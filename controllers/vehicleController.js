// backend/controllers/vehicleController.js

import Vehicle from "../models/vehicleModel.js";
import Booking from "../models/BookingModel.js";
import Location from "../models/locationModel.js"; // ✅ ADDED
import { errorHandler } from "../utils/error.js";
import { availableAtDate } from "../services/checkAvailableVehicle.js";

/** escape user input for safe regex */
const escapeRegex = (s = "") =>
  s.toString().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** normalize values to comparable lowercase string */
const normalizeVal = (val) => {
  if (val === null || val === undefined) return "";
  if (Array.isArray(val))
    return val.join(" ").toString().trim().toLowerCase();
  return String(val).trim().toLowerCase();
};

/** find vehicleIds that have overlapping bookings within the given interval */
const findBookedVehicleIdsInRange = async (start, end) => {
  try {
    const IGNORED_STATUS = ["CANCELLED", "REJECTED"];
    const overlapping = await Booking.find({
      startDate: { $lt: end },
      endDate: { $gt: start },
      status: { $nin: IGNORED_STATUS },
    })
      .select("vehicle")
      .lean();

    const vehicleIds = overlapping
      .map((b) => (b.vehicle ? String(b.vehicle) : null))
      .filter(Boolean);

    return [...new Set(vehicleIds)];
  } catch (err) {
    console.warn("[findBookedVehicleIdsInRange] error:", err?.message || err);
    return [];
  }
};

/**
 * POST /api/user/getVehiclesWithoutBooking
 * Body: { pickUpDistrict, pickUpLocation, pickupDate, dropOffDate, model? }
 *
 * ✅ ANY VEHICLE CAN BE BOOKED FROM ANY LOCATION
 *    → NO district/location filtering, only:
 *        - not deleted
 *        - not booked in range
 *        - optional model match
 */
export const getVehiclesWithoutBooking = async (req, res, next) => {
  try {
    const { pickUpDistrict, pickUpLocation, pickupDate, dropOffDate, model } =
      req.body ?? {};

    console.log(
      "➡ Incoming /getVehiclesWithoutBooking payload (ANY location allowed):",
      req.body
    );

    if (!pickUpDistrict || !pickUpLocation) {
      return res.status(400).json({
        success: false,
        message: "pickUpDistrict & pickUpLocation required",
      });
    }

    // ===========================
    // NO DATES → just list vehicles
    // ===========================
    if (!pickupDate || !dropOffDate) {
      const q = {
        // only exclude explicitly deleted
        $or: [{ isDeleted: { $exists: false } }, { isDeleted: false }],
      };

      // optional model filter ONLY, no district/location
      if (model) {
        q.model = { $regex: `^${escapeRegex(model)}$`, $options: "i" };
      }

      console.log(
        "[getVehiclesWithoutBooking] NO dates → DB query (no location filter):",
        JSON.stringify(q)
      );

      const vehicles = await Vehicle.find(q)
        .lean()
        .limit(1000)
        .catch((e) => {
          console.error(
            "[getVehiclesWithoutBooking] DB query failed:",
            e?.message || e
          );
          return [];
        });

      const wantedModel = model ? normalizeVal(model) : null;

      const results = (vehicles || []).filter((vehicleObj) => {
        if (!vehicleObj) return false;

        const vModel = normalizeVal(vehicleObj.model);

        const deleted =
          vehicleObj.isDeleted === true ||
          String(vehicleObj.isDeleted).toLowerCase() === "true";

        // ✅ Only block if explicitly deleted
        if (deleted) return false;

        // optional model match
        if (wantedModel && vModel !== wantedModel) return false;

        return true;
      });

      console.log(
        "[getVehiclesWithoutBooking] final available (no dates, no location filter) count:",
        results.length
      );
      return res.status(200).json({ success: true, data: results });
    }

    // ===========================
    // DATES PROVIDED → availability logic
    // ===========================
    const start = new Date(pickupDate);
    const end = new Date(dropOffDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid dates" });
    }
    if (start >= end) {
      return res.status(400).json({
        success: false,
        message: "pickupDate must be before dropOffDate",
      });
    }

    // Try availableAtDate service (if implemented)
    let candidates = [];
    try {
      if (typeof availableAtDate === "function") {
        const maybe = await availableAtDate(start, end, {
          // we pass district/location but service is free to ignore them
          district: pickUpDistrict,
          location: pickUpLocation,
          model,
        });
        if (Array.isArray(maybe)) candidates = maybe;
        else if (maybe && typeof maybe === "object" && Array.isArray(maybe.data))
          candidates = maybe.data;
        else candidates = [];
      }
    } catch (err) {
      console.warn(
        "[getVehiclesWithoutBooking] availableAtDate threw, falling back to DB. err:",
        err?.message || err
      );
      candidates = [];
    }

    // Fallback DB query when service didn't return candidates
    if (!Array.isArray(candidates) || candidates.length === 0) {
      const q = {
        // relaxed delete condition like above
        $or: [{ isDeleted: { $exists: false } }, { isDeleted: false }],
      };

      // ✅ Only filter by model (if provided), NOT by district/location
      if (model) {
        q.model = { $regex: `^${escapeRegex(model)}$`, $options: "i" };
      }

      console.log(
        "[getVehiclesWithoutBooking] fallback DB query (no location filter):",
        JSON.stringify(q)
      );
      candidates = await Vehicle.find(q)
        .lean()
        .limit(500)
        .catch((e) => {
          console.error(
            "[getVehiclesWithoutBooking] DB fallback query failed:",
            e?.message || e
          );
          return [];
        });
    }

    console.log(
      "[getVehiclesWithoutBooking] candidates count:",
      (candidates || []).length
    );

    // Compute booked vehicle ids in range
    const bookedVehicleIds = await findBookedVehicleIdsInRange(start, end);
    console.log(
      "[getVehiclesWithoutBooking] bookedVehicleIds (overlapping):",
      bookedVehicleIds.length
    );

    const wantedModel = model ? normalizeVal(model) : null;

    // final defensive filtering
    const results = (candidates || []).filter((v) => {
      if (!v) return false;

      // support both shapes: direct vehicle doc or wrapper { vehicle: {...} }
      const vehicleObj = v.vehicle ? v.vehicle : v;

      const vModel = normalizeVal(vehicleObj.model);

      // Accept both boolean or string representations for flags
      const deleted =
        vehicleObj.isDeleted === true ||
        String(vehicleObj.isDeleted).toLowerCase() === "true";

      // ✅ Only block if explicitly deleted
      if (deleted) return false;

      // ✅ optional model
      if (wantedModel && vModel !== wantedModel) return false;

      // exclude if vehicle has overlapping booking
      const idStr = vehicleObj._id ? String(vehicleObj._id) : null;
      if (idStr && bookedVehicleIds.includes(idStr)) return false;

      return true;
    });

    console.log(
      "[getVehiclesWithoutBooking] final available count (no location filter):",
      results.length
    );
    return res.status(200).json({ success: true, data: results });
  } catch (err) {
    console.error("[getVehiclesWithoutBooking] unexpected error:", err);
    return next(errorHandler(500, "Internal Server Error"));
  }
};

/**
 * POST /api/user/getVariantsForModel
 * Body: { pickUpDistrict, pickUpLocation, pickupDate, dropOffDate, model }
 *
 * ✅ Variants also ignore district/location
 *    → show all variants of the model that:
 *        - are not deleted
 *        - are not booked in that range (if dates provided)
 */
export const getVariantsForModel = async (req, res, next) => {
  try {
    const { pickUpDistrict, pickUpLocation, pickupDate, dropOffDate, model } =
      req.body ?? {};

    if (!model) {
      return res.status(400).json({ success: false, message: "model required" });
    }

    const start = pickupDate ? new Date(pickupDate) : null;
    const end = dropOffDate ? new Date(dropOffDate) : null;
    if ((start && isNaN(start.getTime())) || (end && isNaN(end.getTime()))) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid dates" });
    }
    if (start && end && start >= end) {
      return res.status(400).json({
        success: false,
        message: "pickupDate must be before dropOffDate",
      });
    }

    // Try availableAtDate service first
    let candidates = [];
    try {
      if (typeof availableAtDate === "function") {
        const maybe = await availableAtDate(start, end, {
          district: pickUpDistrict,
          location: pickUpLocation,
          model,
        });
        if (Array.isArray(maybe)) candidates = maybe;
        else if (maybe && typeof maybe === "object" && Array.isArray(maybe.data))
          candidates = maybe.data;
        else candidates = [];
      }
    } catch (err) {
      console.warn(
        "[getVariantsForModel] availableAtDate threw, falling back to DB. err:",
        err?.message || err
      );
      candidates = [];
    }

    // Fallback DB query
    if (!Array.isArray(candidates) || candidates.length === 0) {
      const q = {
        model: { $regex: `^${escapeRegex(model)}$`, $options: "i" },
        // relaxed delete condition
        $or: [{ isDeleted: { $exists: false } }, { isDeleted: false }],
      };

      console.log(
        "[getVariantsForModel] fallback DB query (no location filter):",
        JSON.stringify(q)
      );
      candidates = await Vehicle.find(q)
        .lean()
        .limit(500)
        .catch((e) => {
          console.error(
            "[getVariantsForModel] DB fallback query failed:",
            e?.message || e
          );
          return [];
        });
    }

    // If dates given, compute overlapping bookings
    let bookedVehicleIds = [];
    if (start && end) {
      bookedVehicleIds = await findBookedVehicleIdsInRange(start, end);
      console.log(
        "[getVariantsForModel] bookedVehicleIds count:",
        bookedVehicleIds.length
      );
    }

    const wantedModel = String(model).trim().toLowerCase();

    const variants = (candidates || []).filter((v) => {
      if (!v) return false;
      const vehicleObj = v.vehicle ? v.vehicle : v;

      const vModel = normalizeVal(vehicleObj.model);

      const deleted =
        vehicleObj.isDeleted === true ||
        String(vehicleObj.isDeleted).toLowerCase() === "true";

      // ✅ Only block if explicitly deleted
      if (deleted) return false;

      if (vModel !== wantedModel) return false;

      const idStr = vehicleObj._id ? String(vehicleObj._id) : null;
      if (idStr && bookedVehicleIds.includes(idStr)) return false;

      return true;
    });

    console.log(
      "[getVariantsForModel] returning variants count (no location filter):",
      variants.length
    );
    return res.status(200).json({ success: true, data: variants });
  } catch (err) {
    console.error("[getVariantsForModel] unexpected error:", err);
    return next(errorHandler(500, "Internal Server Error"));
  }
};

/**
 * GET /api/user/getLocationsLov
 * Returns all active locations: [ { district, location }, ... ]
 * Used by useFetchLocationsLov hook on the frontend.
 */
export const getLocationsLov = async (req, res, next) => {
  try {
    const locations = await Location.find({
      $or: [{ isActive: { $exists: false } }, { isActive: true }],
    })
      .select("district location -__v")
      .lean();

    if (!locations || locations.length === 0) {
      return res.status(200).json([]); // frontend expects []
    }

    return res.status(200).json(locations);
  } catch (err) {
    console.error("[getLocationsLov] error:", err);
    return next(errorHandler(500, "Failed to fetch locations"));
  }
};

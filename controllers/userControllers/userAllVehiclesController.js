// backend/controllers/userControllers/userVehicleController.js

import vehicle from "../../models/vehicleModel.js";
import Booking from "../../models/BookingModel.js";
import { errorHandler } from "../../utils/error.js";

// ✅ Show all vehicles to user
export const listAllVehicles = async (req, res, next) => {
  try {
    const vehicles = await vehicle.find();

    if (!vehicles || vehicles.length === 0) {
      return next(errorHandler(404, "no vehicles found"));
    }
    res.status(200).json(vehicles);
  } catch (error) {
    console.log(error);
    next(errorHandler(500, "something went wrong"));
  }
};

// ✅ Show one vehicle Detail to user
export const showVehicleDetails = async (req, res, next) => {
  try {
    if (!req.body) {
      return next(errorHandler(409, "body cannot be empty"));
    }
    const { id } = req.body;
    const vehicleDetail = await vehicle.findById(id);

    if (!vehicleDetail) {
      return next(errorHandler(404, "no vehicles found"));
    }

    res.status(200).json(vehicleDetail);
  } catch (error) {
    console.log(error);
    next(errorHandler(500, "something went wrong"));
  }
};

// ✅ Check vehicle availability for specific dates
export const checkAvailability = async (req, res, next) => {
  try {
    if (!req.body) {
      return next(errorHandler(401, "bad request no body"));
    }
    const { pickupDate, dropOffDate, vehicleId } = req.body;

    if (!pickupDate || !dropOffDate || !vehicleId) {
      console.log("pickup , dropffdate and vehicleId is required");
      return next(
        errorHandler(409, "pickup , dropffdate and vehicleId is required")
      );
    }

    const pickup = new Date(pickupDate);
    const dropoff = new Date(dropOffDate);

    if (isNaN(pickup.getTime()) || isNaN(dropoff.getTime())) {
      return next(errorHandler(409, "Invalid date format"));
    }

    // Check if pickupDate is before dropOffDate
    if (pickup >= dropoff) {
      return next(errorHandler(409, "Invalid date range"));
    }

    // 6 hours buffer (if you really want it)
    const sixHoursLater = new Date(dropoff);
    sixHoursLater.setTime(sixHoursLater.getTime() + 6 * 60 * 60 * 1000);
    console.log("sixHoursLater:", sixHoursLater);

    // checking database for overlapping pickup and dropoffDates
    const existingBookings = await Booking.find({
      vehicleId,
      $or: [
        // Overlap condition
        { pickupDate: { $lt: dropoff }, dropOffDate: { $gt: pickup } },
        // Start within range
        { pickupDate: { $gte: pickup, $lt: dropoff } },
        // End within range
        { dropOffDate: { $gt: pickup, $lte: dropoff } },
        // Booking includes the entire time range
        {
          pickupDate: { $lte: pickup },
          dropOffDate: { $gte: dropoff },
        },
        // After buffer
        {
          pickupDate: { $gte: sixHoursLater },
        },
      ],
    });

    if (existingBookings.length > 0) {
      return next(
        errorHandler(
          400,
          "Vehicle is not available for the specified time period"
        )
      );
    }

    return res
      .status(200)
      .json({ message: "Vehicle is available for booking" });
  } catch (error) {
    console.log(error);
    next(errorHandler(500, "error in checkAvailability"));
  }
};

// ✅ Search car filter in homepage
export const searchCar = async (req, res, next) => {
  try {
    if (!req || !req.body) {
      return res
        .status(400)
        .json({ message: "please provide all the details" });
    }

    const {
      pickup_district,
      pickup_location,
      dropoff_location, // not used in query but kept for future
      pickuptime,
      dropofftime,
    } = req.body;

    // Parse dates (ISO strings from frontend)
    const pickupDate = new Date(pickuptime);
    const dropoffDate = new Date(dropofftime);

    if (isNaN(pickupDate.getTime()) || isNaN(dropoffDate.getTime())) {
      return next(errorHandler(400, "Invalid pickup or dropoff date"));
    }

    const diffMs = dropoffDate.getTime() - pickupDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (dropoffDate <= pickupDate || diffDays < 1) {
      return next(errorHandler(401, "dropoff date should be larger"));
    }

    // 🔍 Main search pipeline
    const search = await vehicle.aggregate([
      // keep only non-deleted (or docs without the field)
      {
        $match: {
          $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
        },
      },
      // match district + location + not booked
      {
        $match: {
          district: pickup_district,
          location: pickup_location,
          $or: [{ isBooked: false }, { isBooked: { $exists: false } }],
        },
      },
      // Group so you can show one car per model / config
      {
        $group: {
          _id: {
            model: "$model",
            location: "$location",
            fuel_type: "$fuel_type",
            transmition: "$transmition",
            seats: "$seats",
          },
          vehicles: {
            $push: "$$ROOT",
          },
        },
      },
      {
        $project: {
          _id: 1,
          vehicles: {
            $cond: {
              if: { $gt: [{ $size: "$vehicles" }, 1] },
              then: { $arrayElemAt: ["$vehicles", 0] },
              else: "$vehicles",
            },
          },
        },
      },
      {
        $unwind: {
          path: "$vehicles",
        },
      },
      {
        $replaceRoot: {
          newRoot: "$vehicles",
        },
      },
    ]);

    // Always return an array (even if empty) -> frontend expects []
    return res.status(200).json(search);
  } catch (error) {
    console.log(error);
    next(errorHandler(500, "something went wrong while Searching car"));
  }
};

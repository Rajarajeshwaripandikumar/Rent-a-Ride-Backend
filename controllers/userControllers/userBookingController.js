// controllers/userControllers/userBookingController.js

import mongoose from "mongoose";
import Booking from "../../models/BookingModel.js";
import User from "../../models/userModel.js";
import { errorHandler } from "../../utils/error.js";
import Razorpay from "razorpay";
import { availableAtDate } from "../../services/checkAvailableVehicle.js";
import Vehicle from "../../models/vehicleModel.js";
import nodemailer from "nodemailer";
import crypto from "crypto";

/* ---------------------------------------------------------
   HELPERS
--------------------------------------------------------- */

const toNumber = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};

const detectAmountInPaise = (rawVal) => {
  const raw = Number(rawVal);
  if (Number.isNaN(raw)) return null;
  if (raw >= 100000) return Math.round(raw); // already paise
  return Math.round(raw * 100); // rupees -> paise
};

/* ---------------------------------------------------------
   BOOK CAR (VERIFY SIGNATURE + SAVE)
--------------------------------------------------------- */

export const BookCar = async (req, res, next) => {
  try {
    if (!req.body) return next(errorHandler(400, "Missing request body"));

    const {
      user_id,
      vehicle_id,
      totalPrice,
      pickupDate,
      dropoffDate,
      pickup_location,
      dropoff_location,
      pickup_district,
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature,
    } = req.body;

    const authUserId = req.user?.id || req.user?._id;
    const finalUserId = authUserId || user_id;

    if (!finalUserId || !vehicle_id)
      return next(errorHandler(400, "Missing user or vehicle id"));

    if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature)
      return next(errorHandler(400, "Missing payment details"));

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret)
      return next(errorHandler(500, "Payment gateway misconfigured"));

    const generatedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (generatedSignature !== razorpaySignature) {
      return next(errorHandler(400, "Invalid payment signature"));
    }

    let userDoc = await User.findById(finalUserId)
      .select("username email")
      .lean()
      .catch(() => null);

    const booking = new Booking({
      pickupDate,
      dropOffDate: dropoffDate,
      userId: finalUserId,
      pickUpLocation: pickup_location,
      dropOffLocation: dropoff_location,
      pickUpDistrict: pickup_district,
      vehicleId: vehicle_id,
      totalPrice: toNumber(totalPrice),
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature,
      status: "booked",
      createdAt: new Date(),
      customerName: userDoc?.username || "",
      customerEmail: userDoc?.email || "",
    });

    const saved = await booking.save();

    return res.status(201).json({
      ok: true,
      message: "Booking saved",
      booking: saved,
    });
  } catch (error) {
    console.error("BookCar error:", error);
    return next(errorHandler(500, "Error while booking car"));
  }
};

/* ---------------------------------------------------------
   CREATE RAZORPAY ORDER
--------------------------------------------------------- */

export const razorpayOrder = async (req, res, next) => {
  try {
    console.log("DEBUG razorpayOrder req.body:", req.body);

    const { totalPrice, pickup_location, dropoff_location, pickup_district } =
      req.body;

    if (!totalPrice || !pickup_location || !dropoff_location || !pickup_district)
      return next(errorHandler(400, "Missing required fields"));

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret)
      return next(errorHandler(500, "Payment gateway not configured"));

    const amountInPaise = detectAmountInPaise(totalPrice);
    if (amountInPaise === null)
      return next(errorHandler(400, "Invalid totalPrice"));

    const instance = new Razorpay({ key_id: keyId, key_secret: keySecret });

    const order = await instance.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      payment_capture: 1,
    });

    if (!order) return next(errorHandler(500, "Failed to create order"));

    return res.status(200).json({
      ok: true,
      id: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error) {
    console.error("razorpayOrder error:", error);
    return next(errorHandler(500, "Error occurred in razorpay order"));
  }
};

/* ---------------------------------------------------------
   getVehiclesWithoutBooking
   👉 ALL cars for ALL locations, filtered ONLY by date + notDeleted
--------------------------------------------------------- */

export const getVehiclesWithoutBooking = async (req, res, next) => {
  try {
    console.log("DEBUG getVehiclesWithoutBooking req.body:", req.body);

    const pickUpDistrict =
      req.body.pickUpDistrict ||
      req.body.pickupDistrict ||
      req.body.pickup_district;

    const pickUpLocation =
      req.body.pickUpLocation ||
      req.body.pickupLocation ||
      req.body.pickup_location;

    const pickupDate =
      req.body.pickupDate || req.body.pickupISO || req.body.pickup_date;

    const dropOffDate =
      req.body.dropOffDate || req.body.dropoffISO || req.body.dropoff_date;

    const model = req.body.model; // optional (for variants page)

    // We still require district+location for Booking & UI (but NOT for filtering)
    if (!pickUpDistrict || !pickUpLocation) {
      return next(errorHandler(409, "pickup District and location needed"));
    }
    if (!pickupDate || !dropOffDate) {
      return next(errorHandler(409, "pickup and dropoff date required"));
    }
    if (new Date(pickupDate) >= new Date(dropOffDate)) {
      return next(errorHandler(409, "Invalid date range"));
    }

    // 🔥 core: date-based availability across ALL cars
    const allAvailable = await availableAtDate(pickupDate, dropOffDate);

    if (!allAvailable || allAvailable.length === 0) {
      console.log(
        "[getVehiclesWithoutBooking] availableAtDate returned 0 vehicles"
      );
      return res.status(200).json({
        ok: true,
        data: [],
        availableVehicles: [],
      });
    }

    console.log(
      "[getVehiclesWithoutBooking] availableAtDate count:",
      allAvailable.length
    );

    const notDeleted = (cur) =>
      cur.isDeleted === false ||
      cur.isDeleted === "false" ||
      cur.isDeleted === 0 ||
      cur.isDeleted === "0" ||
      cur.isDeleted === undefined;

    // ✅ FINAL: all vehicles free in that date range, any district/location
    const availableVehicles = allAvailable.filter(notDeleted);

    console.log(
      "[getVehiclesWithoutBooking] FINAL availableVehicles:",
      availableVehicles.length
    );

    // Save for next middleware if model is present
    res.locals.actionResult = [availableVehicles, model];

    // Normal search: no model → respond directly
    if (!model) {
      return res.status(200).json({
        ok: true,
        data: availableVehicles,
        availableVehicles,
      });
    }

    // Variants screen: continue to showAllVariants
    return next();
  } catch (error) {
    console.error("getVehiclesWithoutBooking error:", error);
    return next(
      errorHandler(
        500,
        "An error occurred while fetching available vehicles."
      )
    );
  }
};

/* ---------------------------------------------------------
   showAllVariants — filter only by model
--------------------------------------------------------- */

export const showAllVariants = async (req, res, next) => {
  try {
    const actionResult = res.locals.actionResult;
    if (!actionResult)
      return next(errorHandler(404, "actionResult missing"));

    const [availableVehicles, model] = actionResult;

    if (!model) {
      return res.status(200).json({
        ok: true,
        data: availableVehicles,
        availableVehicles,
      });
    }

    const matched = availableVehicles.filter(
      (cur) => String(cur.model) === String(model)
    );

    return res.status(200).json({
      ok: true,
      data: matched,
    });
  } catch (error) {
    console.error("showAllVariants error:", error);
    return next(errorHandler(500, "Error in showAllVariants"));
  }
};

/* ---------------------------------------------------------
   ONE OF KIND (single vehicle per model)
--------------------------------------------------------- */

export const showOneofkind = async (req, res, next) => {
  try {
    const actionResult = res.locals.actionResult;
    if (!actionResult)
      return next(errorHandler(404, "actionResult missing"));

    const [availableVehicles] = actionResult;

    const modelsMap = {};
    const result = [];

    availableVehicles.forEach((cur) => {
      if (!modelsMap[cur.model]) {
        modelsMap[cur.model] = true;
        result.push(cur);
      }
    });

    return res.status(200).json({ ok: true, data: result });
  } catch (error) {
    console.error("showOneofkind error:", error);
    return next(errorHandler(500, "Error in showOneofkind"));
  }
};

/* ---------------------------------------------------------
   FILTER VEHICLES
--------------------------------------------------------- */

export const filterVehicles = async (req, res, next) => {
  try {
    const transformedData = req.body;
    if (!transformedData)
      return next(errorHandler(400, "select filter option first"));

    const generateMatchStage = (data) => {
      const carTypes = [];
      const transmitions = [];

      data.forEach((cur) => {
        if (cur.type === "car_type") {
          const firstKey = Object.keys(cur).find((k) => k !== "type");
          if (firstKey) carTypes.push(firstKey);
        }
        if (cur.type === "transmition") {
          Object.keys(cur).forEach((key) => {
            if (key !== "type" && cur[key]) transmitions.push(key);
          });
        }
      });

      return {
        $match: {
          $and: [
            carTypes.length ? { car_type: { $in: carTypes } } : null,
            transmitions.length
              ? { transmition: { $in: transmitions } }
              : null,
          ].filter(Boolean),
        },
      };
    };

    const matchStage = generateMatchStage(transformedData);
    const filteredVehicles = await Vehicle.aggregate([matchStage]);

    return res.status(200).json({ ok: true, data: filteredVehicles });
  } catch (error) {
    console.error("filterVehicles error:", error);
    return next(errorHandler(500, "FilterVehicles internal error"));
  }
};

/* ---------------------------------------------------------
   FIND BOOKINGS FOR A USER
--------------------------------------------------------- */

export const findBookingsOfUser = async (req, res, next) => {
  try {
    const { userId } = req.body;
    if (!userId) return next(errorHandler(400, "_id of user required"));

    const converted = new mongoose.Types.ObjectId(userId);

    const bookings = await Booking.aggregate([
      { $match: { userId: converted } },
      {
        $lookup: {
          from: "vehicles",
          localField: "vehicleId",
          foreignField: "_id",
          as: "result",
        },
      },
      {
        $project: {
          _id: 0,
          bookingDetails: "$$ROOT",
          vehicleDetails: { $arrayElemAt: ["$result", 0] },
        },
      },
    ]);

    return res.status(200).json({ ok: true, data: bookings });
  } catch (error) {
    console.error("findBookingsOfUser error:", error);
    return next(errorHandler(500, "Error in findBookingsOfUser"));
  }
};

/* ---------------------------------------------------------
   LATEST BOOKINGS
--------------------------------------------------------- */

export const latestbookings = async (req, res, next) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return next(errorHandler(400, "user_id required"));

    const converted = new mongoose.Types.ObjectId(user_id);

    const bookings = await Booking.aggregate([
      { $match: { userId: converted } },
      {
        $lookup: {
          from: "vehicles",
          localField: "vehicleId",
          foreignField: "_id",
          as: "result",
        },
      },
      {
        $project: {
          _id: 0,
          bookingDetails: "$$ROOT",
          vehicleDetails: { $arrayElemAt: ["$result", 0] },
        },
      },
      { $sort: { "bookingDetails.createdAt": -1 } },
      { $limit: 1 },
    ]);

    return res.status(200).json({ ok: true, data: bookings });
  } catch (error) {
    console.error("latestbookings error:", error);
    return next(errorHandler(500, "Error in latestbookings"));
  }
};

/* ---------------------------------------------------------
   SEND BOOKING DETAILS EMAIL
--------------------------------------------------------- */

const getVehicleImageUrl = (vehicleDetails = {}) => {
  const baseUrl =
    process.env.CLIENT_PUBLIC_URL ||
    process.env.FRONTEND_URL ||
    "http://localhost:5173";

  let raw = null;

  if (Array.isArray(vehicleDetails.image) && vehicleDetails.image.length > 0) {
    raw = vehicleDetails.image[0];
  } else if (
    typeof vehicleDetails.image === "string" &&
    vehicleDetails.image.trim() !== ""
  ) {
    raw = vehicleDetails.image.trim();
  } else if (
    typeof vehicleDetails.imageUrl === "string" &&
    vehicleDetails.imageUrl.trim() !== ""
  ) {
    raw = vehicleDetails.imageUrl.trim();
  }

  if (!raw) return "";

  if (
    raw.startsWith("http://") ||
    raw.startsWith("https://") ||
    raw.startsWith("/vehicles/")
  ) {
    return raw;
  }

  return `${baseUrl}/vehicles/${raw}`;
};

export const sendBookingDetailsEamil = async (req, res, next) => {
  try {
    const { toEmail, data } = req.body;
    if (!toEmail || !Array.isArray(data) || data.length === 0)
      return next(errorHandler(400, "Missing toEmail or data"));

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const bookingDetails = data[0].bookingDetails || {};
    const vehicleDetails = data[0].vehicleDetails || {};

    const pickupDate = new Date(
      bookingDetails.pickupDate ||
        bookingDetails.pickUpDate ||
        Date.now()
    );
    const dropOffDate = new Date(
      bookingDetails.dropOffDate ||
        bookingDetails.dropoffDate ||
        Date.now()
    );

    const vehicleImageUrl = getVehicleImageUrl(vehicleDetails);

   const html = `
  <div style="font-family: Arial; padding: 10px;">
    <h2>Booking Details</h2>
    <hr>

    <p><strong>Booking Id:</strong> ${bookingDetails._id || ""}</p>
    <p><strong>Total Price:</strong> ${bookingDetails.totalPrice}</p>

    <p><strong>Pickup:</strong> ${bookingDetails.pickUpLocation} —
      ${pickupDate.toLocaleString()}</p>

    <p><strong>Dropoff:</strong> ${bookingDetails.dropOffLocation} —
      ${dropOffDate.toLocaleString()}</p>

    <h2>Vehicle Details</h2>
    <hr>

    ${
      vehicleImageUrl
        ? `<img src="${vehicleImageUrl}" style="max-width:100%;border-radius:8px;" />`
        : ""
    }

    <p><strong>Model:</strong> ${vehicleDetails.model}</p>
    <p><strong>Company:</strong> ${vehicleDetails.company}</p>
    <p><strong>Seats:</strong> ${vehicleDetails.seats}</p>
    <p><strong>Fuel Type:</strong> ${vehicleDetails.fuel_type}</p>
  </div>
`;


    transporter.sendMail(
      {
        from: process.env.EMAIL_USER,
        to: toEmail,
        subject: "rentaride.shop booking details",
        html,
      },
      (err, info) => {
        if (err) return next(errorHandler(500, "Failed to send email"));
        return res.status(200).json({ ok: true, message: "Email sent", info });
      }
    );
  } catch (error) {
    console.error("sendBookingDetailsEamil error:", error);
    return next(errorHandler(500, "internal server error"));
  }
};

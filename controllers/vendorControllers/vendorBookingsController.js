import mongoose from "mongoose";
import Booking from "../../models/BookingModel.js";
import Vehicle from "../../models/vehicleModel.js";
import { errorHandler } from "../../utils/error.js";

export const vendorBookings = async (req, res, next) => {
  try {
    const vendorId = req.vendor?.id || req.userId || req.user?._id || req.body?._id;
    if (!vendorId) return next(errorHandler(401, "Vendor not authenticated"));

    const vendorIdStr = vendorId.toString(); // 🔹 match string in DB

    const vendorVehicles = await Vehicle.find({
      addedBy: vendorIdStr,
      isVendorVehicle: true,
      isDeleted: { $ne: true },
    }).select("_id");

    const vehicleIds = vendorVehicles.map((v) => v._id);

    if (vehicleIds.length === 0) {
      return res.status(200).json({ success: true, bookings: [] });
    }

    const bookings = await Booking.find({
      vehicleId: { $in: vehicleIds },
    })
      .populate("vehicleId", "name registeration_number image company model car_type seats fuel_type transmission year")
      .populate("userId", "username email phoneNumber")
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, bookings });
  } catch (error) {
    console.error("vendorBookings error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

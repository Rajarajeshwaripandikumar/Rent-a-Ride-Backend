// backend/controllers/vendorControllers/vendorStatsController.js

import Vehicle from "../../models/vehicleModel.js";
import Booking from "../../models/BookingModel.js";
import { errorHandler } from "../../utils/error.js";

export const vendorStats = async (req, res, next) => {
  try {
    const vendorId =
      req.vendor?.id || req.userId || req.user?._id || req.body?._id;

    if (!vendorId) {
      return next(errorHandler(401, "Vendor not authenticated"));
    }

    const vendorIdStr = vendorId.toString();
    console.log("📊 vendorStats for vendor:", vendorIdStr);

    // 1️⃣ Get all vehicles owned by this vendor
    const vendorVehicles = await Vehicle.find({
      addedBy: vendorIdStr,
      isVendorVehicle: true,
      isDeleted: { $ne: true },
    }).select("_id");

    const vehicleIds = vendorVehicles.map((v) => v._id);
    const totalVehicles = vendorVehicles.length;

    // If vendor has no vehicles, return zeros quickly
    if (vehicleIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          totalVehicles: 0,
          totalBookings: 0,
          completedTrips: 0,
          earnings: 0,
          totalEarnings: 0,
        },
      });
    }

    // 2️⃣ All bookings for these vehicles
    const totalBookings = await Booking.countDocuments({
      vehicleId: { $in: vehicleIds },
    });

    // 3️⃣ Completed trips – in option 2, treat ALL bookings as completed
    const completedTrips = await Booking.countDocuments({
      vehicleId: { $in: vehicleIds },
    });
    // or simply: const completedTrips = totalBookings;

    // 4️⃣ Earnings = sum of totalPrice for ALL bookings (no status filter)
    const earningsAgg = await Booking.aggregate([
      {
        $match: {
          vehicleId: { $in: vehicleIds },
        },
      },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: "$totalPrice" },
        },
      },
    ]);

    const totalEarnings =
      earningsAgg.length > 0 ? earningsAgg[0].totalEarnings : 0;

    return res.status(200).json({
      success: true,
      data: {
        totalVehicles,
        totalBookings,
        completedTrips,
        earnings: totalEarnings, // used by frontend
        totalEarnings,           // also available
      },
    });
  } catch (err) {
    console.error("vendorStats Error:", err);
    next(err);
  }
};

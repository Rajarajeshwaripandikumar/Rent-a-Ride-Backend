// backend/controllers/adminControllers/bookingsController.js
import Booking from "../../models/BookingModel.js";
import { errorHandler } from "../../utils/error.js";

/**
 * GET /api/admin/allBookings
 * Fetch all bookings WITH user + vehicle populated
 */
export const allBookings = async (req, res, next) => {
  try {
    const bookings = await Booking.find({})
      .populate("vehicleId")                               // full vehicle details
      .populate("userId", "username email phoneNumber")    // real user details
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: bookings.length,
      bookings,
    });
  } catch (error) {
    console.error("allBookings error:", error);
    next(errorHandler(500, "Error fetching all bookings"));
  }
};

/**
 * POST /api/admin/changeStatus
 * Body: { id: <bookingId>, status: <newStatus> }
 */
export const changeStatus = async (req, res, next) => {
  try {
    const { id, status } = req.body || {};

    if (!id || !status) {
      return next(
        errorHandler(400, "Bad request: booking id and new status required")
      );
    }

    const updatedBooking = await Booking.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    )
      .populate("vehicleId")
      .populate("userId", "username email phoneNumber");

    if (!updatedBooking) {
      return next(errorHandler(404, "Booking not found or status not changed"));
    }

    return res.status(200).json({
      success: true,
      message: "Status changed successfully",
      booking: updatedBooking,
    });
  } catch (error) {
    console.error("changeStatus error:", error);
    next(errorHandler(500, "Error changing booking status"));
  }
};

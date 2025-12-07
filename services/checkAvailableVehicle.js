// backend/services/checkAvailableVehicle.js
import Booking from "../models/BookingModel.js";
import Vehicle from "../models/vehicleModel.js";

/**
 * Return array of Vehicle docs that are NOT booked between start and end.
 * - start, end may be Date objects or ISO strings
 * - Treat bookings with statuses 'tripCompleted', 'canceled', 'notBooked' as non-blocking
 */
export const availableAtDate = async (start, end) => {
  try {
    // Normalize dates
    if (!(start instanceof Date)) start = new Date(start);
    if (!(end instanceof Date)) end = new Date(end);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
      console.warn("[availableAtDate] invalid dates", { start, end });
      return [];
    }

    // Define statuses that DO NOT block availability
    const nonBlockingStatuses = ["tripCompleted", "canceled", "notBooked"];

    // Find bookings that overlap the requested period AND are *blocking* (i.e., status NOT in nonBlockingStatuses)
    // Overlap condition: booking.pickupDate < end AND booking.dropOffDate > start
    const blockingBookings = await Booking.find({
      $and: [
        { pickupDate: { $lt: end } },
        { dropOffDate: { $gt: start } },
        { status: { $nin: nonBlockingStatuses } }, // only blocking statuses
      ],
    })
      .select("vehicleId")
      .lean();

    const bookedVehicleIds = blockingBookings
      .map((b) => b.vehicleId)
      .filter(Boolean)
      .map((id) => id.toString());

    // Build vehicle query: active, approved, not deleted, and not in booked list
    const vehicleQuery = {
      isDeleted: false,
      isAdminApproved: true,
    };

    if (bookedVehicleIds.length > 0) {
      vehicleQuery._id = { $nin: bookedVehicleIds };
    }

    // Optionally add any other base filters (isVendorVehicle etc) here
    const availableVehicles = await Vehicle.find(vehicleQuery).lean();

    console.debug("[availableAtDate] blockingBookings:", blockingBookings.length, "availableVehicles:", availableVehicles.length);
    return availableVehicles;
  } catch (err) {
    console.error("[availableAtDate] error:", err);
    return [];
  }
};

export default availableAtDate;

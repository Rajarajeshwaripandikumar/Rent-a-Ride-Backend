import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema({
  vehicleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vehicle",
    required: true,
  },
  pickupDate: { type: Date, required: true },
  dropOffDate: { type: Date, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  pickUpLocation: { type: String, required: true },
  dropOffLocation: { type: String, required: true },
  totalPrice: { type: Number, required: true },
  razorpayOrderId: { type: String, required: true },
  razorpayPaymentId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: [
      "notBooked",
      "booked",
      "onTrip",
      "notPicked",
      "canceled",
      "overDue",
      "tripCompleted",
    ],
    default: "notBooked",
  },
});

// ✅ FIX: Prevent OverwriteModelError
const Booking =
  mongoose.models.Booking || mongoose.model("Booking", bookingSchema);

export default Booking;

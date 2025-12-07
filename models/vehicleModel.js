import mongoose from "mongoose";

const vehicleSchema = new mongoose.Schema(
  {
    registeration_number: {
      type: String,
      required: true,
      unique: true,
    },

    car_title: String,
    car_description: String,

    company: String,
    name: String,
    model: String,
    year_made: Number,

    fuel_type: {
      type: String,
      enum: ["petrol", "diesel", "electric", "hybrid"],
    },

    seats: Number,

    transmition: {
      type: String,
      enum: ["manual", "automatic"],
    },

    car_type: String,
    price: Number,

    image: [String],

    description: String,

    district: {
      type: String,
      required: true,
    },

    location: {
      type: String,
      required: true,
    },

    // 🔹 VENDOR WHO ADDED THIS VEHICLE
    // (you already use this field in vendorAddVehicle & showVendorVehicles)
    addedBy: {
      type: mongoose.Schema.Types.ObjectId, // or String if you prefer
      ref: "Vendor",                        // or "User" based on your schema
      required: function () {
        // make it required only for vendor vehicles
        return this.isVendorVehicle === true;
      },
    },

    // soft-delete flag
    isDeleted: {
      type: Boolean,
      default: false,
    },

    isBooked: {
      type: Boolean,
      default: false,
    },

    // vehicle added by admin vs vendor
    isVendorVehicle: {
      type: Boolean,
      default: false,
    },

    // admin approval status (vendor requests should set this to false initially)
    isAdminApproved: {
      type: Boolean,
      default: true,
    },

    isRejected: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Vehicle", vehicleSchema);

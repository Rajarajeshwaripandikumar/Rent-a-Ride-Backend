import mongoose from "mongoose";

const locationSchema = new mongoose.Schema(
  {
    district: String,
    location: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Location", locationSchema);

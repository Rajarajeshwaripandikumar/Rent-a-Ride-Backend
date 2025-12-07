import mongoose from "mongoose";

const masterDataSchema = new mongoose.Schema(
  {
    id: String,

    // for locations
    district: String,
    location: String,

    // for cars
    model: String,
    variant: String,
    brand: String,

    type: {
      type: String, // "location" | "car"
      required: true,
    },
  },
  { timestamps: true }
);

// This will map to the "masterdatas" collection
const MasterData = mongoose.model("MasterData", masterDataSchema);
export default MasterData;

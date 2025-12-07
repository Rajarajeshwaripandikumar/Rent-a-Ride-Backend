// backend/controllers/userControllers/showSingleOfSameModel.js
import Vehicle from "../../models/vehicleModel.js";

export const showSingleOfSameModel = async (req, res) => {
  try {
    const { pickupDate, dropOffDate, pickUpDistrict, pickUpLocation } = req.body;

    console.log("➡️ Incoming Search:", req.body);

    if (!pickupDate || !dropOffDate || !pickUpDistrict || !pickUpLocation) {
      return res.status(400).json({ message: "Missing search parameters" });
    }

    // Base search
    const cars = await Vehicle.find({
      district: pickUpDistrict,
      location: pickUpLocation,
      isDeleted: "false",
      isAdminApproved: true,
      isRejected: false,
    });

    console.log("Found vehicles:", cars.length);

    return res.status(200).json(cars);

  } catch (err) {
    console.error("showSingleOfSameModel ERROR:", err);
    return res.status(500).json({
      message: "Failed fetching available vehicles",
      error: err.message,
    });
  }
};

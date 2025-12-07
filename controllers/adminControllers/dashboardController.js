// controllers/adminControllers/dashboardController.js
import mongoose from "mongoose";
import { errorHandler } from "../../utils/error.js";
import Vehicle from "../../models/vehicleModel.js";
import { uploader } from "../../utils/cloudinaryConfig.js";
import { dataUri } from "../../utils/multer.js";

/* ============================================================
   ADMIN ADD VEHICLE (auto-approved)
   - uploads images via dataUri -> cloudinary
   - sets explicit boolean flags for consistency
============================================================ */
export const addProduct = async (req, res, next) => {
  try {
    if (!req.body || Object.keys(req.body).length === 0)
      return next(errorHandler(400, "body cannot be empty"));

    if (!req.files || req.files.length === 0)
      return next(errorHandler(400, "image cannot be empty"));

    const {
      registeration_number,
      company,
      name,
      model,
      title,
      base_package,
      price,
      year_made,
      fuel_type,
      description,
      seat,
      transmition_type,
      registeration_end_date,
      insurance_end_date,
      polution_end_date,
      car_type,
      location,
      district,
    } = req.body;

    const uploadedImages = [];
    const fileDataUri = dataUri(req);

    // Upload to cloudinary (tolerant: log per-file failures)
    await Promise.all(
      fileDataUri.map(async (cur) => {
        try {
          const result = await uploader.upload(cur.data, {
            public_id: cur.filename,
          });
          if (result && result.secure_url) uploadedImages.push(result.secure_url);
        } catch (err) {
          console.error("cloudinary upload error for", cur.filename, err);
        }
      })
    );

    if (uploadedImages.length === 0) {
      // nothing uploaded — return an error
      return next(errorHandler(500, "Failed to upload images to Cloudinary"));
    }

    const addVehicle = new Vehicle({
      registeration_number,
      company,
      name,
      model,
      car_title: title,
      car_description: description,
      base_package,
      price: price ? Number(price) : undefined,
      year_made: year_made ? Number(year_made) : undefined,
      fuel_type,
      seats: seat ? Number(seat) : undefined,
      transmition: transmition_type,
      insurance_end: insurance_end_date || null,
      registeration_end: registeration_end_date || null,
      pollution_end: polution_end_date || null,
      car_type,
      location,
      district,
      image: uploadedImages,

      // Explicit flags so queries remain consistent
      isAdminApproved: true,
      isVendorVehicle: false,
      isRejected: false,
      isDeleted: false,
    });

    await addVehicle.save();

    return res.status(201).json({
      success: true,
      message: "Vehicle added successfully",
      vehicle: addVehicle,
    });
  } catch (error) {
    console.error("ADMIN addProduct error:", error);
    if (error.code === 11000) return next(errorHandler(409, "Vehicle already exists"));
    return next(errorHandler(500, "Vehicle failed to add"));
  }
};

/* ============================================================
   ADMIN SHOW ALL VEHICLES
   - returns consistent JSON shape: { success, vehicles }
   - does NOT throw 404 on empty result — returns [] instead
============================================================ */
export const showVehicles = async (req, res, next) => {
  try {
    const vehicles = await Vehicle.find({ isDeleted: false }).sort({ createdAt: -1 }).lean();

    // always return success with array (empty if none)
    return res.status(200).json({
      success: true,
      vehicles: vehicles || [],
      count: vehicles ? vehicles.length : 0,
    });
  } catch (error) {
    console.error("ADMIN showVehicles error:", error);
    return next(errorHandler(500, "something went wrong"));
  }
};

/* ============================================================
   ADMIN SOFT DELETE VEHICLE
============================================================ */
export const deleteVehicle = async (req, res, next) => {
  try {
    const vehicle_id = req.params.id;
    if (!vehicle_id) return next(errorHandler(400, "Invalid ID"));

    if (!mongoose.Types.ObjectId.isValid(vehicle_id))
      return next(errorHandler(400, "Invalid vehicle ID format"));

    const deleted = await Vehicle.findByIdAndUpdate(
      vehicle_id,
      { isDeleted: true },
      { new: true }
    );

    if (!deleted) return next(errorHandler(404, "Vehicle not found"));

    return res.status(200).json({
      success: true,
      message: "Vehicle deleted successfully",
      vehicle: deleted,
    });
  } catch (error) {
    console.error("ADMIN deleteVehicle error:", error);
    return next(errorHandler(500, "something went wrong"));
  }
};

/* ============================================================
   ADMIN EDIT VEHICLE (admin always approves final version)
   - validates id format
   - returns updated doc on success
============================================================ */
export const editVehicle = async (req, res, next) => {
  try {
    const vehicle_id = req.params.id;

    if (!vehicle_id) return next(errorHandler(400, "ID cannot be empty"));
    if (!mongoose.Types.ObjectId.isValid(vehicle_id))
      return next(errorHandler(400, "Invalid vehicle ID format"));

    if (!req.body || !req.body.formData)
      return next(errorHandler(400, "Add data to edit first"));

    const {
      registeration_number,
      company,
      name,
      model,
      title,
      base_package,
      price,
      year_made,
      description,
      Seats,
      transmitionType,
      Registeration_end_date,
      insurance_end_date,
      polution_end_date,
      carType,
      fuelType,
      vehicleLocation,
      vehicleDistrict,
    } = req.body.formData;

    const edited = await Vehicle.findByIdAndUpdate(
      vehicle_id,
      {
        registeration_number,
        company,
        name,
        model,
        car_title: title,
        car_description: description,
        base_package,
        price: price ? Number(price) : undefined,
        year_made: year_made ? Number(year_made) : undefined,
        fuel_type: fuelType,
        seats: Seats ? Number(Seats) : undefined,
        transmition: transmitionType,
        insurance_end: insurance_end_date || null,
        registeration_end: Registeration_end_date || null,
        pollution_end: polution_end_date || null,
        car_type: carType,
        location: vehicleLocation,
        district: vehicleDistrict,

        // Admin edit => final approval
        isAdminApproved: true,
        isRejected: false,
      },
      { new: true }
    ).lean();

    if (!edited) return next(errorHandler(404, "Vehicle with this ID not found"));

    return res.status(200).json({ success: true, edited });
  } catch (error) {
    console.error("ADMIN editVehicle error:", error);
    return next(errorHandler(500, "something went wrong"));
  }
};

// backend/controllers/vendorControllers/vendorCrudController.js

import mongoose from "mongoose";
import { errorHandler } from "../../utils/error.js";
import Vehicle from "../../models/vehicleModel.js";
import { uploader } from "../../utils/cloudinaryConfig.js";
import { base64Converter } from "../../utils/multer.js";

/* ============================================================
   Helper: Upload Base64 Encoded Files to Cloudinary
   - uses Promise.allSettled to avoid failing whole request
   - returns array of secure_url strings
============================================================ */
async function uploadEncodedFiles(encodedFiles) {
  const uploaded = [];

  const results = await Promise.allSettled(
    encodedFiles.map((file) =>
      uploader.upload(file.data, {
        folder: `vehicles/${file.fieldname}`,
        resource_type: "auto",
        unique_filename: true,
      })
    )
  );

  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value?.secure_url) {
      uploaded.push(r.value.secure_url);
    } else {
      console.error("Cloudinary upload failed at index:", i, r.reason || r);
    }
  });

  return uploaded;
}

/* ============================================================
   VENDOR ADD VEHICLE  (Pending admin approval)
   - expects base64-encoded files via base64Converter(req)
   - marks vehicle as vendor-submitted with isVendorVehicle: true
============================================================ */
export const vendorAddVehicle = async (req, res, next) => {
  try {
    if (!req.body || Object.keys(req.body).length === 0)
      return next(errorHandler(400, "Body cannot be empty"));

    const encodedFiles = base64Converter(req);
    if (!encodedFiles?.length) return next(errorHandler(400, "No images received"));

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
      addedBy,
    } = req.body;

    // vendor id can come from authenticated token (req.vendor.id) or the addedBy field
    const vendorId = req.vendor?.id || addedBy;
    if (!vendorId) return next(errorHandler(400, "Vendor id missing"));

    const uploadedImages = await uploadEncodedFiles(encodedFiles);
    if (uploadedImages.length === 0) return next(errorHandler(500, "Image upload failed"));

    const newVehicle = new Vehicle({
      registeration_number,
      company,
      name,
      model,
      car_title: title,
      car_description: description,
      base_package,
      price,
      year_made,
      fuel_type,
      seats: seat,
      transmition: transmition_type,
      insurance_end: insurance_end_date,
      registeration_end: registeration_end_date,
      pollution_end: polution_end_date,
      car_type,
      location,
      district,
      image: uploadedImages,

      // Vendor submission flags (consistent booleans)
      isVendorVehicle: true,
      isAdminApproved: false,
      isRejected: false,
      isDeleted: false,

      // vendor ID (string or ObjectId)
      addedBy: vendorId,
    });

    const saved = await newVehicle.save();

    console.log("vendorAddVehicle -> saved id:", saved._id);

    return res.status(201).json({
      success: true,
      message: "Vehicle submitted for admin approval",
      vehicle: saved,
    });
  } catch (error) {
    console.error("vendorAddVehicle error:", error);
    if (error.code === 11000)
      return next(errorHandler(409, "Vehicle registration number already exists"));
    return next(errorHandler(500, "Vehicle failed to add"));
  }
};

/* ============================================================
   VENDOR EDIT VEHICLE (Re-reviewed by admin)
   - resets approval flags so admin can re-review the edited vehicle
============================================================ */
export const vendorEditVehicles = async (req, res, next) => {
  try {
    const vehicle_id = req.params.id;

    if (!vehicle_id) return next(errorHandler(400, "Vehicle ID missing"));
    if (!req.body?.formData) return next(errorHandler(400, "Missing form data"));

    const data = req.body.formData;

    const updated = await Vehicle.findByIdAndUpdate(
      vehicle_id,
      {
        registeration_number: data.registeration_number,
        company: data.company,
        name: data.name,
        model: data.model,
        car_title: data.title,
        car_description: data.description,
        base_package: data.base_package,
        price: data.price,
        year_made: data.year_made,
        fuel_type: data.fuelType,
        seats: data.Seats,
        transmition: data.transmitionType,
        insurance_end: data.insurance_end_date,
        registeration_end: data.Registeration_end_date,
        pollution_end: data.polution_end_date,
        car_type: data.carType,
        location: data.vehicleLocation,
        district: data.vehicleDistrict,

        // Editing requires admin re-approval
        isAdminApproved: false,
        isRejected: false,
      },
      { new: true }
    );

    if (!updated) return next(errorHandler(404, "Vehicle not found"));

    return res.status(200).json({
      success: true,
      message: "Vehicle updated successfully",
      vehicle: updated,
    });
  } catch (error) {
    console.error("vendorEditVehicles error:", error);
    return next(errorHandler(500, "Error while editing vehicle"));
  }
};

/* ============================================================
   VENDOR DELETE VEHICLE (Soft delete)
============================================================ */
export const vendorDeleteVehicles = async (req, res, next) => {
  try {
    const vehicle_id = req.params.id;
    if (!vehicle_id) return next(errorHandler(400, "Vehicle ID missing"));

    const deleted = await Vehicle.findByIdAndUpdate(
      vehicle_id,
      { isDeleted: true },
      { new: true }
    );

    if (!deleted) return next(errorHandler(404, "Vehicle not found"));

    return res.status(200).json({
      success: true,
      message: "Vehicle deleted successfully",
    });
  } catch (error) {
    console.error("vendorDeleteVehicles error:", error);
    return next(errorHandler(500, "Error while deleting vehicle"));
  }
};

/* ============================================================
   SHOW ALL VEHICLES FOR SPECIFIC VENDOR
   - supports vendorId passed as string or ObjectId
   - returns { success, count, vehicles }
   - defensive: matches addedBy as string and ObjectId
============================================================ */
export const showVendorVehicles = async (req, res, next) => {
  try {
    // vendorId comes from authenticated token or request body (POST { _id } or { addedBy })
    const vendorIdRaw = req.vendor?.id || req.body?._id || req.body?.addedBy;
    if (!vendorIdRaw) return next(errorHandler(400, "Vendor id missing"));

    // Build match conditions accepting both string and ObjectId forms
    const matchBy = [];
    if (mongoose.Types.ObjectId.isValid(String(vendorIdRaw))) {
      matchBy.push({ addedBy: String(vendorIdRaw) }, { addedBy: new mongoose.Types.ObjectId(String(vendorIdRaw)) });
    } else {
      matchBy.push({ addedBy: vendorIdRaw });
    }

    const vehicles = await Vehicle.find({
      $and: [{ isDeleted: false }, { $or: matchBy }],
    })
      .sort({ createdAt: -1 })
      .lean();

    console.log(`showVendorVehicles: vendor=${vendorIdRaw} -> found=${vehicles.length}`);

    return res.status(200).json({
      success: true,
      count: vehicles.length,
      vehicles,
    });
  } catch (error) {
    console.error("showVendorVehicles error:", error);
    return next(errorHandler(500, "Error while fetching vendor vehicles"));
  }
};

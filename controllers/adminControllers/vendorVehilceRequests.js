import Vehicle from "../../models/vehicleModel.js";
import { errorHandler } from "../../utils/error.js";

// ======================================================
// FETCH PENDING VENDOR VEHICLE REQUESTS
// ======================================================
export const fetchVendorVehilceRequests = async (req, res, next) => {
  try {
    const vendorRequests = await Vehicle.find({
      isVendorVehicle: true,
      isAdminApproved: false,
      isRejected: false,
      isDeleted: false,
    }).lean();

    return res.status(200).json({ success: true, requests: vendorRequests });
  } catch (error) {
    console.log(error);
    return next(errorHandler(500, "Error while fetching vendor requests"));
  }
};

// ======================================================
// APPROVE VENDOR VEHICLE
// ======================================================
export const approveVendorVehicleRequest = async (req, res, next) => {
  try {
    const { _id } = req.body;
    if (!_id) return next(errorHandler(400, "Missing vehicle id"));

    const updated = await Vehicle.findByIdAndUpdate(
      _id,
      {
        isAdminApproved: true,
        isRejected: false,
      },
      { new: true }
    );

    if (!updated)
      return next(errorHandler(404, "Vehicle not found for approval"));

    return res.status(200).json({ success: true, updated });
  } catch (error) {
    console.log(error);
    return next(errorHandler(500, "Error while approving vendor request"));
  }
};

// ======================================================
// REJECT VENDOR VEHICLE
// ======================================================
export const rejectVendorVehicleRequest = async (req, res, next) => {
  try {
    const { _id } = req.body;
    if (!_id) return next(errorHandler(400, "Missing vehicle id"));

    const updated = await Vehicle.findByIdAndUpdate(
      _id,
      {
        isRejected: true,
        isAdminApproved: false,
      },
      { new: true }
    );

    if (!updated)
      return next(errorHandler(404, "Vehicle not found for rejection"));

    return res.status(200).json({ success: true, updated });
  } catch (error) {
    console.log(error);
    return next(errorHandler(500, "Error while rejecting vendor request"));
  }
};

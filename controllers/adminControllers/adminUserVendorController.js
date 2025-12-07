// backend/controllers/adminControllers/adminUserVendorController.js
import User from "../../models/userModel.js";
import { errorHandler } from "../../utils/error.js";
import { Parser } from "json2csv";

// 🔹 Get all normal users (role: "user")
export const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find({ role: "user" }).select(
      "-password -refreshToken -resetPasswordToken -resetPasswordExpires"
    );

    // ✅ Always 200, even if empty (better UX for tables)
    return res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (err) {
    console.error("getAllUsers error:", err);
    return next(errorHandler(500, "Could not fetch users"));
  }
};

// 🔹 Get all vendors (role: "vendor")
export const getAllVendors = async (req, res, next) => {
  try {
    const vendors = await User.find({ role: "vendor" }).select(
      "-password -refreshToken -resetPasswordToken -resetPasswordExpires"
    );

    return res.status(200).json({
      success: true,
      count: vendors.length,
      vendors,
    });
  } catch (err) {
    console.error("getAllVendors error:", err);
    return next(errorHandler(500, "Could not fetch vendors"));
  }
};

// 🔹 Update vendor details (from Admin)
export const updateVendorById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { username, email, phoneNumber } = req.body;

    const update = {};
    if (username !== undefined) update.username = username;
    if (email !== undefined) update.email = email;
    if (phoneNumber !== undefined) update.phoneNumber = phoneNumber;

    const vendor = await User.findOneAndUpdate(
      { _id: id, role: "vendor" }, // ensure it's a vendor
      update,
      { new: true, runValidators: true }
    ).select("-password -refreshToken -resetPasswordToken -resetPasswordExpires");

    if (!vendor) {
      return next(errorHandler(404, "Vendor not found"));
    }

    return res.status(200).json({
      success: true,
      vendor,
    });
  } catch (err) {
    console.error("updateVendorById error:", err);
    return next(errorHandler(500, "Could not update vendor"));
  }
};

// 🔹 Download vendor report as CSV
export const downloadVendorReportCsv = async (req, res, next) => {
  try {
    const vendors = await User.find({ role: "vendor" }).select(
      "username email phoneNumber isVendor createdAt"
    );

    if (!vendors.length) {
      return next(errorHandler(404, "No vendors found to export"));
    }

    const data = vendors.map((v) => ({
      Username: v.username || "",
      Email: v.email || "",
      PhoneNumber: v.phoneNumber || "",
      IsVendor: v.isVendor ? "Yes" : "No",
      CreatedAt: v.createdAt,
    }));

    const parser = new Parser();
    const csv = parser.parse(data);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="vendors_report.csv"'
    );
    return res.status(200).send(csv);
  } catch (err) {
    console.error("downloadVendorReportCsv error:", err);
    return next(errorHandler(500, "Could not generate vendor CSV report"));
  }
};

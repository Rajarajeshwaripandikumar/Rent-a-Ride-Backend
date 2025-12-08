// backend/routes/adminRoutes.js
import express from "express";

import {
  getAdminProfile,
  updateAdminProfile,
  getAdminOverview,
  getAllAccounts,
  adminAuth,
  adminAuthCheck,
} from "../controllers/adminControllers/adminController.js";

import { signIn } from "../controllers/authController.js";
import { signOut } from "../controllers/userControllers/userController.js";
import { verifyToken } from "../middleware/verifyToken.js";

import {
  addProduct,
  deleteVehicle,
  editVehicle,
  showVehicles,
} from "../controllers/adminControllers/dashboardController.js";

import { multerUploads } from "../utils/multer.js";

import { getCarModelData } from "../controllers/adminControllers/masterCollectionController.js";

import {
  approveVendorVehicleRequest,
  fetchVendorVehilceRequests,
  rejectVendorVehicleRequest,
} from "../controllers/adminControllers/vendorVehilceRequests.js";

import {
  allBookings,
  changeStatus,
} from "../controllers/adminControllers/bookingsController.js";

import { getLocationsLov } from "../controllers/adminControllers/locationLovController.js";

import User from "../models/userModel.js";
import Booking from "../models/BookingModel.js";
import Vehicle from "../models/vehicleModel.js";

import { Parser } from "json2csv";
import { errorHandler } from "../utils/error.js";

const router = express.Router();

/* ===========================
   AUTH
=========================== */

// Admin login
router.post("/login", signIn);

// Check if admin authenticated
router.get("/auth-check", verifyToken, adminAuth, adminAuthCheck);

// Admin profile
router.get("/profile", verifyToken, adminAuth, getAdminProfile);
router.put("/profile", verifyToken, adminAuth, updateAdminProfile);

// Logout
router.get("/signout", signOut);

/* ===========================
   VEHICLES
=========================== */

router.post("/addProduct", verifyToken, adminAuth, multerUploads, addProduct);

router.get("/showVehicles", verifyToken, adminAuth, showVehicles);

router.delete("/deleteVehicle/:id", verifyToken, adminAuth, deleteVehicle);

router.put("/editVehicle/:id", verifyToken, adminAuth, editVehicle);

/* ===========================
   MASTER DATA
=========================== */

router.get("/getVehicleModels", verifyToken, adminAuth, getCarModelData);

router.get("/getLocationsLov", verifyToken, adminAuth, getLocationsLov);

/* ===========================
   VENDOR VEHICLE REQUESTS
=========================== */

router.get(
  "/fetchVendorVehilceRequests",
  verifyToken,
  adminAuth,
  fetchVendorVehilceRequests
);

router.post(
  "/approveVendorVehicleRequest",
  verifyToken,
  adminAuth,
  approveVendorVehicleRequest
);

router.post(
  "/rejectVendorVehicleRequest",
  verifyToken,
  adminAuth,
  rejectVendorVehicleRequest
);

/* ===========================
   BOOKINGS
=========================== */

router.get("/allBookings", verifyToken, adminAuth, allBookings);
router.post("/changeStatus", verifyToken, adminAuth, changeStatus);

/* ===========================
   USERS & VENDORS
=========================== */

// Normal users
router.get("/users", verifyToken, adminAuth, async (req, res, next) => {
  try {
    const users = await User.find({ role: "user" }).select(
      "-password -refreshToken -resetPasswordToken -resetPasswordExpires"
    );
    res.status(200).json({ success: true, count: users.length, users });
  } catch (err) {
    console.error(err);
    next(errorHandler(500, "Could not fetch users"));
  }
});

// Vendors (for dashboard + frontend CSV)
router.get("/vendors", verifyToken, adminAuth, async (req, res, next) => {
  try {
    const vendors = await User.find({ role: "vendor" }).select(
      // ✅ explicitly send the fields you need on frontend & CSV
      "username email phoneNumber isVendor createdAt profilePicture role status"
    );

    res.status(200).json({ success: true, count: vendors.length, vendors });
  } catch (err) {
    console.error(err);
    next(errorHandler(500, "Could not fetch vendors"));
  }
});

// Update vendor
router.put("/vendors/:id", verifyToken, adminAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const updateFields = {};
    ["username", "email", "phoneNumber"].forEach((f) => {
      if (req.body[f] !== undefined) updateFields[f] = req.body[f];
    });

    const updated = await User.findOneAndUpdate(
      { _id: id, role: "vendor" },
      updateFields,
      { new: true, runValidators: true }
    ).select("-password");

    if (!updated) return next(errorHandler(404, "Vendor not found"));

    res.status(200).json({ success: true, vendor: updated });
  } catch (err) {
    console.error(err);
    next(errorHandler(500, "Could not update vendor"));
  }
});

// Vendor CSV export (backend-side CSV)
router.get(
  "/vendors/report/csv",
  verifyToken,
  adminAuth,
  async (req, res, next) => {
    try {
      const vendors = await User.find({ role: "vendor" }).select(
        "username email phoneNumber isVendor createdAt"
      );

      if (!vendors.length)
        return next(errorHandler(404, "No vendors found to export"));

      const data = vendors.map((v) => ({
        Username: v.username || "",
        Email: v.email || "",
        // ✅ make sure it's a string, so it appears properly
        Phone: v.phoneNumber ? String(v.phoneNumber) : "",
        IsVendor: v.isVendor ? "Yes" : "No",
        // ✅ send as ISO string (your frontend can reformat if needed)
        CreatedAt: v.createdAt ? v.createdAt.toISOString() : "",
      }));

      const parser = new Parser();
      const csv = parser.parse(data);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="vendors_report.csv"'
      );

      res.status(200).send(csv);
    } catch (err) {
      console.error(err);
      next(errorHandler(500, "Could not generate vendor CSV"));
    }
  }
);

/* ===========================
   REAL MONTHLY SALES STATS
=========================== */

// JSON stats for dashboard
router.get("/stats", verifyToken, adminAuth, async (req, res, next) => {
  try {
    const customers = await User.countDocuments({ role: "user" });

    const vehiclesCount = await Vehicle.countDocuments({
      isDeleted: false,
    });

    const bookings = await Booking.find({}, "totalPrice createdAt").lean();
    const bookingsCount = bookings.length;

    const earnings = bookings.reduce(
      (sum, b) => sum + (Number(b.totalPrice) || 0),
      0
    );

    // ✅ populate userId so Recent Transactions can show username/email
    const recentBookings = await Booking.find({})
      .populate("userId", "username email phoneNumber")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Monthly revenue aggregation
    const monthlyAgg = await Booking.aggregate([
      {
        $match: {
          createdAt: { $exists: true },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          revenue: { $sum: "$totalPrice" },
        },
      },
      {
        $sort: {
          "_id.year": 1,
          "_id.month": 1,
        },
      },
    ]);

    const salesOverview = monthlyAgg.map((row) => {
      const year = row._id.year;
      const month = row._id.month;

      const date = new Date(year, month - 1, 1);
      const label = date.toLocaleString("en-US", { month: "short" });

      return {
        key: `${year}-${String(month).padStart(2, "0")}`,
        month: label, // e.g. "Dec"
        revenue: row.revenue, // e.g. 8350
      };
    });

    res.json({
      success: true,
      earnings,
      customers,
      products: vehiclesCount,
      orders: bookingsCount,
      recentTransactions: recentBookings,
      salesOverview, // 👈 used by frontend Line chart
    });
  } catch (err) {
    console.error("ADMIN /stats error:", err);
    next(err);
  }
});

// CSV export for the same stats (for "Download report" button)
router.get(
  "/stats/report/csv",
  verifyToken,
  adminAuth,
  async (req, res, next) => {
    try {
      const customers = await User.countDocuments({ role: "user" });

      const vehiclesCount = await Vehicle.countDocuments({
        isDeleted: false,
      });

      // 👇 Load full bookings with user & vehicle populated
      const bookings = await Booking.find({}) // no filter
        .populate("userId", "username email phoneNumber")
        .populate("vehicleId", "name brand model regNumber")
        .lean();

      const bookingsCount = bookings.length;

      const earnings = bookings.reduce(
        (sum, b) => sum + (Number(b.totalPrice) || 0),
        0
      );

      // Monthly revenue + orders aggregation
      const monthlyAgg = await Booking.aggregate([
        { $match: { createdAt: { $exists: true } } },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
            },
            revenue: { $sum: "$totalPrice" },
            orders: { $sum: 1 },
          },
        },
        {
          $sort: {
            "_id.year": 1,
            "_id.month": 1,
          },
        },
      ]);

      // ===== SUMMARY ROW =====
      const summaryRow = {
        Section: "Summary",
        Month: "",
        Earnings: earnings,
        Customers: customers,
        Vehicles: vehiclesCount,
        Orders: bookingsCount,
      };

      // ===== MONTHLY DETAIL ROWS =====
      const monthlyRows = monthlyAgg.map((row) => {
        const year = row._id.year;
        const month = row._id.month;
        const date = new Date(year, month - 1, 1);
        const label = date.toLocaleString("en-US", { month: "short" });

        return {
          Section: "Monthly",
          Month: label, // Jan, Feb, ...
          Earnings: row.revenue,
          Customers: "",
          Vehicles: "",
          Orders: row.orders,
        };
      });

      // ===== DETAILED BOOKING ROWS =====
      const bookingRows = bookings.map((b) => ({
        Section: "Booking",
        Month: "",

        // summary columns — left blank for bookings
        Earnings: "",
        Customers: "",
        Vehicles: "",
        Orders: "",

        // booking-specific info (match your schema)
        BookingId: b._id,
        CustomerName: b.userId?.username || "",
        CustomerEmail: b.userId?.email || "",
        // ✅ make sure phone is string
        CustomerPhone: b.userId?.phoneNumber
          ? String(b.userId.phoneNumber)
          : "",
        VehicleName:
          b.vehicleId?.name ||
          `${b.vehicleId?.brand || ""} ${b.vehicleId?.model || ""}`,
        VehicleNumber: b.vehicleId?.regNumber || "",
        PickupDate: b.pickupDate,
        DropoffDate: b.dropOffDate,
        PickupLocation: b.pickUpLocation,
        DropoffLocation: b.dropOffLocation,
        TotalPrice: b.totalPrice,
        Status: b.status,
        RazorpayOrderId: b.razorpayOrderId,
        RazorpayPaymentId: b.razorpayPaymentId,
        CreatedAt: b.createdAt ? b.createdAt.toISOString() : "",
      }));

      // Explicit field order for a clean CSV header
      const fields = [
        "Section",
        "Month",
        "Earnings",
        "Customers",
        "Vehicles",
        "Orders",
        "BookingId",
        "CustomerName",
        "CustomerEmail",
        "CustomerPhone",
        "VehicleName",
        "VehicleNumber",
        "PickupDate",
        "DropoffDate",
        "PickupLocation",
        "DropoffLocation",
        "TotalPrice",
        "Status",
        "RazorpayOrderId",
        "RazorpayPaymentId",
        "CreatedAt",
      ];

      const data = [summaryRow, ...monthlyRows, ...bookingRows];

      const parser = new Parser({ fields });
      const csv = parser.parse(data);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="admin_stats_report.csv"'
      );

      res.status(200).send(csv);
    } catch (err) {
      console.error("ADMIN /stats/report/csv error:", err);
      next(errorHandler(500, "Could not generate detailed stats CSV"));
    }
  }
);

/* ===========================
   HEALTH CHECK
=========================== */

router.get("/ping", (req, res) => {
  res.json({ ok: true, message: "Admin API alive" });
});

export default router;
// backend/routes/adminRoutes.js
import express from "express";

import {
  getAdminProfile,
  updateAdminProfile,
  getAdminOverview,
  getAllAccounts,
  adminAuth,
  adminAuthCheck,
} from "../controllers/adminControllers/adminController.js";

import { signIn } from "../controllers/authController.js";
import { signOut } from "../controllers/userControllers/userController.js";
import { verifyToken } from "../middleware/verifyToken.js";

import {
  addProduct,
  deleteVehicle,
  editVehicle,
  showVehicles,
} from "../controllers/adminControllers/dashboardController.js";

import { multerUploads } from "../utils/multer.js";

import { getCarModelData } from "../controllers/adminControllers/masterCollectionController.js";

import {
  approveVendorVehicleRequest,
  fetchVendorVehilceRequests,
  rejectVendorVehicleRequest,
} from "../controllers/adminControllers/vendorVehilceRequests.js";

import {
  allBookings,
  changeStatus,
} from "../controllers/adminControllers/bookingsController.js";

import { getLocationsLov } from "../controllers/adminControllers/locationLovController.js";

import User from "../models/userModel.js";
import Booking from "../models/BookingModel.js";
import Vehicle from "../models/vehicleModel.js";

import { Parser } from "json2csv";
import { errorHandler } from "../utils/error.js";

const router = express.Router();

/* ===========================
   AUTH
=========================== */

// Admin login
router.post("/login", signIn);

// Check if admin authenticated
router.get("/auth-check", verifyToken, adminAuth, adminAuthCheck);

// Admin profile
router.get("/profile", verifyToken, adminAuth, getAdminProfile);
router.put("/profile", verifyToken, adminAuth, updateAdminProfile);

// Logout
router.get("/signout", signOut);

/* ===========================
   VEHICLES
=========================== */

router.post("/addProduct", verifyToken, adminAuth, multerUploads, addProduct);

router.get("/showVehicles", verifyToken, adminAuth, showVehicles);

router.delete("/deleteVehicle/:id", verifyToken, adminAuth, deleteVehicle);

router.put("/editVehicle/:id", verifyToken, adminAuth, editVehicle);

/* ===========================
   MASTER DATA
=========================== */

router.get("/getVehicleModels", verifyToken, adminAuth, getCarModelData);

router.get("/getLocationsLov", verifyToken, adminAuth, getLocationsLov);

/* ===========================
   VENDOR VEHICLE REQUESTS
=========================== */

router.get(
  "/fetchVendorVehilceRequests",
  verifyToken,
  adminAuth,
  fetchVendorVehilceRequests
);

router.post(
  "/approveVendorVehicleRequest",
  verifyToken,
  adminAuth,
  approveVendorVehicleRequest
);

router.post(
  "/rejectVendorVehicleRequest",
  verifyToken,
  adminAuth,
  rejectVendorVehicleRequest
);

/* ===========================
   BOOKINGS
=========================== */

router.get("/allBookings", verifyToken, adminAuth, allBookings);
router.post("/changeStatus", verifyToken, adminAuth, changeStatus);

/* ===========================
   USERS & VENDORS
=========================== */

// Normal users
router.get("/users", verifyToken, adminAuth, async (req, res, next) => {
  try {
    const users = await User.find({ role: "user" }).select(
      "-password -refreshToken -resetPasswordToken -resetPasswordExpires"
    );
    res.status(200).json({ success: true, count: users.length, users });
  } catch (err) {
    console.error(err);
    next(errorHandler(500, "Could not fetch users"));
  }
});

// Vendors
router.get("/vendors", verifyToken, adminAuth, async (req, res, next) => {
  try {
    const vendors = await User.find({ role: "vendor" }).select(
      "-password -refreshToken -resetPasswordToken -resetPasswordExpires"
    );
    res.status(200).json({ success: true, count: vendors.length, vendors });
  } catch (err) {
    console.error(err);
    next(errorHandler(500, "Could not fetch vendors"));
  }
});

// Update vendor
router.put("/vendors/:id", verifyToken, adminAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const updateFields = {};
    ["username", "email", "phoneNumber"].forEach((f) => {
      if (req.body[f] !== undefined) updateFields[f] = req.body[f];
    });

    const updated = await User.findOneAndUpdate(
      { _id: id, role: "vendor" },
      updateFields,
      { new: true, runValidators: true }
    ).select("-password");

    if (!updated) return next(errorHandler(404, "Vendor not found"));

    res.status(200).json({ success: true, vendor: updated });
  } catch (err) {
    console.error(err);
    next(errorHandler(500, "Could not update vendor"));
  }
});

// Vendor CSV export
router.get(
  "/vendors/report/csv",
  verifyToken,
  adminAuth,
  async (req, res, next) => {
    try {
      const vendors = await User.find({ role: "vendor" }).select(
        "username email phoneNumber isVendor createdAt"
      );

      if (!vendors.length)
        return next(errorHandler(404, "No vendors found to export"));

      const data = vendors.map((v) => ({
        Username: v.username,
        Email: v.email,
        Phone: v.phoneNumber,
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

      res.status(200).send(csv);
    } catch (err) {
      console.error(err);
      next(errorHandler(500, "Could not generate vendor CSV"));
    }
  }
);

/* ===========================
   REAL MONTHLY SALES STATS
=========================== */

// JSON stats for dashboard
router.get("/stats", verifyToken, adminAuth, async (req, res, next) => {
  try {
    const customers = await User.countDocuments({ role: "user" });

    const vehiclesCount = await Vehicle.countDocuments({
      isDeleted: false,
    });

    const bookings = await Booking.find({}, "totalPrice createdAt").lean();
    const bookingsCount = bookings.length;

    const earnings = bookings.reduce(
      (sum, b) => sum + (Number(b.totalPrice) || 0),
      0
    );

    // ✅ populate userId so Recent Transactions can show username/email
    const recentBookings = await Booking.find({})
      .populate("userId", "username email phoneNumber")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Monthly revenue aggregation
    const monthlyAgg = await Booking.aggregate([
      {
        $match: {
          createdAt: { $exists: true },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          revenue: { $sum: "$totalPrice" },
        },
      },
      {
        $sort: {
          "_id.year": 1,
          "_id.month": 1,
        },
      },
    ]);

    const salesOverview = monthlyAgg.map((row) => {
      const year = row._id.year;
      const month = row._id.month;

      const date = new Date(year, month - 1, 1);
      const label = date.toLocaleString("en-US", { month: "short" });

      return {
        key: `${year}-${String(month).padStart(2, "0")}`,
        month: label, // e.g. "Dec"
        revenue: row.revenue, // e.g. 8350
      };
    });

    res.json({
      success: true,
      earnings,
      customers,
      products: vehiclesCount,
      orders: bookingsCount,
      recentTransactions: recentBookings,
      salesOverview, // 👈 used by frontend Line chart
    });
  } catch (err) {
    console.error("ADMIN /stats error:", err);
    next(err);
  }
});

// CSV export for the same stats (for "Download report" button)
router.get(
  "/stats/report/csv",
  verifyToken,
  adminAuth,
  async (req, res, next) => {
    try {
      const customers = await User.countDocuments({ role: "user" });

      const vehiclesCount = await Vehicle.countDocuments({
        isDeleted: false,
      });

      // 👇 Load full bookings with user & vehicle populated
      const bookings = await Booking.find({})
        .populate("userId", "username email phoneNumber")
        .populate("vehicleId", "name brand model regNumber")
        .lean();

      const bookingsCount = bookings.length;

      const earnings = bookings.reduce(
        (sum, b) => sum + (Number(b.totalPrice) || 0),
        0
      );

      // Monthly revenue + orders aggregation
      const monthlyAgg = await Booking.aggregate([
        { $match: { createdAt: { $exists: true } } },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
            },
            revenue: { $sum: "$totalPrice" },
            orders: { $sum: 1 },
          },
        },
        {
          $sort: {
            "_id.year": 1,
            "_id.month": 1,
          },
        },
      ]);

      // ===== SUMMARY ROW =====
      const summaryRow = {
        Section: "Summary",
        Month: "",
        Earnings: earnings,
        Customers: customers,
        Vehicles: vehiclesCount,
        Orders: bookingsCount,
      };

      // ===== MONTHLY DETAIL ROWS =====
      const monthlyRows = monthlyAgg.map((row) => {
        const year = row._id.year;
        const month = row._id.month;
        const date = new Date(year, month - 1, 1);
        const label = date.toLocaleString("en-US", { month: "short" });

        return {
          Section: "Monthly",
          Month: label, // Jan, Feb, ...
          Earnings: row.revenue,
          Customers: "",
          Vehicles: "",
          Orders: row.orders,
        };
      });

      // ===== DETAILED BOOKING ROWS =====
      const bookingRows = bookings.map((b) => ({
        Section: "Booking",
        Month: "",

        // summary columns — left blank for bookings
        Earnings: "",
        Customers: "",
        Vehicles: "",
        Orders: "",

        // booking-specific info (match your schema)
        BookingId: b._id,
        CustomerName: b.userId?.username || "",
        CustomerEmail: b.userId?.email || "",
        CustomerPhone: b.userId?.phoneNumber || "",
        VehicleName:
          b.vehicleId?.name ||
          `${b.vehicleId?.brand || ""} ${b.vehicleId?.model || ""}`,
        VehicleNumber: b.vehicleId?.regNumber || "",
        PickupDate: b.pickupDate,
        DropoffDate: b.dropOffDate,
        PickupLocation: b.pickUpLocation,
        DropoffLocation: b.dropOffLocation,
        TotalPrice: b.totalPrice,
        Status: b.status,
        RazorpayOrderId: b.razorpayOrderId,
        RazorpayPaymentId: b.razorpayPaymentId,
        CreatedAt: b.createdAt,
      }));

      // Explicit field order for a clean CSV header
      const fields = [
        "Section",
        "Month",
        "Earnings",
        "Customers",
        "Vehicles",
        "Orders",
        "BookingId",
        "CustomerName",
        "CustomerEmail",
        "CustomerPhone",
        "VehicleName",
        "VehicleNumber",
        "PickupDate",
        "DropoffDate",
        "PickupLocation",
        "DropoffLocation",
        "TotalPrice",
        "Status",
        "RazorpayOrderId",
        "RazorpayPaymentId",
        "CreatedAt",
      ];

      const data = [summaryRow, ...monthlyRows, ...bookingRows];

      const parser = new Parser({ fields });
      const csv = parser.parse(data);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="admin_stats_report.csv"'
      );

      res.status(200).send(csv);
    } catch (err) {
      console.error("ADMIN /stats/report/csv error:", err);
      next(errorHandler(500, "Could not generate detailed stats CSV"));
    }
  }
);

/* ===========================
   HEALTH CHECK
=========================== */

router.get("/ping", (req, res) => {
  res.json({ ok: true, message: "Admin API alive" });
});

export default router;

// backend/controllers/adminControllers/adminController.js
import User from "../../models/userModel.js";
import Booking from "../../models/BookingModel.js";
import Vehicle from "../../models/vehicleModel.js";
import { errorHandler } from "../../utils/error.js";

/**
 * MIDDLEWARE: adminAuth
 * Ensures the user is logged in AND has role "admin"
 */
export const adminAuth = (req, res, next) => {
  if (!req.user) {
    return next(errorHandler(401, "Not authenticated"));
  }

  if (req.user.role !== "admin") {
    return next(errorHandler(403, "Admin access only"));
  }

  return next();
};

/**
 * GET /api/admin/auth-check
 */
export const adminAuthCheck = (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Admin authenticated",
  });
};

/**
 * GET /api/admin/profile
 */
export const getAdminProfile = async (req, res, next) => {
  try {
    const admin = await User.findById(req.user.id).select("-password");

    if (!admin) {
      return next(errorHandler(404, "Admin not found"));
    }

    return res.status(200).json({
      success: true,
      admin,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/admin/profile
 */
export const updateAdminProfile = async (req, res, next) => {
  try {
    const { username, email, phoneNumber, adress, profilePicture } = req.body;

    const updates = {};
    if (username) updates.username = username;
    if (email) updates.email = email;
    if (phoneNumber) updates.phoneNumber = phoneNumber;
    if (adress) updates.adress = adress;
    if (profilePicture) updates.profilePicture = profilePicture;

    const updatedAdmin = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true }
    ).select("-password");

    if (!updatedAdmin) {
      return next(errorHandler(404, "Admin not found"));
    }

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      admin: updatedAdmin,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/overview
 * Simple counts by role
 */
export const getAdminOverview = async (req, res, next) => {
  try {
    const [totalUsers, totalVendors, totalAdmins, totalAccounts] =
      await Promise.all([
        User.countDocuments({ role: "user" }),
        User.countDocuments({ role: "vendor" }),
        User.countDocuments({ role: "admin" }),
        User.countDocuments({}),
      ]);

    return res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        totalVendors,
        totalAdmins,
        totalAccounts,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/accounts
 * Returns all users (any role)
 */
export const getAllAccounts = async (req, res, next) => {
  try {
    const users = await User.find().select("-password").lean();

    return res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/stats
 * Dashboard stats + monthly analytics for AdminHomeMain.jsx
 */
export const getAdminStats = async (req, res, next) => {
  try {
    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(now.getMonth() - 5); // last 6 months including current

    // ✅ use correct enum values: from your Booking schema
    const BOOKING_DONE_STATUSES = ["booked", "tripCompleted"];

    // 1) Totals
    const [orders, earningsAgg, customers, products] = await Promise.all([
      // bookings count
      Booking.countDocuments({ status: { $in: BOOKING_DONE_STATUSES } }),

      // total earnings
      Booking.aggregate([
        {
          $match: { status: { $in: BOOKING_DONE_STATUSES } },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$totalPrice" },
          },
        },
      ]),

      // customers = normal users
      User.countDocuments({ role: "user" }),

      // products = vehicles
      Vehicle.countDocuments(),
    ]);

    const earnings = earningsAgg[0]?.total || 0;

    // 2) Recent transactions (LATEST 5 BOOKINGS) 🔥
    //    Manual user join to avoid any populate weirdness
    const recentRaw = await Booking.find({
      status: { $in: BOOKING_DONE_STATUSES },
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    // collect distinct userIds
    const userIds = [
      ...new Set(
        recentRaw
          .map((b) => (b.userId ? b.userId.toString() : null))
          .filter(Boolean)
      ),
    ];

    // fetch those users
    const users = await User.find({ _id: { $in: userIds } })
      .select("username email")
      .lean();

    const userMap = new Map(
      users.map((u) => [u._id.toString(), u])
    );

    // normalize recentTransactions into shape frontend expects
    const recentTransactions = recentRaw.map((b, index) => {
      const u = b.userId ? userMap.get(b.userId.toString()) : null;

      return {
        _id: b._id,
        bookingCode: `BKG-${String(index + 1).padStart(3, "0")}`,
        userId: u
          ? {
              username: u.username || "",
              email: u.email || "",
            }
          : null,
        customerName: b.customerName || "",
        createdAt: b.createdAt,
        totalPrice: b.totalPrice,
        status: b.status,
      };
    });

    // 3) Monthly bookings trend (for chart)
    const monthlyAgg = await Booking.aggregate([
      {
        $match: {
          status: { $in: BOOKING_DONE_STATUSES },
          createdAt: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          totalBookings: { $sum: 1 },
          totalSale: { $sum: "$totalPrice" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const labels = monthlyAgg.map((m) => {
      const monthIndex = m._id.month - 1;
      return `${monthNames[monthIndex]} ${m._id.year}`;
    });

    const series = [
      {
        name: "Bookings",
        data: monthlyAgg.map((m) => m.totalBookings),
      },
    ];

    return res.status(200).json({
      earnings,
      customers,
      products,
      orders,
      recentTransactions,
      salesOverview: { labels, series },
    });
  } catch (error) {
    console.error("getAdminStats error:", error);
    return next(errorHandler(500, "Failed to load admin stats"));
  }
};

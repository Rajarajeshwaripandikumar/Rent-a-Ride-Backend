import User from "../../models/userModel.js";
import { errorHandler } from "../../utils/error.js";
import bcryptjs from "bcryptjs";

/**
 * UPDATE USER
 * Rules:
 *  - User can update ONLY themselves
 *  - Admin can update any user
 */
export const updateUser = async (req, res, next) => {
  try {
    const targetUserId = req.params.id;

    // Auth check (user or admin)
    if (req.user.id !== targetUserId && req.user.role !== "admin") {
      return next(errorHandler(401, "You can only update your account"));
    }

    const updates = {};

    if (req.body.username) updates.username = req.body.username;
    if (req.body.email) updates.email = req.body.email;
    if (req.body.profilePicture) updates.profilePicture = req.body.profilePicture;
    if (req.body.phoneNumber) updates.phoneNumber = req.body.phoneNumber;
    if (req.body.adress) updates.adress = req.body.adress;

    // Password update
    if (req.body.password) {
      updates.password = bcryptjs.hashSync(req.body.password, 10);
    }

    // ADMIN ROLE CHANGE (optional)
    if (req.user.role === "admin" && req.body.role) {
      updates.role = req.body.role;
      updates.isUser = req.body.role === "user";
      updates.isVendor = req.body.role === "vendor";
      updates.isAdmin = req.body.role === "admin";
    }

    const updatedUser = await User.findByIdAndUpdate(
      targetUserId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updatedUser) {
      return next(errorHandler(404, "User not found"));
    }

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      user: updatedUser,
    });

  } catch (error) {
    // Handle duplicate key error (email/phone conflict)
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return next(errorHandler(409, `${field} already exists`));
    }
    next(error);
  }
};


/**
 * DELETE USER
 * Rules:
 *  - User can delete themselves
 *  - Admin can delete any user
 */
export const deleteUser = async (req, res, next) => {
  try {
    const targetUserId = req.params.id;

    if (req.user.id !== targetUserId && req.user.role !== "admin") {
      return next(errorHandler(401, "You can only delete your account"));
    }

    const userFound = await User.findByIdAndDelete(targetUserId);

    if (!userFound) {
      return next(errorHandler(404, "User not found"));
    }

    return res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });

  } catch (error) {
    next(error);
  }
};


/**
 * SIGN OUT
 * Clears cookies for access + refresh token
 */
export const signOut = async (req, res, next) => {
  try {
    res.clearCookie("access_token", {
      httpOnly: true,
      sameSite: "none",
      secure: true,
    });

    return res.status(200).json({
      success: true,
      message: "Signed out successfully",
    });

  } catch (error) {
    next(errorHandler(500, "Error in signout controller"));
  }
};

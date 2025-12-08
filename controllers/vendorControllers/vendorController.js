import dotenv from "dotenv";
dotenv.config();

import User from "../../models/userModel.js";
import bcryptjs from "bcryptjs";
import Jwt from "jsonwebtoken";
import { errorHandler } from "../../utils/error.js";

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || "15m";

if (!ACCESS_TOKEN_SECRET) {
  console.error("❌ ACCESS_TOKEN_SECRET missing (vendorAuthController)");
  process.exit(1);  // Fail early if secret is missing
}

const generateToken = (user, role) => {
  return Jwt.sign(
    {
      id: user._id,
      role: role,
      isVendor: true,  // backward compatibility
    },
    ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );
};

const makeVendorToken = (user) => generateToken(user, "vendor");

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

// Vendor Signup
export const vendorSignup = async (req, res, next) => {
  try {
    const { username, email, password, phoneNumber, adress } = req.body;

    if (!username || !email || !password) {
      return next(errorHandler(400, "Username, email, password required"));
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return next(errorHandler(409, "Email already registered"));
    }

    if (password.length < 6) {
      return next(errorHandler(400, "Password must be at least 6 characters"));
    }

    const hashedPassword = bcryptjs.hashSync(password, 10);

    const vendor = await User.create({
      username,
      email,
      password: hashedPassword,
      phoneNumber: phoneNumber || "",
      adress: adress || "",
      role: "vendor",
    });

    return res.status(200).json({
      success: true,
      message: "Vendor created successfully",
      vendor: {
        id: vendor._id,
        username: vendor.username,
        email: vendor.email,
        role: vendor.role,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return next(errorHandler(409, "Email already exists"));
    }
    next(error);
  }
};

// Vendor Signin
export const vendorSignin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return next(errorHandler(400, "Email and password required"));

    const vendor = await User.findOne({
      email,
      role: "vendor",
    });

    if (!vendor) return next(errorHandler(404, "Vendor not found"));

    const isValid = await bcryptjs.compare(password, vendor.password);
    if (!isValid) return next(errorHandler(401, "Wrong credentials"));

    const token = makeVendorToken(vendor);
    const { password: _, ...vendorData } = vendor._doc;

    return res
      .cookie("access_token", token, cookieOptions)
      .status(200)
      .json({
        success: true,
        message: "Vendor login successful",
        token,
        vendor: vendorData,
      });
  } catch (error) {
    next(error);
  }
};

// Vendor Signout
export const vendorSignout = async (req, res, next) => {
  try {
    return res
      .clearCookie("access_token", cookieOptions)
      .status(200)
      .json({ success: true, message: "Vendor signed out" });
  } catch (error) {
    next(error);
  }
};

// Vendor Google Login/Signup
export const vendorGoogle = async (req, res, next) => {
  try {
    const { email, name, photo } = req.body;

    let vendor = await User.findOne({ email, role: "vendor" });

    if (vendor) {
      const token = makeVendorToken(vendor);
      const { password: _, ...rest } = vendor._doc;

      return res
        .cookie("access_token", token, cookieOptions)
        .status(200)
        .json({
          success: true,
          message: "Vendor logged in successfully",
          vendor: rest,
        });
    }

    // Create a new vendor
    const randomPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = bcryptjs.hashSync(randomPassword, 10);

    const newVendor = await User.create({
      username: name.replace(/\s+/g, "").toLowerCase() + Math.random().toString(36).slice(-4),
      email,
      password: hashedPassword,
      profilePicture: photo,
      role: "vendor",
    });

    const token = makeVendorToken(newVendor);
    const { password: _, ...rest } = newVendor._doc;

    return res
      .cookie("access_token", token, cookieOptions)
      .status(200)
      .json({
        success: true,
        message: "Vendor created & logged in successfully",
        vendor: rest,
      });
  } catch (error) {
    next(error);
  }
};

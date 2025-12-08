import dotenv from "dotenv";
dotenv.config();

import crypto from "crypto";
import Jwt from "jsonwebtoken";
import bcryptjs from "bcryptjs";

import User from "../models/userModel.js";
import { errorHandler } from "../utils/error.js";
import { sendResetEmail } from "../utils/email.js";

/**
 * ENV expected:
 * ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET
 * ACCESS_TOKEN_EXPIRES_IN, REFRESH_TOKEN_EXPIRES_IN
 * FRONTEND_URL
 * RESET_TOKEN_EXPIRE_MINUTES
 */

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;

const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || "15m";
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || "7d";

// cookie settings – used for access_token cookie
const accessCookieOptions = {
  httpOnly: true,
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// JWT creators
const makeAccessToken = (user) =>
  Jwt.sign({ id: user._id, role: user.role }, ACCESS_TOKEN_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });

const makeRefreshToken = (user) =>
  Jwt.sign({ id: user._id, role: user.role }, REFRESH_TOKEN_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  });

/* ============================================================
   SIGNUP — USER / VENDOR / ADMIN
============================================================ */

export const signUp = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password)
      return next(errorHandler(400, "All fields are required"));

    const existing = await User.findOne({ email });
    if (existing) return next(errorHandler(409, "Email already registered"));

    const hashed = bcryptjs.hashSync(password, 10);

    const newUser = new User({
      username,
      email,
      password: hashed,
      role: "user",
      isUser: true,
    });

    await newUser.save();

    res.status(200).json({
      success: true,
      message: "User created successfully",
    });
  } catch (err) {
    next(err);
  }
};

export const signUpVendor = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password)
      return next(errorHandler(400, "All fields are required"));

    const existing = await User.findOne({ email });
    if (existing) return next(errorHandler(409, "Email already registered"));

    const hashed = bcryptjs.hashSync(password, 10);

    const newVendor = new User({
      username,
      email,
      password: hashed,
      role: "vendor",
      isVendor: true,
    });

    await newVendor.save();

    res.status(200).json({
      success: true,
      message: "Vendor created successfully",
    });
  } catch (err) {
    next(err);
  }
};

export const signUpAdmin = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password)
      return next(errorHandler(400, "All fields are required"));

    const existing = await User.findOne({ email });
    if (existing) return next(errorHandler(409, "Email already registered"));

    const hashed = bcryptjs.hashSync(password, 10);

    const newAdmin = new User({
      username,
      email,
      password: hashed,
      role: "admin",
      isAdmin: true,
    });

    await newAdmin.save();

    res.status(200).json({
      success: true,
      message: "Admin created successfully",
    });
  } catch (err) {
    next(err);
  }
};

/* ============================================================
   SIGN IN
============================================================ */

export const signIn = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return next(errorHandler(400, "Email and password required"));

    const validUser = await User.findOne({ email });
    if (!validUser) return next(errorHandler(404, "User not found"));

    const isCorrect = bcryptjs.compareSync(password, validUser.password);
    if (!isCorrect) return next(errorHandler(401, "Wrong credentials"));

    const accessToken = makeAccessToken(validUser);
    const refreshToken = makeRefreshToken(validUser);

    validUser.refreshToken = refreshToken;
    const updatedUser = await validUser.save();

    const { password: _, refreshToken: __, ...rest } = updatedUser._doc;

    res.cookie("access_token", accessToken, accessCookieOptions);

    res.status(200).json({
      success: true,
      message: "Login successful",
      accessToken,
      refreshToken,
      role: updatedUser.role,
      isUser: updatedUser.isUser,
      isAdmin: updatedUser.isAdmin,
      isVendor: updatedUser.isVendor,
      user: rest,
    });
  } catch (err) {
    next(err);
  }
};

/* ============================================================
   REFRESH TOKEN
============================================================ */

export const refreshToken = async (req, res, next) => {
  try {
    if (!req.headers.authorization)
      return next(errorHandler(403, "Authorization header missing"));

    const raw = req.headers.authorization.split(" ")[1];
    if (!raw) return next(errorHandler(403, "Invalid header"));

    const [refreshToken] = raw.split(",");

    const decoded = Jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) return next(errorHandler(403, "Invalid refresh token"));
    if (user.refreshToken !== refreshToken)
      return next(errorHandler(403, "Token mismatch"));

    const newAccess = makeAccessToken(user);
    const newRefresh = makeRefreshToken(user);

    user.refreshToken = newRefresh;
    await user.save();

    res.cookie("access_token", newAccess, accessCookieOptions);

    res.status(200).json({
      success: true,
      accessToken: newAccess,
      refreshToken: newRefresh,
      role: user.role,
    });
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return next(errorHandler(401, "RefreshTokenExpired"));
    }
    next(err);
  }
};

/* ============================================================
   GOOGLE AUTH
============================================================ */

export const google = async (req, res, next) => {
  try {
    const { email, name, photo } = req.body;

    let user = await User.findOne({ email });

    if (user && !user.isUser)
      return next(errorHandler(409, "Email already used as vendor"));

    if (!user) {
      const randomPassword =
        Math.random().toString(36).slice(-8) +
        Math.random().toString(36).slice(-8);

      const hashedPassword = bcryptjs.hashSync(randomPassword, 10);

      user = await User.create({
        email,
        password: hashedPassword,
        profilePicture: photo,
        role: "user",
        isUser: true,
        username:
          name.split(" ").join("").toLowerCase() +
          Math.random().toString(36).slice(-4),
      });
    }

    const accessToken = makeAccessToken(user);
    const refreshToken = makeRefreshToken(user);

    user.refreshToken = refreshToken;
    await user.save();

    const userObj = user.toObject();
    delete userObj.password;

    res.cookie("access_token", accessToken, accessCookieOptions);

    res.status(200).json({
      success: true,
      message: "Google login successful",
      accessToken,
      refreshToken,
      user: userObj,
    });
  } catch (err) {
    next(err);
  }
};

/* ============================================================
   FORGOT PASSWORD (FIXED – no 504)
============================================================ */

export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email)
      return res
        .status(400)
        .json({ success: false, message: "email required" });

    const normalized = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalized });

    // Always respond same
    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If this email exists, a reset link will be sent",
      });
    }

    // Token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashed = crypto.createHash("sha256").update(resetToken).digest("hex");

    const expireMinutes = parseInt(
      process.env.RESET_TOKEN_EXPIRE_MINUTES || "30",
      10
    );

    user.resetPasswordToken = hashed;
    user.resetPasswordExpires = Date.now() + expireMinutes * 60 * 1000;
    await user.save();

    // Build frontend URL
    const frontend =
      process.env.FRONTEND_URL ||
      process.env.FRONTEND_BASE_URL ||
      "http://localhost:5173";

    const resetUrl = `${frontend}/reset-password?token=${resetToken}&email=${encodeURIComponent(
      user.email
    )}`;

    // Instant response → no timeouts / no 504
    res.status(200).json({
      success: true,
      message: "If this email exists, a reset link will be sent",
    });

    // Send email in background
    sendResetEmail(user.email, resetUrl, { isVendor: !!user.isVendor })
      .then((sent) => {
        if (!sent) {
          console.warn(
            "⚠️ Email could NOT be sent. Fallback link:",
            resetUrl
          );
        } else {
          console.log("📧 Reset email sent to:", user.email);
        }
      })
      .catch((err) => {
        console.error("❌ sendResetEmail error:", err);
        console.log("Reset URL:", resetUrl);
      });
  } catch (err) {
    console.error("forgotPassword error:", err);
    if (!res.headersSent) next(err);
  }
};

/* ============================================================
   RESET PASSWORD
============================================================ */

export const resetPassword = async (req, res, next) => {
  try {
    const { token, email, id, password } = req.body;

    if (!token || !password || (!email && !id)) {
      return res.status(400).json({
        success: false,
        message: "invalid request",
      });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const query = email
      ? {
          email: email.toLowerCase().trim(),
          resetPasswordToken: tokenHash,
          resetPasswordExpires: { $gt: Date.now() },
        }
      : {
          _id: id,
          resetPasswordToken: tokenHash,
          resetPasswordExpires: { $gt: Date.now() },
        };

    const user = await User.findOne(query);

    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired token" });
    }

    // Update password
    user.password = bcryptjs.hashSync(password, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.refreshToken = undefined;

    await user.save();

    const roleUpper =
      (user.role && user.role.toUpperCase()) ||
      (user.isVendor
        ? "VENDOR"
        : user.isAdmin
        ? "ADMIN"
        : "USER");

    return res.status(200).json({
      success: true,
      message: "Password reset successfully",
      role: roleUpper,
    });
  } catch (err) {
    next(err);
  }
};

/* ============================================================
   FIREBASE AUTH (DISABLED)
============================================================ */

export const firebaseAuth = async (req, res, next) => {
  return next(errorHandler(503, "Firebase authentication is disabled"));
};

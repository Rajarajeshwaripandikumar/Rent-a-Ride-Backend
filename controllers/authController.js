import dotenv from "dotenv";
dotenv.config();

import crypto from "crypto";
import Jwt from "jsonwebtoken";
import bcryptjs from "bcryptjs";

import User from "../models/userModel.js";
import { errorHandler } from "../utils/error.js";
import { sendResetEmail } from "../utils/email.js";

// ------------------ FIREBASE ADMIN JSON FIX (Node 22 Compatible) ------------------
import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Firebase JSON manually
const serviceAccount = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../firebase-service-account.json"),
    "utf8"
  )
);

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// ------------------------------------------------------------------------------

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

if (!ACCESS_TOKEN_SECRET || !REFRESH_TOKEN_SECRET) {
  console.error(
    "ERROR: ACCESS_TOKEN_SECRET or REFRESH_TOKEN_SECRET not found in .env"
  );
}

// Common cookie options for access token
const accessCookieOptions = {
  httpOnly: true,
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 7 * 24 * 60 * 60 * 1000, // cookie lifetime; JWT still obeys ACCESS_TOKEN_EXPIRES_IN
};

// Create JWT tokens
const makeAccessToken = (user) =>
  Jwt.sign(
    { id: user._id, role: user.role },
    ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );

const makeRefreshToken = (user) =>
  Jwt.sign(
    { id: user._id, role: user.role },
    REFRESH_TOKEN_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );

// ================== SIGN UP (USER) ==================
export const signUp = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password)
      return next(errorHandler(400, "All fields are required"));

    const existing = await User.findOne({ email });
    if (existing) return next(errorHandler(409, "Email already registered"));

    const hashedPassword = bcryptjs.hashSync(password, 10);

    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role: "user",
    });

    await newUser.save();

    res.status(200).json({
      success: true,
      succes: true,
      message: "User created successfully",
    });
  } catch (err) {
    next(err);
  }
};

// ================== SIGN UP (VENDOR) ==================
export const signUpVendor = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return next(errorHandler(400, "All fields are required"));
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return next(errorHandler(409, "Email already registered"));
    }

    const hashedPassword = bcryptjs.hashSync(password, 10);

    const newVendor = new User({
      username,
      email,
      password: hashedPassword,
      role: "vendor",
      isVendor: true,
    });

    await newVendor.save();

    res.status(200).json({
      success: true,
      succes: true,
      message: "Vendor created successfully",
    });
  } catch (err) {
    next(err);
  }
};

// ================== SIGN UP (ADMIN) ==================
export const signUpAdmin = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return next(errorHandler(400, "All fields are required"));
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return next(errorHandler(409, "Email already registered"));
    }

    const hashedPassword = bcryptjs.hashSync(password, 10);

    const newAdmin = new User({
      username,
      email,
      password: hashedPassword,
      role: "admin",
      isAdmin: true,
    });

    await newAdmin.save();

    res.status(200).json({
      success: true,
      succes: true,
      message: "Admin created successfully",
    });
  } catch (err) {
    next(err);
  }
};

// ================== SIGN IN (USER / VENDOR / ADMIN) ==================
export const signIn = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return next(errorHandler(400, "Email and password required"));

    const validUser = await User.findOne({ email });
    if (!validUser) return next(errorHandler(404, "User not found"));

    const isPasswordCorrect = bcryptjs.compareSync(
      password,
      validUser.password
    );
    if (!isPasswordCorrect)
      return next(errorHandler(401, "Wrong credentials"));

    const accessToken = makeAccessToken(validUser);
    const refreshToken = makeRefreshToken(validUser);

    validUser.refreshToken = refreshToken;
    const updatedUser = await validUser.save();

    const { password: _, refreshToken: __, ...rest } = updatedUser._doc;

    // set cookie so verifyToken / verifyUser / verifyVendor can use it
    res.cookie("access_token", accessToken, accessCookieOptions);

    res.status(200).json({
      success: true,
      succes: true,
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

// ================== REFRESH TOKEN ==================
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

    // update cookie with new access token
    res.cookie("access_token", newAccess, accessCookieOptions);

    res.status(200).json({
      success: true,
      succes: true,
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

// ================== GOOGLE AUTH ==================
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
    userObj.role = user.role;

    // Cookie for subsequent authenticated API calls
    res.cookie("access_token", accessToken, accessCookieOptions);

    res.status(200).json({
      success: true,
      succes: true,
      message: "Google login successful",
      accessToken,
      refreshToken,
      user: userObj,
    });
  } catch (err) {
    next(err);
  }
};

// ================== FORGOT PASSWORD ==================
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email)
      return res
        .status(400)
        .json({ success: false, message: "email required" });

    const normalized = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalized });

    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If this email exists, a reset link will be sent",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashed = crypto.createHash("sha256").update(resetToken).digest("hex");

    const expireMinutes = parseInt(
      process.env.RESET_TOKEN_EXPIRE_MINUTES || "30",
      10
    );

    user.resetPasswordToken = hashed;
    user.resetPasswordExpires = Date.now() + expireMinutes * 60 * 1000;
    await user.save();

    const frontend =
      process.env.FRONTEND_URL ||
      process.env.FRONTEND_BASE_URL ||
      "http://localhost:5173";

    const resetUrl = `${frontend}/reset-password?token=${resetToken}&email=${encodeURIComponent(
      user.email
    )}`;

    const sent = await sendResetEmail(user.email, resetUrl, {
      isVendor: !!user.isVendor,
    });

    if (!sent) {
      console.log("Password reset link:", resetUrl);
      return res.status(200).json({
        success: true,
        message:
          "Reset link generated but SMTP not configured. Check backend logs.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "If this email exists, a reset link will be sent",
    });
  } catch (err) {
    next(err);
  }
};

// ================== RESET PASSWORD ==================
export const resetPassword = async (req, res, next) => {
  try {
    const { token, email, id, password } = req.body;

    if (!token || !password || (!email && !id)) {
      return res
        .status(400)
        .json({ success: false, message: "invalid request" });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

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

// ================== FIREBASE AUTH ==================
export const firebaseAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const idToken = authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

    if (!idToken)
      return next(errorHandler(400, "Missing Firebase ID token"));

    const decoded = await admin.auth().verifyIdToken(idToken);

    const firebaseEmail = decoded.email;
    const firebaseName = decoded.name;
    const firebaseAvatar = decoded.picture;

    if (!firebaseEmail)
      return next(errorHandler(400, "Firebase token missing email"));

    let user = await User.findOne({ email: firebaseEmail });

    if (user && !user.isUser)
      return next(errorHandler(409, "Email already used as non-user account"));

    if (!user) {
      const randomPassword =
        Math.random().toString(36).slice(-8) +
        Math.random().toString(36).slice(-8);

      const hashedPassword = bcryptjs.hashSync(randomPassword, 10);

      user = await User.create({
        email: firebaseEmail,
        password: hashedPassword,
        profilePicture: firebaseAvatar,
        role: "user",
        isUser: true,
        username:
          (firebaseName || firebaseEmail.split("@")[0])
            .replace(/\s+/g, "")
            .toLowerCase() +
          Math.random().toString(36).slice(-4),
      });
    }

    const accessToken = makeAccessToken(user);
    const refreshToken = makeRefreshToken(user);

    user.refreshToken = refreshToken;
    await user.save();

    const { password, refreshToken: _, ...doc } = user._doc;

    res.cookie("access_token", accessToken, accessCookieOptions);

    return res.status(200).json({
      success: true,
      accesstoken: accessToken,
      refreshToken,
      user: doc,
    });
  } catch (err) {
    console.error("❌ Firebase auth error:", err);
    next(errorHandler(500, "Firebase authentication failed"));
  }
};

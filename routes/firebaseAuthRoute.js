import express from "express";
import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import User from "../models/userModel.js";

const router = express.Router();

/* ---------------- FIREBASE ADMIN INIT ---------------- */
const serviceAccountPath =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "./firebase-service-account.json";

const absPath = path.isAbsolute(serviceAccountPath)
  ? serviceAccountPath
  : path.join(process.cwd(), serviceAccountPath);

if (!admin.apps.length) {
  if (!fs.existsSync(absPath)) {
    console.error("❌ Firebase service account JSON not found at:", absPath);
  } else {
    const serviceAccount = JSON.parse(fs.readFileSync(absPath, "utf8"));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("✅ Firebase Admin initialized");
  }
}

/* -------------------- POST /firebase -------------------- */
/* Accepts Firebase ID token and returns your own JWT + user */
router.post("/firebase", async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const idToken = authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

    if (!idToken) {
      return res.status(400).json({ ok: false, message: "Missing ID token" });
    }

    // Verify Firebase token
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      console.error("Firebase verifyIdToken error:", err);
      return res.status(401).json({ ok: false, message: "Invalid ID token" });
    }

    const email = decoded.email;
    const name = decoded.name || email?.split("@")[0];
    const picture = decoded.picture;

    if (!email) {
      return res
        .status(400)
        .json({ ok: false, message: "Google login failed: No email" });
    }

    /* -------- FIND OR CREATE USER -------- */
    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        username: name,
        email,
        password: "GOOGLE_AUTH", // placeholder, not used
        profilePicture: picture,
        isUser: true, // your frontend expects this flag
      });
    }

    /* -------- GENERATE APP JWT -------- */
    const token = jwt.sign(
      { id: user._id },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      ok: true,
      isUser: true,
      token,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
        isUser: user.isUser,
      },
    });
  } catch (err) {
    console.error("Google auth error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

export default router;

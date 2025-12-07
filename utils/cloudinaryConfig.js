// /backend/utils/cloudinaryConfig.js
import dotenv from "dotenv";
dotenv.config();

import { v2 as cloudinary } from "cloudinary";

const key = process.env.CLOUDINARY_API_KEY || "";
const secret = process.env.CLOUDINARY_API_SECRET || "";
const name = process.env.CLOUDINARY_CLOUD_NAME || "";

console.log("[cloudinaryConfig] verifying env vars (masked)...");
console.log("[cloudinaryConfig] CLOUDINARY_CLOUD_NAME present:", !!name);
console.log("[cloudinaryConfig] CLOUDINARY_API_KEY present:", !!key);
console.log("[cloudinaryConfig] CLOUDINARY_API_SECRET present:", !!secret);
console.log("[cloudinaryConfig] CLOUDINARY_API_KEY length:", key.trim().length);
console.log("[cloudinaryConfig] CLOUDINARY_API_SECRET length:", secret.trim().length);

// Trim values to avoid accidental whitespace errors
const cloudName = name.trim();
const apiKey = key.trim();
const apiSecret = secret.trim();

// Sanity check: lengths reasonable
if (!cloudName || !apiKey || !apiSecret) {
  console.error("[cloudinaryConfig] ERROR: missing Cloudinary environment variables or blank values.");
  throw new Error("Missing Cloudinary env vars. Check CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET");
}

// Configure Cloudinary
cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
  secure: true,
});

export const uploader = cloudinary.uploader;
export default cloudinary;

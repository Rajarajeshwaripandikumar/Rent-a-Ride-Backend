// backend/utils/verifyVendor.js
import jwt from "jsonwebtoken";
import { errorHandler } from "./error.js";
import User from "../models/userModel.js";

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;

export const verifyVendor = async (req, res, next) => {
  try {
    if (!ACCESS_TOKEN_SECRET) {
      console.error("ACCESS_TOKEN_SECRET missing in .env");
      return next(
        errorHandler(500, "ACCESS_TOKEN_SECRET not configured on server")
      );
    }

    // 1) Get token – ✅ Prefer Authorization header over cookie
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const headerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

    const cookieToken = req.cookies?.access_token || req.cookies?.accessToken;

    // ✅ HEADER wins, then cookie
    const token = headerToken || cookieToken;

    if (!token) {
      return next(errorHandler(401, "Vendor not authenticated"));
    }

    // 2) Verify token and handle expiry
    jwt.verify(token, ACCESS_TOKEN_SECRET, async (err, decoded) => {
      if (err) {
        if (err.name === "TokenExpiredError") {
          console.warn(
            "verifyVendor: token expired:",
            token?.slice?.(0, 20) ?? "<token>"
          );
          return next(errorHandler(401, "TokenExpired"));
        }

        console.warn("verifyVendor: invalid token:", err.message);
        return next(errorHandler(403, "Invalid vendor token"));
      }

      if (!decoded?.id && !decoded?._id && !decoded?.userId) {
        return next(errorHandler(400, "Invalid vendor payload in token"));
      }

      const userId = decoded.id || decoded._id || decoded.userId;

      // 3) Load vendor from DB (optional but you already do this)
      const vendor = await User.findById(userId).select("-password");
      if (!vendor) {
        return next(errorHandler(404, "Vendor not found"));
      }

      // 4) Check vendor role/flag
      const isVendorFromToken =
        decoded.role === "vendor" || decoded.isVendor === true;
      const isVendorFromDb =
        vendor.role === "vendor" || vendor.isVendor === true;

      if (!isVendorFromToken && !isVendorFromDb) {
        return next(errorHandler(403, "Access denied: vendors only"));
      }

      // 5) Attach to req for controllers
      req.user = vendor; // full user doc
      req.userId = vendor._id;

      return next();
    });
  } catch (error) {
    console.error("verifyVendor unexpected error:", error);
    return next(errorHandler(500, "Internal error in verifyVendor"));
  }
};

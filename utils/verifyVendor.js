// backend/utils/verifyVendor.js
import jwt from "jsonwebtoken";
import { errorHandler } from "./error.js";
import User from "../models/userModel.js"; // optional, if you want DB lookup

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;

export const verifyVendor = async (req, res, next) => {
  try {
    if (!ACCESS_TOKEN_SECRET) {
      console.error("ACCESS_TOKEN_SECRET missing in .env");
      return next(
        errorHandler(500, "ACCESS_TOKEN_SECRET not configured on server")
      );
    }

    // 1) Try cookie first (same pattern as verifyToken / verifyUser)
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const headerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

    const cookieToken = req.cookies?.access_token || req.cookies?.accessToken;
    const token = cookieToken || headerToken;

    if (!token) {
      return next(errorHandler(401, "Vendor not authenticated"));
    }

    // 2) Verify token and handle expiry specially
    jwt.verify(token, ACCESS_TOKEN_SECRET, async (err, decoded) => {
      if (err) {
        if (err.name === "TokenExpiredError") {
          console.warn(
            "verifyVendor: token expired:",
            token?.slice?.(0, 20) ?? "<token>"
          );
          // IMPORTANT: same message as other middlewares
          return next(errorHandler(401, "TokenExpired"));
        }

        console.warn("verifyVendor: invalid token:", err.message);
        return next(errorHandler(403, "Invalid vendor token"));
      }

      if (!decoded?.id) {
        return next(errorHandler(400, "Invalid vendor payload in token"));
      }

      // 3) OPTIONAL: load full vendor doc from DB
      const vendor = await User.findById(decoded.id).select("-password");
      if (!vendor) {
        return next(errorHandler(404, "Vendor not found"));
      }

      if (vendor.role !== "vendor") {
        return next(errorHandler(403, "Access denied: vendors only"));
      }

      // 4) Attach to req for controllers
      req.user = vendor;      // full doc
      req.userId = vendor._id;

      return next();
    });
  } catch (error) {
    console.error("verifyVendor unexpected error:", error);
    return next(errorHandler(500, "Internal error in verifyVendor"));
  }
};

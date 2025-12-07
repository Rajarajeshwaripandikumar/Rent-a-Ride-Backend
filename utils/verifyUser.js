// utils/verifyUser.js
import jwt from "jsonwebtoken";
import User from "../models/userModel.js";
import { errorHandler } from "./error.js";

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;

export const verifyUser = async (req, res, next) => {
  try {
    if (!ACCESS_TOKEN_SECRET) {
      console.error("ACCESS_TOKEN_SECRET missing in .env");
      return next(errorHandler(500, "Server config error"));
    }

    // 1) Prefer cookie token (same pattern as verifyToken)
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const headerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

    const cookieToken = req.cookies?.access_token || req.cookies?.accessToken;
    const token = cookieToken || headerToken;

    if (!token) {
      return next(errorHandler(401, "User not authenticated"));
    }

    // 2) Verify token, handle expiry separately
    jwt.verify(token, ACCESS_TOKEN_SECRET, async (err, decoded) => {
      if (err) {
        if (err.name === "TokenExpiredError") {
          console.warn(
            "verifyUser: token expired:",
            token?.slice?.(0, 20) ?? "<token>"
          );
          // ⚠️ IMPORTANT: 401 + "TokenExpired" so frontend can refresh/redirect
          return next(errorHandler(401, "TokenExpired"));
        }

        console.warn("verifyUser: invalid token:", err.message);
        return next(errorHandler(403, "Invalid user token"));
      }

      // 3) Find the user in DB
      const user = await User.findById(decoded.id).select("-password");
      if (!user) {
        return next(errorHandler(404, "User not found"));
      }

      // OPTIONAL: if you want **only normal users**, not vendors/admins:
      // if (user.role !== "user") {
      //   return next(errorHandler(403, "Access denied: users only"));
      // }

      // 4) Attach to req for controllers
      req.user = user;
      req.userId = user._id;

      return next();
    });
  } catch (err) {
    console.error("verifyUser unexpected error:", err);
    return next(errorHandler(500, "Internal server error in verifyUser"));
  }
};

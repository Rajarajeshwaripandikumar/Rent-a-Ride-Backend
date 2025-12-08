import jwt from "jsonwebtoken";
import { errorHandler } from "../utils/error.js";

export const verifyToken = async (req, res, next) => {
  try {
    // 1. Get token from cookie first, then Authorization header
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const headerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

    const cookieToken = req.cookies?.access_token || req.cookies?.accessToken;

    // Prefer cookie token so refreshed tokens win
    const token = cookieToken || headerToken;

    if (!token) {
      return next(errorHandler(401, "No token provided, authorization denied"));
    }

    // 2. Use the same secret used to sign access tokens
    const secret = process.env.ACCESS_TOKEN_SECRET;
    if (!secret) {
      console.error("ACCESS_TOKEN_SECRET missing in .env");
      return next(errorHandler(500, "Server config error"));
    }

    // 3. Verify token, handle expiry specially
    try {
      const decoded = await jwt.verify(token, secret); // Using async/await here for cleaner code

      // 4. Attach user info to request
      req.user = {
        id: decoded.id || decoded._id || decoded.userId,
        role: decoded.role,
        ...decoded,
      };

      return next();
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        console.warn("verifyToken: token expired:", token?.slice(0, 20) ?? "<token>");
        return next(errorHandler(401, "TokenExpired"));
      }

      console.warn("verifyToken: invalid token:", err.message);
      return next(errorHandler(403, "Token is not valid"));
    }

  } catch (err) {
    console.error("verifyToken unexpected error:", err);
    return next(errorHandler(500, "Internal server error in verifyToken"));
  }
};

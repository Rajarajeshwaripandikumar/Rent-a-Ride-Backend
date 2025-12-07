// backend/routes/locationRoute.js
import express from "express";
import Location from "../models/locationModel.js";

const router = express.Router();

/**
 * GET /api/locations/districts
 *  -> ["Chennai", "Coimbatore", ...]
 */
router.get("/districts", async (req, res, next) => {
  try {
    const districts = await Location.distinct("district", { isActive: true });

    res.status(200).json({
      success: true,
      districts: districts.sort(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/locations
 *  - If ?district=Chennai  -> locations only in that district
 *  - If no query           -> all locations (same as /all)
 */
router.get("/", async (req, res, next) => {
  try {
    const { district } = req.query;

    const query = { isActive: true }; // ✅ use isActive (matches schema)
    if (district) query.district = district;

    const locations = await Location.find(query).sort({
      district: 1,
      location: 1,
    });

    res.status(200).json({
      success: true,
      locations,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/locations/all
 *  -> all locations (for drop-off – can choose any district)
 */
router.get("/all", async (req, res, next) => {
  try {
    const locations = await Location.find({ isActive: true }).sort({
      district: 1,
      location: 1,
    });

    res.status(200).json({
      success: true,
      locations,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

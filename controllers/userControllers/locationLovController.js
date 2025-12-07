// backend/controllers/userControllers/locationLovController.js

import Location from "../../models/locationModel.js";

/**
 * GET /api/user/getLocationsLov
 * Returns all active locations: [ { district, location }, ... ]
 */
export const getLocationsLov = async (req, res) => {
  try {
    console.log("==== [getLocationsLov] START ====");

    // sanity check: is model loaded
    console.log("[getLocationsLov] Location typeof:", typeof Location);

    const rows = await Location.find({
      $or: [{ isActive: { $exists: false } }, { isActive: true }],
    })
      .select("district location isActive")
      .lean();

    console.log("[getLocationsLov] rows.length:", rows?.length || 0);

    // always return array
    return res.status(200).json(rows || []);
  } catch (err) {
    console.error("[getLocationsLov] ERROR:", err);

    // expose details in dev so you can see it in Network → Response
    return res.status(500).json({
      message: "Failed to fetch locations",
      error: err?.message || String(err),
      stack:
        process.env.NODE_ENV === "development" ? err?.stack : undefined,
    });
  }
};

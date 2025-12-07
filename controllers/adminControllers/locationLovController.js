// controllers/adminControllers/locationLovController.js
import MasterData from "../../models/masterDataModel.js";

export const getLocationsLov = async (req, res) => {
  try {
    // fetch only rows that are location type
    const rows = await MasterData.find({ type: "location" })
      .select("district location")
      .sort({ district: 1, location: 1 }) // optional: sorted output
      .lean();

    return res.status(200).json({
      success: true,
      count: rows.length,
      locations: rows,
    });
  } catch (err) {
    console.error("getLocationsLov error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch locations LOV",
      error: err.message,
    });
  }
};

// backend/controllers/adminControllers/masterCollectionController.js
import MasterData from "../../models/masterDataModel.js";
import { v4 as uuidv4 } from "uuid";
import { errorHandler } from "../../utils/error.js";

// ---------------------------------------------------------------------------
// Seed data (locations + car models)
// ---------------------------------------------------------------------------
const dummyData = [
  // LOCATIONS
  // kochi
  { id: uuidv4(), district: "Kochi", districtCode: "KOCHI", location: "kalamassery : skoda service", type: "location" },
  { id: uuidv4(), district: "Kochi", districtCode: "KOCHI", location: "kalamassery : volkswagen", type: "location" },
  { id: uuidv4(), district: "Kochi", districtCode: "KOCHI", location: "cheranallur : volkswagen", type: "location" },

  // kottayam
  { id: uuidv4(), district: "Kottayam", districtCode: "KTYM", location: "ettumanoor : skoda service", type: "location" },
  { id: uuidv4(), district: "Kottayam", districtCode: "KTYM", location: "kottayam : railway station", type: "location" },
  { id: uuidv4(), district: "Kottayam", districtCode: "KTYM", location: "thellakom : volkswagen", type: "location" },

  // trivandrum
  { id: uuidv4(), district: "Trivandrum", districtCode: "TVM", location: "Nh 66 bybass : kochuveli railway station", type: "location" },
  { id: uuidv4(), district: "Trivandrum", districtCode: "TVM", location: "tampanur : central railway station", type: "location" },
  { id: uuidv4(), district: "Trivandrum", districtCode: "TVM", location: "kazhakootam : railway station", type: "location" },

  // thrissur
  { id: uuidv4(), district: "Thrissur", districtCode: "TSR", location: "thrissur : railway station", type: "location" },
  { id: uuidv4(), district: "Thrissur", districtCode: "TSR", location: "valarkavu : near ganam theater", type: "location" },
  { id: uuidv4(), district: "Thrissur", districtCode: "TSR", location: "paliyekara : evm mg", type: "location" },

  // calicut
  { id: uuidv4(), district: "Calicut", districtCode: "CLT", location: "calicut : railway", type: "location" },
  { id: uuidv4(), district: "Calicut", districtCode: "CLT", location: "calicut : airport", type: "location" },
  { id: uuidv4(), district: "Calicut", districtCode: "CLT", location: "pavangad : evm nissan", type: "location" },

  // CARS
  { id: uuidv4(), model: "Alto 800", variant: "manual", type: "car", brand: "maruthi" },
  { id: uuidv4(), model: "Alto 800", variant: "automatic", type: "car", brand: "maruthi" },
  { id: uuidv4(), model: "SKODA SLAVIA PETROL AT", variant: "automatic", type: "car", brand: "skoda" },
  { id: uuidv4(), model: "NISSAN MAGNITE PETROL MT", variant: "manual", type: "car", brand: "nissan" },
  { id: uuidv4(), model: "SKODA KUSHAQ Petrol MT", variant: "manual", type: "car", brand: "skoda" },
  { id: uuidv4(), model: "SKODA KUSHAQ Petrol AT", variant: "automatic", type: "car", brand: "skoda" },
  { id: uuidv4(), model: "MG HECTOR Petrol MT", variant: "manual", type: "car", brand: "mg" },
  { id: uuidv4(), model: "MG HECTOR Petrol AT", variant: "automatic", type: "car", brand: "mg" },
  { id: uuidv4(), model: "MG HECTOR Diesel MT", variant: "manual", type: "car", brand: "mg" },
  { id: uuidv4(), model: "NISSAN TERRANO Diesel MT", variant: "manual", type: "car", brand: "nissan" },
  { id: uuidv4(), model: "NISSAN KICKS Petrol MT", variant: "manual", type: "car", brand: "nissan" },
  { id: uuidv4(), model: "NISSAN KICKS Petrol AT", variant: "automatic", type: "car", brand: "nissan" },
  { id: uuidv4(), model: "VW TAIGUN Petrol MT", variant: "manual", type: "car", brand: "volkswagen" },
  { id: uuidv4(), model: "HYUNDAI ALCAZAR Diesel AT", variant: "automatic", type: "car", brand: "hyundai" },
  { id: uuidv4(), model: "CITROEN C3 Petrol MT", variant: "manual", type: "car", brand: "citroen" },
  { id: uuidv4(), model: "ISUZU MUX Diesel AT", variant: "automatic", type: "car", brand: "isuzu" },
  { id: uuidv4(), model: "MG HECTOR PLUS Petrol MT", variant: "manual", type: "car", brand: "mg" },
  { id: uuidv4(), model: "MG HECTOR PLUS Petrol AT", variant: "automatic", type: "car", brand: "mg" },
  { id: uuidv4(), model: "MG HECTOR PLUS Diesel MT", variant: "manual", type: "car", brand: "mg" },

  { id: uuidv4(), model: "MARUTI SWIFT Petrol AT", variant: "automatic", type: "car", brand: "maruthi" },
  { id: uuidv4(), model: "DATSUN REDI GO Petrol MT", variant: "manual", type: "car", brand: "datsun" },
  { id: uuidv4(), model: "DATSUN REDI GO Petrol AT", variant: "automatic", type: "car", brand: "datsun" },
  { id: uuidv4(), model: "NISSAN MICRA Petrol MT", variant: "automatic", type: "car", brand: "nissan" },
  { id: uuidv4(), model: "VW AMEO Diesel MT", variant: "manual", type: "car", brand: "volkswagen" },
  { id: uuidv4(), model: "SKODA RAPID Petrol MT", variant: "manual", type: "car", brand: "skoda" },
  { id: uuidv4(), model: "MARUTI DZIRE Petrol MT", variant: "manual", type: "car", brand: "maruthi" },
  { id: uuidv4(), model: "VW VENTO Petrol MT", variant: "manual", type: "car", brand: "volkswagen" },
  { id: uuidv4(), model: "VW VENTO Petrol AT", variant: "automatic", type: "car", brand: "volkswagen" },
  { id: uuidv4(), model: "VW VENTO Diesel AT", variant: "automatic", type: "car", brand: "volkswagen" },
  { id: uuidv4(), model: "VW POLO Petrol MT", variant: "manual", type: "car", brand: "volkswagen" },
  { id: uuidv4(), model: "VW POLO Petrol AT", variant: "automatic", type: "car", brand: "volkswagen" },
  { id: uuidv4(), model: "VW POLO Diesel MT", variant: "manual", type: "car", brand: "volkswagen" },
];

// ---------------------------------------------------------------------------
// CONTROLLER: Insert dummy master data (admin-only)
// GET /api/admin/dummyData  (or POST, if you prefer)
// ---------------------------------------------------------------------------
export const insertDummyData = async (req, res, next) => {
  try {
    // avoid duplicating data if already seeded
    const existingCount = await MasterData.countDocuments();
    if (existingCount > 0) {
      return res.status(200).json({
        success: true,
        message: "Master data already seeded",
        count: existingCount,
      });
    }

    const inserted = await MasterData.insertMany(dummyData);

    return res.status(201).json({
      success: true,
      message: "Dummy master data inserted successfully",
      count: inserted.length,
    });
  } catch (error) {
    console.error("insertDummyData error:", error);
    return next(errorHandler(500, "Error inserting dummy master data"));
  }
};

// ---------------------------------------------------------------------------
// CONTROLLER: Get vehicle models master data
// GET /api/admin/getVehicleModels?brand=skoda (optional brand filter)
// ---------------------------------------------------------------------------
export const getCarModelData = async (req, res, next) => {
  try {
    const { brand } = req.query;

    const filter = { type: "car" };
    if (brand) {
      filter.brand = new RegExp(`^${brand}$`, "i"); // case-insensitive match
    }

    const models = await MasterData.find(filter)
      .select("model variant brand type")
      .sort({ brand: 1, model: 1, variant: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: models.length,
      models,
    });
  } catch (error) {
    console.error("getCarModelData error:", error);
    return next(errorHandler(500, "Could not get model data"));
  }
};

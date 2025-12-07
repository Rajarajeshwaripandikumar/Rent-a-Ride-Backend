// /backend/controllers/userControllers/userProfileController.js
import User from "../../models/userModel.js";
import cloudinary from "../../utils/cloudinaryConfig.js";
import { normalizeFiles, filesToBase64 } from "../../utils/multer.js";

export const editUserProfile = async (req, res, next) => {
  try {
    const userId = req.params.id;

    console.log("====================================");
    console.log("[editUserProfile] userId:", userId);
    console.log("[editUserProfile] req.body keys:", Object.keys(req.body || {}));
    console.log("[editUserProfile] req.file exists:", !!req.file);
    console.log("[editUserProfile] req.files keys:", Object.keys(req.files || {}));
    console.log("====================================");

    // -----------------------------
    // 1️⃣ Extract incoming text fields
    // -----------------------------
    let fields = {};

    if (req.body && Object.keys(req.body).length > 0) {
      // CASE: JSON body → { formData: {...} }
      if (req.body.formData && typeof req.body.formData === "object") {
        fields = req.body.formData;
      }
      // CASE: formData JSON-string inside multipart
      else if (req.body.formData && typeof req.body.formData === "string") {
        try {
          fields = JSON.parse(req.body.formData);
        } catch {
          fields = { ...req.body };
          delete fields.formData;
        }
      }
      // CASE: multipart → direct fields
      else {
        fields = { ...req.body };
      }
    }

    // Allowed fields
    const allowed = ["username", "email", "phoneNumber", "adress"];
    const updateObj = {};

    allowed.forEach((key) => {
      const val = fields[key];
      if (val !== undefined && val !== null && String(val).trim() !== "") {
        updateObj[key] = val;
      }
    });

    // -----------------------------
    // 2️⃣ Process FILE Upload
    // -----------------------------
    let files = [];

    if (req.file) {
      // multerSingleUpload → file stored in req.file
      files = [req.file];
      console.log("[editUserProfile] Taking file from req.file");
    } else {
      // fallback for future multiple upload usage
      files = normalizeFiles(req);
      console.log("[editUserProfile] normalizeFiles →", files.length, "files");
    }

    if (files.length > 0) {
      const base64Files = filesToBase64(files);
      const firstFile = base64Files[0];

      if (firstFile?.data) {
        console.log("[editUserProfile] Uploading to Cloudinary...");

        const uploadRes = await cloudinary.uploader.upload(firstFile.data, {
          folder: "avatars",
          transformation: [
            { width: 800, height: 800, crop: "limit" },
            { quality: "auto" },
          ],
        });

        console.log("[editUserProfile] Cloudinary uploaded:", {
          public_id: uploadRes.public_id,
          url: uploadRes.secure_url,
        });

        updateObj.profilePicture = uploadRes.secure_url;
      }
    }

    // If nothing to update
    if (Object.keys(updateObj).length === 0) {
      return res
        .status(400)
        .json({ message: "No profile fields or image provided." });
    }

    // -----------------------------
    // 3️⃣ Update user in DB
    // -----------------------------
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateObj },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const { password, ...rest } = updatedUser._doc;

    console.log("[editUserProfile] Updated user sent to frontend.");
    console.log("====================================");

    // -----------------------------
    // 4️⃣ Return to frontend
    // -----------------------------
    return res.status(200).json({ currentUser: rest });
  } catch (error) {
    console.error("❌ editUserProfile error:", error);
    next(error);
  }
};

export default editUserProfile;

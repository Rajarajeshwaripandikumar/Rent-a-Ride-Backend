// backend/utils/multer.js
import multer from "multer";
import path from "path";

const storage = multer.memoryStorage();

// -- New: accept named fields (matches frontend) --
export const multerMultipleUploads = multer({ storage }).fields([
  { name: "image", maxCount: 10 },           // vehicle images (multiple)
  { name: "insurance_image", maxCount: 5 },  // insurance docs
  { name: "rc_book_image", maxCount: 5 },    // rc book
  { name: "polution_image", maxCount: 5 },   // polution docs
]);

// Keep single-file helper for legacy handlers
export const multerSingleUpload = multer({ storage }).single("image");

// Backwards-compatible alias (some files import multerUploads)
export const multerUploads = multerMultipleUploads; // alias for old code

/**
 * Normalize req.files into a flat array of file objects.
 * - If multer used .array(), req.files is already an array -> return it.
 * - If multer used .fields(), req.files is an object of arrays -> flatten them.
 * - Otherwise return [].
 *
 * Each file object is the standard multer file:
 * { fieldname, originalname, encoding, mimetype, buffer, size, ... }
 */
export const normalizeFiles = (req) => {
  if (!req.files) return [];

  // multer .array() -> req.files is an array
  if (Array.isArray(req.files)) return req.files;

  // multer .fields() -> req.files is an object: { fieldName: [File, ...], ... }
  if (typeof req.files === "object") {
    return Object.values(req.files).flat();
  }

  return [];
};

/**
 * Converts an array of Multer files (or req) into Cloudinary-ready data URIs.
 * RETURNS: [{ data, filename, fieldname }]
 */
export const filesToBase64 = (reqOrFiles) => {
  const files = Array.isArray(reqOrFiles) ? reqOrFiles : normalizeFiles(reqOrFiles);
  if (!files || files.length === 0) return [];

  return files.map((file) => {
    const base64 = Buffer.from(file.buffer).toString("base64");
    const ext = path.extname(file.originalname).replace(".", "") || "jpeg";
    const mime = file.mimetype || `image/${ext}`;
    const dataUri = `data:${mime};base64,${base64}`;

    return {
      data: dataUri,
      filename: file.originalname,
      fieldname: file.fieldname,
    };
  });
};

// Backward-compatible exports
export const dataUri = (reqOrFiles) => filesToBase64(reqOrFiles);
export const base64Converter = (reqOrFiles) => filesToBase64(reqOrFiles);

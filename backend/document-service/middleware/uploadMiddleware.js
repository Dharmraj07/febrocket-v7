const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ==========================================
// CONFIGURATION
// ==========================================

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ==========================================
// FILE FILTER (Shared)
// ==========================================

const fileFilter = (_req, file, cb) => {
  if (ALLOWED_FILE_TYPES.includes(file.mimetype)) {
    return cb(null, true);
  }

  return cb(
    new Error(
      "Invalid file type. Only PDF, JPG, JPEG, PNG, WebP, and GIF files are allowed."
    ),
    false
  );
};

// ==========================================
// STORAGE: MEMORY (for R2)
// ==========================================

const memoryStorage = multer.memoryStorage();

const uploadToMemory = multer({
  storage: memoryStorage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
});

// ==========================================
// STORAGE: LOCAL DISK (for local development)
// ==========================================

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

const uploadToDisk = multer({
  storage: diskStorage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
});

// ==========================================
// EXPORT
// ==========================================

module.exports = {
  uploadToMemory, // For R2 uploads
  uploadToDisk,   // For local uploads
};
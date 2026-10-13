const sharp = require("sharp");

const MAX_IMAGE_DIMENSION = 2800;
const JPEG_QUALITY = 88;
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function isPdf(mimetype, buffer) {
  if (mimetype !== "application/pdf") return false;
  if (!buffer || buffer.length < 5) return false;
  return buffer.slice(0, 5).toString("ascii") === "%PDF-";
}

function isSupportedImage(mimetype) {
  return SUPPORTED_IMAGE_TYPES.has(mimetype);
}

async function optimizeImage(file) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw new Error("Uploaded file is empty or invalid.");
  }

  if (file.mimetype === "application/pdf") {
    if (!isPdf(file.mimetype, file.buffer)) {
      throw new Error("Invalid PDF file. The document does not contain a valid PDF signature.");
    }
    return {
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.buffer.length,
      optimized: false,
    };
  }

  if (!isSupportedImage(file.mimetype)) {
    throw new Error(`Unsupported file type for processing: ${file.mimetype}`);
  }

  const image = sharp(file.buffer, {
    failOn: "error",
    limitInputPixels: 25_000_000,
  });
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Uploaded image has no readable dimensions.");
  }

  // Sharp cannot encode GIF output, so retain GIFs without changing their MIME type.
  if (file.mimetype === "image/gif") {
    console.warn("Skipping GIF optimization because Sharp cannot encode GIF output.");
    return {
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.buffer.length,
      optimized: false,
    };
  }

  const pipeline = image
    .rotate()
    .resize({
      width: MAX_IMAGE_DIMENSION,
      height: MAX_IMAGE_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    });

  let output;
  let mimetype = file.mimetype;

  if (file.mimetype === "image/jpeg") {
    output = await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
  } else if (file.mimetype === "image/png") {
    output = await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  } else {
    output = await pipeline.webp({ quality: JPEG_QUALITY }).toBuffer();
    mimetype = "image/webp";
  }

  console.info("Image optimized before R2 upload", {
    originalSize: file.buffer.length,
    optimizedSize: output.length,
    originalType: file.mimetype,
    storedType: mimetype,
    width: metadata.width,
    height: metadata.height,
  });

  return {
    buffer: output,
    mimetype,
    size: output.length,
    optimized: true,
  };
}

module.exports = {
  isPdf,
  isSupportedImage,
  optimizeImage,
};
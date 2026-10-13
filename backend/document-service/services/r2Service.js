
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const {
  R2_ENDPOINT,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
  R2_PUBLIC_URL,
} = process.env;

function isR2Configured() {
  return Boolean(
    R2_ENDPOINT &&
      R2_ACCESS_KEY_ID &&
      R2_SECRET_ACCESS_KEY &&
      R2_BUCKET_NAME
  );
}

function validateR2PublicUrl(publicUrl) {
  if (!publicUrl) return;

  try {
    const parsedUrl = new URL(publicUrl);
    if (!/^https?:$/.test(parsedUrl.protocol) || parsedUrl.pathname !== "/") {
      throw new Error("R2_PUBLIC_URL must be an http/https origin without a path.");
    }
  } catch (error) {
    throw new Error(`Invalid R2_PUBLIC_URL: ${error.message}`);
  }
}

function getR2Client() {
  if (!isR2Configured()) {
    throw new Error(
      "Cloudflare R2 is not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME."
    );
  }

  if (R2_PUBLIC_URL) {
    validateR2PublicUrl(R2_PUBLIC_URL);
  }

  return new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}


// ==========================================
// UPLOAD FILE TO R2
// ==========================================

const uploadFileToR2 = async ({
  key,
  fileBuffer,
  contentType,
}) => {
  const r2Client = getR2Client();

  try {
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType || "application/octet-stream",
    });

    const response = await r2Client.send(command);

    console.log(`✅ File uploaded to R2: ${key}`);

    return {
      success: true,
      key,
      response,
    };
  } catch (error) {
    console.error("❌ R2 Upload Error:", error.message);
    throw error;
  }
};

const getPublicFileUrl = (key) => {
  if (!R2_PUBLIC_URL) {
    return null;
  }

  return `${R2_PUBLIC_URL.replace(/\/$/, "")}/${key
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
};


// ==========================================
// GET FILE FROM R2
// ==========================================

const getFileFromR2 = async (key) => {
  const r2Client = getR2Client();

  try {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });

    const response = await r2Client.send(command);

    return response;
  } catch (error) {
    console.error("❌ R2 Get File Error:", error.message);
    throw error;
  }
};

const getSignedFileUrl = async (key, expiresIn = 300) => {
  const r2Client = getR2Client();
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(r2Client, command, { expiresIn });
};


// ==========================================
// DELETE FILE FROM R2
// ==========================================

const deleteFileFromR2 = async (key) => {
  const r2Client = getR2Client();

  try {
    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });

    await r2Client.send(command);

    console.log(`🗑️ File deleted from R2: ${key}`);

    return {
      success: true,
      key,
    };
  } catch (error) {
    console.error("❌ R2 Delete File Error:", error.message);
    throw error;
  }
};


// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  uploadFileToR2,
  getPublicFileUrl,
  getFileFromR2,
  getSignedFileUrl,
  deleteFileFromR2,
};

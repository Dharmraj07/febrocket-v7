const crypto = require("crypto");
const User = require("../models/User");
const { AppError } = require("../utils/authHelpers");

const SHARE_CODE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SHARE_CODE_LENGTH = 4;
const SHARE_CODE_TTL_MS = 10 * 60 * 1000;

const generateShareCodeValue = () =>
  Array.from({ length: SHARE_CODE_LENGTH }, () =>
    SHARE_CODE_ALPHABET[crypto.randomInt(0, SHARE_CODE_ALPHABET.length)]
  ).join("");

const normalizeShareCode = (value) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return /^[0-9A-Z]{4}$/.test(normalized) ? normalized : null;
};

const hashShareCode = (code) =>
  crypto.createHash("sha256").update(String(code).trim().toUpperCase()).digest("hex");

const buildSafeConnectionUser = (user) => {
  if (!user) return null;
  return {
    id: String(user._id),
    userName: user.userName,
    profilePicture: user.profilePicture || null,
  };
};

const clearShareCodeFields = async (userId) => {
  await User.updateOne(
    { _id: userId },
    { $unset: { shareCodeHash: 1, shareCodeExpiresAt: 1 } },
  );
};

const generateShareCodeForUser = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError("User not found.", 404);
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = generateShareCodeValue();
    const hash = hashShareCode(code);
    const duplicate = await User.exists({
      _id: { $ne: userId },
      shareCodeHash: hash,
      shareCodeExpiresAt: { $gt: new Date() },
    });

    if (!duplicate) {
      const expiresAt = new Date(Date.now() + SHARE_CODE_TTL_MS);
      user.shareCodeHash = hash;
      user.shareCodeExpiresAt = expiresAt;
      await user.save();
      return { code, expiresAt };
    }
  }

  throw new AppError("Unable to generate a unique sharing code. Please try again.", 409);
};

const connectWithCode = async (userId, rawCode) => {
  const normalizedCode = normalizeShareCode(rawCode);
  if (!normalizedCode) {
    throw new AppError("Invalid or expired sharing code.", 400);
  }

  const normalizedUserId = String(userId);
  const user = await User.findById(userId).select("connectedUserId");
  if (!user) {
    throw new AppError("User not found.", 404);
  }

  const shareCodeHash = hashShareCode(normalizedCode);
  const now = new Date();
  const owners = await User.find({
    shareCodeHash,
    shareCodeExpiresAt: { $gt: now },
  })
    .select("_id connectedUserId userName profilePicture")
    .limit(2);

  if (owners.length !== 1) {
    throw new AppError("Invalid or expired sharing code.", 400);
  }

  const owner = owners[0];
  if (String(owner._id) === normalizedUserId) {
    throw new AppError("You cannot connect to yourself.", 400);
  }

  const claimedCode = await User.findOneAndUpdate(
    {
      _id: owner._id,
      shareCodeHash,
      shareCodeExpiresAt: { $gt: now },
    },
    { $set: { shareCodeHash: null, shareCodeExpiresAt: null } },
    { new: true },
  );
  if (!claimedCode) {
    throw new AppError("Invalid or expired sharing code.", 400);
  }

  const ownerId = String(owner._id);
  await disconnectConnectionForUser(normalizedUserId);
  await disconnectConnectionForUser(ownerId);

  const viewer = await User.findOneAndUpdate(
    { _id: normalizedUserId, connectedUserId: null },
    {
      $set: {
        connectedUserId: ownerId,
        connectionRole: "viewer",
      },
    },
    { new: true },
  );
  if (!viewer) {
    throw new AppError("Unable to establish connection. Please try again.", 409);
  }

  const ownerConnected = await User.findOneAndUpdate(
    { _id: ownerId, connectedUserId: null },
    {
      $set: {
        connectedUserId: normalizedUserId,
        connectionRole: "owner",
      },
    },
    { new: true },
  );
  if (!ownerConnected) {
    await User.updateOne(
      {
        _id: normalizedUserId,
        connectedUserId: ownerId,
        connectionRole: "viewer",
      },
      { $set: { connectedUserId: null, connectionRole: null } },
    );
    throw new AppError("Unable to establish connection. Please try again.", 409);
  }

  const connectedUser = await User.findById(ownerId).select("userName profilePicture");
  return {
    user: buildSafeConnectionUser(connectedUser),
    role: "viewer",
  };
};

const getConnectionForUser = async (userId) => {
  const currentUser = await User.findById(userId).select("connectedUserId connectionRole");
  if (!currentUser || !currentUser.connectedUserId) {
    return { connected: false, user: null };
  }

  const connectedUser = await User.findById(currentUser.connectedUserId).select(
    "userName profilePicture connectedUserId connectionRole"
  );

  const rolesMatch =
    currentUser.connectionRole === "viewer"
      ? connectedUser?.connectionRole === "owner"
      : currentUser.connectionRole === "owner"
        ? connectedUser?.connectionRole === "viewer"
        : false;
  if (
    !connectedUser ||
    String(connectedUser.connectedUserId) !== String(userId) ||
    !rolesMatch
  ) {
    await disconnectConnectionForUser(userId);
    return { connected: false, user: null };
  }

  return {
    connected: true,
    user: buildSafeConnectionUser(connectedUser),
    role: currentUser.connectionRole,
  };
};

const disconnectConnectionForUser = async (userId) => {
  const currentUser = await User.findById(userId).select("connectedUserId");
  if (!currentUser) {
    return;
  }

  const partnerId = currentUser.connectedUserId
    ? String(currentUser.connectedUserId)
    : null;
  const clearConnection = { $set: { connectedUserId: null, connectionRole: null } };
  await User.updateOne(
    partnerId
      ? { _id: userId, connectedUserId: partnerId }
      : { _id: userId, connectedUserId: null },
    clearConnection,
  );
  if (partnerId) {
    await User.updateOne(
      { _id: partnerId, connectedUserId: userId },
      clearConnection,
    );
  }
};

module.exports = {
  SHARE_CODE_ALPHABET,
  SHARE_CODE_LENGTH,
  SHARE_CODE_TTL_MS,
  generateShareCodeValue,
  normalizeShareCode,
  hashShareCode,
  generateShareCodeForUser,
  connectWithCode,
  getConnectionForUser,
  disconnectConnectionForUser,
  clearShareCodeFields,
};

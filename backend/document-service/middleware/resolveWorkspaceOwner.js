const axios = require("axios");
const mongoose = require("mongoose");
const { getEnvNumber } = require("../helpers/env");

const authServiceUrl = (
  process.env.AUTH_SERVICE_URL || "http://localhost:3001"
).replace(/\/+$/, "");
const authServiceTimeoutMs = Math.max(
  1000,
  getEnvNumber("AUTH_SERVICE_TIMEOUT_MS", 5000),
);

function sendError(res, status, message) {
  return res.status(status).json({ success: false, message });
}

async function resolveWorkspaceOwner(req, res, next) {
  const currentUserId = String(req.user.id);
  const requestedOwnerId =
    typeof req.query.ownerId === "string" ? req.query.ownerId.trim() : "";

  if (!requestedOwnerId || requestedOwnerId === currentUserId) {
    req.workspaceOwnerId = currentUserId;
    req.isConnectedWorkspace = false;
    return next();
  }

  if (!mongoose.Types.ObjectId.isValid(requestedOwnerId)) {
    return sendError(res, 400, "Invalid account ID.");
  }

  try {
    const response = await axios.get(
      `${authServiceUrl}/api/auth/share/connection`,
      {
        headers: {
          ...(req.headers.authorization
            ? { authorization: req.headers.authorization }
            : {}),
          ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}),
        },
        timeout: authServiceTimeoutMs,
      },
    );
    const connectedUser = response.data?.data?.connected
      ? response.data.data.user
      : null;

    if (
      response.data?.data?.role !== "viewer" ||
      !connectedUser ||
      String(connectedUser.id) !== requestedOwnerId
    ) {
      return sendError(res, 403, "This account is not connected to yours.");
    }

    req.workspaceOwnerId = requestedOwnerId;
    req.isConnectedWorkspace = true;
    return next();
  } catch (error) {
    if (error.response?.status === 401) {
      return sendError(res, 401, "Your session is no longer valid.");
    }
    if (error.response?.status === 403) {
      return sendError(res, 403, "This account is not connected to yours.");
    }
    console.error("Connected account verification failed:", error.message);
    return sendError(
      res,
      503,
      "Connected account access could not be verified. Please try again.",
    );
  }
}

module.exports = resolveWorkspaceOwner;

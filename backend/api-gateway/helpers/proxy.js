const axios = require("axios");

const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const filteredHeaders = (source, { gatewayOwnsCors = false } = {}) => {
  const connectionTokens = String(source.connection || "")
    .split(",")
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
  const excludedHeaders = new Set([...hopByHopHeaders, ...connectionTokens]);

  return Object.fromEntries(
    Object.entries(source).filter(([name]) => {
      const normalizedName = name.toLowerCase();
      return (
        !excludedHeaders.has(normalizedName) &&
        normalizedName !== "host" &&
        !(gatewayOwnsCors && normalizedName.startsWith("access-control-"))
      );
    }),
  );
};

const copyHeaders = (source, target, options) => {
  for (const [name, value] of Object.entries(filteredHeaders(source, options))) {
    target.setHeader(name, value);
  }
};

const proxyRequest = async ({ req, res, serviceUrl, serviceName }) => {
  const controller = new AbortController();
  req.once("aborted", () => controller.abort());

  try {
    const isSseStream =
      req.originalUrl?.includes("/events") ||
      req.headers.accept?.includes("text/event-stream");
    const isUpload =
      req.originalUrl?.includes("/upload") ||
      req.headers["content-type"]?.includes("multipart/form-data");
    const isFormMapping = req.originalUrl?.startsWith("/api/forms/map");
    const requestTimeout = isSseStream
      ? 0
      : isFormMapping
        ? Number(process.env.FORM_MAPPING_PROXY_TIMEOUT_MS || 150000)
        : isUpload
        ? Number(process.env.PROXY_UPLOAD_TIMEOUT_MS || 120000)
        : Number(process.env.PROXY_TIMEOUT_MS || 30000);

    const targetUrl = new URL(req.originalUrl, serviceUrl).toString();
    const headers = filteredHeaders(req.headers);
    const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    if (clientIp) {
      headers["x-forwarded-for"] = req.headers["x-forwarded-for"]
        ? `${req.headers["x-forwarded-for"]}, ${clientIp}`
        : clientIp;
    }

    const response = await axios({
      method: req.method,
      url: targetUrl,
      data: req,
      headers,
      maxRedirects: 0,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      responseType: "stream",
      decompress: false,
      timeout: requestTimeout,
      signal: controller.signal,
      validateStatus: () => true,
    });

    copyHeaders(response.headers, res, { gatewayOwnsCors: true });
    res.status(response.status);
    if (isSseStream && typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }
    response.data.on("error", (error) => {
      console.error(`[${serviceName} proxy response stream error]:`, error.message);
      if (!res.headersSent) {
        res.status(502).json({
          success: false,
          message: `${serviceName} service response was interrupted`,
        });
      } else {
        res.destroy(error);
      }
    });
    response.data.pipe(res);
  } catch (error) {
    if (req.aborted || res.destroyed) return;

    const isTimeout =
      error.code === "ECONNABORTED" ||
      error.code === "ETIMEDOUT" ||
      error.name === "TimeoutError" ||
      (typeof error.message === "string" && error.message.toLowerCase().includes("timeout"));
    const statusCode = isTimeout ? 504 : 502;
    console.error(`[${serviceName} proxy error]:`, error.code || error.message);

    return res.status(statusCode).json({
      success: false,
      message: isTimeout
        ? `${serviceName} service timed out`
        : `${serviceName} service is unavailable`,
    });
  }
};

module.exports = { proxyRequest };

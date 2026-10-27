function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || "127.0.0.1";
}

module.exports = { getClientIp };

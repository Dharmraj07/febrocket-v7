const jwt = require("jsonwebtoken");
const config = require("../config");

module.exports = (options = {}) => {
  return (req, res, next) => {
    const authHeader = req.headers?.authorization;
    
    const accessToken = req.cookies?.access_token ||
      (authHeader?.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : authHeader);

    if (!accessToken) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access. Please log in",
      });
    }

    try {
      const decoded = jwt.verify(accessToken, config.jwtAccessSecret);
      req.user = decoded;

      if (options.adminOnly && req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          message: "Access denied. Admin privileges required.",
        });
      }

      return next();
    } catch (error) {
      console.error("Authentication failed:", error.message);
      return res.status(401).json({
        success: false,
        message: "Unauthorized access. Invalid token",
      });
    }
  };
};
const notFoundHandler = (req, _res, next) => {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

const errorHandler = (error, _req, res, _next) => {
  const statusCode = error.statusCode || error.status || 500;
  const message = statusCode >= 500
    ? "Internal Server Error"
    : error.message;

  console.error(error.message || "Unhandled error", {
    statusCode,
    stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
  });

  return res.status(statusCode).json({
    success: false,
    message,
    ...(error.errors ? { errors: error.errors } : {}),
  });
};

module.exports = { notFoundHandler, errorHandler };

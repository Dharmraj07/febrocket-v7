const passport = require("passport");
const { AppError } = require("../controllers/authController");

const authenticate = (strategy) => (req, res, next) => {
  passport.authenticate(strategy, { session: false }, (error, user, info) => {
    if (error) return next(error);
    if (!user) return next(new AppError(info?.message || "Authentication failed", 401));

    req.user = user;
    return next();
  })(req, res, next);
};

module.exports = authenticate;

const passport = require("passport");
const User = require("../models/User");
const LocalStrategy = require("passport-local").Strategy;
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const config = require("./index");
const getOAuthStateStore = require("../utils/oauthStateStore");
const {
  authenticateLocal,
  registerUser,
  linkProvider,
} = require("../controllers/authController");

const localOptions = {
  usernameField: "email",
  passwordField: "password",
  session: false,
};

passport.use("local-login", new LocalStrategy(localOptions, async (email, password, done) => {
  try {
    const user = await authenticateLocal(email, password);
    return done(null, user);
  } catch (error) {
    return done(error);
  }
}));

passport.use("local-register", new LocalStrategy({
  ...localOptions,
  passReqToCallback: true,
}, async (req, email, password, done) => {
  try {
    const user = await registerUser({ ...req.body, email, password });
    return done(null, user);
  } catch (error) {
    return done(error);
  }
}));

const providerVerify = (provider) => async (_accessToken, _refreshToken, profile, done) => {
  try {
    const user = await linkProvider(provider, profile.id, profile);
    return done(null, user);
  } catch (error) {
    return done(error);
  }
};

if (config.googleClientId && config.googleClientSecret) {
  passport.use("google", new GoogleStrategy({
    clientID: config.googleClientId,
    clientSecret: config.googleClientSecret,
    callbackURL: config.googleCallbackUrl,
    state: true,
    store: getOAuthStateStore("google"),
  }, providerVerify("google")));
}

if (config.facebookAppId && config.facebookAppSecret) {
  passport.use("facebook", new FacebookStrategy({
    clientID: config.facebookAppId,
    clientSecret: config.facebookAppSecret,
    callbackURL: config.facebookCallbackUrl,
    graphAPIVersion: config.facebookGraphApiVersion,
    profileFields: ["id", "displayName", "emails", "name"],
    state: true,
    store: getOAuthStateStore("facebook"),
  }, providerVerify("facebook")));
}

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    return done(null, user);
  } catch (error) {
    return done(error);
  }
});

module.exports = passport;
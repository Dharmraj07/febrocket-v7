function getEnvNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function getEnvBoolean(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ["true", "1", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function requireEnv(name, { allowEmpty = false } = {}) {
  const value = process.env[name];

  if (value === undefined || (!allowEmpty && (!String(value).trim() || value === "undefined"))) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

module.exports = {
  getEnvNumber,
  getEnvBoolean,
  requireEnv,
};

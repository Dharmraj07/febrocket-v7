const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");

const readConfig = (port) => {
  const configPath = path.resolve(__dirname, "../config");
  const script = `
    const config = require(${JSON.stringify(configPath)});
    process.stdout.write(JSON.stringify({
      port: config.port,
      googleCallbackUrl: config.googleCallbackUrl,
      facebookCallbackUrl: config.facebookCallbackUrl,
    }));
  `;

  return JSON.parse(
    execFileSync(process.execPath, ["-e", script], {
      cwd: os.tmpdir(),
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: port,
        GOOGLE_CALLBACK_URL: "",
        FACEBOOK_CALLBACK_URL: "",
        DOTENV_CONFIG_PATH: "",
        DOTENV_CONFIG_QUIET: "true",
      },
      encoding: "utf8",
    }),
  );
};

test("OAuth callback defaults use the auth service port", () => {
  const config = readConfig("");

  assert.equal(config.port, 3001);
  assert.equal(
    config.googleCallbackUrl,
    "http://localhost:3001/api/auth/google/callback",
  );
  assert.equal(
    config.facebookCallbackUrl,
    "http://localhost:3001/api/auth/facebook/callback",
  );
});

test("OAuth callback defaults follow a configured auth service port", () => {
  const config = readConfig("4321");

  assert.equal(config.port, 4321);
  assert.equal(
    config.googleCallbackUrl,
    "http://localhost:4321/api/auth/google/callback",
  );
  assert.equal(
    config.facebookCallbackUrl,
    "http://localhost:4321/api/auth/facebook/callback",
  );
});

test("production configuration refuses fallback JWT secrets", () => {
  const configPath = path.resolve(__dirname, "../config");
  const script = `
    try {
      require(${JSON.stringify(configPath)});
      process.stdout.write("accepted");
    } catch (error) {
      if (!error.message.includes("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET")) throw error;
      process.stdout.write("rejected");
    }
  `;
  const result = execFileSync(process.execPath, ["-e", script], {
    cwd: os.tmpdir(),
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "production",
      DOTENV_CONFIG_PATH: "",
      DOTENV_CONFIG_QUIET: "true",
    },
    encoding: "utf8",
  });

  assert.equal(result, "rejected");
});

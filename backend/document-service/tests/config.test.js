const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");

const testSecret = (character) => Buffer.alloc(32, character).toString("hex");

test("production document service requires explicit JWT secrets", () => {
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

test("production document service starts with explicit access and refresh secrets", () => {
  const configPath = path.resolve(__dirname, "../config");
  const script = `
    const config = require(${JSON.stringify(configPath)});
    process.stdout.write(JSON.stringify({
      accessConfigured: Boolean(config.jwtAccessSecret),
      refreshConfigured: Boolean(config.jwtRefreshSecret),
    }));
  `;
  const result = execFileSync(process.execPath, ["-e", script], {
    cwd: os.tmpdir(),
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "production",
      JWT_ACCESS_SECRET: testSecret("a"),
      JWT_REFRESH_SECRET: testSecret("b"),
      PROCESSING_SERVICE_API_KEY: "configured-processing-service-key",
      DOTENV_CONFIG_PATH: "",
      DOTENV_CONFIG_QUIET: "true",
    },
    encoding: "utf8",
  });

  assert.deepEqual(JSON.parse(result), {
    accessConfigured: true,
    refreshConfigured: true,
  });
});

test("development configuration rejects missing and placeholder JWT secrets", () => {
  const configPath = path.resolve(__dirname, "../config");
  const script = `
    try {
      require(${JSON.stringify(configPath)});
      process.stdout.write("accepted");
    } catch {
      process.stdout.write("rejected");
    }
  `;
  const baseEnv = {
    PATH: process.env.PATH,
    NODE_ENV: "development",
    DOTENV_CONFIG_PATH: "",
    DOTENV_CONFIG_QUIET: "true",
  };

  for (const jwtEnv of [
    {},
    { JWT_ACCESS_SECRET: "your_name", JWT_REFRESH_SECRET: "your_name" },
    { JWT_ACCESS_SECRET: "short", JWT_REFRESH_SECRET: "short" },
    {
      JWT_ACCESS_SECRET: testSecret("a"),
      JWT_REFRESH_SECRET: testSecret("a"),
    },
  ]) {
    const result = execFileSync(process.execPath, ["-e", script], {
      cwd: os.tmpdir(),
      env: { ...baseEnv, ...jwtEnv },
      encoding: "utf8",
    });
    assert.equal(result, "rejected");
  }
});

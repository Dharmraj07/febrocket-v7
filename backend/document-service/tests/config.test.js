const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");

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
      access: config.jwtAccessSecret,
      refresh: config.jwtRefreshSecret,
    }));
  `;
  const result = execFileSync(process.execPath, ["-e", script], {
    cwd: os.tmpdir(),
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "production",
      JWT_ACCESS_SECRET: "configured-access-secret",
      JWT_REFRESH_SECRET: "configured-refresh-secret",
      PROCESSING_SERVICE_API_KEY: "configured-processing-service-key",
      DOTENV_CONFIG_PATH: "",
      DOTENV_CONFIG_QUIET: "true",
    },
    encoding: "utf8",
  });

  assert.deepEqual(JSON.parse(result), {
    access: "configured-access-secret",
    refresh: "configured-refresh-secret",
  });
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");

const configPath = path.resolve(__dirname, "../config");
const script = `
  try {
    require(${JSON.stringify(configPath)});
    process.stdout.write("accepted");
  } catch {
    process.stdout.write("rejected");
  }
`;

const loadConfig = (jwtEnv) => {
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: os.tmpdir(),
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "development",
      DOTENV_CONFIG_PATH: "",
      DOTENV_CONFIG_QUIET: "true",
      ...jwtEnv,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};

const testSecret = (character) => Buffer.alloc(32, character).toString("hex");

test("JWT configuration fails closed for missing, short, and placeholder secrets", () => {
  assert.equal(loadConfig({}), "rejected");
  assert.equal(
    loadConfig({
      JWT_ACCESS_SECRET: "replace-with-a-long-random-access-secret",
      JWT_REFRESH_SECRET: "replace-with-a-long-random-refresh-secret",
    }),
    "rejected",
  );
  assert.equal(
    loadConfig({
      JWT_ACCESS_SECRET: "short",
      JWT_REFRESH_SECRET: "short",
    }),
    "rejected",
  );
  assert.equal(
    loadConfig({
      JWT_ACCESS_SECRET: testSecret("a"),
      JWT_REFRESH_SECRET: testSecret("a"),
    }),
    "rejected",
  );
});

test("JWT configuration accepts strong explicit access and refresh secrets", () => {
  assert.equal(
    loadConfig({
      JWT_ACCESS_SECRET: testSecret("a"),
      JWT_REFRESH_SECRET: testSecret("b"),
    }),
    "accepted",
  );
});

test("JWT configuration accepts a strong explicitly configured legacy secret", () => {
  assert.equal(
    loadConfig({ JWT_SECRET_KEY: testSecret("c") }),
    "accepted",
  );
});

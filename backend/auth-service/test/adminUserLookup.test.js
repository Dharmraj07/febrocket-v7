const test = require("node:test");
const assert = require("node:assert/strict");
const User = require("../models/User");
const authController = require("../controllers/authController");

test("admin user listing can filter by a bounded set of user IDs", async () => {
  const ids = [
    "507f1f77bcf86cd799439011",
    "507f1f77bcf86cd799439012",
  ];
  const originalFind = User.find;
  const originalCountDocuments = User.countDocuments;
  let receivedFilter;
  let responseBody;
  let responseStatus;

  User.find = (filter) => {
    receivedFilter = filter;
    return {
      select() {
        return this;
      },
      sort() {
        return this;
      },
      skip() {
        return this;
      },
      limit: async () => [],
    };
  };
  User.countDocuments = async () => 0;

  try {
    await authController.getAllUsers(
      { query: { ids: ids.join(","), limit: String(ids.length) } },
      {
        status(status) {
          responseStatus = status;
          return this;
        },
        json(body) {
          responseBody = body;
          return this;
        },
      },
    );
  } finally {
    User.find = originalFind;
    User.countDocuments = originalCountDocuments;
  }

  assert.deepEqual(receivedFilter, { _id: { $in: ids } });
  assert.equal(responseStatus, 200);
  assert.deepEqual(responseBody.users, []);
});

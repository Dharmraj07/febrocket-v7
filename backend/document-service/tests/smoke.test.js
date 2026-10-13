const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../app');
const config = require('../config');

test('health endpoint responds successfully', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.service, 'document-service');
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

test('CORS only reflects configured document-service origins', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      headers: { Origin: 'https://untrusted.example.invalid' },
    });
    if (!config.allowedOrigins.includes('*')) {
      assert.equal(response.headers.get('access-control-allow-origin'), null);
    }

    const allowedOrigin = config.allowedOrigins.find((origin) => origin !== '*');
    if (allowedOrigin) {
      const allowedResponse = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: { Origin: allowedOrigin },
      });
      assert.equal(
        allowedResponse.headers.get('access-control-allow-origin'),
        allowedOrigin,
      );
    }
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

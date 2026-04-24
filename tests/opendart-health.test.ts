import assert from "node:assert/strict";
import test from "node:test";

test("checkOpendartApiKey returns a redacted endpoint", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENDART_API_KEY;
  process.env.OPENDART_API_KEY = "test-opendart-secret";

  global.fetch = async () =>
    new Response(JSON.stringify({ status: "000", message: "정상" }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });

  try {
    const { checkOpendartApiKey } = await import("@/lib/sources/opendart");
    const result = await checkOpendartApiKey();

    assert.equal(result.ok, true);
    assert.equal(result.endpoint.includes("test-opendart-secret"), false);
    assert.match(result.endpoint, /crtfc_key=%5BREDACTED%5D/);
  } finally {
    global.fetch = originalFetch;
    if (originalKey == null) {
      delete process.env.OPENDART_API_KEY;
    } else {
      process.env.OPENDART_API_KEY = originalKey;
    }
  }
});

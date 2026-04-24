import assert from "node:assert/strict";
import test from "node:test";

import { redactSecrets, redactSecretString } from "@/lib/secret-redaction";

test("redactSecretString redacts sensitive URL parameters", () => {
  const redacted = redactSecretString("https://opendart.example/api/list.json?crtfc_key=abc123&page_no=1");

  assert.equal(redacted, "https://opendart.example/api/list.json?crtfc_key=%5BREDACTED%5D&page_no=1");
  assert.equal(redacted.includes("abc123"), false);
});

test("redactSecrets redacts sensitive object keys recursively", () => {
  const redacted = redactSecrets({
    nested: {
      smtpPass: "smtp-password",
      safeValue: "visible",
    },
  }) as { nested: { smtpPass: string; safeValue: string } };

  assert.equal(redacted.nested.smtpPass, "[REDACTED]");
  assert.equal(redacted.nested.safeValue, "visible");
});

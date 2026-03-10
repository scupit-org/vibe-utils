import test from "node:test";
import assert from "node:assert/strict";
import { extractClientIdFromPayload } from "../src/mcp-runtime/auth-middleware.js";

test("extractClientIdFromPayload prefers client_id (RFC 9068) over azp", () => {
  const payload = {
    client_id: "rfc9068-client-id",
    azp: "auth0-client-id",
    aud: ["https://hostname", "https://hostname/"],
  };
  assert.equal(extractClientIdFromPayload(payload), "rfc9068-client-id");
});

test("extractClientIdFromPayload uses azp when client_id is absent", () => {
  const payload = {
    azp: "auth0-client-id",
    aud: ["https://hostname", "https://hostname/"],
  };
  assert.equal(extractClientIdFromPayload(payload), "auth0-client-id");
});

test("extractClientIdFromPayload returns empty string when both client_id and azp are absent", () => {
  const payload = {
    aud: ["https://hostname", "https://hostname/"],
    sub: "user-123",
  };
  assert.equal(extractClientIdFromPayload(payload), "");
});

test("extractClientIdFromPayload never uses aud as fallback (resource URI, not client ID)", () => {
  const payload = {
    aud: ["https://live-monitor-mcp.example.com", "https://live-monitor-mcp.example.com/"],
    sub: "user-123",
  };
  const result = extractClientIdFromPayload(payload);
  assert.equal(result, "");
  assert.ok(
    !result.includes("example.com"),
    "clientId must not contain resource URI from aud"
  );
});

test("extractClientIdFromPayload treats empty string client_id as absent", () => {
  const payload = {
    client_id: "",
    azp: "auth0-client-id",
  };
  assert.equal(extractClientIdFromPayload(payload), "auth0-client-id");
});

test("extractClientIdFromPayload treats empty string azp as absent", () => {
  const payload = {
    client_id: "",
    azp: "",
    aud: ["https://hostname"],
  };
  assert.equal(extractClientIdFromPayload(payload), "");
});

test("extractClientIdFromPayload treats whitespace-only client_id as absent", () => {
  const payload = {
    client_id: "   ",
    azp: "valid-client-id",
  };
  assert.equal(extractClientIdFromPayload(payload), "valid-client-id");
});

test("extractClientIdFromPayload ignores non-string client_id", () => {
  const payload = {
    client_id: 12345,
    azp: "valid-client-id",
  };
  assert.equal(extractClientIdFromPayload(payload), "valid-client-id");
});

test("extractClientIdFromPayload ignores non-string azp", () => {
  const payload = {
    azp: { nested: "object" },
  };
  assert.equal(extractClientIdFromPayload(payload), "");
});

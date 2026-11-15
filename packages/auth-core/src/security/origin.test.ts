import assert from "node:assert/strict";
import test from "node:test";

import { requestOriginAllowed } from "./origin";

const appUrl = "https://admin.example.com";

test("allows a state change from the application origin", () => {
  assert.equal(requestOriginAllowed({
    method: "POST",
    appUrl,
    origin: "https://admin.example.com",
    referer: null,
  }), true);
});

test("allows the referer when the origin header is absent", () => {
  assert.equal(requestOriginAllowed({
    method: "POST",
    appUrl,
    origin: null,
    referer: "https://admin.example.com/login",
  }), true);
});

test("rejects a different origin", () => {
  assert.equal(requestOriginAllowed({
    method: "POST",
    appUrl,
    origin: "https://clinic.example.com",
    referer: null,
  }), false);
});

test("rejects a state change with no origin or referer", () => {
  assert.equal(requestOriginAllowed({
    method: "DELETE",
    appUrl,
    origin: null,
    referer: null,
  }), false);
});

test("allows ordinary reads without an origin", () => {
  assert.equal(requestOriginAllowed({
    method: "GET",
    appUrl,
    origin: null,
    referer: null,
  }), true);
});

test("allows a signed internal request from another application", () => {
  assert.equal(requestOriginAllowed({
    method: "POST",
    appUrl,
    origin: "https://clinic.example.com",
    referer: null,
    serviceRequest: true,
  }), true);
});

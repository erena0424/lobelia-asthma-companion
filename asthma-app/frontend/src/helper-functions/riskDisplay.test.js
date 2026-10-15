import { test } from "node:test";
import assert from "node:assert/strict";
import { riskLabel } from "./riskDisplay.js";

test("risk labels never expose a number", () => {
  assert.equal(riskLabel("Low"), "Low");
  assert.equal(riskLabel("MEDIUM"), "Medium");
  assert.equal(riskLabel("Moderate"), "Medium");
  assert.equal(riskLabel("High"), "High");
  assert.equal(riskLabel(undefined), null);
  assert.equal(riskLabel("0.34"), null);
});

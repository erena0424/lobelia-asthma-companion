import { test } from "node:test";
import assert from "node:assert/strict";
import { clearSafetyCache, loadSafetyCache, saveSafetyCache, safetySource } from "./safetyCache.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

const profile = {
  sub: "u1",
  email: "a@example.com",
  care_goal: "not a safety field",
  action_plan: { red: { emergency: "Call 911" } },
  emergency_contacts: [{ firstName: "Sam", phone: "555-0100" }],
  asthma_support: { clinician: { name: "Dr. Lee", phone: "555-0101" }, rescue_inhaler: "not kept", peak_flow: { personal_best: 450 } },
};

test("keeps only the safety fields and clears on logout", () => {
  const storage = memoryStorage();
  saveSafetyCache(profile, storage, new Date("2026-10-17T12:00:00Z"));
  const cached = loadSafetyCache(storage);
  assert.deepEqual(cached.action_plan, profile.action_plan);
  assert.equal(cached.saved_at, "2026-10-17T12:00:00.000Z");
  assert.equal(cached.care_goal, undefined);
  assert.equal(cached.email, undefined);
  assert.equal(cached.asthma_support.rescue_inhaler, undefined);
  clearSafetyCache(storage);
  assert.equal(loadSafetyCache(storage), null);
});

test("uses the device copy only when the profile has not loaded", () => {
  const storage = memoryStorage();
  saveSafetyCache(profile, storage);
  const cached = loadSafetyCache(storage);

  const offline = safetySource({ sub: "u1", exp: 1 }, cached);
  assert.deepEqual(offline.user.action_plan, profile.action_plan);
  assert.ok(offline.savedAt);

  const online = safetySource({ ...profile, action_plan: null }, cached);
  assert.equal(online.user.action_plan, null);
  assert.equal(online.savedAt, null);

  assert.deepEqual(safetySource({ sub: "u1" }, null), { user: { sub: "u1" }, savedAt: null });
});

test("broken storage never throws", () => {
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("full"); }, removeItem() { throw new Error("x"); } };
  saveSafetyCache(profile, broken);
  assert.equal(loadSafetyCache(broken), null);
  clearSafetyCache(broken);
});

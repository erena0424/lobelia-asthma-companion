import test from "node:test";
import assert from "node:assert/strict";
import { watchLocationPermission } from "./location.js";

function fakeNavigator() {
  const listeners = new Set();
  const status = {
    state: "prompt",
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
  };
  return {
    status,
    listeners,
    nav: { permissions: { query: async () => status } },
    change(state) {
      status.state = state;
      listeners.forEach((fn) => fn());
    },
  };
}

test("calls back when location is allowed after the page loaded", async () => {
  const fake = fakeNavigator();
  const seen = [];
  watchLocationPermission((state) => seen.push(state), fake.nav);
  await new Promise((resolve) => setTimeout(resolve, 0));
  fake.change("granted");
  assert.deepEqual(seen, ["granted"]);
});

test("unsubscribe stops further callbacks", async () => {
  const fake = fakeNavigator();
  const seen = [];
  const stop = watchLocationPermission((state) => seen.push(state), fake.nav);
  await new Promise((resolve) => setTimeout(resolve, 0));
  stop();
  fake.change("granted");
  assert.deepEqual(seen, []);
});

test("does nothing without the Permissions API", () => {
  const stop = watchLocationPermission(() => {}, {});
  assert.equal(typeof stop, "function");
  stop();
});

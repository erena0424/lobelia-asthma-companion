import { test } from "node:test";
import assert from "node:assert/strict";
import { mentionsBreathingDistress } from "./breathingDistress.js";

test("flags common ways of describing breathing trouble", () => {
  for (const text of [
    "I can't breathe",
    "i cant breathe well",
    "It’s hard to breathe right now",
    "having trouble breathing",
    "so short of breath",
    "my chest is really tight",
    "I'm wheezing a lot",
    "think I'm having an asthma attack",
    "my inhaler isn't helping",
    "should I call 911",
  ]) {
    assert.equal(mentionsBreathingDistress(text), true, text);
  }
});

test("does not flag ordinary messages", () => {
  for (const text of [
    "I have CS577 today",
    "Breathing feels fine today",
    "What is my forecast?",
    "",
    null,
  ]) {
    assert.equal(mentionsBreathingDistress(text), false, String(text));
  }
});

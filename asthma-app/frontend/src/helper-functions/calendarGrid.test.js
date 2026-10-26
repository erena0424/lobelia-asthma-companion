import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HOUR_PX, allDayEndKeepingLength, layoutDay, minuteAtOffset, minutesToTime, monthGrid, shiftAnchor, visibleRange, weekDays, ymd,
} from "./calendarGrid.js";

test("month grid starts on Sunday and covers 6 weeks", () => {
  const grid = monthGrid(new Date(2026, 9, 14));
  assert.equal(grid.length, 42);
  assert.equal(ymd(grid[0]), "2026-09-27");
  assert.equal(grid[0].getDay(), 0);
});

test("week and ranges", () => {
  assert.deepEqual(weekDays(new Date(2026, 9, 14)).map(ymd).slice(0, 2), ["2026-10-11", "2026-10-12"]);
  assert.deepEqual(visibleRange("day", new Date(2026, 9, 14)).map(ymd), ["2026-10-14", "2026-10-14"]);
  assert.equal(ymd(shiftAnchor("month", new Date(2026, 9, 31), 1)), "2026-11-01");
  assert.equal(ymd(shiftAnchor("week", new Date(2026, 9, 14), -1)), "2026-10-07");
});

test("slot math snaps to 15 minutes", () => {
  assert.equal(minuteAtOffset(HOUR_PX * 14.6), 14 * 60 + 30);
  assert.equal(minutesToTime(14 * 60 + 30), "14:30");
  assert.equal(minutesToTime(24 * 60 + 10), "23:59");
});

test("overlapping events share lanes; separate ones don't", () => {
  const laid = layoutDay([
    { id: "a", start: "2026-10-14T10:00", end: "2026-10-14T11:00" },
    { id: "b", start: "2026-10-14T10:30", end: "2026-10-14T11:30" },
    { id: "c", start: "2026-10-14T13:00" },
    { id: "d", start: "2026-10-14" },
  ]);
  const byId = Object.fromEntries(laid.map((item) => [item.event.id, item]));
  assert.equal(laid.length, 3);
  assert.deepEqual([byId.a.lane, byId.a.lanes, byId.b.lane, byId.b.lanes], [0, 2, 1, 2]);
  assert.deepEqual([byId.c.lane, byId.c.lanes, byId.c.height], [0, 1, HOUR_PX]);
  assert.equal(byId.a.top, 10 * HOUR_PX);
});

test("moving an all-day Google event keeps its length", () => {
  // one day: Google end is the next day (exclusive)
  assert.equal(allDayEndKeepingLength({ start: "2026-10-27", end: "2026-10-28" }, "2026-10-30"), "2026-10-30");
  // three days
  assert.equal(allDayEndKeepingLength({ start: "2026-10-27", end: "2026-10-30" }, "2026-11-01"), "2026-11-03");
  // no end on record: one day
  assert.equal(allDayEndKeepingLength({ start: "2026-10-27", end: null }, "2026-10-29"), "2026-10-29");
});

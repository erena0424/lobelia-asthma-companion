// Pure date / time-grid helpers for the Calendar views (no React, testable in Node).

export const HOUR_PX = 48;
export const SNAP_MINUTES = 15;

export function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseYmd(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function startOfWeek(date) {
  return addDays(date, -date.getDay());
}

/** 6 weeks x 7 days starting on the Sunday on/before the 1st. */
export function monthGrid(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

export function weekDays(date) {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

/** First and last visible day (inclusive) for a view. */
export function visibleRange(view, anchor) {
  if (view === "month") {
    const grid = monthGrid(anchor);
    return [grid[0], grid[grid.length - 1]];
  }
  if (view === "week") {
    const days = weekDays(anchor);
    return [days[0], days[6]];
  }
  if (view === "list") return [anchor, addDays(anchor, 13)];
  return [anchor, anchor];
}

export function shiftAnchor(view, anchor, direction) {
  if (view === "month") return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
  if (view === "week") return addDays(anchor, 7 * direction);
  if (view === "list") return addDays(anchor, 14 * direction);
  return addDays(anchor, direction);
}

/** Minutes after midnight from "YYYY-MM-DDTHH:MM", or null for all-day/date-only. */
export function minutesOf(start) {
  const match = /T(\d{2}):(\d{2})/.exec(String(start || ""));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function minutesToTime(minutes) {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, minutes));
  const h = String(Math.floor(clamped / 60)).padStart(2, "0");
  const m = String(clamped % 60).padStart(2, "0");
  return `${h}:${m}`;
}

export function snap(minutes, step = SNAP_MINUTES) {
  return Math.round(minutes / step) * step;
}

/** Minute of the day under a y offset inside the time grid. */
export function minuteAtOffset(offsetY, step = SNAP_MINUTES) {
  const raw = (offsetY / HOUR_PX) * 60;
  return Math.max(0, Math.min(24 * 60 - step, Math.floor(raw / step) * step));
}

/**
 * Positions timed events for one day; overlapping events share the width.
 * @returns [{ event, top, height, lane, lanes }]
 */
export function layoutDay(events) {
  const timed = events
    .map((event) => {
      const start = minutesOf(event.start);
      if (start === null) return null;
      const endRaw = minutesOf(event.end);
      const end = endRaw !== null && endRaw > start ? endRaw : start + 60;
      return { event, start, end };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const placed = [];
  let cluster = [];
  let clusterEnd = -1;

  function closeCluster() {
    const lanes = Math.max(1, ...cluster.map((item) => item.lane + 1));
    for (const item of cluster) placed.push({ ...item, lanes });
    cluster = [];
  }

  for (const item of timed) {
    if (item.start >= clusterEnd && cluster.length) closeCluster();
    const used = new Set(cluster.filter((other) => other.end > item.start).map((other) => other.lane));
    let lane = 0;
    while (used.has(lane)) lane += 1;
    cluster.push({ ...item, lane });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  if (cluster.length) closeCluster();

  return placed.map(({ event, start, end, lane, lanes }) => ({
    event,
    top: (start / 60) * HOUR_PX,
    height: Math.max(((end - start) / 60) * HOUR_PX, 20),
    lane,
    lanes,
  }));
}

export function isAllDay(event) {
  return Boolean(event.all_day) || minutesOf(event.start) === null;
}

/** Local date key an event belongs to ("YYYY-MM-DD" prefix of its start). */
export function eventDateKey(event) {
  return String(event.start || "").slice(0, 10);
}

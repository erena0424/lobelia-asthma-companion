// Field definitions for the profile's asthma sections. Paths are dot-separated
// keys into the user's action_plan / asthma_support JSON (or top-level fields).

export const ACTION_PLAN_SECTIONS = [
  {
    title: "Green zone · every day",
    zone: "green",
    fields: [
      { path: "green.daily_medicines", label: "Daily (controller) medicines", type: "textarea" },
      { path: "green.before_exercise", label: "Before exercise (only if your clinician prescribed a step)", placeholder: "As written on your plan" },
    ],
  },
  {
    title: "Yellow zone · getting worse",
    zone: "yellow",
    fields: [
      { path: "yellow.quick_relief_medicine", label: "Quick-relief medicine", placeholder: "e.g. the name on your rescue inhaler" },
      { path: "yellow.dose_device", label: "Dose and device", placeholder: "As written on your plan, e.g. puffs with a spacer" },
      { path: "yellow.repeat_every_minutes", label: "Repeat every (minutes)", type: "number", min: 1, max: 240 },
      { path: "yellow.max_doses", label: "Up to (doses)", type: "number", min: 1, max: 20 },
      { path: "yellow.if_not_improving", label: "If you're not improving", type: "textarea" },
    ],
  },
  {
    title: "Red zone · medical alert",
    zone: "red",
    fields: [
      { path: "red.quick_relief", label: "Quick-relief instructions", type: "textarea" },
      { path: "red.oral_steroid", label: "Oral steroid (only if your clinician prescribed one)" },
      { path: "red.call_clinician", label: "When to call your clinician" },
      { path: "red.emergency", label: "Emergency steps", type: "textarea", placeholder: "e.g. Call 911" },
    ],
  },
  {
    title: "Anything else from your plan",
    fields: [{ path: "other_instructions", label: "Other instructions", type: "textarea" }],
  },
];

export const SUPPORT_SECTIONS = [
  {
    title: "Medicines and devices",
    fields: [
      { path: "rescue_inhaler", label: "Rescue inhaler" },
      { path: "controller_medicines", label: "Controller medicines", type: "textarea" },
      { path: "nebulizer", label: "Nebulizer", placeholder: "e.g. Yes, at home" },
    ],
  },
  {
    title: "Peak flow (optional)",
    fields: [
      { path: "peak_flow.personal_best", label: "Personal best", type: "number", min: 50, max: 900 },
      { path: "peak_flow.yellow_below", label: "Yellow zone below", type: "number", min: 50, max: 900 },
      { path: "peak_flow.red_below", label: "Red zone below", type: "number", min: 50, max: 900 },
    ],
  },
  {
    title: "Asthma clinician",
    fields: [
      { path: "clinician.name", label: "Name" },
      { path: "clinician.phone", label: "Phone", type: "tel" },
    ],
  },
  {
    title: "Preferred urgent care or hospital",
    fields: [
      { path: "urgent_care.name", label: "Name" },
      { path: "urgent_care.phone", label: "Phone", type: "tel" },
      { path: "urgent_care.address", label: "Address" },
    ],
  },
];

export const PREFERENCE_FIELDS = [
  { path: "care_goal", label: "What would you most like help with?", type: "textarea", max: 1000 },
  { path: "accessibility_needs", label: "Anything that makes the app easier to use for you?", type: "textarea", max: 1000 },
  { path: "preferred_environment", label: "Where do you spend most of your time?", type: "select", options: ["Mostly indoors", "Mostly outdoors", "A mix"] },
  { path: "preferred_reminder", label: "Best time for a check-in reminder", type: "select", options: ["Morning", "Afternoon", "Evening", "None"] },
  { path: "contact_method", label: "How should Lobelia reach you?", type: "select", options: ["In the app", "Email", "Text"] },
];

export function getPath(object, path) {
  return path.split(".").reduce((value, key) => (value == null ? undefined : value[key]), object);
}

export function setPath(object, path, value) {
  const [key, ...rest] = path.split(".");
  if (rest.length === 0) return { ...object, [key]: value };
  return { ...object, [key]: setPath(object?.[key] || {}, rest.join("."), value) };
}

/** Turns form strings into the API's types; blanks become null. */
export function cleanValue(field, raw) {
  if (raw === "" || raw === undefined || raw === null) return null;
  if (field.type === "number") {
    const number = Number(raw);
    return Number.isFinite(number) ? Math.round(number) : null;
  }
  return String(raw).trim() || null;
}

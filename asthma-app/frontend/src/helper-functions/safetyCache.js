// A copy of the user's own safety info (action plan, contacts, clinician, peak flow)
// kept on this device, so the help screen still shows it when the server is
// asleep or unreachable. Never sent anywhere; cleared on logout.

const KEY = "lobelia.safety";

export function safetySubset(user) {
  return {
    action_plan: user?.action_plan ?? null,
    emergency_contacts: Array.isArray(user?.emergency_contacts) ? user.emergency_contacts : [],
    asthma_support: {
      clinician: user?.asthma_support?.clinician ?? null,
      urgent_care: user?.asthma_support?.urgent_care ?? null,
      peak_flow: user?.asthma_support?.peak_flow ?? null,
    },
  };
}

export function saveSafetyCache(user, storage = globalThis.localStorage, now = new Date()) {
  try {
    storage?.setItem(KEY, JSON.stringify({ ...safetySubset(user), saved_at: now.toISOString() }));
  } catch {
    // storage full or blocked: the help screen falls back to 911 only
  }
}

export function loadSafetyCache(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem(KEY) || "null");
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

export function clearSafetyCache(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}

/** True when `user` came from the profile API (the JWT payload alone has no contacts). */
export function hasLoadedProfile(user) {
  return Boolean(user && "emergency_contacts" in user);
}

/** The user to show on the help screen, plus when the device copy was saved if it was used. */
export function safetySource(user, cached) {
  if (hasLoadedProfile(user) || !cached) return { user, savedAt: null };
  return { user: { ...user, ...safetySubset(cached) }, savedAt: cached.saved_at || null };
}

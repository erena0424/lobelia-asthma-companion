// Fixed keyword check used by the chat to surface the help screen.
// This is not an assessment: it only decides whether to show a link to
// static emergency information. Phrase list needs clinical-advisor review.
const DISTRESS_PATTERNS = [
  /\b(can'?t|cannot|can not|couldn'?t|unable to)\s+(catch my\s+)?breathe?\b/,
  /\b(hard|difficult|struggling|struggle)\s+(to\s+)?breath(e|ing)?\b/,
  /\btrouble\s+breathing\b/,
  /\bshort(ness)?\s+of\s+breath\b/,
  /\bout\s+of\s+breath\b/,
  /\bgasping\b/,
  /\bchest\s+(is\s+|feels\s+)?(really\s+|so\s+|very\s+)?tight/,
  /\btight\s+chest\b/,
  /\bwheez/,
  /\basthma\s+attack\b/,
  /\b(inhaler|puffer)\s+(is\s*n'?t|isnt|is\s+not|not|does\s*n'?t|doesnt)\s+(working|helping|work|help)\b/,
  /\bemergency\b/,
  /\b911\b/,
];

export function mentionsBreathingDistress(text) {
  const normalized = String(text || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'");

  return DISTRESS_PATTERNS.some((pattern) => pattern.test(normalized));
}

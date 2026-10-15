// Line-drawn mood face (Figma frame 03): thin teal outline, dot eyes, and a mouth
// that goes from a deep frown (level 1) through flat (3) to a smile (5).
const MOUTH_CURVE = { 1: -7, 2: -3.5, 3: 0, 4: 4, 5: 7 };

function MoodFace({ level, selected = false, size = 44 }) {
  const curve = MOUTH_CURVE[level] ?? 0;
  // frowns sit a little lower so the face reads as sad, not surprised
  const mouthY = curve < 0 ? 31 : 29;

  return (
    <svg
      className={`mood-face ${selected ? "selected" : ""}`}
      width={size}
      height={size}
      viewBox="0 0 44 44"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="22" cy="22" r="19.5" />
      <circle className="mood-face-eye" cx="15.5" cy="17.5" r="1.8" />
      <circle className="mood-face-eye" cx="28.5" cy="17.5" r="1.8" />
      <path d={`M 14 ${mouthY} Q 22 ${mouthY + curve} 30 ${mouthY}`} />
    </svg>
  );
}

export default MoodFace;

import { BREATHING_MAX, BREATHING_SYMPTOMS, severityLabel } from "../../helper-functions/checkInMapping";

/**
 * The four 0-10 symptom sliders, shared by the Day check-in and the Quick log.
 * `hints` (optional) maps a symptom key to a short line under it, e.g. "From your 2:10 pm log".
 */
function SymptomSliders({ idPrefix, values, onChange, hints = {} }) {
  return BREATHING_SYMPTOMS.map(({ key, label }) => {
    const score = values[key] ?? 0;
    const setScore = (value) =>
      onChange({ ...values, [key]: Math.min(BREATHING_MAX, Math.max(0, Math.round(Number(value) || 0))) });

    return (
      <div className="check-in-slider" key={key}>
        <div className="check-in-slider-label">
          <label htmlFor={`${idPrefix}-${key}`}>{label}</label>
          <span className="check-in-slider-value">
            <input
              type="number"
              min="0"
              max={BREATHING_MAX}
              value={score}
              aria-label={`${label} score from 0 to 10`}
              onChange={(event) => setScore(event.target.value)}
            />
            <strong>{severityLabel(score)}</strong>
          </span>
        </div>
        <input
          id={`${idPrefix}-${key}`}
          type="range"
          min="0"
          max={BREATHING_MAX}
          step="1"
          value={score}
          aria-valuetext={`${score} out of 10, ${severityLabel(score)}`}
          onChange={(event) => setScore(event.target.value)}
        />
        <div className="check-in-slider-anchors" aria-hidden="true">
          <span style={{ left: "0%" }}>None</span>
          <span style={{ left: "30%" }}>Slight</span>
          <span style={{ left: "60%" }}>Noticeable</span>
          <span style={{ left: "100%" }}>Strong</span>
        </div>
        {hints[key] && <p className="check-in-from">{hints[key]}</p>}
      </div>
    );
  });
}

export default SymptomSliders;

import { useState } from "react";
import { Link } from "react-router";
import FormModal from "./FormModal";
import SymptomSliders from "./SymptomSliders";
import { saveQuickLog, toQuickLogPayload } from "../../helper-functions/quickLogs";
import { BREATHING_SYMPTOMS, triggerOptions, isProfileTrigger } from "../../helper-functions/checkInMapping";
import { urls } from "../../constants";
import "../pages/CheckInPage.css";

const STRONG_SCORE = 7;

function emptyDraft() {
  return {
    breathing: Object.fromEntries(BREATHING_SYMPTOMS.map(({ key }) => [key, 0])),
    limiting: false,
    puffs: 0,
    triggers: [],
    note: "",
  };
}

/**
 * Quick log: how breathing is right now, saved with the time. Everything is optional;
 * saving with nothing set logs "no symptoms right now". Calls onSaved(log).
 */
function QuickLogModal({ token, knownTriggers = [], onClose, onSaved }) {
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const now = new Date();
  const strong = Object.values(draft.breathing).some((score) => score >= STRONG_SCORE);

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function toggleTrigger(trigger) {
    setDraft((current) => ({
      ...current,
      triggers: current.triggers.includes(trigger)
        ? current.triggers.filter((item) => item !== trigger)
        : [...current.triggers, trigger],
    }));
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const log = await saveQuickLog({ token, log: toQuickLogPayload(draft) });
      onSaved(log);
      onClose();
    } catch (saveError) {
      setError(saveError.message || "We couldn't save your quick log. Please try again.");
      setSaving(false);
    }
  }

  return (
    <FormModal
      title="How is your breathing right now?"
      onHide={onClose}
      onSubmit={handleSave}
      submitText={saving ? "Saving…" : "Save quick log"}
      color="light"
      buttonError={error}
    >
      <div className="quick-log vertical-16">
        <p className="check-in-hint">
          Quick log · {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()}. Everything here
          is optional. It helps fill in your day check-in later.
        </p>

        <SymptomSliders idPrefix="quick" values={draft.breathing} onChange={(breathing) => update("breathing", breathing)} />

        {strong && (
          <p className="quick-log-help">
            You marked a strong symptom. <Link to={urls.help} onClick={onClose}>Breathing help</Link> asks a few questions
            about how you're breathing now.
          </p>
        )}

        <div className="quick-log-row">
          <span>Reliever puffs just now</span>
          <span className="quick-log-stepper">
            <button type="button" aria-label="One fewer puff" onClick={() => update("puffs", Math.max(0, draft.puffs - 1))}>−</button>
            <output aria-live="polite">{draft.puffs}</output>
            <button type="button" aria-label="One more puff" onClick={() => update("puffs", Math.min(50, draft.puffs + 1))}>+</button>
          </span>
        </div>

        <div className="check-in-chips" role="group" aria-label="More about right now">
          <button
            type="button"
            className={`check-in-chip ${draft.limiting ? "selected" : ""}`}
            aria-pressed={draft.limiting}
            onClick={() => update("limiting", !draft.limiting)}
          >
            It's limiting what I'm doing
          </button>
          {triggerOptions(knownTriggers, draft.triggers).map((trigger) => (
            <button
              type="button"
              key={trigger}
              className={`check-in-chip ${draft.triggers.includes(trigger) ? "selected" : ""}`}
              aria-pressed={draft.triggers.includes(trigger)}
              onClick={() => toggleTrigger(trigger)}
            >
              {isProfileTrigger(knownTriggers, trigger) && (
                <span className="check-in-chip-star" aria-label="From your Profile">★ </span>
              )}
              {trigger}
            </button>
          ))}
        </div>

        <textarea
          className="check-in-note"
          rows="2"
          maxLength={1000}
          placeholder="A note, if you like: where you are, what you're doing"
          aria-label="Note"
          value={draft.note}
          onChange={(event) => update("note", event.target.value)}
        />
      </div>
    </FormModal>
  );
}

export default QuickLogModal;

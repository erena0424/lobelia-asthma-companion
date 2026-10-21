import { useEffect, useState } from "react";
import { Button } from "react-bootstrap";
import { useAuth } from "../../context/AuthContext";
import { getCheckIns, saveCheckIn, setInhalerTotal } from "../../helper-functions/checkIns";
import { getDayPrefill, logTime } from "../../helper-functions/quickLogs";
import {
  BASIC_QUESTIONS,
  BREATHING_SYMPTOMS,
  MOODS,
  answersFromSaved,
  emptyCheckIn,
  hasSymptoms,
  missingBasics,
  prefillAnswers,
  toCheckInPayload,
  triggerOptions,
  isProfileTrigger,
} from "../../helper-functions/checkInMapping";
import MoodFace from "./MoodFace";
import SymptomSliders from "./SymptomSliders";
import "../pages/CheckInPage.css";

/**
 * The Day check-in questions for one date, used on the Check-in page and in the Calendar's day sheet.
 * Loads that day's saved check-in, or until there is one, pre-fills from the day's quick logs.
 * Calls onSaved(body) once the check-in and puff total are saved.
 */
function DayCheckInForm({ date, isToday = true, initialMood = null, onSaved }) {
  const { token, user } = useAuth();
  const [answers, setAnswers] = useState(() => ({ ...emptyCheckIn(), mood: initialMood }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [customTrigger, setCustomTrigger] = useState("");
  const [showMissing, setShowMissing] = useState(false);
  // where pre-filled answers came from, e.g. { wheezing: "From your 2:10 pm log" }
  const [hints, setHints] = useState({});
  const [logNotes, setLogNotes] = useState([]);

  const knownTriggers = Array.isArray(user?.trigger_preferences) ? user.trigger_preferences : [];
  const noSymptomsText = isToday ? "No symptoms today" : "No symptoms that day";

  // prefill from an existing check-in for that day, or, until the day is checked in, from that day's quick logs
  useEffect(() => {
    let cancelled = false;

    getCheckIns({ from: date, to: date, token })
      .then(async (data) => {
        if (cancelled) return;

        const existing = (data?.items || []).find((item) => item.date === date);
        let saved = answersFromSaved(existing);
        let fromLogs = {};
        let notes = [];

        if (!existing?.symptoms_logged) {
          const prefill = await getDayPrefill({ token, date }).catch(() => null);
          if (cancelled) return;
          ({ answers: saved, hints: fromLogs } = prefillAnswers(saved, prefill));
          notes = prefill?.logs || [];
        }

        setHints(fromLogs);
        setLogNotes(notes);
        setAnswers((current) => ({ ...saved, mood: saved.mood ?? current.mood }));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [date, token]);

  function update(field, value) {
    setAnswers((current) => ({ ...current, [field]: value }));
  }

  function toggle(field, value) {
    setAnswers((current) => ({
      ...current,
      [field]: current[field].includes(value)
        ? current[field].filter((item) => item !== value)
        : [...current[field], value],
    }));
  }

  function addCustomTrigger() {
    const trigger = customTrigger.trim().slice(0, 40);
    if (!trigger) return;
    setAnswers((current) =>
      current.triggers.some((item) => item.toLowerCase() === trigger.toLowerCase())
        ? current
        : { ...current, triggers: [...current.triggers, trigger] }
    );
    setCustomTrigger("");
  }

  const missing = missingBasics(answers);

  async function handleSave() {
    if (missing.length > 0) {
      setShowMissing(true);
      setError("Answer the questions marked above to save. They shape your Today card.");
      // bring the first unanswered question into view (the error sits by the Save button)
      setTimeout(() => document.querySelector(".check-in-sliders.is-missing, .check-in-question.is-missing, .check-in-puffs.is-missing")
        ?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
      return;
    }

    setError("");
    setSaving(true);

    const { body, puffs } = toCheckInPayload(answers, date);

    try {
      // setting the puff total refreshes the forecast, so skip the check-in's own refresh
      await saveCheckIn({ token, checkIn: body, refreshForecast: false });
      await setInhalerTotal({ token, date, puffs });
    } catch (saveError) {
      setError(saveError.message || "We couldn't save your check-in. Please try again.");
      setSaving(false);
      return;
    }

    onSaved?.(body);
  }

  return (
    <div className="day-check-in-form vertical-24">
      {Object.keys(hints).length > 0 && (
        <p className="check-in-prefilled m-0">
          We filled in what your quick logs from this day already say. Check each answer and change anything that's off.
        </p>
      )}

      <section
        className={`check-in-section check-in-sliders vertical-16 ${showMissing && !answers.breathingSet ? "is-missing" : ""}`}
        aria-labelledby={`check-in-symptoms-${date}`}
      >
        <h2 id={`check-in-symptoms-${date}`}>How bad were your symptoms? <span className="check-in-required">Required</span></h2>
        <p className="check-in-hint">0 is none, 10 is the worst you can imagine. If it changed during the day, pick the worst.</p>
        <div className="check-in-chips">
          <button
            type="button"
            className={`check-in-chip ${answers.breathingSet && !hasSymptoms(answers.breathing) ? "selected" : ""}`}
            aria-pressed={answers.breathingSet && !hasSymptoms(answers.breathing)}
            onClick={() =>
              setAnswers((current) => ({
                ...current,
                breathing: Object.fromEntries(BREATHING_SYMPTOMS.map(({ key }) => [key, 0])),
                breathingSet: true,
              }))
            }
          >
            {noSymptomsText}
          </button>
        </div>
        {hints.noSymptoms && <p className="check-in-from">{hints.noSymptoms}</p>}
        {showMissing && !answers.breathingSet && (
          <p className="check-in-missing-note">Set the sliders, or tap "{noSymptomsText}".</p>
        )}
        <SymptomSliders
          idPrefix="breathing"
          values={answers.breathing}
          hints={hints}
          onChange={(breathing) => setAnswers((current) => ({ ...current, breathing, breathingSet: true }))}
        />
      </section>

      <section className="check-in-section vertical-16" aria-labelledby={`check-in-basics-${date}`}>
        <h2 id={`check-in-basics-${date}`}>About your day <span className="check-in-required">Required</span></h2>
        {BASIC_QUESTIONS.map(({ key, label }) => {
          const unanswered = showMissing && answers[key] !== true && answers[key] !== false;
          return (
            <fieldset className={`check-in-question ${unanswered ? "is-missing" : ""}`} key={key}>
              <legend>{label}</legend>
              <div className="check-in-chips" role="group" aria-label={label}>
                {[{ value: true, text: "Yes" }, { value: false, text: "No" }].map(({ value, text }) => (
                  <button
                    type="button"
                    key={text}
                    className={`check-in-chip ${answers[key] === value ? "selected" : ""}`}
                    aria-pressed={answers[key] === value}
                    onClick={() => update(key, value)}
                  >
                    {text}
                  </button>
                ))}
              </div>
              {key === "relieverUsed" && answers.relieverUsed === true && (
                <label className={`check-in-puffs ${showMissing && missing.includes("puffs") ? "is-missing" : ""}`}>
                  How many puffs in total?
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={answers.puffs}
                    onChange={(event) => update("puffs", event.target.value)}
                  />
                </label>
              )}
              {hints[key] && <p className="check-in-from">{hints[key]}</p>}
            </fieldset>
          );
        })}
      </section>

      <section className="check-in-section vertical-8">
        <h2>How are you feeling? <span className="check-in-optional">Optional</span></h2>
        <div
          className="check-in-faces"
          role="radiogroup"
          aria-label="How are you feeling?"
          onKeyDown={(keyEvent) => {
            // arrow keys move the selection, like a native radio group
            const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[keyEvent.key];
            if (!step) return;
            keyEvent.preventDefault();
            const next = Math.min(5, Math.max(1, (answers.mood ?? 3) + step));
            update("mood", next);
            keyEvent.currentTarget.querySelector(`[data-mood="${next}"]`)?.focus();
          }}
        >
          {MOODS.map((mood) => (
            <button
              type="button"
              role="radio"
              key={mood.value}
              aria-checked={answers.mood === mood.value}
              aria-label={mood.label}
              data-mood={mood.value}
              tabIndex={answers.mood === mood.value || (answers.mood === null && mood.value === 3) ? 0 : -1}
              className={`check-in-face ${answers.mood === mood.value ? "selected" : ""}`}
              onClick={() => update("mood", mood.value)}
            >
              <MoodFace level={mood.value} selected={answers.mood === mood.value} />
              <span>{mood.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="check-in-section vertical-8">
        <h2>Anything you think set it off? <span className="check-in-optional">Optional</span></h2>
        <p className="check-in-hint">Not sure? That's fine. Tap anything you noticed and Lobelia will compare it with how you felt.</p>
        {knownTriggers.length > 0 && (
          <p className="check-in-hint">What you picked in your Profile shows first, marked with a star.</p>
        )}
        <div className="check-in-chips">
          {triggerOptions(knownTriggers, answers.triggers).map((trigger) => (
            <button
              type="button"
              key={trigger}
              className={`check-in-chip ${answers.triggers.includes(trigger) ? "selected" : ""}`}
              aria-pressed={answers.triggers.includes(trigger)}
              onClick={() => toggle("triggers", trigger)}
            >
              {isProfileTrigger(knownTriggers, trigger) && (
                <span className="check-in-chip-star" aria-label="From your Profile">★ </span>
              )}
              {trigger}
            </button>
          ))}
        </div>
        <div className="check-in-add">
          <input
            type="text"
            maxLength={40}
            placeholder="Add your own, like paint fumes"
            aria-label="Add your own possible trigger"
            value={customTrigger}
            onChange={(event) => setCustomTrigger(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCustomTrigger();
              }
            }}
          />
          <button type="button" className="check-in-add-button" onClick={addCustomTrigger}>Add</button>
        </div>
      </section>

      <section className="check-in-section vertical-8">
        <h2>Anything else? <span className="check-in-optional">Optional</span></h2>
        <textarea
          className="check-in-note"
          rows="3"
          maxLength={1000}
          placeholder="Where you were, what you did, how you slept, anything"
          aria-label="Anything else"
          value={answers.note}
          onChange={(event) => update("note", event.target.value)}
        />
        {logNotes.length > 0 && (
          <ul className="check-in-log-notes">
            {logNotes.map((entry) => (
              <li key={entry.logged_at}>
                <span>{logTime(entry.logged_at)}</span> {entry.note}
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && <p className="error-text-dark text-center m-0">{error}</p>}

      <div className="at-middle-center">
        <Button className="button-dark btn-large-text" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save day check-in"}
        </Button>
      </div>
    </div>
  );
}

export default DayCheckInForm;

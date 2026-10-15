import { useEffect, useState } from "react";
import { Button } from "react-bootstrap";
import { Link, useSearchParams } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { getCheckIns, saveCheckIn, setInhalerTotal } from "../../helper-functions/checkIns";
import { askCompanion } from "../../helper-functions/askCompanion";
import { localYmd, yesterdayYmd } from "../../helper-functions/forecastDisplayLogic";
import {
  BREATHING_SYMPTOMS,
  CONTEXT_CHIPS,
  BREATHING_MAX,
  MOODS,
  emptyCheckIn,
  severityLabel,
  toCheckInPayload,
  userNoteFrom,
} from "../../helper-functions/checkInMapping";
import { urls } from "../../constants";
import MoodFace from "../input/MoodFace";
import "./CheckInPage.css";

const FALLBACK_REPLY =
  "Thanks for checking in. Every check-in helps Lobelia understand your days a little better.";

function CheckInPage() {
  const { token, user } = useAuth();
  const [searchParams] = useSearchParams();

  // ?date=YYYY-MM-DD (today or earlier, e.g. from the Calendar) or ?day=yesterday
  const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.get("date") || "") ? searchParams.get("date") : null;
  const otherDate =
    requestedDate && requestedDate < localYmd() && requestedDate !== yesterdayYmd() ? requestedDate : null;

  const [day, setDay] = useState(() => {
    if (otherDate) return "other";
    if (searchParams.get("day") === "yesterday" || requestedDate === yesterdayYmd()) return "yesterday";
    return "today";
  });
  const date = day === "other" ? otherDate : day === "yesterday" ? yesterdayYmd() : localYmd();

  const [answers, setAnswers] = useState(emptyCheckIn);
  const [status, setStatus] = useState("editing");
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");

  const knownTriggers = Array.isArray(user?.trigger_preferences) ? user.trigger_preferences : [];

  // prefill from an existing check-in for that day (e.g. one saved from the Calendar)
  useEffect(() => {
    let cancelled = false;

    getCheckIns({ from: date, to: date, token })
      .then((data) => {
        if (cancelled) return;

        const existing = (data?.items || []).find((item) => item.date === date);

        setAnswers((current) => ({
          ...emptyCheckIn(),
          mood: current.mood,
          note: existing ? userNoteFrom(existing.notes) : "",
          triggers: existing?.triggers || [],
          ...(existing?.details?.mood ? { mood: existing.details.mood } : {}),
          ...(existing?.details?.breathing
            ? { breathing: { ...emptyCheckIn().breathing, ...existing.details.breathing } }
            : {}),
          puffs: existing?.puffs_today > 0 ? existing.puffs_today : 1,
          context: existing?.details?.context
            ? existing.details.context
            : existing?.puffs_today > 0 ? ["reliever_use"] : [],
        }));
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

  async function handleSave() {
    if (answers.mood === null) {
      setError("Pick the face that fits best to continue.");
      return;
    }

    setError("");
    setStatus("saving");

    const { body, puffs } = toCheckInPayload(answers, date);

    try {
      // when puffs are set, that call refreshes the forecast, so skip the first refresh
      await saveCheckIn({ token, checkIn: body, refreshForecast: puffs === null });

      if (puffs !== null) {
        await setInhalerTotal({ token, date, puffs });
      }
    } catch (saveError) {
      setError(saveError.message || "We couldn't save your check-in. Please try again.");
      setStatus("editing");
      return;
    }

    setStatus("replying");

    try {
      const data = await askCompanion({
        token,
        persona: "warm",
        message:
          `I just finished my ${day === "today" ? "check-in" : `check-in for ${date}`}. ` +
          `${body.notes.replace("[Check-in] ", "")}\n` +
          "Please reply with one or two short, supportive sentences.",
      });
      setReply(data.message);
    } catch {
      setReply(FALLBACK_REPLY);
    }

    setStatus("done");
  }

  if (status === "replying" || status === "done") {
    return (
      <main className="check-in-page vertical-24">
        <section className="check-in-section check-in-reply vertical-16 at-middle-center">
          <img className="check-in-bunny" src={`${import.meta.env.BASE_URL}bunny.gif`} alt="Companion" />
          <h2>Check-in saved</h2>
          <p className="paragraph" aria-live="polite">
            {status === "replying" ? "Your companion is writing a note…" : reply}
          </p>
          {status === "done" && (
            <Link className="btn button-dark btn-large-text" to={urls.home}>
              Back to Today
            </Link>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="check-in-page vertical-24">
      <p className="paragraph text-center m-0">
        A quick check-in about how you and your breathing are doing. Everything except the faces is optional.
      </p>

      <section className="check-in-section vertical-8">
        <h2>Which day?</h2>
        <div className="check-in-chips" role="group" aria-label="Which day">
          {[
            { value: "today", label: "Today" },
            { value: "yesterday", label: "Yesterday" },
            ...(otherDate
              ? [{ value: "other", label: new Date(`${otherDate}T00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) }]
              : []),
          ].map((option) => (
            <button
              type="button"
              key={option.value}
              className={`check-in-chip ${day === option.value ? "selected" : ""}`}
              aria-pressed={day === option.value}
              onClick={() => setDay(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="check-in-hint">
          Yesterday's check-in helps create today's forecast. Today's helps create tomorrow's.
        </p>
      </section>

      <section className="check-in-section vertical-8">
        <h2>How are you feeling?</h2>
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

      <section className="check-in-section vertical-16">
        <h2>How is your breathing?</h2>
        {BREATHING_SYMPTOMS.map(({ key, label }) => {
          const score = answers.breathing[key];
          const setScore = (value) =>
            update("breathing", {
              ...answers.breathing,
              [key]: Math.min(BREATHING_MAX, Math.max(0, Math.round(Number(value) || 0))),
            });

          return (
            <div className="check-in-slider" key={key}>
              <div className="check-in-slider-label">
                <label htmlFor={`breathing-${key}`}>{label}</label>
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
                id={`breathing-${key}`}
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
                <span style={{ left: "30%" }}>Mild</span>
                <span style={{ left: "60%" }}>Moderate</span>
                <span style={{ left: "100%" }}>Severe</span>
              </div>
            </div>
          );
        })}
      </section>

      <section className="check-in-section vertical-8">
        <h2>Other context</h2>
        <div className="check-in-chips">
          {CONTEXT_CHIPS.map(({ key, label }) => (
            <button
              type="button"
              key={key}
              className={`check-in-chip ${answers.context.includes(key) ? "selected" : ""}`}
              aria-pressed={answers.context.includes(key)}
              onClick={() => toggle("context", key)}
            >
              {label}
            </button>
          ))}
        </div>
        {answers.context.includes("reliever_use") && (
          <label className="check-in-puffs">
            Rescue inhaler puffs that day
            <input
              type="number"
              min="1"
              max="50"
              value={answers.puffs}
              onChange={(event) => update("puffs", event.target.value)}
            />
          </label>
        )}
      </section>

      {knownTriggers.length > 0 && (
        <section className="check-in-section vertical-8">
          <h2>Anything set it off?</h2>
          <div className="check-in-chips">
            {knownTriggers.map((trigger) => (
              <button
                type="button"
                key={trigger}
                className={`check-in-chip ${answers.triggers.includes(trigger) ? "selected" : ""}`}
                aria-pressed={answers.triggers.includes(trigger)}
                onClick={() => toggle("triggers", trigger)}
              >
                {trigger}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="check-in-section vertical-8">
        <h2>Anything else?</h2>
        <textarea
          className="check-in-note"
          rows="3"
          maxLength={1000}
          placeholder="A few words about your day, if you like"
          value={answers.note}
          onChange={(event) => update("note", event.target.value)}
        />
      </section>

      {error && <p className="error-text-dark text-center m-0">{error}</p>}

      <div className="at-middle-center">
        <Button
          className="button-dark btn-large-text"
          onClick={handleSave}
          disabled={status === "saving"}
        >
          {status === "saving" ? "Saving…" : "Save check-in"}
        </Button>
      </div>
    </main>
  );
}

export default CheckInPage;

import { useState } from "react";
import { Button } from "react-bootstrap";
import FormModal from "../input/FormModal";
import "../pages/CalendarPage.css";

const ENVIRONMENTS = ["Indoor", "Outdoor", "Both", "Not sure"];
const INTENSITIES = ["Resting", "Light", "Moderate", "Hard", "Not sure"];

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

function timeOf(value) {
  const match = /T(\d{2}:\d{2})/.exec(String(value || ""));
  return match ? match[1] : "";
}

function draftFrom(date, initial, startTime, endTime) {
  if (initial) {
    return {
      title: initial.title || "",
      date: String(initial.start || date).slice(0, 10),
      allDay: !timeOf(initial.start),
      startTime: timeOf(initial.start) || "09:00",
      endTime: timeOf(initial.start) ? timeOf(initial.end) : "10:00",
      location: initial.location || "",
      environment: capitalize(initial.environment),
      intensity: capitalize(initial.intensity),
      context: initial.context || "",
      notes: initial.notes || initial.description || "",
    };
  }

  return {
    title: "",
    date,
    // a tapped day starts as all-day; a tapped time keeps its slot
    allDay: !startTime,
    startTime: startTime || "09:00",
    endTime: startTime ? endTime || "" : "10:00",
    location: "",
    environment: "",
    intensity: "",
    context: "",
    notes: "",
  };
}

/**
 * The plan fields Lobelia uses for its tips, with an All day switch.
 * Calls onSave(date, event) (an edited event keeps its id), then onDone().
 * A Google Calendar event only shows the fields Google keeps; notes become its description.
 */
export function PlanForm({ date, initial = null, startTime = "", endTime = "", onSave, onDone }) {
  const fromGoogle = initial?.source === "google_calendar";
  const [draft, setDraft] = useState(() => draftFrom(date, initial, startTime, endTime));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function update(event) {
    const { name, value } = event.target;
    setDraft((current) => ({ ...current, [name]: value }));
  }

  async function handleSave() {
    if (saving) return;

    if (!draft.title.trim()) {
      setError("Give your plan a name.");
      return;
    }

    if (!draft.allDay && !draft.startTime) {
      setError("Pick a start time, or turn on All day.");
      return;
    }

    if (!draft.allDay && draft.endTime && draft.endTime <= draft.startTime) {
      setError("The end time should be after the start time.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await onSave(draft.date, {
        id: initial?.id || `manual-${Date.now()}`,
        title: draft.title.trim(),
        start: draft.allDay ? draft.date : `${draft.date}T${draft.startTime}`,
        end: !draft.allDay && draft.endTime ? `${draft.date}T${draft.endTime}` : null,
        all_day: draft.allDay,
        location: draft.location.trim() || null,
        environment: draft.environment && draft.environment !== "Not sure" ? draft.environment.toLowerCase() : null,
        intensity: draft.intensity && draft.intensity !== "Not sure" ? draft.intensity.toLowerCase() : null,
        context: draft.context.trim() || null,
        notes: draft.notes.trim() || null,
      });
      onDone?.();
    } catch (saveError) {
      setError(saveError.message || "Unable to save your plan.");
      setSaving(false);
    }
  }

  return (
    <div className="vertical-16 plan-form">
      <label className="check-in-input-group">
        <h3 className="section-header-text-small">What is it?</h3>
        <input name="title" value={draft.title} onChange={update} placeholder="Chemistry lab, skating, soccer practice..." maxLength={300} />
      </label>

      <div className="plan-when">
        <div className="plan-when-row">
          <span id="plan-all-day-label">All day</span>
          <button
            type="button"
            role="switch"
            className="plan-switch"
            aria-checked={draft.allDay}
            aria-labelledby="plan-all-day-label"
            onClick={() => setDraft((current) => ({ ...current, allDay: !current.allDay }))}
          >
            <span aria-hidden="true" />
          </button>
        </div>
        <div className="event-modal-row">
          <label className="check-in-input-group">
            <h3 className="section-header-text-small">Date</h3>
            <input type="date" name="date" value={draft.date} onChange={update} />
          </label>
          {!draft.allDay && (
            <>
              <label className="check-in-input-group">
                <h3 className="section-header-text-small">Starts</h3>
                <input type="time" name="startTime" value={draft.startTime} onChange={update} />
              </label>
              <label className="check-in-input-group">
                <h3 className="section-header-text-small">Ends</h3>
                <input type="time" name="endTime" value={draft.endTime} onChange={update} />
              </label>
            </>
          )}
        </div>
      </div>

      <label className="check-in-input-group">
        <h3 className="section-header-text-small">Location (optional)</h3>
        <input name="location" value={draft.location} onChange={update} placeholder="Rink, park, gym, a friend's place..." maxLength={200} />
      </label>

      {!fromGoogle && (
        <div className="event-modal-row">
          <label className="check-in-input-group">
            <h3 className="section-header-text-small">Inside or outside?</h3>
            <select name="environment" value={draft.environment} onChange={update}>
              <option value="">Choose…</option>
              {ENVIRONMENTS.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="check-in-input-group">
            <h3 className="section-header-text-small">How active?</h3>
            <select name="intensity" value={draft.intensity} onChange={update}>
              <option value="">Choose…</option>
              {INTENSITIES.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
        </div>
      )}

      {!fromGoogle && (
        <label className="check-in-input-group">
          <h3 className="section-header-text-small">Anything that might bother your breathing? (optional)</h3>
          <input name="context" value={draft.context} onChange={update} placeholder="Strong scents, chemicals, smoke, cold air, dust..." maxLength={200} />
        </label>
      )}

      <label className="check-in-input-group">
        <h3 className="section-header-text-small">Notes (optional)</h3>
        <textarea name="notes" value={draft.notes} onChange={update} rows="2" maxLength={fromGoogle ? 2000 : 500} />
      </label>

      {fromGoogle && <p className="m-0 cal-note">Saving updates this event in your Google Calendar too.</p>}

      {error && <p className="error-text-dark text-center m-0">{error}</p>}

      <div className="at-middle-center">
        <Button className="button-dark btn-medium-text" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : fromGoogle ? "Save to Google Calendar" : "Save plan"}
        </Button>
      </div>
    </div>
  );
}

/** Add (or edit, when `initial` is given) a plan in its own pop-up. */
function EventModal({ date, initial = null, startTime = "", endTime = "", onClose, onSave }) {
  return (
    <FormModal title={initial?.source === "google_calendar" ? "Edit Google Calendar event" : initial ? "Edit plan" : "Add a plan"} onHide={onClose} showSubmit={false} color="light">
      <PlanForm date={date} initial={initial} startTime={startTime} endTime={endTime} onSave={onSave} onDone={onClose} />
    </FormModal>
  );
}

export default EventModal;

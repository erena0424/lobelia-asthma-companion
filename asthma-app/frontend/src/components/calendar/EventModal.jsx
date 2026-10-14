import { useState } from "react";
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
      startTime: timeOf(initial.start),
      endTime: timeOf(initial.end),
      location: initial.location || "",
      environment: capitalize(initial.environment),
      intensity: capitalize(initial.intensity),
      context: initial.context || "",
      notes: initial.notes || "",
    };
  }

  return {
    title: "",
    date,
    startTime: startTime || "",
    endTime: endTime || "",
    location: "",
    environment: "",
    intensity: "",
    context: "",
    notes: "",
  };
}

/**
 * Add (or edit, when `initial` is given) a plan with the details Lobelia uses for its tips.
 * Calls onSave(date, event); an edited event keeps its id.
 */
function EventModal({ date, initial = null, startTime = "", endTime = "", onClose, onSave }) {
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

    if (draft.endTime && draft.startTime && draft.endTime <= draft.startTime) {
      setError("The end time should be after the start time.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await onSave(draft.date, {
        id: initial?.id || `manual-${Date.now()}`,
        title: draft.title.trim(),
        start: draft.startTime ? `${draft.date}T${draft.startTime}` : draft.date,
        end: draft.endTime ? `${draft.date}T${draft.endTime}` : null,
        all_day: !draft.startTime,
        location: draft.location.trim() || null,
        environment: draft.environment && draft.environment !== "Not sure" ? draft.environment.toLowerCase() : null,
        intensity: draft.intensity && draft.intensity !== "Not sure" ? draft.intensity.toLowerCase() : null,
        context: draft.context.trim() || null,
        notes: draft.notes.trim() || null,
      });
      onClose();
    } catch (saveError) {
      setError(saveError.message || "Unable to save your plan.");
      setSaving(false);
    }
  }

  return (
    <FormModal
      title={initial ? "Edit plan" : "Add a plan"}
      onHide={onClose}
      onSubmit={handleSave}
      submitText={saving ? "Saving…" : "Save plan"}
      color="light"
      buttonError={error}
    >
      <div className="vertical-16">
        <label className="check-in-input-group">
          <h3 className="section-header-text-small">What is it?</h3>
          <input name="title" value={draft.title} onChange={update} placeholder="Chemistry lab, skating, soccer practice..." maxLength={300} />
        </label>

        <div className="event-modal-row">
          <label className="check-in-input-group">
            <h3 className="section-header-text-small">Date</h3>
            <input type="date" name="date" value={draft.date} onChange={update} />
          </label>
          <label className="check-in-input-group">
            <h3 className="section-header-text-small">Starts</h3>
            <input type="time" name="startTime" value={draft.startTime} onChange={update} />
          </label>
          <label className="check-in-input-group">
            <h3 className="section-header-text-small">Ends</h3>
            <input type="time" name="endTime" value={draft.endTime} onChange={update} />
          </label>
        </div>

        <label className="check-in-input-group">
          <h3 className="section-header-text-small">Where? (optional)</h3>
          <input name="location" value={draft.location} onChange={update} maxLength={200} />
        </label>

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

        <label className="check-in-input-group">
          <h3 className="section-header-text-small">Anything that might bother your breathing? (optional)</h3>
          <input name="context" value={draft.context} onChange={update} placeholder="Strong scents, chemicals, smoke, cold air, dust..." maxLength={200} />
        </label>

        <label className="check-in-input-group">
          <h3 className="section-header-text-small">Notes (optional)</h3>
          <textarea name="notes" value={draft.notes} onChange={update} rows="2" maxLength={500} />
        </label>
      </div>
    </FormModal>
  );
}

export default EventModal;

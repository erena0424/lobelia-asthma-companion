import FormModal from "../input/FormModal";
import { formatEventTime } from "../../helper-functions/dayPlan";
import "../pages/CalendarPage.css";

function CalendarModal({
  selectedDate,
  formData,
  error,
  saveMessage,
  saving,
  isFutureDate,
  googleEvents,
  dayPlanEvents = [],
  onClose,
  onSave,
  onChange,
  formatReadableDate,
  formatEventForSelectedDay,
}) {
  if (!selectedDate) {
    return null;
  }

  return (
    <FormModal
      title={`${formatReadableDate(selectedDate)}`}
      onHide={onClose}
      onSubmit={onSave}
      submitText={isFutureDate ? "Save Event" : "Save Check-in"}
      color="light"
      buttonError={error ? error : ""}
      buttonSuccess={saveMessage ? saveMessage : ""}
    >
      {/* The user's own plans for this day, with Lobelia's tip for each */}
      {dayPlanEvents.length > 0 && (
        <div className="card dark-theme mt-2 mb-3" style={{ gap: "16px" }}>
          <h3>Plans &amp; tips</h3>

          <ul>
            {dayPlanEvents.map((event) => (
              <li key={event.id}>
                <strong>{formatEventTime(event.start)} · {event.title}</strong>
                {event.tip && <div>{event.tip}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Google Calendar Events */}
      {googleEvents?.length > 0 && (
        <div className="card dark-theme mt-2 mb-3" style={{ gap: "16px" }}>
          <h3>Google Calendar Events</h3>

          <ul>
            {googleEvents.map((event) => (
              <li key={event.id}>
                <strong>{event.title}</strong>

                <br />

                <div>
                  {formatEventForSelectedDay(
                    event.start,
                    event.end,
                    selectedDate
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      <div
        className="vertical-16"
      >
        {/* Available for both past and future dates */}
        <label className="check-in-input-group">
          <h3 className="section-header-text-small">Calendar event</h3>

          <textarea
            name="calendar_event"
            value={formData.calendar_event}
            onChange={onChange}
            rows="1"
            placeholder="Outdoor run, work shift, travel..."
            style={{minHeight:"50px"}}
          />

          <small className="check-in-field-hint" style={{marginTop:0}}>
            Add what you have planned this day — we’ll use it in your advice.
          </small>
        </label>

        {/* Future-date explanation */}
        {isFutureDate && (
          <p className="check-in-field-hint">
            This date has not occurred yet. Symptoms, triggers,
            and notes can be recorded once the date has occurred.
          </p>
        )}

        {/* Only show health information for today/past */}
        {!isFutureDate && (
          <>
            <fieldset className="check-in-fieldset">
              <h3 className="section-header-text-small">Symptoms</h3>

              <label className="check-in-checkbox">
                <input
                  type="checkbox"
                  name="daily_day_symp"
                  checked={formData.daily_day_symp}
                  onChange={onChange}
                />

                <span>Daytime asthma symptoms</span>
              </label>

              <label className="check-in-checkbox">
                <input
                  type="checkbox"
                  name="daily_night_symp"
                  checked={formData.daily_night_symp}
                  onChange={onChange}
                />

                <span>Nighttime asthma symptoms</span>
              </label>

              <label className="check-in-checkbox">
                <input
                  type="checkbox"
                  name="daily_limit_activity"
                  checked={formData.daily_limit_activity}
                  onChange={onChange}
                />

                <span>Symptoms limited my activity</span>
              </label>
            </fieldset>

            <label className="check-in-input-group">
              <h3 className="section-header-text-small">Triggers</h3>

              <textarea
                name="triggers"
                value={formData.triggers}
                onChange={onChange}
                rows="1"
                placeholder="Pollen, exercise, smoke"
                style={{minHeight:"50px", marginBottom:0}}
              />

              <small className="check-in-field-hint" style={{marginTop:0}}>
                Separate multiple triggers with commas.
              </small>
            </label>

            <label className="check-in-input-group">
              <h3 className="section-header-text-small">Notes</h3>

              <textarea
                name="notes"
                value={formData.notes}
                onChange={onChange}
                rows="4"
                placeholder="Add anything you noticed about your symptoms."
                style={{minHeight:"50px"}}
              />
            </label>
          </>
        )}

      </div>
    </FormModal>
  );
}

export default CalendarModal;
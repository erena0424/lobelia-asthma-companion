import { Link } from "react-router";
import FormModal from "../input/FormModal";
import MoodFace from "../input/MoodFace";
import { formatEventTime } from "../../helper-functions/dayPlanDisplay";
import { BREATHING_SYMPTOMS, MOODS, userNoteFrom } from "../../helper-functions/checkInMapping";
import { LEVEL_LABELS, symptomLevel } from "../../helper-functions/insightsDisplay";
import { isAllDay } from "../../helper-functions/calendarGrid";
import { urls } from "../../constants";

// What someone logged on a day, beside that day's plans. The face shows here only,
// never on the calendar grid.
function DayLog({ dateKey, checkIn, events, onClose }) {
  const date = new Date(`${dateKey}T00:00`);
  const title = date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const mood = MOODS.find((option) => option.value === checkIn?.details?.mood);
  const level = symptomLevel(checkIn);
  const scores = checkIn?.details?.breathing || {};
  const note = userNoteFrom(checkIn?.notes);
  const puffs = Number(checkIn?.puffs_today || 0);
  const basics = [
    ["Symptoms during the day", checkIn?.daily_day_symp],
    ["Woke up at night", checkIn?.daily_night_symp],
    ["Asthma limited activities", checkIn?.daily_limit_activity],
  ];

  return (
    <FormModal title={title} onHide={onClose} onSubmit={onClose} showSubmit={false} color="light">
      <div className="day-log vertical-16">
        <div className="day-log-top">
          {mood ? (
            <span className="day-log-mood">
              <MoodFace level={mood.value} size={34} />
              Feeling <strong>{mood.label.toLowerCase()}</strong>
            </span>
          ) : (
            <span className="day-log-muted">No face picked</span>
          )}
          {level && (
            <span className="day-log-level">
              <i className={`cal-level-dot is-${level}`} aria-hidden="true" />
              {LEVEL_LABELS[level]}
            </span>
          )}
        </div>

        {checkIn?.symptoms_logged && (
          <dl className="day-log-basics">
            {basics.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className={value ? "is-yes" : ""}>{value ? "Yes" : "No"}</dd>
              </div>
            ))}
            <div>
              <dt>Rescue inhaler</dt>
              <dd className={puffs > 0 ? "is-yes" : ""}>{puffs > 0 ? `${puffs} ${puffs === 1 ? "puff" : "puffs"}` : "No"}</dd>
            </div>
          </dl>
        )}
        {!checkIn?.symptoms_logged && puffs > 0 && (
          <p className="m-0">Rescue inhaler: {puffs} {puffs === 1 ? "puff" : "puffs"} (no check-in yet)</p>
        )}

        {Object.keys(scores).length > 0 && (
          <div className="day-log-scores">
            {BREATHING_SYMPTOMS.filter(({ key }) => typeof scores[key] === "number").map(({ key, label }) => (
              <div className="day-log-score" key={key}>
                <span>{label}</span>
                <span className="day-log-track" aria-hidden="true"><i style={{ width: `${scores[key] * 10}%` }} /></span>
                <strong aria-label={`${scores[key]} out of 10`}>{scores[key]}</strong>
              </div>
            ))}
          </div>
        )}

        {checkIn?.triggers?.length > 0 && (
          <div>
            <p className="day-log-eyebrow">Possible triggers noted</p>
            <div className="check-in-chips">
              {checkIn.triggers.map((trigger) => <span key={trigger} className="day-log-chip">{trigger}</span>)}
            </div>
          </div>
        )}

        {note && <p className="day-log-note">{note}</p>}

        {events.length > 0 && (
          <div>
            <p className="day-log-eyebrow">Plans that day</p>
            <ul className="day-log-plans">
              {events.map((event) => (
                <li key={event.id || event.title}>
                  <span>{isAllDay(event) ? "All day" : formatEventTime(event.start)}</span>
                  {event.title}
                  {event.location ? ` · ${event.location}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Link className="btn button-dark btn-medium-text day-log-edit" to={`${urls.checkIn}?date=${dateKey}`}>
          {checkIn?.symptoms_logged ? "Edit this check-in" : "Log a check-in"}
        </Link>
      </div>
    </FormModal>
  );
}

export default DayLog;

import { useCallback, useEffect, useState } from "react";
import { Button } from "react-bootstrap";
import EventModal from "../calendar/EventModal";
import {
  environmentLine,
  formatEventTime,
  getDayPlan,
  nextEvent,
  saveDayEvents,
} from "../../helper-functions/dayPlan";
import { localYmd } from "../../helper-functions/forecastDisplayLogic";
import "./TodayPlan.css";

// Top of the Today page (Figma frame 01): next plan + tip, environment,
// trouble-breathing entry, check-in prompt, and the day's plans with tips.
function TodayPlan({ token, location }) {

  const [plan, setPlan] = useState(null);
  const [status, setStatus] = useState("loading");
  const [showEventModal, setShowEventModal] = useState(false);

  const today = localYmd();

  const loadPlan = useCallback(async () => {
    const data = await getDayPlan({ token, lat: location.lat, lon: location.lon, date: today });
    setPlan(data);
    setStatus("success");
  }, [token, location, today]);

  useEffect(() => {
    let cancelled = false;

    getDayPlan({ token, lat: location.lat, lon: location.lon, date: today })
      .then((data) => {
        if (cancelled) return;
        setPlan(data);
        setStatus("success");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [token, location, today]);

  async function addEvent(date, event) {
    // other days' plans are fetched so their existing events are kept
    const dayPlan =
      date === today ? plan : await getDayPlan({ token, lat: location.lat, lon: location.lon, date });
    const ownEvents = (dayPlan?.events || []).filter((existing) => existing.source !== "google_calendar");

    await saveDayEvents({ token, date, events: [...ownEvents, event] });

    if (date === today) {
      setStatus("loading");
      await loadPlan().catch(() => setStatus("error"));
    }
  }

  const events = plan?.events || [];
  const upcoming = nextEvent(events);
  const envLine = environmentLine(plan?.environment);

  return (
    <section className="today-card today-day vertical-16" aria-labelledby="today-day-title">
      <div className="today-plan-header">
        <h2 className="today-section-title" id="today-day-title">Your day</h2>
        {envLine && <p className="m-0 today-env">{envLine}</p>}
      </div>

      {status === "loading" && <p className="m-0">Looking at your day…</p>}
      {status === "error" && <p className="m-0">We couldn't load today's plan right now.</p>}

      {status === "success" && plan.summary && (
        <div className="today-summary">
          <p className="insight-label">Suggestion</p>
          <p className="m-0">{plan.summary}</p>
        </div>
      )}

      {status === "success" && events.length === 0 && (
        <p className="m-0">Add your plans with times to get a short tip before each one.</p>
      )}

      {events.length > 0 && (
        <ul className="today-events">
          {events.map((event) => {
            const isNext = upcoming && event.id === upcoming.id;
            return (
              <li key={event.id} className={`today-event ${isNext ? "is-next" : ""}`}>
                <span className="today-event-time">{formatEventTime(event.start)}</span>
                <div className="today-event-body">
                  <strong>
                    {event.title}
                    {isNext && <span className="today-next-tag">Next</span>}
                  </strong>
                  {event.tip && <span className="today-event-tip">{event.tip}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div>
        <Button className="button-secondary btn-medium-text" onClick={() => setShowEventModal(true)}>
          Add a plan
        </Button>
      </div>

      {status === "success" && plan.source === "rules" && (
        <p className="m-0 today-note">Tips are general right now because the AI tips are unavailable.</p>
      )}

      {showEventModal && (
        <EventModal date={today} onClose={() => setShowEventModal(false)} onSave={addEvent} />
      )}
    </section>
  );
}

export default TodayPlan;

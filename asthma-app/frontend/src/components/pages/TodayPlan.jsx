import { useCallback, useEffect, useState } from "react";
import { Button } from "react-bootstrap";
import { useNavigate } from "react-router";
import EventModal from "../calendar/EventModal";
import {
  environmentLine,
  formatEventTime,
  getDayPlan,
  nextEvent,
  saveDayEvents,
} from "../../helper-functions/dayPlan";
import { localYmd } from "../../helper-functions/forecastDisplayLogic";
import { urls } from "../../constants";
import "./TodayPlan.css";

// Top of the Today page (Figma frame 01): next plan + tip, environment,
// trouble-breathing entry, check-in prompt, and the day's plans with tips.
function TodayPlan({ token, location }) {
  const navigate = useNavigate();

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
    <div className="today-plan vertical-24">
      <section className="today-card today-next vertical-8">
        {status === "loading" && <p className="m-0">Looking at your day…</p>}
        {status === "error" && <p className="m-0">We couldn't load today's plan right now.</p>}
        {status === "success" && (
          <>
            <h2 className="m-0">
              {upcoming
                ? `Next: ${upcoming.title} · ${formatEventTime(upcoming.start)}`
                : "No more plans with a time today"}
            </h2>
            <p className="m-0">{upcoming ? upcoming.tip : plan.summary}</p>
            {envLine && <p className="m-0 today-env">{envLine}</p>}
          </>
        )}
      </section>

      <section className="today-help-row">
        <span>Having trouble breathing?</span>
        <Button className="button-alert btn-medium-text" onClick={() => navigate(urls.help)}>
          Get help
        </Button>
      </section>

      <section className="today-card vertical-8">
        <h2 className="m-0">How are you feeling?</h2>
        <p className="m-0">Do a quick mood and breathing check-in.</p>
        <div>
          <Button className="button-dark btn-medium-text" onClick={() => navigate(urls.checkIn)}>
            Start check-in
          </Button>
        </div>
      </section>

      <section className="today-card vertical-16">
        <div className="today-plan-header">
          <h2 className="m-0">Today's plan</h2>
        </div>

        {status === "success" && plan.summary && <p className="m-0 today-summary">{plan.summary}</p>}

        {status === "success" && events.length === 0 && (
          <p className="m-0">Add your plans with times to get a short tip before each one.</p>
        )}

        {events.length > 0 && (
          <ul className="today-events">
            {events.map((event) => (
              <li key={event.id} className="today-event">
                <span className="today-event-time">{formatEventTime(event.start)}</span>
                <div className="vertical-0">
                  <strong>{event.title}</strong>
                  {event.tip && <span className="today-event-tip">{event.tip}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div>
          <Button className="button-dark btn-medium-text" onClick={() => setShowEventModal(true)}>
            Add a plan
          </Button>
        </div>

        {status === "success" && plan.source === "rules" && (
          <p className="m-0 today-note">Tips are general right now because the AI tips are unavailable.</p>
        )}
      </section>

      {showEventModal && (
        <EventModal date={today} onClose={() => setShowEventModal(false)} onSave={addEvent} />
      )}
    </div>
  );
}

export default TodayPlan;

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { urls } from "../../constants";
import { loadDisplayForecast, localYmd } from "../../helper-functions/getForecast";
import { getCheckIns, logInhalerPuff } from "../../helper-functions/checkIns";
import { getDayPlan, saveDayEvents } from "../../helper-functions/dayPlan";
import { formatEventTime } from "../../helper-functions/dayPlanDisplay";
import {
  greetingFor,
  MOOD_LABELS,
  outlookHeadline,
  outlookImplication,
  temperatureReadout,
} from "../../helper-functions/outlookCopy";
import { addDays, minutesOf, parseYmd, ymd } from "../../helper-functions/calendarGrid";
import { FALLBACK_PLACE } from "../../helper-functions/location";
import MoodFace from "../input/MoodFace";
import EventModal from "../calendar/EventModal";
import "./HomePage.css";

// Today page, design direction v2 (approved mockup, option B).
// Outlook = general conditions; one visible recommendation; specific tips only on plans.


function LeafIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 19C5 11 10 5 19 5c0 9-6 14-14 14z" />
      <path d="M5 19 13 11" />
    </svg>
  );
}

function Sprig() {
  return (
    <svg className="today-sprig" viewBox="0 0 120 150" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M60 148 C58 118 62 92 56 64 C52 46 58 30 66 16" />
      <path d="M58 112 C44 108 34 98 30 86 C42 88 52 96 58 108" />
      <path d="M59 92 C72 88 82 78 86 66 C74 68 64 76 59 88" />
      <path d="M56 66 C46 60 40 50 40 40" />
      <g transform="translate(66 16)">
        <path d="M0 0 C-3 -6 -7 -8 -9 -6 C-8 -3 -4 -1 0 0Z" /><path d="M0 0 C3 -6 7 -8 9 -6 C8 -3 4 -1 0 0Z" />
        <path d="M0 0 C-8 2 -12 8 -10 12 C-6 11 -2 6 0 0Z" /><path d="M0 0 C-1 7 0 13 3 15 C5 11 3 5 0 0Z" />
        <path d="M0 0 C7 3 12 9 11 13 C7 12 3 6 0 0Z" />
      </g>
      <g transform="translate(40 40) scale(.8)">
        <path d="M0 0 C-3 -6 -7 -8 -9 -6 C-8 -3 -4 -1 0 0Z" /><path d="M0 0 C3 -6 7 -8 9 -6 C8 -3 4 -1 0 0Z" />
        <path d="M0 0 C-8 2 -12 8 -10 12 C-6 11 -2 6 0 0Z" /><path d="M0 0 C-1 7 0 13 3 15 C5 11 3 5 0 0Z" />
        <path d="M0 0 C7 3 12 9 11 13 C7 12 3 6 0 0Z" />
      </g>
    </svg>
  );
}

// Plan steps from the user's own action plan (or what a plan usually covers), folded to the first step.
function PlanSteps({ plan, symptoms }) {
  if (!plan?.steps?.length && plan?.source !== "plan") return null;
  const [first, ...rest] = plan.steps || [];
  return (
    <details className="today-planrow" open={plan.open}>
      <summary>
        <span className="today-planrow-head">{plan.heading}</span>
        {first && <span className="today-planrow-first">{first}</span>}
        {rest.length > 0 && <span className="today-planrow-more">+{rest.length} more</span>}
      </summary>
      {symptoms?.lead && <p className="today-planrow-lead">{symptoms.lead}</p>}
      {plan.steps.length > 0 && (
        <ul>
          {plan.steps.map((step, index) => <li key={index}>{step}</li>)}
        </ul>
      )}
      <p className="today-source">
        {plan.source === "plan" ? (
          <>{plan.note} · <Link to={urls.profile}>View full plan</Link></>
        ) : (
          <>Have a plan from your clinician? <Link to={urls.profile}>Add it</Link> to see your own steps here.</>
        )}
      </p>
    </details>
  );
}

function BreathingHelpLink() {
  return (
    <p className="today-source today-help-link">
      Trouble breathing right now? <Link to={urls.help}>Open Breathing help</Link>
    </p>
  );
}

// Moved to the top on a Strong score, limited activity or 2 symptom days in a row (from the backend)
function BreathingHelpTop({ lead }) {
  return (
    <div className="today-help-top">
      <p>{lead || "Trouble breathing right now?"}</p>
      <Link className="today-btn today-btn-small" to={urls.help}>Open Breathing help</Link>
    </div>
  );
}

function footerText(today) {
  const dates = today?.symptoms?.dates || [];
  if (!dates.length) return "Based on today's conditions and your calendar. Not medical advice or a diagnosis.";
  const label = (value) => parseYmd(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const range = dates.length === 1 ? label(dates[0]) : `${label(dates[0])} to ${label(dates[dates.length - 1])}`;
  return `Based on today's conditions and what you logged ${range}. Not medical advice or a diagnosis. Your action plan and clinician come first.`;
}

function Outlook({ status, dayPlan, environment, locationPermission, onCheckIn }) {
  const today = dayPlan?.today;
  const state = today?.symptoms?.state;
  const helpTop = status === "success" && today?.help?.top;
  const flagged = new Set((today?.flags || []).map((flag) => flag.key));
  const temperature = temperatureReadout(environment);

  const readouts = [
    environment?.pollen && ["Pollen", environment.pollen, flagged.has("pollen")],
    environment?.aqi_label && ["Air quality", environment.aqi_label, flagged.has("air_quality")],
    environment?.humidity_pct != null && ["Humidity", `${environment.humidity_pct}%`, false],
    temperature && ["Temperature", temperature, flagged.has("cold") || flagged.has("temperature_swing")],
  ].filter(Boolean);
  const implication = outlookImplication(environment, today?.flags);

  return (
    <section className="today-outlook" aria-labelledby="today-outlook-label">
      <Sprig />
      <div className="today-outlook-head">
        <span className="today-eyebrow" id="today-outlook-label">Today</span>
      </div>

      <p className="today-outlook-text">{outlookHeadline(environment, today?.flags)}</p>
      {implication && <p className="today-outlook-sub">{implication}</p>}

      {readouts.length > 0 && (
        <ul className="today-readouts">
          {readouts.map(([label, value, flag]) => (
            <li key={label} className={flag ? "is-flagged" : ""}><span>{label}</span><b>{value}</b></li>
          ))}
        </ul>
      )}

      <div className="today-focus">
        <LeafIcon />
        <div className="today-focus-body">
          <h3>Today's focus</h3>
          {status === "loading" && <p>Looking at today's conditions and what you logged…</p>}
          {status === "error" && <p>We couldn't load today's focus right now.</p>}
          {helpTop && <BreathingHelpTop lead={today.help.lead} />}

          {status === "success" && state === "escalate" && (
            <div className="today-escalate">
              <p className="today-escalate-lead">{today.symptoms.lead}</p>
              <p className="today-escalate-line">{today.symptoms.escalation}</p>
              <PlanSteps plan={{ ...today.plan, open: true }} />
            </div>
          )}

          {status === "success" && state !== "escalate" && (
            <>
              {dayPlan?.summary && <p className="today-tip-lead">{dayPlan.summary}</p>}
              {today?.because && <p className="today-because">{today.because}</p>}
              {state === "none" && (
                <>
                  <p className="today-plan-ref">Check in to see what you've logged here, next to your action plan.</p>
                  <button type="button" className="today-btn today-btn-small" onClick={onCheckIn}>Check in for today</button>
                </>
              )}
              {(state === "green" || state === "yellow") && <PlanSteps plan={today.plan} symptoms={today.symptoms} />}
            </>
          )}
          {!helpTop && <BreathingHelpLink />}
        </div>
      </div>

      {locationPermission !== "granted" && locationPermission !== "checking" && (
        <p className="today-note">Showing conditions for {FALLBACK_PLACE}. Allow location access to see conditions where you are.</p>
      )}
      {status === "success" && <p className="today-note">{footerText(today)}</p>}
    </section>
  );
}

function planState(event, now) {
  const start = minutesOf(event.start);
  if (start === null) return "all-day";
  const end = minutesOf(event.end) ?? start + 60;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return end <= nowMinutes ? "done" : "upcoming";
}

function YourDay({ token, location, onPlansChanged }) {
  const [plan, setPlan] = useState(null);
  const [status, setStatus] = useState("loading");
  const [showEventModal, setShowEventModal] = useState(false);
  const today = localYmd();

  const load = useCallback(
    () =>
      getDayPlan({ token, lat: location.lat, lon: location.lon, date: today }).then((data) => {
        setPlan(data);
        setStatus("success");
        onPlansChanged(data);
      }),
    [token, location, today, onPlansChanged]
  );

  useEffect(() => {
    load().catch(() => {
      setStatus("error");
      onPlansChanged(null, "error");
    });
  }, [load, onPlansChanged]);

  async function addEvent(date, event) {
    const dayPlan = date === today ? plan : await getDayPlan({ token, lat: location.lat, lon: location.lon, date });
    const ownEvents = (dayPlan?.events || []).filter((existing) => existing.source !== "google_calendar");
    await saveDayEvents({ token, date, events: [...ownEvents, event] });
    if (date === today) await load().catch(() => setStatus("error"));
  }

  const now = new Date();
  const events = plan?.events || [];
  const nextId = events.find((event) => planState(event, now) === "upcoming")?.id;

  return (
    <section className="today-day" aria-labelledby="today-day-title">
      <div className="today-day-head">
        <h2 className="today-section-title" id="today-day-title">Your day</h2>
        {events.length > 0 && <span className="today-eyebrow">{events.length} {events.length === 1 ? "plan" : "plans"}</span>}
      </div>

      {status === "loading" && <p className="today-muted">Looking at your day…</p>}
      {status === "error" && <p className="today-muted">We couldn't load today's plans right now.</p>}
      {status === "success" && events.length === 0 && (
        <p className="today-muted">Add your plans with times to get a short tip before each one.</p>
      )}

      {events.length > 0 && (
        <ol className="today-plans">
          {events.map((event) => {
            const state = planState(event, now);
            const isNext = event.id === nextId;
            const details = [event.location, event.environment].filter(Boolean).join(" · ");
            return (
              <li key={event.id} className={`today-plan ${state === "done" ? "is-done" : ""} ${isNext ? "is-next" : ""}`}>
                <div className="today-time">{formatEventTime(event.start)}</div>
                <div className="today-plan-body">
                  <div className="today-plan-title">
                    {event.title}
                    {details && <span className="today-plan-place">{details}</span>}
                    {isNext && <span className="today-tag">Up next</span>}
                  </div>
                  {event.tip && (
                    <p className="today-tip"><LeafIcon /><span>{event.tip}</span></p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="today-add-row">
        <button type="button" className="today-link" onClick={() => setShowEventModal(true)}>Add a plan</button>
      </div>

      {status === "success" && plan?.source === "rules" && (
        <p className="today-note">Tips are general right now because the AI tips are unavailable.</p>
      )}

      {showEventModal && <EventModal date={today} onClose={() => setShowEventModal(false)} onSave={addEvent} />}
    </section>
  );
}

function CheckInCard({ todayCheckIn, onStart }) {
  const checkedIn = Boolean(todayCheckIn?.symptoms_logged);
  const mood = todayCheckIn?.details?.mood;

  return (
    <section className="today-card today-checkin" aria-labelledby="today-checkin-title">
      <h3 id="today-checkin-title">How are you feeling?</h3>
      <p className="today-sub">
        {checkedIn
          ? `You've checked in today${mood ? ` · ${MOOD_LABELS[mood]}` : ""}. Update it anytime.`
          : "Your daily check-in takes about a minute."}
      </p>
      <div className="today-faces" role="group" aria-label="Pick a face to start your check-in">
        {[1, 2, 3, 4, 5].map((level) => (
          <button key={level} type="button" className="today-face" aria-label={MOOD_LABELS[level]} onClick={() => onStart(level)}>
            <MoodFace level={level} selected={mood === level} size={38} />
          </button>
        ))}
      </div>
      <button type="button" className="today-btn" onClick={() => onStart(null)}>
        {checkedIn ? "Update check-in" : "Start check-in"}
      </button>
    </section>
  );
}

function InhalerCard({ token, week, onLogged }) {
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState("");
  const today = localYmd();
  const todayPuffs = week.find((item) => item.date === today)?.puffs_today || 0;
  const lastUse = [...week]
    .filter((item) => item.puffs_today > 0 && item.date !== today)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];

  let summary = "No uses logged this week";
  if (todayPuffs > 0) summary = `Today · ${todayPuffs} ${todayPuffs === 1 ? "puff" : "puffs"}`;
  else if (lastUse) {
    const day = parseYmd(lastUse.date).toLocaleDateString("en-US", { weekday: "long" });
    summary = `Last used ${day} · ${lastUse.puffs_today} ${lastUse.puffs_today === 1 ? "puff" : "puffs"}`;
  }

  async function logUse() {
    if (logging) return;
    setLogging(true);
    setError("");
    try {
      const data = await logInhalerPuff({ token });
      onLogged(data.puffs_today);
    } catch (logError) {
      setError(logError.message || "Unable to log rescue inhaler use.");
    } finally {
      setLogging(false);
    }
  }

  return (
    <section className="today-card" aria-labelledby="today-inhaler-title">
      <div className="today-inhaler">
        <div>
          <h3 id="today-inhaler-title">Rescue inhaler</h3>
          <p className="today-sub" aria-live="polite">{summary}</p>
        </div>
        <button type="button" className="today-btn-ghost" onClick={logUse} disabled={logging}>
          {logging ? "Logging…" : "Log a use"}
        </button>
      </div>
      {error && <p className="today-error">{error}</p>}
    </section>
  );
}

// "How you've felt this week": the face picked at each check-in (never the forecast).
function WeekStrip({ week }) {
  const todayKey = localYmd();
  const days = Array.from({ length: 7 }, (_, index) => addDays(new Date(), index - 6));
  const byDate = Object.fromEntries(week.map((item) => [item.date, item]));

  return (
    <section className="today-week" aria-labelledby="today-week-title">
      <div className="today-week-head">
        <span className="today-eyebrow" id="today-week-title">How you've felt this week</span>
        <Link className="today-week-link" to={urls.statistics}>Insights</Link>
      </div>
      <div className="today-days">
        {days.map((day) => {
          const key = ymd(day);
          const entry = byDate[key];
          const checkedIn = Boolean(entry?.symptoms_logged);
          const mood = entry?.details?.mood;
          const isToday = key === todayKey;
          const label = checkedIn ? (mood ? MOOD_LABELS[mood] : "Checked in") : isToday ? "Not checked in yet" : "No check-in";
          return (
            <div key={key} className={isToday ? "is-today" : ""}>
              {checkedIn && mood ? (
                <span className="today-mini" role="img" aria-label={label}><MoodFace level={mood} size={22} /></span>
              ) : (
                <span className={`today-mini ${checkedIn ? "checked" : "empty"}`} role="img" aria-label={label} />
              )}
              <span>{isToday ? "Today" : day.toLocaleDateString("en-US", { weekday: "short" })}</span>
            </div>
          );
        })}
      </div>
      <p className="today-week-note">From your daily check-ins. An empty circle means you didn't check in that day.</p>
    </section>
  );
}

function HomePage() {
  const { token, user } = useAuth();
  const { location, locationPermission } = useOutletContext();
  const navigate = useNavigate();

  const [dayPlan, setDayPlan] = useState(null);
  const [planStatus, setPlanStatus] = useState("loading");
  const [week, setWeek] = useState([]);

  // The retired forecast still runs in the background so its predictions can be compared
  // with what people log later (prediction roadmap, Gate 1). Nothing from it is shown.
  useEffect(() => {
    if (token && location) loadDisplayForecast({ lat: location.lat, lon: location.lon, token }).catch(() => {});
  }, [token, location]);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    getCheckIns({ from: ymd(addDays(new Date(), -6)), to: localYmd(), token })
      .then((data) => {
        if (!cancelled) setWeek(data?.items || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onPlansChanged = useCallback((data, nextStatus = "success") => {
    if (data) setDayPlan(data);
    setPlanStatus(nextStatus);
  }, []);

  const todayCheckIn = week.find((item) => item.date === localYmd());
  const now = new Date();
  const firstName = String(user?.name || "").trim().split(/\s+/)[0];

  function startCheckIn(mood) {
    navigate(mood ? `${urls.checkIn}?mood=${mood}` : urls.checkIn);
  }

  function puffLogged(total) {
    const today = localYmd();
    setWeek((current) => {
      const others = current.filter((item) => item.date !== today);
      return [...others, { ...(todayCheckIn || { date: today }), puffs_today: total }];
    });
  }

  return (
    <div className="today">
      <header className="today-hello">
        <div className="today-eyebrow">{now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
        <h1 className="today-greeting">
          {greetingFor(now)}{firstName ? <>, <em>{firstName}</em></> : ""}
        </h1>
      </header>

      <div className="today-grid">
        <div className="today-main">
          <Outlook
            status={planStatus}
            dayPlan={dayPlan}
            environment={dayPlan?.environment || null}
            locationPermission={locationPermission}
            onCheckIn={() => navigate(urls.checkIn)}
          />
          {token && location && <YourDay token={token} location={location} onPlansChanged={onPlansChanged} />}
        </div>

        <aside className="today-side" aria-label="Check-in and inhaler">
          <CheckInCard todayCheckIn={todayCheckIn} onStart={startCheckIn} />
          {token && <InhalerCard token={token} week={week} onLogged={puffLogged} />}
          <WeekStrip week={week} />
        </aside>
      </div>
    </div>
  );
}

export default HomePage;

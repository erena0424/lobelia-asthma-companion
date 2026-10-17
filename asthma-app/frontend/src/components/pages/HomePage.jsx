import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { urls } from "../../constants";
import { RISK_EXPLAINER, riskLabel } from "../../helper-functions/riskDisplay";
import {
  forecastHasAdvice,
  homeForecastDayLabel,
  loadDisplayForecast,
  localYmd,
} from "../../helper-functions/getForecast";
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

// --- next-step-logic:start ---
// Pure Next Step copy logic (LBL-002). Kept JSX-free and bounded by these
// markers so HomePage.nextStep.test.js can exercise the real source text
// directly, since plain Node can't load a file containing JSX. Do not add
// JSX between these markers.
//
// Three-way check (see prps/LBL-002_prp.md §2/§3):
//   (a) non-empty summary -> use it verbatim
//   (b) empty summary but forecastHasAdvice() is true (sections have body
//       text) -> accurate "no summary, guidance is below" copy — never the
//       check-in-required wording, since this only renders in the
//       post-check-in success branch
//   (c) forecastHasAdvice() is false -> a distinct "no guidance yet" copy,
//       still never the check-in nag
function computeNextStepText(forecast) {
  const summary = String(forecast?.advice?.summary || "").trim();

  if (summary) {
    return summary;
  }

  if (forecastHasAdvice(forecast)) {
    return "No summary today — see today's guidance below.";
  }

  return "No guidance is available for today's forecast yet.";
}
// --- next-step-logic:end ---

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

const LEVEL_STEPS = { Low: 1, Medium: 2, High: 3 };

function Outlook({ status, forecast, errorMessage, environment, hasActionPlan, locationPermission, onCheckIn }) {
  const level = status === "success" ? riskLabel(forecast?.risk_level) : null;
  const dayLabel = forecast && homeForecastDayLabel(forecast) === "TOMORROW" ? "Tomorrow's outlook" : "Today's outlook";
  const temperature = temperatureReadout(environment);
  const factors = forecast?.contributing_factors || [];
  const sections = (forecast?.advice?.sections || []).filter((section) => String(section?.body || "").trim());

  const readouts = [
    environment?.pollen && ["Pollen", environment.pollen],
    environment?.aqi_label && ["Air quality", environment.aqi_label],
    temperature && ["Temperature", temperature],
  ].filter(Boolean);
  const implication = outlookImplication(environment);

  return (
    <section className="today-outlook" aria-labelledby="today-outlook-label">
      <Sprig />
      <div className="today-outlook-head">
        <span className="today-eyebrow" id="today-outlook-label">{dayLabel}</span>
        {level && (
          <>
            <span className={`today-level level-${level.toLowerCase()}`}><i />{level}</span>
            <span className={`today-scale level-${level.toLowerCase()}`} aria-hidden="true">
              {[1, 2, 3].map((step) => <span key={step} className={step <= LEVEL_STEPS[level] ? "on" : ""} />)}
            </span>
          </>
        )}
      </div>

      <p className="today-outlook-text">{outlookHeadline(environment)}</p>
      {implication && <p className="today-outlook-sub">{implication}</p>}

      {readouts.length > 0 && (
        <ul className="today-readouts">
          {readouts.map(([label, value]) => (
            <li key={label}><span>{label}</span><b>{value}</b></li>
          ))}
        </ul>
      )}

      <div className="today-focus">
        <LeafIcon />
        <div>
          <h3>Today's focus</h3>
          {status === "loading" && <p>Looking at today's conditions and your recent check-ins…</p>}
          {status === "success" && <p>{computeNextStepText(forecast)}</p>}
          {status === "check-in-required" && (
            <>
              <p>{errorMessage} It takes about a minute.</p>
              <button type="button" className="today-btn today-btn-small" onClick={onCheckIn}>Check in for yesterday</button>
            </>
          )}
          {status === "error" && <p>{errorMessage || "We couldn't load your outlook right now."}</p>}
          {/* Medication steps only ever point to the user's own saved plan; Lobelia never sets a schedule. */}
          {status !== "loading" && (hasActionPlan ? (
            <p className="today-plan-ref">
              Follow the daily steps in your saved action plan.
              <span className="today-source">From your saved action plan · <Link to={urls.profile}>View plan</Link></span>
            </p>
          ) : (
            <p className="today-plan-ref">
              Keep your rescue inhaler with you. No action plan saved yet;{" "}
              <Link to={urls.profile}>add the one from your clinician</Link>.
            </p>
          ))}
        </div>
      </div>

      {status === "success" && (factors.length > 0 || sections.length > 0) && (
        <details className="today-more">
          <summary>Why, and more ways to prepare</summary>
          <ul>
            {factors.map((factor, index) => <li key={`f-${index}`}>{factor}</li>)}
            {sections.map((section, index) => <li key={`s-${index}`}>{section.body}</li>)}
          </ul>
        </details>
      )}

      {locationPermission !== "granted" && locationPermission !== "checking" && (
        <p className="today-note">Showing conditions for {FALLBACK_PLACE}. Allow location access to see conditions where you are.</p>
      )}
      <p className="today-note">{RISK_EXPLAINER}</p>
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
    load().catch(() => setStatus("error"));
  }, [load]);

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

  const [forecast, setForecast] = useState(null);
  const [status, setStatus] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [environment, setEnvironment] = useState(null);
  const [week, setWeek] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function loadForecast() {
      try {
        setStatus("loading");
        setErrorMessage("");
        const data = await loadDisplayForecast({ lat: location.lat, lon: location.lon, token });
        if (!cancelled) {
          setForecast(data);
          setStatus("success");
        }
      } catch (error) {
        if (cancelled) return;
        if (error.code === "CHECK_IN_REQUIRED" || error.code === "FORECAST_NOT_FOUND") {
          setStatus("check-in-required");
          setErrorMessage("Yesterday's check-in helps create today's outlook.");
        } else {
          setStatus("error");
          setErrorMessage(error.message || "Unable to load your outlook.");
        }
      }
    }

    if (token && location) loadForecast();
    return () => {
      cancelled = true;
    };
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

  const onPlansChanged = useCallback((dayPlan) => setEnvironment(dayPlan?.environment || null), []);

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
            status={status}
            forecast={forecast}
            errorMessage={errorMessage}
            environment={environment}
            hasActionPlan={Boolean(user?.action_plan && Object.values(user.action_plan).some(Boolean))}
            locationPermission={locationPermission}
            onCheckIn={() => navigate(`${urls.checkIn}?day=yesterday`)}
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

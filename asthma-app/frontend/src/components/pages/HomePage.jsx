import { useEffect, useState } from "react";
import { Button } from "react-bootstrap";
import { useNavigate, useOutletContext } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { urls } from "../../constants";
import TodayPlan from "./TodayPlan";
import { RISK_EXPLAINER, riskLabel } from "../../helper-functions/riskDisplay";
import {
  forecastHasAdvice,
  homeForecastDayLabel,
  loadDisplayForecast,
  localYmd,
} from "../../helper-functions/getForecast";
import { getCheckIns, logInhalerPuff } from "../../helper-functions/checkIns";
import "./HomePage.css";

// Today page (docs/design/redesign-plan.md §4): outlook, your day, check-in & inhaler.

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

// One plain-language line per level. Wording needs regulatory-claims review.
const LEVEL_MEANING = {
  Low: "Conditions look calmer for your breathing today.",
  Medium: "A few things today may bother your breathing.",
  High: "Today may be harder on your breathing. Keep your action plan close.",
};

function OutlookCard({ status, forecast, errorMessage, locationPermission, onCheckIn }) {
  if (status === "loading") {
    return (
      <section className="today-outlook" aria-busy="true">
        <p className="today-outlook-kicker">Today's outlook</p>
        <p className="m-0">Looking at today's conditions and your recent check-ins…</p>
      </section>
    );
  }

  if (status === "check-in-required") {
    return (
      <section className="today-outlook">
        <p className="today-outlook-kicker">Today's outlook</p>
        <h2 className="today-outlook-title">No outlook yet</h2>
        <p className="m-0">{errorMessage} It takes about a minute.</p>
        <div>
          <Button className="button-light btn-medium-text" onClick={onCheckIn}>
            Check in for yesterday
          </Button>
        </div>
      </section>
    );
  }

  if (status === "error" || !forecast) {
    return (
      <section className="today-outlook">
        <p className="today-outlook-kicker">Today's outlook</p>
        <h2 className="today-outlook-title">Outlook unavailable</h2>
        <p className="m-0">{errorMessage || "We couldn't load your outlook right now."}</p>
      </section>
    );
  }

  const level = riskLabel(forecast.risk_level);
  const day = homeForecastDayLabel(forecast) === "TOMORROW" ? "Tomorrow's" : "Today's";
  const factors = forecast.contributing_factors || [];
  const sections = (forecast.advice?.sections || []).filter((section) => String(section?.body || "").trim());

  return (
    <section className="today-outlook" aria-labelledby="today-outlook-title">
      <div className="today-outlook-head">
        <p className="today-outlook-kicker">{day} outlook</p>
        {level && <span className={`status-badge status-${level.toLowerCase()}`}>{level}</span>}
      </div>
      <h2 className="today-outlook-title" id="today-outlook-title">
        {level ? LEVEL_MEANING[level] : "Here's your outlook."}
      </h2>

      {factors.length > 0 && (
        <div className="today-factors" aria-label="Main factors">
          {factors.map((factor, index) => (
            <span key={`${factor}-${index}`}>{factor}</span>
          ))}
        </div>
      )}

      <div className="today-guidance">
        <p className="insight-label">Suggestion</p>
        <p className="m-0">{computeNextStepText(forecast)}</p>
        {sections.length > 0 && (
          <ul>
            {sections.map((section, index) => (
              <li key={index}>{section.body}</li>
            ))}
          </ul>
        )}
      </div>

      {locationPermission !== "granted" && (
        <p className="today-outlook-note">
          Allow location access for outlooks based on the conditions where you are.
        </p>
      )}
      <p className="today-outlook-note">{RISK_EXPLAINER}</p>
    </section>
  );
}

function CheckInCard({ token, onCheckIn }) {
  const [today, setToday] = useState(null);
  const [logging, setLogging] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const date = localYmd();

    getCheckIns({ from: date, to: date, token })
      .then((data) => {
        if (!cancelled) setToday((data?.items || []).find((item) => item.date === date) || {});
      })
      .catch(() => {
        if (!cancelled) setToday({});
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function logPuff() {
    if (logging) return;
    setLogging(true);
    setMessage("");
    setError("");

    try {
      const data = await logInhalerPuff({ token });
      setToday((current) => ({ ...current, puffs_today: data.puffs_today }));
      setMessage("Logged.");
    } catch (puffError) {
      setError(puffError.message || "Unable to log rescue inhaler use.");
    } finally {
      setLogging(false);
    }
  }

  const checkedIn = Boolean(today?.symptoms_logged);
  const puffs = today?.puffs_today || 0;

  return (
    <section className="today-card today-checkin vertical-16" aria-label="Check-in and inhaler">
      <div className="vertical-8">
        <h2 className="today-section-title">How are you feeling?</h2>
        <p className="m-0">
          {checkedIn ? "You've checked in today. You can update it anytime." : "A quick mood and breathing check-in."}
        </p>
        <div>
          <Button className="button-dark btn-medium-text" onClick={onCheckIn}>
            {checkedIn ? "Update check-in" : "Start check-in"}
          </Button>
        </div>
      </div>

      <hr className="today-divider" />

      <div className="vertical-8">
        <h2 className="today-section-title">Rescue inhaler</h2>
        <p className="m-0" aria-live="polite">
          {today === null ? "…" : `Today: ${puffs} ${puffs === 1 ? "puff" : "puffs"}.`} {message}
        </p>
        {error && <p className="m-0 today-error">{error}</p>}
        <div>
          <Button className="button-secondary btn-medium-text" onClick={logPuff} disabled={logging}>
            {logging ? "Logging…" : "I used my rescue inhaler"}
          </Button>
        </div>
      </div>
    </section>
  );
}

function HomePage() {
  const { token } = useAuth();
  const { location, locationPermission } = useOutletContext();
  const navigate = useNavigate();

  const [forecast, setForecast] = useState(null);
  const [status, setStatus] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");

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

    if (token && location) {
      loadForecast();
    }

    return () => {
      cancelled = true;
    };
  }, [token, location]);

  return (
    <main className="today-grid">
      <div className="today-main vertical-24">
        <OutlookCard
          status={status}
          forecast={forecast}
          errorMessage={errorMessage}
          locationPermission={locationPermission}
          onCheckIn={() => navigate(`${urls.checkIn}?day=yesterday`)}
        />
        {token && location && <TodayPlan token={token} location={location} />}
      </div>

      <aside className="today-side vertical-24">
        {token && <CheckInCard token={token} onCheckIn={() => navigate(urls.checkIn)} />}
      </aside>
    </main>
  );
}

export default HomePage;

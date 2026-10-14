import { useEffect, useMemo, useState } from "react";
import { Button } from "react-bootstrap";
import { useNavigate, useOutletContext } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { urls } from "../../constants";
import {
  homeRiskHeading,
  loadDisplayForecast,
} from "../../helper-functions/getForecast";
import { logInhalerPuff } from "../../helper-functions/checkIns";

function formatName(user) {
  return (
    user?.first_name ||
    user?.name ||
    user?.given_name ||
    user?.email?.split("@")[0] ||
    "Name"
  );
}

function HomePage() {
  const { token, user } = useAuth();

  const [forecast, setForecast] = useState(null);
  const [status, setStatus] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const [loggingPuff, setLoggingPuff] = useState(false);
  const [puffMessage, setPuffMessage] = useState("");
  const [puffError, setPuffError] = useState("");

  const { location, locationPermission } = useOutletContext();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function loadForecast() {
      try {
        setStatus("loading");
        setErrorMessage("");

        const data = await loadDisplayForecast({
          lat: location.lat,
          lon: location.lon,
          token,
        });

        if (!cancelled) {
          setForecast(data);
          setStatus("success");
        }
      } catch (error) {
        if (cancelled) return;

        if (
          error.code === "CHECK_IN_REQUIRED" ||
          error.code === "FORECAST_NOT_FOUND"
        ) {
          setStatus("check-in-required");
          setErrorMessage(
            "Complete yesterday’s check-in before generating your risk forecast."
          );
        } else {
          setStatus("error");
          setErrorMessage(
            error.message || "Unable to load your forecast."
          );
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

  async function handleRescueInhalerClick() {
    if (!token || loggingPuff) return;

    try {
      setLoggingPuff(true);
      setPuffMessage("");
      setPuffError("");

      const data = await logInhalerPuff({
        token,
      });

      setPuffMessage(
        `Logged. Today's total: ${data.puffs_today} ${
          data.puffs_today === 1 ? "puff" : "puffs"
        }.`
      );
    } catch (error) {
      setPuffError(
        error.message || "Unable to log rescue inhaler use."
      );
    } finally {
      setLoggingPuff(false);
    }
  }

  const riskPercentage = useMemo(() => {
    const probability = Number(forecast?.flare_probability);

    if (Number.isNaN(probability)) {
      return 0;
    }

    return Math.round(probability * 100);
  }, [forecast]);

  const riskLevel = forecast?.risk_level || "Low";

  const riskClass = riskLevel.toLowerCase();

  const predictedTriggers =
    forecast?.contributing_factors?.length > 0
      ? forecast.contributing_factors
      : ["No major triggers identified"];

  const preventativeMeasures =
    forecast?.advice?.sections?.length > 0
      ? forecast.advice.sections.map((section) => section.body)
      : [
          "Plan today’s activities around your risk and air quality, and keep your rescue inhaler with you.",
        ];

  const nextStep =
    forecast?.advice?.summary ||
    "Complete yesterday’s check-in to receive a personalized recommendation.";

  return (
    <main>

      {status === "loading" && (
        <section className="home-state-card">
          <h2>Loading your forecast...</h2>
          <br />
          <p className="paragraph">
            We are combining your check-in and environmental data.
          </p>
        </section>
      )}

      {status === "check-in-required" && (
        <section className="home-state-card">
          <h2>Check-in required</h2>
          <br />
          <p className="paragraph">{errorMessage}</p>
          <p className="paragraph">
            Check-ins live in the Calendar: tap yesterday's date to log how your asthma was.
          </p>
          <br />
          <Button
            className="button-dark btn-large-text"
            onClick={() => navigate(urls.calendar)}
          >
            Do a check-in
          </Button>
        </section>
      )}

      {status === "error" && (
        <section className="home-state-card home-state-error">
          <h2>Forecast unavailable</h2>
          <br />
          <p className="paragraph">{errorMessage}</p>
        </section>
      )}

      {status === "success" && forecast && (
        <div className="vertical-40">
          <section className="home-risk-section">
            <div className={`risk-summary risk-${riskClass}`}>
              <h2>
                {homeRiskHeading(forecast, riskLevel)}
              </h2>

              <div className="risk-circle">
                <span>{riskPercentage}%</span>
              </div>
            </div>

            <div className="home-next-step-column">
              <article className="home-card next-step-card">
                <h2>Next Step</h2>

                <hr />

                <p>{nextStep}</p>
                {
                  locationPermission !== "granted" ?
                    <p className="error-text-dark note">Allow location access to receive more accurate feedback based on your local environmental conditions. This will help us find potential environmental triggers near you.</p>
                  : ""
                }
              </article>

              <div className="vertical-8 at-middle-center">
                <Button
                  className="button-error-dark btn-large-text"
                  onClick={handleRescueInhalerClick}
                  disabled={loggingPuff}
                >
                  {loggingPuff
                    ? "Logging..."
                    : "I used my rescue inhaler."}
                </Button>

                {puffMessage && (
                  <p className="inhaler-log-success">
                    {puffMessage}
                  </p>
                )}

                {puffError && (
                  <p className="inhaler-log-error">
                    {puffError}
                  </p>
                )}
              </div>
            </div>
          </section>

          <hr style={{margin: 0}}/>

          <ForecastCard
            title="Predicted Triggers"
            items={predictedTriggers}
          />

          <ForecastCard
            title="Suggested Preventative Measures"
            items={preventativeMeasures}
          />

          {forecast.advice?.disclaimer && (
            <p className="home-disclaimer">
              {forecast.advice.disclaimer}
            </p>
          )}
        </div>
      )}
    </main>
  );
}

function ForecastCard({ title, items }) {
  return (
    <article className="home-card forecast-card">
      <h2>{title}</h2>

      <hr />

      <div className="vertical-16 at-middle-center">
        <div className="forecast-tags">
          {items.map((item, index) => (
            <span
              className="forecast-tag"
              key={`${item}-${index}`}
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

export default HomePage;

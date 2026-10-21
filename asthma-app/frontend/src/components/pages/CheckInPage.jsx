import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { askCompanion } from "../../helper-functions/askCompanion";
import { localYmd, yesterdayYmd } from "../../helper-functions/forecastDisplayLogic";
import { urls } from "../../constants";
import DayCheckInForm from "../input/DayCheckInForm";
import "./CheckInPage.css";

const FALLBACK_REPLY =
  "Thanks for checking in. Every check-in helps Lobelia understand your days a little better.";

function CheckInPage() {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();

  // ?date=YYYY-MM-DD (today or earlier, e.g. from the Calendar) or ?day=yesterday
  const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.get("date") || "") ? searchParams.get("date") : null;
  const otherDate =
    requestedDate && requestedDate < localYmd() && requestedDate !== yesterdayYmd() ? requestedDate : null;

  const [day, setDay] = useState(() => {
    if (otherDate) return "other";
    if (searchParams.get("day") === "yesterday" || requestedDate === yesterdayYmd()) return "yesterday";
    return "today";
  });
  const date = day === "other" ? otherDate : day === "yesterday" ? yesterdayYmd() : localYmd();

  // a face picked on Today arrives as ?mood=1..5
  const [initialMood] = useState(() => {
    const mood = Number(searchParams.get("mood"));
    return mood >= 1 && mood <= 5 ? mood : null;
  });
  const [status, setStatus] = useState("editing");
  const [reply, setReply] = useState("");

  async function handleSaved(body) {
    setStatus("replying");

    try {
      const data = await askCompanion({
        token,
        persona: "warm",
        message:
          `I just finished my ${day === "today" ? "check-in" : `check-in for ${date}`}. ` +
          `${body.notes.replace("[Check-in] ", "")}\n` +
          "Please reply with one or two short, supportive sentences.",
      });
      setReply(data.message);
    } catch {
      setReply(FALLBACK_REPLY);
    }

    setStatus("done");
  }

  if (status === "replying" || status === "done") {
    return (
      <main className="check-in-page vertical-24">
        <section className="check-in-section check-in-reply vertical-16 at-middle-center">
          <h2>Check-in saved</h2>
          <p className="paragraph" aria-live="polite">
            {status === "replying" ? "Your companion is writing a note…" : reply}
          </p>
          {status === "done" && (
            <Link className="btn button-dark btn-large-text" to={urls.home}>
              Back to Today
            </Link>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="check-in-page vertical-24">
      <p className="paragraph m-0">
        Look back on the whole day. Your symptom levels and three quick questions shape your Today card and tips.
        Everything after them is optional: log whatever you notice, and Lobelia will look for patterns over time.
      </p>

      <section className="check-in-section vertical-8">
        <h2>Which day?</h2>
        <div className="check-in-chips" role="group" aria-label="Which day">
          {[
            { value: "today", label: "Today" },
            { value: "yesterday", label: "Yesterday" },
            ...(otherDate
              ? [{ value: "other", label: new Date(`${otherDate}T00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) }]
              : []),
          ].map((option) => (
            <button
              type="button"
              key={option.value}
              className={`check-in-chip ${day === option.value ? "selected" : ""}`}
              aria-pressed={day === option.value}
              onClick={() => setDay(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="check-in-hint">
          Today shows your latest check-in from today or yesterday, next to your action plan.
        </p>
      </section>

      <DayCheckInForm key={date} date={date} isToday={day === "today"} initialMood={initialMood} onSaved={handleSaved} />
    </main>
  );
}

export default CheckInPage;

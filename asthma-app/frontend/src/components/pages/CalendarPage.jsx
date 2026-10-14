import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "react-bootstrap";
import { Link, useOutletContext } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { useCalendar } from "../../context/CalendarContext";
import { getCheckIns } from "../../helper-functions/checkIns";
import { getDayPlan, saveDayEvents } from "../../helper-functions/dayPlan";
import { formatEventTime } from "../../helper-functions/dayPlanDisplay";
import {
  addDays,
  eventDateKey,
  parseYmd,
  shiftAnchor,
  visibleRange,
  weekDays,
  ymd,
} from "../../helper-functions/calendarGrid";
import useIsSmallScreen from "../../helper-functions/useIsSmallScreen";
import CalendarConnectionPanel from "../calendar/CalendarConnectionPanel";
import EventModal from "../calendar/EventModal";
import FormModal from "../input/FormModal";
import { ListView, MonthView, TimeGridView } from "./CalendarViews";
import { urls } from "../../constants";
import "./CalendarPage.css";
import "./CalendarViews.css";

const VIEWS = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
  { value: "list", label: "List" },
];

function rangeTitle(view, anchor) {
  if (view === "month") return anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  if (view === "day") return anchor.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const [start, end] = visibleRange(view, anchor);
  const format = (date) => date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${format(start)} – ${format(end)}, ${end.getFullYear()}`;
}

function EventDetails({ event, token, location, onEdit, onDelete, onClose }) {
  const [tip, setTip] = useState(event.tip || "");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const editable = event.source !== "google_calendar";

  // tips come from the day plan (cached on the server after the first look)
  useEffect(() => {
    if (event.tip || !location) return;

    let cancelled = false;
    getDayPlan({ token, lat: location.lat, lon: location.lon, date: eventDateKey(event) })
      .then((plan) => {
        const match = (plan.events || []).find((item) => item.id === event.id);
        if (!cancelled && match?.tip) setTip(match.tip);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [event, token, location]);

  async function handleDelete() {
    setDeleting(true);
    setError("");
    try {
      await onDelete(event);
      onClose();
    } catch (deleteError) {
      setError(deleteError.message || "Unable to delete this plan.");
      setDeleting(false);
    }
  }

  const details = [
    ["When", `${parseYmd(eventDateKey(event)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · ${formatEventTime(event.start)}${event.end && formatEventTime(event.end) !== "All day" ? ` – ${formatEventTime(event.end)}` : ""}`],
    ["Where", event.location],
    ["Inside or outside", event.environment],
    ["How active", event.intensity],
    ["Might bother breathing", event.context],
    ["Notes", event.notes],
  ].filter(([, value]) => value);

  return (
    <FormModal title={event.title} onHide={onClose} onSubmit={onClose} showSubmit={false} color="light" buttonError={error}>
      <div className="vertical-16">
        {details.map(([label, value]) => (
          <p className="m-0" key={label}>
            <strong>{label}:</strong> {value}
          </p>
        ))}
        {tip && <p className="m-0 cal-tip">{tip}</p>}
        {!editable && <p className="m-0 cal-note">From your Google Calendar. Edit it there.</p>}
        {error && <p className="m-0 error-text-dark">{error}</p>}
        {editable && (
          <div className="btn-row">
            <Button className="button-dark btn-medium-text" onClick={() => onEdit(event)}>
              Edit
            </Button>
            <Button className="button-alert-outline btn-medium-text" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </div>
        )}
      </div>
    </FormModal>
  );
}

function CalendarPage() {
  const { token } = useAuth();
  const { location } = useOutletContext();
  const { calendarStatus, calendarSnapshot, loadCalendarMonth } = useCalendar();
  const isSmallScreen = useIsSmallScreen();

  const todayKey = ymd(new Date());
  const [view, setView] = useState(() => (isSmallScreen ? "day" : "week"));
  const [anchor, setAnchor] = useState(() => new Date());
  const [checkIns, setCheckIns] = useState([]);
  const [status, setStatus] = useState("loading");
  const [reloadKey, setReloadKey] = useState(0);

  const [openEvent, setOpenEvent] = useState(null);
  const [editor, setEditor] = useState(null); // { date, startTime, endTime, initial }

  const [rangeStart, rangeEnd] = visibleRange(view, anchor);
  const from = ymd(rangeStart);
  const to = ymd(rangeEnd);

  useEffect(() => {
    let cancelled = false;

    getCheckIns({ from, to, token })
      .then((data) => {
        if (cancelled) return;
        setCheckIns(data?.items || []);
        setStatus("success");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [from, to, token, reloadKey]);

  // Google events come from the existing monthly loader (only when connected)
  const year = anchor.getFullYear();
  const monthIndex = anchor.getMonth();
  useEffect(() => {
    if (!token || !calendarStatus.connected) return;
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    void loadCalendarMonth({
      year,
      monthIndex,
      monthStart: ymd(new Date(year, monthIndex, 1)),
      monthEnd: ymd(new Date(year, monthIndex, daysInMonth)),
      includeEvents: true,
      authToken: token,
    });
  }, [calendarStatus.connected, loadCalendarMonth, monthIndex, token, year]);

  const checkInsByDate = useMemo(
    () => Object.fromEntries(checkIns.map((checkIn) => [checkIn.date, checkIn])),
    [checkIns]
  );

  const ownEventsByDate = useMemo(
    () =>
      Object.fromEntries(
        checkIns.map((checkIn) => [
          checkIn.date,
          (checkIn.calendar_events || []).filter((event) => event.source !== "google_calendar"),
        ])
      ),
    [checkIns]
  );

  const eventsByDate = useMemo(() => {
    const map = {};
    for (const [date, events] of Object.entries(ownEventsByDate)) {
      map[date] = [...events];
    }
    for (const event of calendarStatus.connected ? calendarSnapshot.googleEvents || [] : []) {
      const key = event.date || eventDateKey(event);
      (map[key] = map[key] || []).push({ ...event, source: "google_calendar" });
    }
    for (const events of Object.values(map)) {
      events.sort((a, b) => String(a.start).localeCompare(String(b.start)));
    }
    return map;
  }, [ownEventsByDate, calendarSnapshot.googleEvents, calendarStatus.connected]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  async function replaceDay(date, transform) {
    // other days' plans may be outside the loaded range, so fetch that day's list first
    let current = ownEventsByDate[date];
    if (!current) {
      const data = await getCheckIns({ from: date, to: date, token });
      const row = (data?.items || []).find((item) => item.date === date);
      current = (row?.calendar_events || []).filter((event) => event.source !== "google_calendar");
    }
    await saveDayEvents({ token, date, events: transform(current) });
  }

  async function saveEvent(date, event) {
    const previous = editor?.initial;
    if (previous && eventDateKey(previous) !== date) {
      await replaceDay(eventDateKey(previous), (events) => events.filter((item) => item.id !== previous.id));
    }
    await replaceDay(date, (events) => [...events.filter((item) => item.id !== event.id), event]);
    reload();
  }

  async function deleteEvent(event) {
    await replaceDay(eventDateKey(event), (events) => events.filter((item) => item.id !== event.id));
    reload();
  }

  function openDay(day) {
    setAnchor(day);
    setView("day");
  }

  const days = view === "week" ? weekDays(anchor) : view === "list" ? Array.from({ length: 14 }, (_, i) => addDays(anchor, i)) : [anchor];

  return (
    <main className="vertical-24">
      <CalendarConnectionPanel />

      <section className="calendar-card cal-shell">
        <div className="cal-toolbar">
          <div className="cal-nav">
            <Button className="button-dark cal-today-btn" onClick={() => setAnchor(new Date())}>
              Today
            </Button>
            <button type="button" className="calendar-arrow" aria-label="Previous" onClick={() => setAnchor(shiftAnchor(view, anchor, -1))}>
              ←
            </button>
            <button type="button" className="calendar-arrow" aria-label="Next" onClick={() => setAnchor(shiftAnchor(view, anchor, 1))}>
              →
            </button>
            <h2 className="cal-title">{rangeTitle(view, anchor)}</h2>
          </div>

          <div className="cal-views" role="group" aria-label="Calendar view">
            {VIEWS.map((option) => (
              <button
                type="button"
                key={option.value}
                className={`check-in-chip ${view === option.value ? "selected" : ""}`}
                aria-pressed={view === option.value}
                onClick={() => setView(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <p className="calendar-status m-0">
          {view === "month"
            ? "Tap a day to open it. "
            : view === "list"
              ? ""
              : "Click (or drag) on a time to add a plan. "}
          Days with a check-in show a dot. <Link to={`${urls.checkIn}?date=${todayKey}`}>Log today's check-in</Link>
        </p>

        {status === "error" && <p className="calendar-error">We couldn't load your calendar. Please try again.</p>}

        {view === "month" && (
          <MonthView
            anchor={anchor}
            todayKey={todayKey}
            eventsByDate={eventsByDate}
            checkInsByDate={checkInsByDate}
            onOpenDay={openDay}
            onOpenEvent={setOpenEvent}
          />
        )}

        {(view === "week" || view === "day") && (
          <TimeGridView
            days={days}
            todayKey={todayKey}
            eventsByDate={eventsByDate}
            checkInsByDate={checkInsByDate}
            onSlot={(date, startTime, endTime) => setEditor({ date, startTime, endTime, initial: null })}
            onOpenEvent={setOpenEvent}
          />
        )}

        {view === "list" && (
          <ListView days={days} todayKey={todayKey} eventsByDate={eventsByDate} checkInsByDate={checkInsByDate} onOpenEvent={setOpenEvent} />
        )}

        <div>
          <Button className="button-dark btn-medium-text" onClick={() => setEditor({ date: view === "month" || view === "list" ? todayKey : ymd(anchor), initial: null })}>
            Add a plan
          </Button>
        </div>
      </section>

      {openEvent && (
        <EventDetails
          event={openEvent}
          token={token}
          location={location}
          onClose={() => setOpenEvent(null)}
          onDelete={deleteEvent}
          onEdit={(event) => {
            setOpenEvent(null);
            setEditor({ date: eventDateKey(event), initial: event });
          }}
        />
      )}

      {editor && (
        <EventModal
          date={editor.date}
          initial={editor.initial}
          startTime={editor.startTime}
          endTime={editor.endTime}
          onClose={() => setEditor(null)}
          onSave={saveEvent}
        />
      )}
    </main>
  );
}

export default CalendarPage;

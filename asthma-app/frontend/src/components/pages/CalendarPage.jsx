import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useCalendar } from "../../context/CalendarContext";
import "./CalendarPage.css";
import CalendarConnectionPanel from "../calendar/CalendarConnectionPanel";
import CalendarModal from "../calendar/CalendarModal";
import SpinnerOverlay from "../input/SpinnerOverlay";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EMPTY_ARRAY = [];

const EMPTY_FORM = {
  daily_day_symp: false,
  daily_night_symp: false,
  daily_limit_activity: false,
  notes: "",
  triggers: "",
  calendar_event: "",
};

function formatDateKey(year, monthIndex, day) {
  const month = String(monthIndex + 1).padStart(2, "0");
  const date = String(day).padStart(2, "0");

  return `${year}-${month}-${date}`;
}

function formatReadableDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function CalendarPage() {
  const { token } = useAuth();
  const {
    calendarStatus,
    calendarSnapshot,
    loadCalendarMonth,
    saveCalendarCheckIn,
  } = useCalendar();

  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [saving, setSaving] = useState(false);


  const year = currentMonth.getFullYear();
  const monthIndex = currentMonth.getMonth();

  const monthName = currentMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const firstDayIndex = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const monthStart = formatDateKey(year, monthIndex, 1);
  const monthEnd = formatDateKey(year, monthIndex, daysInMonth);
  const monthKey = `${monthStart}:${monthEnd}`;

  const currentMonthData =
    calendarSnapshot.monthKey === monthKey ? calendarSnapshot : null;

  const checkIns = currentMonthData?.checkIns ?? EMPTY_ARRAY;
  const googleEvents = currentMonthData?.googleEvents ?? EMPTY_ARRAY;
  const loading = currentMonthData?.checkInsLoading ?? false;
  const eventsLoading = currentMonthData?.googleEventsLoading ?? false;
  const monthError = currentMonthData?.error ?? "";

  const checkInsByDate = useMemo(() => {
    return Object.fromEntries(
      checkIns.map((checkIn) => [checkIn.date, checkIn])
    );
  }, [checkIns]);

  const googleEventsByDate = useMemo(() => {
    const map = {};
    for (const ev of googleEvents) {
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    return map;
  }, [googleEvents]);

  useEffect(() => {
    if (!token) {
      return;
    }

    void loadCalendarMonth({
      year,
      monthIndex,
      monthStart,
      monthEnd,
      includeEvents: calendarStatus.connected,
      authToken: token,
    });
  }, [calendarStatus.connected, loadCalendarMonth, monthEnd, monthIndex, monthStart, token, year]);


  function goToPreviousMonth() {
    setCurrentMonth(new Date(year, monthIndex - 1, 1));
  }

  function goToNextMonth() {
    setCurrentMonth(new Date(year, monthIndex + 1, 1));
  }

  function isFutureDate(dateKey) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [year, month, day] = dateKey.split("-").map(Number);

    const date = new Date(year, month - 1, day);
    date.setHours(0, 0, 0, 0);

    return date > today;
  }

  function openDate(dateKey) {
    const existingCheckIn = checkInsByDate[dateKey];

    setSelectedDate(dateKey);
    setSaveMessage("");
    setError("");

    if (existingCheckIn) {
      setFormData({
        daily_day_symp: Boolean(existingCheckIn.daily_day_symp),
        daily_night_symp: Boolean(existingCheckIn.daily_night_symp),
        daily_limit_activity: Boolean(
          existingCheckIn.daily_limit_activity
        ),
        notes: existingCheckIn.notes ?? "",
        triggers: Array.isArray(existingCheckIn.triggers)
          ? existingCheckIn.triggers.join(", ")
          : "",
        calendar_event: existingCheckIn.calendar_event ?? "",
      });
    } else {
      setFormData(EMPTY_FORM);
    }
  }

  function closeModal() {
    if (saving) return;

    setSelectedDate(null);
    setSaveMessage("");
  }

  function updateField(event) {
    const { name, value, checked, type } = event.target;

    setFormData((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!selectedDate || !token) return;

    const future = isFutureDate(selectedDate);

    const triggers = formData.triggers
      .split(",")
      .map((trigger) => trigger.trim())
      .filter(Boolean);

    try {
      setSaving(true);
      setError("");
      setSaveMessage("");

      const saved = await saveCalendarCheckIn({
        checkIn: {
          date: selectedDate,

          daily_day_symp: future
            ? false
            : formData.daily_day_symp,

          daily_night_symp: future
            ? false
            : formData.daily_night_symp,

          daily_limit_activity: future
            ? false
            : formData.daily_limit_activity,

          notes: future
            ? null
            : formData.notes.trim(),

          triggers: future
            ? null
            : triggers,

          calendar_event: formData.calendar_event.trim(),
        },
      });

      if (saved?.forecast_refreshed && saved?.forecast?.risk_level) {
        setSaveMessage(
          `Check-in saved. Risk prediction updated to ${saved.forecast.risk_level}.`
        );
      } else {
        setSaveMessage("Check-in saved.");
      }
    } catch (requestError) {
      console.error(requestError);
      setError(requestError.message || "Unable to save your check-in.");
    } finally {
      setSaving(false);
    }
  }

  const today = new Date();

  const todayKey = formatDateKey(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  const calendarCells = [];

  for (let index = 0; index < firstDayIndex; index += 1) {
    calendarCells.push(
      <div
        className="calendar-empty-cell"
        key={`empty-start-${index}`}
        aria-hidden="true"
      />
    );
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = formatDateKey(year, monthIndex, day);
    const checkIn = checkInsByDate[dateKey];

    const hasCheckIn =
      Boolean(checkIn?.daily_day_symp) ||
      Boolean(checkIn?.daily_night_symp) ||
      Boolean(checkIn?.daily_limit_activity) ||
      Boolean(checkIn?.notes?.trim()) ||
      (Array.isArray(checkIn?.triggers) && checkIn.triggers.length > 0);


    const hasGoogleEvent = calendarStatus.connected && Boolean(googleEventsByDate[dateKey]);
    const isToday = dateKey === todayKey;
    const isFuture = isFutureDate(dateKey);

    calendarCells.push(
      <button
        type="button"
        className={[
          "calendar-day vertical-8 at-middle-center",
          isToday ? "calendar-day-today" : "",
          hasCheckIn ? "calendar-day-recorded" : "",
          isFutureDate ? "calendar-day-future" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        key={dateKey}
        onClick={() => openDate(dateKey)}
        aria-label={`${formatReadableDate(dateKey)}${
          hasCheckIn ? ", check-in recorded" : ""
          }${isFutureDate ? ", future date" : ""}`}
      >
        <span className="calendar-day-number">{day}</span>

        <div className="horizontal-8 at-middle-center">
          {hasCheckIn && (
            <span
              className="calendar-entry-dot"
              aria-label="Check-in recorded"
            />
          )}
          {hasGoogleEvent && (
            <span
              className="calendar-google-dot"
              aria-label="Google Calendar event"
            />
          )}
        </div>
      </button>
    );
  }

  function formatEventForSelectedDay(start, end, selectedDate) {
    const startDate = new Date(start);
    const endDate = new Date(end);

    const eventStartKey = startDate.toISOString().slice(0, 10);
    const eventEndKey = endDate.toISOString().slice(0, 10);

    const timeOptions = {
      hour: "numeric",
      minute: "2-digit",
    };

    // Single-day event
    if (eventStartKey === eventEndKey) {
      return `${startDate.toLocaleTimeString([], timeOptions)} – ${endDate.toLocaleTimeString([], timeOptions)}`;
    }

    // First day of a multi-day event
    if (selectedDate === eventStartKey) {
      return `Starts ${startDate.toLocaleTimeString([], timeOptions)}`;
    }

    // Last day of a multi-day event
    if (selectedDate === eventEndKey) {
      return `Ends ${endDate.toLocaleTimeString([], timeOptions)}`;
    }

    // Middle day(s)
    return "All day";
  }

  return (
    <main>

      <CalendarConnectionPanel />

      <section className="calendar-card">
        <div className="calendar-month-controls">
          <button
            type="button"
            className="calendar-arrow"
            onClick={goToPreviousMonth}
            aria-label="Previous month"
          >
            ←
          </button>

          <h2>{monthName}</h2>

          <button
            type="button"
            className="calendar-arrow"
            onClick={goToNextMonth}
            aria-label="Next month"
          >
            →
          </button>
        </div>

        <p className="calendar-status">
          Tap today or a past date to log a check-in. Tap a future date to add a plan.
        </p>

        {loading && <p className="calendar-status">Loading your check-ins...</p>}

        {!loading && monthError && !selectedDate && (
          <p className="calendar-error">{monthError}</p>
        )}

        {!loading && error && !selectedDate && !monthError && (
          <p className="calendar-error">{error}</p>
        )}

        {!loading && (
          <div className="calendar-grid-wrapper">
            <div className="calendar-weekdays">
              {WEEKDAYS.map((weekday) => (
                <div key={weekday} className="calendar-weekday">
                  {weekday}
                </div>
              ))}
            </div>

            <div className="calendar-days-grid">{calendarCells}</div>
          </div>
        )}
      </section>

      <CalendarModal
        selectedDate={selectedDate}
        formData={formData}
        error={error}
        saveMessage={saveMessage}
        saving={saving}
        isFutureDate={selectedDate ? isFutureDate(selectedDate) : false}
        googleEvents={
          selectedDate
            ? googleEventsByDate[selectedDate] ?? []
            : []
        }
        onClose={closeModal}
        onSave={handleSave}
        onChange={updateField}
        formatReadableDate={formatReadableDate}
        formatEventForSelectedDay={formatEventForSelectedDay}
      />
      <SpinnerOverlay visible={eventsLoading} message="Loading Google Calendar events..." />
    </main>
  );
}

export default CalendarPage;
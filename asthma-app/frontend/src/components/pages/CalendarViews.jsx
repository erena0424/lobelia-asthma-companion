import { useEffect, useRef, useState } from "react";
import { formatEventTime } from "../../helper-functions/dayPlanDisplay";
import {
  HOUR_PX,
  isAllDay,
  layoutDay,
  minuteAtOffset,
  minutesToTime,
  monthGrid,
  ymd,
} from "../../helper-functions/calendarGrid";
import { LEVEL_LABELS, symptomLevel } from "../../helper-functions/insightsDisplay";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function hourLabel(hour) {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

// A day with a log shows a dot colored by its symptom level (an open ring when it comes from quick logs only);
// tapping it opens that day's Day check-in.
function CheckInMarker({ dateKey, checkInsByDate, todayKey, onOpenLog, compact = false }) {
  const day = checkInsByDate[dateKey];
  const level = symptomLevel(day);

  if (level) {
    const fromLogs = Boolean(day.from_quick_logs);
    const label = fromLogs ? `${LEVEL_LABELS[level]} (quick logs)` : LEVEL_LABELS[level];
    return (
      <button
        type="button"
        className={`cal-level ${fromLogs ? "is-from-logs" : ""}`}
        aria-label={`Day check-in for ${new Date(`${dateKey}T00:00`).toDateString()}: ${label}`}
        title={label}
        onClick={(clickEvent) => {
          clickEvent.stopPropagation();
          onOpenLog?.(dateKey);
        }}
        onKeyDown={(keyEvent) => keyEvent.stopPropagation()}
      >
        <i className={`cal-level-dot is-${level}`} aria-hidden="true" />
        {!compact && <span>{label}</span>}
      </button>
    );
  }

  if (compact || dateKey > todayKey) return null;

  return (
    <button
      type="button"
      className="cal-checkin-link"
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        onOpenLog?.(dateKey);
      }}
    >
      Log a day check-in
    </button>
  );
}

function EventChip({ event, onOpen }) {
  return (
    <button
      type="button"
      className={`cal-chip ${event.source === "google_calendar" ? "cal-chip-google" : ""}`}
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        onOpen(event);
      }}
    >
      {!isAllDay(event) && <span className="cal-chip-time">{formatEventTime(event.start)}</span>} {event.title}
    </button>
  );
}

export function MonthView({ anchor, todayKey, eventsByDate, checkInsByDate, onOpenDay, onOpenDayView, onOpenEvent, onOpenLog }) {
  const month = anchor.getMonth();

  return (
    <div className="cal-month">
      {WEEKDAYS.map((weekday) => (
        <div key={weekday} className="cal-month-weekday">{weekday}</div>
      ))}
      {monthGrid(anchor).map((day) => {
        const key = ymd(day);
        const events = eventsByDate[key] || [];

        return (
          <div
            key={key}
            role="button"
            tabIndex={0}
            className={`cal-month-cell ${day.getMonth() !== month ? "cal-outside" : ""} ${key === todayKey ? "cal-today" : ""}`}
            onClick={() => onOpenDay(day)}
            onKeyDown={(keyEvent) => {
              if (keyEvent.key === "Enter") onOpenDay(day);
            }}
            aria-label={`Add a plan or check-in for ${day.toDateString()}`}
          >
            <div className="cal-month-cell-head">
              <button
                type="button"
                className="cal-day-number"
                aria-label={`Open the day view for ${day.toDateString()}`}
                onClick={(clickEvent) => {
                  clickEvent.stopPropagation();
                  onOpenDayView(day);
                }}
                onKeyDown={(keyEvent) => keyEvent.stopPropagation()}
              >
                {day.getDate()}
              </button>
              <CheckInMarker dateKey={key} checkInsByDate={checkInsByDate} todayKey={todayKey} onOpenLog={onOpenLog} compact />
            </div>
            {events.slice(0, 3).map((event) => (
              <EventChip key={event.id || event.title} event={event} onOpen={onOpenEvent} />
            ))}
            {events.length > 3 && <span className="cal-more">+{events.length - 3} more</span>}
          </div>
        );
      })}
    </div>
  );
}

/** Week (7 columns) or Day (1 column) time grid. Click or drag to add a plan. */
export function TimeGridView({ days, todayKey, eventsByDate, checkInsByDate, onSlot, onOpenDay, onOpenEvent, onOpenLog }) {
  const scrollRef = useRef(null);
  const [drag, setDrag] = useState(null);

  // start the view around 7 AM
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = HOUR_PX * 7;
  }, []);

  function offsetIn(column, clientY) {
    return clientY - column.getBoundingClientRect().top;
  }

  function handlePointerDown(pointerEvent, key) {
    if (pointerEvent.button !== 0 || pointerEvent.target.closest(".cal-block")) return;
    const minute = minuteAtOffset(offsetIn(pointerEvent.currentTarget, pointerEvent.clientY));

    if (pointerEvent.pointerType !== "mouse") {
      // touch / pen: a tap opens a one-hour slot (dragging would fight scrolling)
      onSlot(key, minutesToTime(minute), minutesToTime(minute + 60));
      return;
    }

    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
    setDrag({ key, start: minute, end: minute + 30 });
  }

  function handlePointerMove(pointerEvent, key) {
    if (!drag || drag.key !== key) return;
    const minute = minuteAtOffset(offsetIn(pointerEvent.currentTarget, pointerEvent.clientY)) + 15;
    setDrag((current) => ({ ...current, end: Math.max(current.start + 15, minute) }));
  }

  function handlePointerUp(key) {
    if (!drag || drag.key !== key) return;
    const { start, end } = drag;
    setDrag(null);
    // a plain click (no real drag) gives a one-hour plan
    onSlot(key, minutesToTime(start), minutesToTime(end - start <= 30 ? start + 60 : end));
  }

  return (
    <div className="cal-timegrid">
      <div className="cal-timegrid-head" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
        <div />
        {days.map((day) => {
          const key = ymd(day);
          const allDay = (eventsByDate[key] || []).filter(isAllDay);
          return (
            <div key={key} className={`cal-col-head ${key === todayKey ? "cal-today" : ""}`}>
              <button
                type="button"
                className="cal-col-title"
                aria-label={`Add a plan or check-in for ${day.toDateString()}`}
                onClick={() => onOpenDay(key)}
              >
                {WEEKDAYS[day.getDay()]} <strong>{day.getDate()}</strong>
              </button>
              <CheckInMarker dateKey={key} checkInsByDate={checkInsByDate} todayKey={todayKey} onOpenLog={onOpenLog} compact={days.length > 1} />
              {allDay.map((event) => (
                <EventChip key={event.id || event.title} event={event} onOpen={onOpenEvent} />
              ))}
            </div>
          );
        })}
      </div>

      <div className="cal-timegrid-body" ref={scrollRef}>
        <div className="cal-timegrid-inner" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)`, height: HOUR_PX * 24 }}>
          <div className="cal-hours">
            {HOURS.map((hour) => (
              <div key={hour} className="cal-hour-label" style={{ top: hour * HOUR_PX }}>
                {hour === 0 ? "" : hourLabel(hour)}
              </div>
            ))}
          </div>

          {days.map((day) => {
            const key = ymd(day);
            return (
              <div
                key={key}
                className={`cal-day-col ${key === todayKey ? "cal-today-col" : ""}`}
                onPointerDown={(pointerEvent) => handlePointerDown(pointerEvent, key)}
                onPointerMove={(pointerEvent) => handlePointerMove(pointerEvent, key)}
                onPointerUp={() => handlePointerUp(key)}
                onPointerCancel={() => setDrag(null)}
                aria-label={`${day.toDateString()}: click a time to add a plan`}
              >
                {HOURS.map((hour) => (
                  <div key={hour} className="cal-hour-line" style={{ top: hour * HOUR_PX }} />
                ))}

                {layoutDay(eventsByDate[key] || []).map(({ event, top, height, lane, lanes }) => (
                  <button
                    type="button"
                    key={event.id || `${event.title}-${top}`}
                    className={`cal-block ${event.source === "google_calendar" ? "cal-chip-google" : ""}`}
                    style={{
                      top,
                      height,
                      left: `calc(${(lane / lanes) * 100}% + 2px)`,
                      width: `calc(${100 / lanes}% - 4px)`,
                    }}
                    onClick={() => onOpenEvent(event)}
                  >
                    <strong>{event.title}</strong>
                    <span>{formatEventTime(event.start)}{event.end ? ` – ${formatEventTime(event.end)}` : ""}</span>
                  </button>
                ))}

                {drag?.key === key && (
                  <div
                    className="cal-drag"
                    style={{ top: (drag.start / 60) * HOUR_PX, height: ((drag.end - drag.start) / 60) * HOUR_PX }}
                  >
                    {formatEventTime(`T${minutesToTime(drag.start)}`)} – {formatEventTime(`T${minutesToTime(drag.end)}`)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ListView({ days, todayKey, eventsByDate, checkInsByDate, onOpenEvent, onOpenLog }) {
  const withEvents = days.filter((day) => (eventsByDate[ymd(day)] || []).length > 0);

  if (withEvents.length === 0) {
    return <p className="cal-empty">No plans in the next two weeks. Switch to Day or Week and click a time to add one.</p>;
  }

  return (
    <div className="cal-list vertical-16">
      {withEvents.map((day) => {
        const key = ymd(day);
        return (
          <section key={key} className="cal-list-day">
            <div className="cal-list-head">
              <h3>{day.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</h3>
              <CheckInMarker dateKey={key} checkInsByDate={checkInsByDate} todayKey={todayKey} onOpenLog={onOpenLog} />
            </div>
            {(eventsByDate[key] || []).map((event) => (
              <EventChip key={event.id || event.title} event={event} onOpen={onOpenEvent} />
            ))}
          </section>
        );
      })}
    </div>
  );
}


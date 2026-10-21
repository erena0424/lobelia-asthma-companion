import { useState } from "react";
import FormModal from "../input/FormModal";
import DayCheckInForm from "../input/DayCheckInForm";
import { parseYmd } from "../../helper-functions/calendarGrid";
import { PlanForm } from "./EventModal";

/**
 * Tapping a day on the Calendar: add a plan, or add or change that day's Day check-in.
 * Future days only take plans. Past days open on the check-in, today and later on Plan.
 */
function DaySheet({ dateKey, todayKey, tab: requestedTab, startTime = "", endTime = "", onClose, onSavePlan, onCheckInSaved }) {
  const canCheckIn = dateKey <= todayKey;
  const [tab, setTab] = useState(() =>
    canCheckIn && (requestedTab === "check-in" || (!requestedTab && dateKey < todayKey)) ? "check-in" : "plan"
  );
  const title = parseYmd(dateKey).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <FormModal title={title} onHide={onClose} showSubmit={false} color="light">
      <div className="vertical-24 day-sheet">
        {canCheckIn && (
          <div className="day-sheet-tabs" role="tablist" aria-label="What to add">
            {[
              { value: "plan", label: "Plan" },
              { value: "check-in", label: "Day check-in" },
            ].map((option) => (
              <button
                type="button"
                role="tab"
                key={option.value}
                id={`day-sheet-tab-${option.value}`}
                aria-selected={tab === option.value}
                aria-controls="day-sheet-panel"
                className={tab === option.value ? "selected" : ""}
                onClick={() => setTab(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        <div id="day-sheet-panel" role={canCheckIn ? "tabpanel" : undefined} aria-labelledby={canCheckIn ? `day-sheet-tab-${tab}` : undefined}>
          {tab === "plan" ? (
            <PlanForm date={dateKey} startTime={startTime} endTime={endTime} onSave={onSavePlan} onDone={onClose} />
          ) : (
            <DayCheckInForm
              date={dateKey}
              isToday={dateKey === todayKey}
              onSaved={() => {
                onCheckInSaved?.();
                onClose();
              }}
            />
          )}
        </div>
      </div>
    </FormModal>
  );
}

export default DaySheet;

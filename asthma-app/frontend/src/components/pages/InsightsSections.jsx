import { useEffect, useRef, useState } from "react";
import { useInsights } from "../../helper-functions/useInsights";
import {
  COMPARISON_ROWS,
  INSIGHT_RANGES,
  SYMPTOM_FILTERS,
  TREND_TAGS,
  describeChange,
  monthLabel,
  patternSentence,
} from "../../helper-functions/insightsDisplay";

// Insights built from the user's own check-ins: weekly trend, a 4-week comparison and
// possible patterns. Patterns are associations in their log, never causes.
// Copy needs regulatory-claims review.

export function ComparisonCard({ comparison }) {
  if (!comparison) return null;
  const { current, previous } = comparison;

  return (
    <section className="insights-card insights-compare" aria-labelledby="insights-compare-title">
      <h2 id="insights-compare-title">Last 4 weeks</h2>
      <p className="insights-sub">Compared with the 4 weeks before, from your check-ins</p>
      <table className="insights-compare-table">
        <thead>
          <tr>
            <th scope="col"><span className="visually-hidden">Measure</span></th>
            <th scope="col">Before</th>
            <th scope="col">Last 4 wks</th>
            <th scope="col"><span className="visually-hidden">Change</span></th>
          </tr>
        </thead>
        <tbody>
          {COMPARISON_ROWS.map(({ key, label, worseWhenMore }) => {
            const change = describeChange(previous[key], current[key], worseWhenMore);
            return (
              <tr key={key}>
                <th scope="row">{label}</th>
                <td className="insights-num insights-before">
                  {previous[key]}{key === "days_checked_in" && <span className="insights-of"> / {comparison.days}</span>}
                </td>
                <td className="insights-num insights-now">
                  {current[key]}{key === "days_checked_in" && <span className="insights-of"> / {comparison.days}</span>}
                </td>
                <td><span className={`insights-change is-${change.tone}`}>{change.text}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function TrendChart({ weeks, symptomKey, width }) {
  // drawn at the card's real width, so text stays at its set size on any screen
  const height = 250;
  const left = 40;
  const right = width - 16;
  const top = 18;
  const bottom = 168;
  const barTop = 196;
  const barBottom = 232;

  const values = weeks.map((week) =>
    symptomKey ? week.avg_by_symptom?.[symptomKey] ?? null : week.avg_score
  );
  const known = values.filter((value) => value !== null);
  const yMax = Math.min(10, Math.max(4, Math.ceil(Math.max(0, ...known)) + 1));
  const step = weeks.length > 1 ? (right - left) / (weeks.length - 1) : 0;
  const x = (index) => (weeks.length > 1 ? left + index * step : (left + right) / 2);
  const y = (value) => bottom - (value / yMax) * (bottom - top);
  const puffMax = Math.max(1, ...weeks.map((week) => week.puffs));
  const barWidth = Math.max(3, Math.min(14, step * 0.45 || 14));

  // line segments skip weeks without scores instead of drawing to zero
  const segments = [];
  let current = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push(`${x(index).toFixed(1)},${y(value).toFixed(1)}`);
    }
  });
  if (current.length) segments.push(current);

  const ticks = [0, Math.round(yMax / 2), yMax];
  const labelEvery = Math.max(1, Math.ceil(weeks.length / Math.max(2, Math.floor(width / 110))));
  const lastIndex = values.map((value, index) => (value === null ? -1 : index)).reduce((a, b) => Math.max(a, b), -1);
  const fmt = (iso) => new Date(`${iso}T00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <svg className="insights-trend" viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={`Weekly average symptom score and rescue puffs for the last ${weeks.length} weeks`}>
      {ticks.map((tick) => (
        <g key={tick}>
          <line className="insights-grid" x1={left} x2={right} y1={y(tick)} y2={y(tick)} />
          <text className="insights-axis" x={left - 8} y={y(tick) + 4} textAnchor="end">{tick}</text>
        </g>
      ))}
      {segments.map((points, index) => (
        points.length > 1
          ? <polyline key={index} className="insights-line" points={points.join(" ")} />
          : null
      ))}
      {values.map((value, index) => (value === null ? null : (
        <circle key={index} className={`insights-point ${index === lastIndex ? "is-last" : ""}`}
          cx={x(index)} cy={y(value)} r={index === lastIndex ? 4.5 : 2.5}>
          <title>{`Week of ${fmt(weeks[index].week_start)}: ${value}`}</title>
        </circle>
      )))}
      {weeks.map((week, index) => (
        index % labelEvery === 0 || index === weeks.length - 1 ? (
          <text key={week.week_start} className="insights-axis" x={x(index)} y={bottom + 18}
            textAnchor={index === 0 ? "start" : index === weeks.length - 1 ? "end" : "middle"}>
            {fmt(week.week_start)}
          </text>
        ) : null
      ))}
      <line className="insights-grid" x1={left} x2={right} y1={barBottom} y2={barBottom} />
      <text className="insights-axis" x={left - 8} y={barBottom - 2} textAnchor="end">puffs</text>
      {weeks.map((week, index) => (
        week.puffs > 0 ? (
          <rect key={week.week_start} className="insights-bar" x={x(index) - barWidth / 2}
            y={barBottom - (week.puffs / puffMax) * (barBottom - barTop)} width={barWidth}
            height={(week.puffs / puffMax) * (barBottom - barTop)}>
            <title>{`Week of ${fmt(week.week_start)}: ${week.puffs} puffs`}</title>
          </rect>
        ) : null
      ))}
    </svg>
  );
}

export function TrendCard({ token }) {
  const [days, setDays] = useState(28);
  const [symptomKey, setSymptomKey] = useState(null);
  const { status, data } = useInsights(token, days);
  const wrapRef = useRef(null);
  const [chartWidth, setChartWidth] = useState(640);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => setChartWidth(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(node);
    return () => observer.disconnect();
  }, [status]);
  const weeks = data?.weeks || [];
  const hasScores = weeks.some((week) => week.avg_score !== null);

  return (
    <section className="insights-card" aria-labelledby="insights-trend-title">
      <div className="insights-head">
        <div>
          <h2 id="insights-trend-title">How your symptoms have changed</h2>
          <p className="insights-sub">Weekly average of your 0–10 scores, from your check-ins</p>
        </div>
        <div className="insights-seg" role="group" aria-label="Time range">
          {INSIGHT_RANGES.map((range) => (
            <button key={range.days} type="button" aria-pressed={days === range.days}
              className={days === range.days ? "is-on" : ""} onClick={() => setDays(range.days)}>
              {range.label}
            </button>
          ))}
        </div>
      </div>
      <div className="insights-chips" role="group" aria-label="Symptom">
        {SYMPTOM_FILTERS.map((filter) => (
          <button key={filter.label} type="button" aria-pressed={symptomKey === filter.key}
            className={`check-in-chip ${symptomKey === filter.key ? "selected" : ""}`}
            onClick={() => setSymptomKey(filter.key)}>
            {filter.label}
          </button>
        ))}
      </div>
      {status === "loading" && <p className="insights-sub">Loading your check-ins…</p>}
      {status === "error" && <p className="insights-sub">Your trend isn't available right now. Please try again later.</p>}
      {status === "success" && (
        <>
          <div className="insights-chart-wrap" ref={wrapRef}>
            <TrendChart weeks={weeks} symptomKey={symptomKey} width={chartWidth} />
          </div>
          <div className="insights-legend">
            <span><i className="is-line" />Average symptom score</span>
            <span><i className="is-bar" />Rescue puffs that week</span>
          </div>
          {!hasScores && (
            <p className="insights-sub">Add 0–10 scores in your check-ins to see this line fill in.</p>
          )}
        </>
      )}
    </section>
  );
}

export function PatternsCard({ insights }) {
  const { status, data } = insights;
  const patterns = data?.patterns || [];
  const basis = data?.patterns_basis;

  return (
    <section className="insights-card" aria-labelledby="insights-patterns-title">
      <div className="insights-head">
        <div>
          <h2 id="insights-patterns-title">Possible patterns</h2>
          <p className="insights-sub">Things that showed up on your harder days more often than on other days. Patterns, not causes.</p>
        </div>
        {basis && basis.check_ins > 0 && (
          <span className="insights-eyebrow">
            From {basis.check_ins} check-ins since {new Date(`${basis.since}T00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        )}
      </div>

      {status === "loading" && <p className="insights-sub">Looking through your check-ins…</p>}
      {status === "error" && <p className="insights-sub">Patterns aren't available right now. Please try again later.</p>}
      {status === "success" && patterns.length === 0 && (
        <p className="insights-empty">
          No clear patterns yet. Keep logging the things you notice, like triggers and plans. A pattern shows up here
          once something has come up on at least {basis?.min_days || 5} days.
        </p>
      )}

      {patterns.length > 0 && (
        <ul className="insights-patterns">
          {patterns.map((pattern) => {
            const maxDays = Math.max(1, ...pattern.monthly.map((month) => month.days));
            return (
              <li key={pattern.key} className="insights-pattern">
                <div className="insights-pattern-text">
                  <p className="insights-pattern-title">
                    {pattern.label}
                    {pattern.trend && <span className={`insights-tag is-${pattern.trend}`}>{TREND_TAGS[pattern.trend]}</span>}
                  </p>
                  <p className="insights-pattern-count">{patternSentence(pattern)}</p>
                  {pattern.avg_score_with !== null && pattern.avg_score_without !== null && (
                    <p className="insights-pattern-count">
                      Average symptom score {pattern.avg_score_with} on those days, {pattern.avg_score_without} on others.
                    </p>
                  )}
                </div>
                {/* one grid column per month holds both its bar and its label, so they always line up */}
                <div className="insights-months" style={{ gridTemplateColumns: `repeat(${pattern.monthly.length}, minmax(0, 1fr))` }}
                  role="img" aria-label={`Harder days with ${pattern.label} by month: ${pattern.monthly
                    .map((month) => `${monthLabel(month.month)} ${month.days ? `${month.harder} of ${month.days}` : "none"}`)
                    .join(", ")}`}>
                  {pattern.monthly.map((month) => (
                    <div key={month.month} className="insights-month">
                      <div className="insights-month-track" title={month.days ? `${month.harder} of ${month.days} days` : "No days"}>
                        {month.days > 0 && (
                          <span className="insights-month-days" style={{ height: `${(month.days / maxDays) * 100}%` }}>
                            <span className="insights-month-harder" style={{ height: `${(month.harder / month.days) * 100}%` }} />
                          </span>
                        )}
                      </div>
                      <span className="insights-month-label">{monthLabel(month.month)}</span>
                    </div>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="insights-fine">
        Each month's bar is the days with that factor; the dark part is how many were harder breathing days. Talk with
        your clinician before changing anything based on this.
      </p>
    </section>
  );
}

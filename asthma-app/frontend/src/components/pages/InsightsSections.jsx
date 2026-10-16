import { useEffect, useRef, useState } from "react";
import { useInsights } from "../../helper-functions/useInsights";
import {
  COMPARISON_ROWS,
  INSIGHT_RANGES,
  SYMPTOM_FILTERS,
  axisLines,
  conditionSummary,
  describeChange,
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

function useWidth(initial) {
  const ref = useRef(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

// x: the condition's level (forecast for that day), y: average symptom level 0-10 on those days
function ConditionChart({ curve, width }) {
  const height = 210;
  const left = 30;
  const right = width - 14;
  const top = 14;
  const bottom = 130;
  const count = curve.points.length;
  // inset so the outer level names (e.g. "Below 40°F") stay inside the chart
  const inset = 30;
  const x = (index) => left + inset + (index * (right - left - inset * 2)) / Math.max(1, count - 1);
  const y = (value) => bottom - (value / 10) * (bottom - top);
  const withData = curve.points.map((point, index) => ({ ...point, index })).filter((point) => point.days > 0);
  // tighter type when levels sit close together (five air quality levels on a phone)
  const tight = (right - left - inset * 2) / Math.max(1, count - 1) < 64;

  return (
    <svg className="insights-condition" viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={`Average symptom level by ${curve.noun}: ${curve.points
        .map((point) => `${point.level} ${point.days ? `${point.avg} over ${point.days} days` : "no days"}`)
        .join("; ")}`}>
      {[0, 5, 10].map((tick) => (
        <g key={tick}>
          <line className="insights-grid" x1={left} x2={right} y1={y(tick)} y2={y(tick)} />
          <text className="insights-axis" x={left - 8} y={y(tick) + 4} textAnchor="end">{tick}</text>
        </g>
      ))}
      {withData.length > 1 && (
        <polyline className="insights-line" points={withData.map((point) => `${x(point.index)},${y(point.avg)}`).join(" ")} />
      )}
      {withData.map((point) => (
        <circle key={point.level} className={`insights-point ${point.days < 3 ? "is-thin" : ""}`}
          cx={x(point.index)} cy={y(point.avg)} r="4.5">
          <title>{`${point.level}: average ${point.avg} over ${point.days} days`}</title>
        </circle>
      ))}
      {curve.points.map((point, index) => (
        <g key={point.level}>
          <text className={`insights-axis insights-axis-level ${tight ? "is-tight" : ""}`} x={x(index)} y={bottom + 20} textAnchor="middle">
            {axisLines(point.level).map((line, lineIndex) => (
              <tspan key={line} x={x(index)} dy={lineIndex ? 14 : 0}>{line}</tspan>
            ))}
          </text>
          <text className="insights-axis insights-axis-days" x={x(index)} y={bottom + 64} textAnchor="middle">
            {point.days ? `${point.days} ${point.days === 1 ? "day" : "days"}` : "—"}
          </text>
        </g>
      ))}
    </svg>
  );
}

function ConditionPanel({ curve }) {
  const [ref, width] = useWidth(320);
  const summary = conditionSummary(curve);
  return (
    <div className="insights-condition-panel">
      <h3>{curve.label}</h3>
      {curve.days === 0 ? (
        <p className="insights-sub">No days with {curve.noun} data and a check-in yet.</p>
      ) : (
        <>
          <div ref={ref}><ConditionChart curve={curve} width={width} /></div>
          <p className={`insights-condition-summary ${summary ? "" : "is-quiet"}`}>
            {summary || `No clear pattern with ${curve.noun} yet (from ${curve.days} days).`}
          </p>
        </>
      )}
    </div>
  );
}

function NotedRow({ factor }) {
  return (
    <li className="insights-noted-row">
      <div className="insights-noted-text">
        <p className="insights-pattern-title">{factor.kind === "plan" ? `“${factor.label}”` : factor.label}</p>
        <p className="insights-pattern-count">
          Average {factor.avg_with} on {factor.days_with} days {factor.kind === "plan" ? "with this plan" : "you noted it"}, {factor.avg_without} on {factor.days_without} other days
        </p>
      </div>
      <div className="insights-noted-scale" aria-hidden="true">
        <span className="insights-noted-track" />
        <span className="insights-noted-dot is-without" style={{ left: `${factor.avg_without * 10}%` }} />
        <span className="insights-noted-dot is-with" style={{ left: `${factor.avg_with * 10}%` }} />
        <span className="insights-noted-tick" style={{ left: 0 }}>0</span>
        <span className="insights-noted-tick" style={{ left: "100%" }}>10</span>
      </div>
    </li>
  );
}

export function PatternsCard({ insights }) {
  const { status, data } = insights;
  const conditions = data?.conditions || [];
  const noted = data?.noted || [];
  const basis = data?.patterns_basis;

  return (
    <section className="insights-card" aria-labelledby="insights-patterns-title">
      <div className="insights-head">
        <div>
          <h2 id="insights-patterns-title">Possible patterns</h2>
          <p className="insights-sub">How your symptom level changed with conditions and with things you noted. Patterns, not causes.</p>
        </div>
        {basis && basis.check_ins > 0 && (
          <span className="insights-eyebrow">
            From {basis.check_ins} check-ins since {new Date(`${basis.since}T00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        )}
      </div>

      {status === "loading" && <p className="insights-sub">Looking through your check-ins…</p>}
      {status === "error" && <p className="insights-sub">Patterns aren't available right now. Please try again later.</p>}

      {status === "success" && (
        <>
          <div className="insights-conditions">
            {conditions.map((curve) => <ConditionPanel key={curve.key} curve={curve} />)}
          </div>

          <h3 className="insights-noted-title">Things you noted</h3>
          {noted.length > 0 ? (
            <>
              <div className="insights-noted-legend">
                <span><i className="insights-noted-dot is-with" />Days with it</span>
                <span><i className="insights-noted-dot is-without" />Other days</span>
              </div>
              <ul className="insights-noted">{noted.map((factor) => <NotedRow key={factor.key} factor={factor} />)}</ul>
            </>
          ) : (
            <p className="insights-empty">
              Nothing to compare yet. Triggers and plans show up here once you've logged them on at least{" "}
              {basis?.min_noted_days || 5} days.
            </p>
          )}

          <p className="insights-fine">
            Symptom level is the day's highest 0–10 score, or an estimate from your four check-in answers when you didn't
            add scores. Conditions are the day's forecast for your area. Faded points are based on fewer than{" "}
            {basis?.min_point_days || 3} days. Talk with your clinician before changing anything based on this.
          </p>
        </>
      )}
    </section>
  );
}

import { useMemo } from "react";

type Curve = {
  per_day: Record<string, { time: string; density: number }[]>;
  live: { time: string; density: number }[];
};

type Blackout = { start: string; end: string };

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

type Props = {
  curve: Curve;
  blackouts: Record<DayKey, Blackout[]>;
  selectedDay: DayKey;
  onDayChange: (day: DayKey) => void;
  curveDay: DayKey;
};

const DAY_LABELS: Record<DayKey, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

const W = 720;
const H = 220;
const PAD_L = 40;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 28;

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function DemandCurveChart({ curve, blackouts, selectedDay, onDayChange, curveDay }: Props) {
  const showLive = selectedDay === curveDay && curve.live.length > 0;

  const { xMin, xMax, points, livePoints, dayBlackouts } = useMemo(() => {
    const dayPoints = curve.per_day[selectedDay] ?? [];
    const all = [...dayPoints, ...curve.live];
    const times = all.map((p) => timeToMin(p.time));
    const xMinV = Math.min(...times, 8 * 60);
    const xMaxV = Math.max(...times, 19 * 60);
    return {
      xMin: xMinV,
      xMax: xMaxV,
      points: dayPoints,
      livePoints: curve.live,
      dayBlackouts: blackouts[selectedDay] ?? [],
    };
  }, [curve, blackouts, selectedDay]);

  const x = (minute: number) => PAD_L + ((minute - xMin) / Math.max(1, xMax - xMin)) * (W - PAD_L - PAD_R);
  const y = (density: number) => PAD_T + (1 - density / 100) * (H - PAD_T - PAD_B);

  const path = (pts: { time: string; density: number }[]) =>
    pts
      .map((p, i) => `${i === 0 ? "M" : "L"} ${x(timeToMin(p.time)).toFixed(1)} ${y(p.density).toFixed(1)}`)
      .join(" ");

  const baselineArea = points.length
    ? `M ${x(timeToMin(points[0].time)).toFixed(1)} ${(H - PAD_B).toFixed(1)} ` +
      points
        .map((p) => `L ${x(timeToMin(p.time)).toFixed(1)} ${y(p.density).toFixed(1)}`)
        .join(" ") +
      ` L ${x(timeToMin(points[points.length - 1].time)).toFixed(1)} ${(H - PAD_B).toFixed(1)} Z`
    : "";

  const ticks = [0, 25, 50, 75, 100];
  const hourTicks: number[] = [];
  for (let h = Math.ceil(xMin / 60); h <= Math.floor(xMax / 60); h++) hourTicks.push(h * 60);

  const days: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

  return (
    <div className="ob-chart">
      <div className="ob-chart-tabs" role="tablist">
        {days.map((d) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={d === selectedDay}
            className={`ob-chart-tab ${d === selectedDay ? "is-active" : ""} ${blackouts[d]?.length ? "has-data" : ""}`}
            onClick={() => onDayChange(d)}
          >
            <span>{DAY_LABELS[d]}</span>
            {blackouts[d]?.length ? <span className="ob-chart-tab-dot" aria-hidden /> : null}
          </button>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Demand curve" className="ob-chart-svg">
        {ticks.map((t) => (
          <line
            key={`y-${t}`}
            x1={PAD_L}
            x2={W - PAD_R}
            y1={y(t)}
            y2={y(t)}
            className="ob-chart-grid"
          />
        ))}
        {ticks.map((t) => (
          <text key={`yl-${t}`} x={PAD_L - 8} y={y(t) + 4} className="ob-chart-axis-label" textAnchor="end">
            {t}
          </text>
        ))}
        {hourTicks.map((m) => (
          <text key={`xl-${m}`} x={x(m)} y={H - 8} className="ob-chart-axis-label" textAnchor="middle">
            {`${(m / 60).toString().padStart(2, "0")}:00`}
          </text>
        ))}

        {dayBlackouts.map((b, i) => (
          <rect
            key={`bl-${i}`}
            x={x(timeToMin(b.start))}
            y={PAD_T}
            width={Math.max(0, x(timeToMin(b.end)) - x(timeToMin(b.start)))}
            height={H - PAD_T - PAD_B}
            className="ob-chart-blackout"
          />
        ))}

        {points.length > 1 ? (
          <>
            <path d={baselineArea} className="ob-chart-baseline-area" />
            <path d={path(points)} className="ob-chart-baseline-line" />
          </>
        ) : null}
        {showLive && livePoints.length > 1 ? (
          <path d={path(livePoints)} className="ob-chart-live-line" />
        ) : null}
      </svg>

      <div className="ob-chart-legend">
        <span className="ob-chart-legend-item">
          <span className="ob-chart-legend-dot is-baseline" /> Typical
        </span>
        {showLive ? (
          <span className="ob-chart-legend-item">
            <span className="ob-chart-legend-dot is-live" /> Live this week
          </span>
        ) : null}
        {dayBlackouts.length ? (
          <span className="ob-chart-legend-item">
            <span className="ob-chart-legend-dot is-blackout" /> Detected peak (no offers)
          </span>
        ) : null}
      </div>

      {dayBlackouts.length ? (
        <p className="ob-chart-caption">
          Peak window
          {dayBlackouts.length === 1 ? "" : "s"}:{" "}
          {dayBlackouts.map((b) => `${b.start}–${b.end}`).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}

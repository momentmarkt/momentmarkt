/*
 * Dual-handle percentage range. Two stacked native range inputs share one
 * track; the area between them fills with a cocoa→spark gradient. Floating
 * value bubbles ride above each thumb.
 */

type Props = {
  floor: number;
  ceiling: number;
  min?: number;
  max?: number;
  step?: number;
  onFloor: (n: number) => void;
  onCeiling: (n: number) => void;
  floorLabel?: string;
  ceilingLabel?: string;
};

export function RangeSlider({
  floor,
  ceiling,
  min = 0,
  max = 50,
  step = 1,
  onFloor,
  onCeiling,
  floorLabel = "Floor",
  ceilingLabel = "Ceiling",
}: Props) {
  const span = Math.max(1, max - min);
  const floorPct = ((floor - min) / span) * 100;
  const ceilingPct = ((ceiling - min) / span) * 100;

  return (
    <div className="ob-range">
      <div className="ob-range-bubbles">
        <span
          className="ob-range-bubble is-floor"
          style={{ left: `${floorPct}%` }}
        >
          <small>{floorLabel}</small>
          <strong>{floor}%</strong>
        </span>
        <span
          className="ob-range-bubble is-ceiling"
          style={{ left: `${ceilingPct}%` }}
        >
          <small>{ceilingLabel}</small>
          <strong>{ceiling}%</strong>
        </span>
      </div>

      <div className="ob-range-track">
        <span
          className="ob-range-fill"
          style={{
            left: `${floorPct}%`,
            width: `${Math.max(0, ceilingPct - floorPct)}%`,
          }}
        />
        <input
          type="range"
          className="ob-range-input is-floor"
          min={min}
          max={max}
          step={step}
          value={floor}
          aria-label={`${floorLabel} (${floor} percent)`}
          onChange={(e) => onFloor(Number(e.target.value))}
        />
        <input
          type="range"
          className="ob-range-input is-ceiling"
          min={min}
          max={max}
          step={step}
          value={ceiling}
          aria-label={`${ceilingLabel} (${ceiling} percent)`}
          onChange={(e) => onCeiling(Number(e.target.value))}
        />
      </div>

      <div className="ob-range-axis" aria-hidden>
        <span>{min}%</span>
        <span>{Math.round(min + span / 2)}%</span>
        <span>{max}%</span>
      </div>
    </div>
  );
}

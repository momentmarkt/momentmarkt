/*
 * Bounds — the merchant's contract with the assistant. Discount range is a
 * dual-thumb slider, allowed categories pull from the merchant's menu, and
 * blackout windows are a list (any number of start/end ranges). Brand tone is
 * a free-text guidance field. Opening hours live in Settings.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { getMenuCategories } from "../data/merchantMenu";

const SLIDER_MAX = 50;

type BlackoutWindow = { id: string; start: string; end: string };

const initialBlackouts: BlackoutWindow[] = [
  { id: "bl-1", start: "12:00", end: "13:00" },
];

export function BoundsSection() {
  const menuCategories = useMemo(() => getMenuCategories(), []);
  const defaultActive = useMemo(
    () => menuCategories.slice(0, Math.min(2, menuCategories.length)).map((c) => c.id),
    [menuCategories],
  );

  const [floor, setFloor] = useState(5);
  const [ceiling, setCeiling] = useState(20);
  const [cats, setCats] = useState<string[]>(defaultActive);
  const [blackouts, setBlackouts] = useState<BlackoutWindow[]>(initialBlackouts);
  const [tone, setTone] = useState(
    "Polite, no urgency language. Mention Berlin neighbourhood warmth where it fits.",
  );

  const addBlackout = () =>
    setBlackouts((b) => [...b, { id: `bl-${Date.now()}`, start: "18:00", end: "19:00" }]);
  const removeBlackout = (id: string) => setBlackouts((b) => b.filter((w) => w.id !== id));
  const updateBlackout = (id: string, patch: Partial<BlackoutWindow>) =>
    setBlackouts((b) => b.map((w) => (w.id === id ? { ...w, ...patch } : w)));

  return (
    <div className="section-body">
      <header className="section-head">
        <div className="section-head-text">
          <span className="eyebrow">Bounds</span>
          <h1>Your contract with the assistant</h1>
          <p className="lead">
            You don't write offer copy. You set the discount range you'll tolerate, the
            categories you participate in, and the windows when nothing should fire. We
            generate every offer in real time inside these bounds.
          </p>
        </div>
      </header>

      <section className="bounds-grid">
        <article className="bounds-card bounds-card-wide">
          <h2>Discount range</h2>
          <p className="bounds-help">
            Drag either end. Floor is the smallest discount we'll start at; ceiling is the
            largest we'll ever go, even after a customer pushes back.
          </p>
          <DualSlider
            min={0}
            max={SLIDER_MAX}
            floor={floor}
            ceiling={ceiling}
            onChange={(f, c) => {
              setFloor(f);
              setCeiling(c);
            }}
          />
          <div className="bounds-range-foot">
            <span><strong>{floor}%</strong> floor</span>
            <span className="bounds-range-band">{ceiling - floor}% band</span>
            <span><strong>{ceiling}%</strong> ceiling</span>
          </div>
        </article>

        <article className="bounds-card bounds-card-wide">
          <h2>Allowed categories</h2>
          <p className="bounds-help">
            Pulled from your menu. Tap to opt categories in or out — we only generate offers
            for the ones you've selected.
          </p>
          <div className="chip-row">
            {menuCategories.map((c) => {
              const on = cats.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`chip ${on ? "is-on" : ""}`}
                  onClick={() =>
                    setCats((current) =>
                      on ? current.filter((id) => id !== c.id) : [...current, c.id],
                    )
                  }
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </article>

        <article className="bounds-card bounds-card-wide">
          <h2>Blackout windows</h2>
          <p className="bounds-help">
            Hours where you're already full and don't want offers fired. Add as many as you
            need — peak lunch, school pick-up, anything that puts pressure on the counter.
          </p>
          <ul className="blackout-list">
            {blackouts.map((w) => (
              <li key={w.id} className="blackout-row">
                <input
                  type="time"
                  className="blackout-input"
                  aria-label="Start time"
                  value={w.start}
                  onChange={(e) => updateBlackout(w.id, { start: e.target.value })}
                />
                <span className="blackout-dash" aria-hidden>
                  —
                </span>
                <input
                  type="time"
                  className="blackout-input"
                  aria-label="End time"
                  value={w.end}
                  onChange={(e) => updateBlackout(w.id, { end: e.target.value })}
                />
                <button
                  type="button"
                  className="blackout-remove"
                  onClick={() => removeBlackout(w.id)}
                  aria-label="Remove window"
                  disabled={blackouts.length === 1}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="ghost-button blackout-add" onClick={addBlackout}>
            + Add window
          </button>
        </article>

        <article className="bounds-card bounds-card-wide">
          <h2>Brand tone</h2>
          <p className="bounds-help">
            Free-text guidance we weave into every generated headline. Keep it short.
          </p>
          <textarea
            className="bounds-textarea"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            rows={3}
          />
        </article>
      </section>

      <footer className="section-foot">
        <span className="foot-meta">
          Last saved: <strong>2026-04-25 11:08</strong> · 4 offers generated under these bounds today
        </span>
        <button type="button" className="primary-button">
          Save bounds
        </button>
      </footer>
    </div>
  );
}

/* ── dual-thumb slider ──────────────────────────────────────────────────── */

function DualSlider({
  min,
  max,
  floor,
  ceiling,
  onChange,
}: {
  min: number;
  max: number;
  floor: number;
  ceiling: number;
  onChange: (floor: number, ceiling: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<null | "floor" | "ceiling">(null);

  useEffect(() => {
    if (!drag) return;
    const handleMove = (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const value = Math.round(min + ratio * (max - min));
      if (drag === "floor") {
        onChange(Math.min(value, ceiling - 1), ceiling);
      } else {
        onChange(floor, Math.max(value, floor + 1));
      }
    };
    const onMouse = (e: MouseEvent) => handleMove(e.clientX);
    const onTouch = (e: TouchEvent) => {
      if (e.touches[0]) handleMove(e.touches[0].clientX);
    };
    const stop = () => setDrag(null);
    window.addEventListener("mousemove", onMouse);
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchmove", onTouch);
    window.addEventListener("touchend", stop);
    return () => {
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("touchend", stop);
    };
  }, [drag, min, max, floor, ceiling, onChange]);

  const floorPct = ((floor - min) / (max - min)) * 100;
  const ceilingPct = ((ceiling - min) / (max - min)) * 100;

  const onKey = (which: "floor" | "ceiling") => (e: React.KeyboardEvent) => {
    let delta = 0;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") delta = -1;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") delta = 1;
    if (!delta) return;
    e.preventDefault();
    if (which === "floor") onChange(Math.max(min, Math.min(floor + delta, ceiling - 1)), ceiling);
    else onChange(floor, Math.min(max, Math.max(ceiling + delta, floor + 1)));
  };

  return (
    <div className="dual-slider" ref={trackRef}>
      <div className="dual-slider-track" />
      <div
        className="dual-slider-fill"
        style={{ left: `${floorPct}%`, width: `${ceilingPct - floorPct}%` }}
      />
      <button
        type="button"
        className="dual-slider-thumb is-floor"
        style={{ left: `${floorPct}%` }}
        aria-label={`Floor ${floor}%`}
        aria-valuenow={floor}
        aria-valuemin={min}
        aria-valuemax={max}
        onMouseDown={() => setDrag("floor")}
        onTouchStart={() => setDrag("floor")}
        onKeyDown={onKey("floor")}
      >
        <span>{floor}%</span>
      </button>
      <button
        type="button"
        className="dual-slider-thumb is-ceiling"
        style={{ left: `${ceilingPct}%` }}
        aria-label={`Ceiling ${ceiling}%`}
        aria-valuenow={ceiling}
        aria-valuemin={min}
        aria-valuemax={max}
        onMouseDown={() => setDrag("ceiling")}
        onTouchStart={() => setDrag("ceiling")}
        onKeyDown={onKey("ceiling")}
      >
        <span>{ceiling}%</span>
      </button>
    </div>
  );
}

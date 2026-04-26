import type { ExtractedMenu, LimitsBody } from "../api/onboardingApi";
import { RangeSlider } from "./RangeSlider";

type Props = {
  menu: ExtractedMenu;
  value: LimitsBody;
  onChange: (next: LimitsBody) => void;
};

const DEFAULT_RULES = [
  {
    id: "rain_hot_drink",
    label: "Rain + hot drinks",
    hint: "Surface a hot-drink offer when rain is rolling in.",
  },
  {
    id: "demand_gap_lunch",
    label: "Lunch demand gap",
    hint: "Surface when foot traffic is well below your typical lunch.",
  },
];

export function LimitsPanel({ menu, value, onChange }: Props) {
  const toggleCategory = (id: string) => {
    const next = value.categories.includes(id)
      ? value.categories.filter((c) => c !== id)
      : [...value.categories, id];
    onChange({ ...value, categories: next });
  };

  const setFloor = (n: number) => {
    onChange({ ...value, discount_floor: Math.min(n, value.discount_ceiling - 1) });
  };
  const setCeiling = (n: number) => {
    onChange({ ...value, discount_ceiling: Math.max(n, value.discount_floor + 1) });
  };

  const toggleRule = (id: string) => {
    const next = value.auto_approve_rules.includes(id)
      ? value.auto_approve_rules.filter((r) => r !== id)
      : [...value.auto_approve_rules, id];
    onChange({ ...value, auto_approve_rules: next });
  };

  return (
    <div className="ob-limits">
      <article className="ob-card">
        <h2>Allowed categories</h2>
        <p className="ob-muted">Only items in these categories can appear in offers.</p>
        <div className="chip-row">
          {menu.categories.map((c) => {
            const on = value.categories.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                className={`chip ${on ? "is-on" : ""}`}
                onClick={() => toggleCategory(c.id)}
                aria-pressed={on}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </article>

      <article className="ob-card">
        <h2>Discount range</h2>
        <p className="ob-muted">
          The lowest you'd ever start at, and the highest you'd ever go.
        </p>

        <RangeSlider
          floor={value.discount_floor}
          ceiling={value.discount_ceiling}
          min={0}
          max={50}
          onFloor={setFloor}
          onCeiling={setCeiling}
        />
      </article>

      <article className="ob-card ob-auto">
        <header className="ob-auto-head">
          <div>
            <h2>Auto-approve</h2>
            <p className="ob-muted">
              Skip the inbox when one of your trusted rules matches. Otherwise everything
              waits for one tap.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={value.auto_approve}
            className={`ob-switch ${value.auto_approve ? "is-on" : ""}`}
            onClick={() => onChange({ ...value, auto_approve: !value.auto_approve })}
          >
            <span className="ob-switch-thumb" aria-hidden />
            <span className="sr-only">{value.auto_approve ? "On" : "Off"}</span>
          </button>
        </header>

        <div className={`ob-auto-rules ${value.auto_approve ? "" : "is-disabled"}`} aria-hidden={!value.auto_approve}>
          <span className="ob-auto-rules-label">Trusted rules</span>
          <ul>
            {DEFAULT_RULES.map((r) => {
              const on = value.auto_approve_rules.includes(r.id);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    disabled={!value.auto_approve}
                    className={`ob-auto-rule ${on ? "is-on" : ""}`}
                    onClick={() => toggleRule(r.id)}
                  >
                    <span className="ob-auto-rule-check" aria-hidden>
                      {on ? "✓" : ""}
                    </span>
                    <span className="ob-auto-rule-content">
                      <strong>{r.label}</strong>
                      <small>{r.hint}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </article>
    </div>
  );
}

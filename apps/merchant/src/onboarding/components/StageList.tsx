import type { StageView } from "../api/onboardingApi";

export function StageList({ stages }: { stages: StageView[] }) {
  return (
    <ol className="ob-stages" aria-label="Processing stages">
      {stages.map((s) => (
        <li key={s.id} className={`ob-stage is-${s.status}`}>
          <span className="ob-stage-icon" aria-hidden>
            {s.status === "done" ? "✓" : s.status === "active" ? <span className="ob-spinner" /> : s.status === "error" ? "!" : ""}
          </span>
          <span className="ob-stage-label">{s.label}</span>
          <span className="ob-stage-status">{s.status}</span>
        </li>
      ))}
    </ol>
  );
}

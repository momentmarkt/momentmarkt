import { STEP_LABEL, STEP_ORDER, type StepId } from "../state/onboardingMachine";

export function ProgressStepper({ active }: { active: StepId }) {
  const activeIdx = STEP_ORDER.indexOf(active);
  return (
    <ol className="ob-stepper" aria-label="Onboarding progress">
      {STEP_ORDER.map((step, idx) => {
        const state = idx < activeIdx ? "done" : idx === activeIdx ? "active" : "pending";
        return (
          <li key={step} className={`ob-stepper-item is-${state}`} aria-current={state === "active" ? "step" : undefined}>
            <span className="ob-stepper-dot" aria-hidden>
              {state === "done" ? "✓" : idx + 1}
            </span>
            <span className="ob-stepper-label">{STEP_LABEL[step]}</span>
            {idx < STEP_ORDER.length - 1 ? <span className="ob-stepper-bar" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}

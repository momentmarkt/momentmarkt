/*
 * Onboarding wizard shell. Routes between the 5 steps based on machine state.
 * First-run gate via localStorage["merchant_onboarded"]; once cleared, this
 * shell mounts; on POST /complete it sets the flag and the dashboard takes over.
 */

import { useCallback, useReducer } from "react";
import { ProgressStepper } from "./components/ProgressStepper";
import { initialState, reduce, setOnboarded } from "./state/onboardingMachine";
import { DropStep } from "./steps/DropStep";
import { MenuConfirmStep } from "./steps/MenuConfirmStep";
import { ProcessingStep } from "./steps/ProcessingStep";
import { postComplete } from "./api/onboardingApi";

type Props = {
  onComplete: (merchantId: string) => void;
};

export function OnboardingShell({ onComplete }: Props) {
  const [state, dispatch] = useReducer(reduce, initialState);

  const handleStarted = useCallback(
    (args: { onboardingId: string; merchantId: string; fileName: string; gmapsUrl: string }) => {
      dispatch({ type: "started", ...args });
    },
    [],
  );

  const onMenuReady = useCallback(
    (menu: import("./api/onboardingApi").ExtractedMenu) => {
      dispatch({ type: "menu_loaded", menu });
      dispatch({ type: "advance", to: "menu" });
    },
    [],
  );

  const onError = useCallback((message: string) => {
    dispatch({ type: "error", message });
  }, []);

  const completeNow = useCallback(async () => {
    if (!state.onboardingId) return;
    try {
      const res = await postComplete(state.onboardingId);
      setOnboarded(res.merchant_id);
      onComplete(res.merchant_id);
    } catch (err) {
      dispatch({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, [state.onboardingId, onComplete]);

  return (
    <main className="ob-shell">
      <header className="ob-shell-head">
        <div className="ob-brand">
          <span className="rail-mark" aria-hidden>
            <span className="rail-mark-dot" />
          </span>
          <div>
            <span className="eyebrow">MomentMarkt</span>
            <strong>Merchant onboarding</strong>
          </div>
        </div>
        <ProgressStepper active={state.step} />
      </header>

      <section className="ob-canvas">
        {state.step === "drop" ? <DropStep onStarted={handleStarted} /> : null}
        {state.step === "processing" && state.onboardingId ? (
          <ProcessingStep
            onboardingId={state.onboardingId}
            onMenuReady={onMenuReady}
            onError={onError}
          />
        ) : null}

        {state.step === "menu" && state.onboardingId && state.menu ? (
          <MenuConfirmStep
            onboardingId={state.onboardingId}
            menu={state.menu}
            onMenuChange={(next) => dispatch({ type: "menu_updated", menu: next })}
            onConfirm={() => dispatch({ type: "advance", to: "hours" })}
          />
        ) : null}

        {state.step === "hours" ? (
          <PlaceholderStep
            title="Hours and blackouts"
            details="We'll show your opening hours and the times you're already at capacity. Coming up next."
            onAdvance={() => dispatch({ type: "advance", to: "flow" })}
          />
        ) : null}

        {state.step === "flow" ? (
          <PlaceholderStep
            title="How MomentMarkt works for your shop"
            details="A short tour of how offers get drafted, approved, and surfaced to nearby customers."
            onAdvance={completeNow}
            advanceLabel="Start receiving opportunities"
          />
        ) : null}

        {state.error ? (
          <p className="ob-error" role="alert">
            Onboarding error: {state.error}
          </p>
        ) : null}
      </section>
    </main>
  );
}

function PlaceholderStep({
  title,
  details,
  onAdvance,
  advanceLabel = "Continue",
  menu,
}: {
  title: string;
  details: string;
  onAdvance: () => void;
  advanceLabel?: string;
  menu?: import("./api/onboardingApi").ExtractedMenu | null;
}) {
  return (
    <section className="ob-step ob-placeholder">
      <header className="ob-step-head">
        <h1>{title}</h1>
        <p className="lead">{details}</p>
      </header>

      {menu ? (
        <ul className="ob-menu-preview">
          {menu.categories.map((c) => (
            <li key={c.id}>
              <strong>{c.label}</strong>
              <small>{c.items.length} items</small>
              <ul>
                {c.items.slice(0, 4).map((item) => (
                  <li key={item.id}>
                    <span>{item.name}</span>
                    <span>€{item.price_eur.toFixed(2)}</span>
                  </li>
                ))}
                {c.items.length > 4 ? <li className="ob-muted">+{c.items.length - 4} more…</li> : null}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}

      <footer className="ob-step-foot">
        <button type="button" className="primary-button" onClick={onAdvance}>
          {advanceLabel}
        </button>
      </footer>
    </section>
  );
}

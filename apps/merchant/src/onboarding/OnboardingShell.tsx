/*
 * Onboarding wizard shell. Routes between the 5 steps based on machine state.
 * First-run gate via localStorage["merchant_onboarded"]; once cleared, this
 * shell mounts; on POST /complete it sets the flag and the dashboard takes over.
 */

import { useCallback, useReducer } from "react";
import { ProgressStepper } from "./components/ProgressStepper";
import { initialState, reduce, setOnboarded } from "./state/onboardingMachine";
import { DropStep } from "./steps/DropStep";
import { FlowIntroStep } from "./steps/FlowIntroStep";
import { HoursStep } from "./steps/HoursStep";
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
      <a className="ob-mark" href="#" aria-label="MomentMarkt">
        <img src="/logo.svg" alt="" className="ob-mark-glyph" />
      </a>

      <div className="ob-frame">
        <ProgressStepper active={state.step} />

        <section className="ob-canvas" aria-live="polite">
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

          {state.step === "hours" && state.onboardingId ? (
            <HoursStep
              onboardingId={state.onboardingId}
              onConfirm={(h) => {
                dispatch({ type: "hours_loaded", hours: h });
                dispatch({ type: "advance", to: "flow" });
              }}
            />
          ) : null}

          {state.step === "flow" && state.onboardingId && state.menu ? (
            <FlowIntroStep
              onboardingId={state.onboardingId}
              menu={state.menu}
              onComplete={completeNow}
            />
          ) : null}

          {state.error ? (
            <p className="ob-error" role="alert">
              Something went wrong: {state.error}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}


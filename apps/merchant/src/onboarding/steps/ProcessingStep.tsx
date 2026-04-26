import { useEffect, useRef, useState } from "react";
import { fetchMenu, fetchStatus, type ExtractedMenu, type StatusResponse } from "../api/onboardingApi";
import { StageList } from "../components/StageList";

const POLL_MS = 600;

type Props = {
  onboardingId: string;
  onMenuReady: (menu: ExtractedMenu) => void;
  onError: (msg: string) => void;
};

export function ProcessingStep({ onboardingId, onMenuReady, onError }: Props) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const s = await fetchStatus(onboardingId);
        if (cancelled) return;
        setStatus(s);
        if (s.error) {
          onError(s.error);
          return;
        }
        const allDone = s.stages.every((stage) => stage.status === "done");
        if (allDone && !fired.current) {
          fired.current = true;
          const menu = await fetchMenu(onboardingId);
          if (!cancelled) onMenuReady(menu);
          return;
        }
        timer = setTimeout(tick, POLL_MS);
      } catch (err) {
        if (!cancelled) onError(err instanceof Error ? err.message : String(err));
      }
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [onboardingId, onMenuReady, onError]);

  return (
    <section className="ob-step ob-processing">
      <header className="ob-step-head">
        <span className="eyebrow">Processing</span>
        <h1>Reading your shop.</h1>
        <p className="lead">
          We'll narrate each step so you know what we're touching. You can edit the
          extracted menu in a moment.
        </p>
      </header>

      {status ? (
        <StageList stages={status.stages} />
      ) : (
        <p className="ob-muted">Connecting…</p>
      )}
    </section>
  );
}

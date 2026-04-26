import { useRef, useState } from "react";
import { startOnboarding } from "../api/onboardingApi";

const GMAPS_URL_RE = /^https?:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.app\.goo\.gl)\//i;

function MenuIcon() {
  return (
    <svg className="ob-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 4h14v16H5z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg className="ob-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

type Props = {
  onStarted: (args: { onboardingId: string; merchantId: string; fileName: string; gmapsUrl: string }) => void;
};

export function DropStep({ onStarted }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragState = useState(false);
  const [dragging, setDragging] = dragState;

  const validUrl = GMAPS_URL_RE.test(url.trim());
  const validFile = !!file && file.size > 0 && file.size <= 5 * 1024 * 1024;
  const canSubmit = validUrl && validFile && !submitting;

  const handleFile = (f: File | null) => {
    if (!f) {
      setFile(null);
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError("File too large (max 5MB).");
      return;
    }
    setError(null);
    setFile(f);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await startOnboarding(file, url.trim());
      onStarted({
        onboardingId: res.onboarding_id,
        merchantId: res.merchant_id,
        fileName: file.name,
        gmapsUrl: url.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <form className="ob-step ob-drop" onSubmit={onSubmit}>
      <header className="ob-step-head">
        <span className="eyebrow">Welcome</span>
        <h1>Drop your menu and your Google Maps link.</h1>
        <p className="lead">
          We'll read the menu, pull your storefront details, import the last 90 days of
          card transactions for your area, and show you the demand pattern your shop
          actually follows. About 15 seconds.
        </p>
      </header>

      <div className="ob-drop-grid">
        <label
          className={`ob-drop-zone ${dragging ? "is-drag" : ""} ${file ? "is-set" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) handleFile(dropped);
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.txt,.md"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            hidden
          />
          <span className="eyebrow ob-input-label"><MenuIcon /> Menu</span>
          {file ? (
            <>
              <strong className="ob-drop-filename">{file.name}</strong>
              <small>{(file.size / 1024).toFixed(1)} KB</small>
              <button type="button" className="ob-link" onClick={() => fileRef.current?.click()}>
                Replace
              </button>
            </>
          ) : (
            <>
              <strong>Drop a PDF, image, or .txt</strong>
              <small>or click to browse · up to 5 MB</small>
              <button type="button" className="ob-link" onClick={() => fileRef.current?.click()}>
                Choose file
              </button>
            </>
          )}
        </label>

        <label className="ob-drop-field">
          <span className="eyebrow ob-input-label"><PinIcon /> Google Maps link</span>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://maps.app.goo.gl/…"
            autoComplete="url"
            inputMode="url"
          />
          <small className={validUrl || url.length === 0 ? "" : "is-warn"}>
            {url.length === 0
              ? "Find your shop on Google Maps and paste the share link."
              : validUrl
                ? "Looks like a Google Maps link."
                : "That doesn't look like a Google Maps link."}
          </small>
        </label>
      </div>

      {error ? <p className="ob-error" role="alert">{error}</p> : null}

      <footer className="ob-step-foot">
        <button type="submit" className="primary-button" disabled={!canSubmit}>
          {submitting ? "Starting…" : "Process"}
        </button>
      </footer>
    </form>
  );
}

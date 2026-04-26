import { useRef, useState } from "react";
import { postMenuAgent, type ExtractedMenu } from "../api/onboardingApi";

type Msg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  diffsApplied?: number;
};

type Props = {
  onboardingId: string;
  onMenuUpdated: (menu: ExtractedMenu) => void;
};

const SUGGESTIONS = [
  "Rename Espresso to Caffè",
  "Set all croissants to €3.50",
  "Move Iced Latte to Hot Drinks",
  "Add a photo placeholder for the pastries",
];

export function AgentChat({ onboardingId, onMenuUpdated }: Props) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: "m0",
      role: "assistant",
      text:
        "Hi — I'll edit your menu. Try: 'rename Espresso to Caffè', 'set all croissants to €3.50', or 'add a photo placeholder for the pastries'.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const counter = useRef(1);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const userMsg: Msg = { id: `u${counter.current++}`, role: "user", text: trimmed };
    setMessages((m) => [...m, userMsg]);
    setDraft("");
    setBusy(true);
    try {
      const res = await postMenuAgent(onboardingId, trimmed);
      onMenuUpdated(res.menu);
      setMessages((m) => [
        ...m,
        {
          id: `a${counter.current++}`,
          role: "assistant",
          text: res.reply,
          diffsApplied: res.diffs.length,
        },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: `a${counter.current++}`,
          role: "assistant",
          text: err instanceof Error ? err.message : String(err),
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="ob-agent" aria-label="Menu assistant">
      <header>
        <span className="eyebrow">Menu assistant</span>
        <strong>Edit by chat</strong>
        <small>Bulk renames, prices, photos.</small>
      </header>

      <ol className="ob-agent-log">
        {messages.map((m) => (
          <li key={m.id} className={`ob-agent-msg is-${m.role}`}>
            <p>{m.text}</p>
            {m.diffsApplied ? (
              <small className="ob-agent-diff">applied {m.diffsApplied} change{m.diffsApplied === 1 ? "" : "s"}</small>
            ) : null}
          </li>
        ))}
        {busy ? (
          <li className="ob-agent-msg is-assistant is-busy">
            <p><span className="ob-spinner" aria-hidden /> thinking…</p>
          </li>
        ) : null}
      </ol>

      <div className="ob-agent-suggest">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            className="ob-chip"
            disabled={busy}
            onClick={() => send(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <form
        className="ob-agent-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Tell the agent what to change…"
          disabled={busy}
          aria-label="Message to menu agent"
        />
        <button type="submit" className="primary-button" disabled={busy || !draft.trim()}>
          Send
        </button>
      </form>
    </aside>
  );
}

import { useState } from "react";

type Node = { id: string; title: string; subtitle: string; explainer: string };

const NODES: Node[] = [
  {
    id: "bounds",
    title: "You set the limits",
    subtitle: "Categories, discount range, hours",
    explainer:
      "You decide which menu categories can be offered, the discount range you'd accept, and when your shop is open. Everything else is automatic.",
  },
  {
    id: "opportunity",
    title: "We watch for moments",
    subtitle: "Weather, demand, events",
    explainer:
      "When rain rolls in, an event lets out nearby, or your usual lunch crowd thins, we notice and start drafting an offer for your shop.",
  },
  {
    id: "draft",
    title: "An offer is drafted",
    subtitle: "Headline + image, inside your limits",
    explainer:
      "We write a short headline, pick a relevant image, and pick a discount inside your range. Nothing leaves your bounds.",
  },
  {
    id: "approve",
    title: "Approve in one tap",
    subtitle: "Or auto-approve repeats",
    explainer:
      "You see every draft and approve it with one tap. If you trust a recipe (e.g. rain + hot drinks), turn on auto-approve and it ships instantly.",
  },
  {
    id: "surface",
    title: "Shown to nearby people",
    subtitle: "Right moment, right block",
    explainer:
      "The offer surfaces only to nearby customers in the right context — never blasted to everyone. Quiet by default.",
  },
  {
    id: "negotiate",
    title: "We negotiate for you",
    subtitle: "Always inside your range",
    explainer:
      "If someone hesitates, we can nudge the discount up — but never below your floor and never above your ceiling. You stay in control of the math.",
  },
];

export function FlowDiagram() {
  const [activeId, setActiveId] = useState<string>(NODES[0].id);
  const active = NODES.find((n) => n.id === activeId) ?? NODES[0];

  return (
    <div className="ob-flow">
      <ol className="ob-flow-track">
        {NODES.map((n, i) => {
          const isActive = n.id === activeId;
          return (
            <li key={n.id} className={`ob-flow-node ${isActive ? "is-active" : ""}`}>
              <button
                type="button"
                onClick={() => setActiveId(n.id)}
                onMouseEnter={() => setActiveId(n.id)}
                aria-pressed={isActive}
              >
                <span className="ob-flow-num" aria-hidden>
                  {i + 1}
                </span>
                <span className="ob-flow-title">{n.title}</span>
                <span className="ob-flow-sub">{n.subtitle}</span>
              </button>
              {i < NODES.length - 1 ? <span className="ob-flow-arrow" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
      <p className="ob-flow-explainer">{active.explainer}</p>
    </div>
  );
}

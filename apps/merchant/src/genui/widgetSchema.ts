// Mirror of apps/mobile/src/genui/widgetSchema.ts. Kept structurally identical
// so a generated widget that validates on mobile validates here too — the
// merchant inbox MUST render exactly what the wallet renders.
export type WidgetNode =
  | {
      type: "View" | "ScrollView";
      className?: string;
      children?: WidgetNode[];
    }
  | {
      type: "Text";
      className?: string;
      text: string;
    }
  | {
      type: "Image";
      className?: string;
      source: string;
      accessibilityLabel: string;
    }
  | {
      type: "Pressable";
      className?: string;
      action: "redeem";
      text: string;
    };

const containerTypes = new Set(["View", "ScrollView"]);

export const fallbackWidgetSpec: WidgetNode = {
  type: "View",
  className: "rounded-[34px] bg-ink p-5",
  children: [
    {
      type: "Text",
      className: "text-xs font-bold uppercase tracking-[3px] text-cream/60",
      text: "Safe fallback",
    },
    {
      type: "Text",
      className: "mt-3 text-3xl font-black leading-9 text-cream",
      text: "MomentMarkt has a valid offer ready.",
    },
    {
      type: "Text",
      className: "mt-3 text-base leading-6 text-cream/80",
      text: "The generated widget failed validation, so the demo keeps a known-good redemption card.",
    },
    {
      type: "Pressable",
      className: "mt-5 rounded-2xl bg-cream px-5 py-4",
      action: "redeem",
      text: "Redeem safely",
    },
  ],
};

export function isWidgetNode(value: unknown, depth = 0): value is WidgetNode {
  if (!isRecord(value) || depth > 12) return false;

  if (typeof value.className !== "undefined" && typeof value.className !== "string") {
    return false;
  }

  if (containerTypes.has(String(value.type))) {
    return (
      typeof value.children === "undefined" ||
      (Array.isArray(value.children) &&
        value.children.every((child) => isWidgetNode(child, depth + 1)))
    );
  }

  if (value.type === "Text") {
    return typeof value.text === "string";
  }

  if (value.type === "Image") {
    return typeof value.source === "string" && typeof value.accessibilityLabel === "string";
  }

  if (value.type === "Pressable") {
    return value.action === "redeem" && typeof value.text === "string";
  }

  return false;
}

export function coerceWidgetNode(value: unknown): WidgetNode {
  return isWidgetNode(value) ? value : fallbackWidgetSpec;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

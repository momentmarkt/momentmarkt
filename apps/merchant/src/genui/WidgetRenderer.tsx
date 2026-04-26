import { coerceWidgetNode, type WidgetNode } from "./widgetSchema";
import { s } from "./styleTable";

type Props = {
  node: unknown;
  onRedeem?: () => void;
};

// Web port of apps/mobile/src/components/WidgetRenderer.tsx. Same schema,
// same className vocabulary — what the wallet renders is what the merchant
// sees here. View/ScrollView → div, Text → span, Image → img, Pressable →
// button. ScrollView gets overflowY:auto since the merchant card may be
// taller than the column.
export function WidgetRenderer({ node, onRedeem }: Props) {
  return <Render node={coerceWidgetNode(node)} onRedeem={onRedeem ?? (() => {})} />;
}

function Render({ node, onRedeem }: { node: WidgetNode; onRedeem: () => void }) {
  switch (node.type) {
    case "View":
      return (
        <div style={s(node.className)}>
          {node.children?.map((child, index) => (
            <Render key={index} node={child} onRedeem={onRedeem} />
          ))}
        </div>
      );
    case "ScrollView":
      return (
        <div style={{ ...s(node.className), overflowY: "auto" }}>
          {node.children?.map((child, index) => (
            <Render key={index} node={child} onRedeem={onRedeem} />
          ))}
        </div>
      );
    case "Text":
      return <span style={{ ...s(node.className), display: "block" }}>{node.text}</span>;
    case "Image":
      return (
        <img
          src={node.source}
          alt={node.accessibilityLabel}
          style={{ ...s(node.className), objectFit: "cover", display: "block" }}
        />
      );
    case "Pressable":
      return (
        <button
          type="button"
          onClick={onRedeem}
          style={{
            ...s(node.className),
            border: "none",
            cursor: "pointer",
            color: colors.cocoa,
            fontWeight: 900,
            fontSize: 16,
            textAlign: "center",
          }}
        >
          {node.text}
        </button>
      );
  }
}

// Small re-export so the Pressable default text color matches the mobile
// renderer's `text-cocoa` styling without re-importing the table here.
const colors = { cocoa: "#6f3f2c" };

/**
 * Stress tests for the consumer-side GenUI validator + coercion.
 *
 * Mirrors `apps/backend/tests/test_genui.py` because the same JSON shapes
 * cross the wire. The mobile renderer is unforgiving — an invalid widget
 * tree throws inside React Native, so `coerceWidgetNode` is the safety
 * rail that keeps the demo on screen.
 *
 * Runs as a plain Node script to match the existing
 * `redeem.test.ts` harness:
 *
 *   pnpm dlx tsx src/genui/__tests__/widgetSchema.test.ts
 */

import {
  coerceWidgetNode,
  fallbackWidgetSpec,
  isWidgetNode,
  type WidgetNode,
} from "../widgetSchema";

let failures = 0;

function assert(label: string, condition: boolean): void {
  if (condition) {
    // eslint-disable-next-line no-console
    console.log(`OK   ${label}`);
  } else {
    failures += 1;
    // eslint-disable-next-line no-console
    console.error(`FAIL ${label}`);
  }
}

function nestedView(depth: number): unknown {
  let node: unknown = { type: "Text", text: "leaf" };
  for (let i = 0; i < depth; i += 1) {
    node = { type: "View", children: [node] };
  }
  return node;
}

const validText: WidgetNode = { type: "Text", text: "Hi" };
const validImage: WidgetNode = {
  type: "Image",
  source: "https://example.com/x.jpg",
  accessibilityLabel: "alt",
};
const validPressable: WidgetNode = {
  type: "Pressable",
  action: "redeem",
  text: "Go",
};

// ---- accepts valid ----------------------------------------------------------
assert("accepts minimal Text", isWidgetNode(validText));
assert("accepts minimal Image", isWidgetNode(validImage));
assert("accepts minimal Pressable", isWidgetNode(validPressable));
assert(
  "accepts View with mixed children",
  isWidgetNode({
    type: "View",
    className: "p-5",
    children: [validText, validImage, validPressable],
  }),
);
assert(
  "accepts ScrollView with empty children",
  isWidgetNode({ type: "ScrollView", children: [] }),
);
assert(
  "accepts View with no children key at all",
  isWidgetNode({ type: "View" }),
);
assert("fallback widget validates", isWidgetNode(fallbackWidgetSpec));

// ---- rejects hostile inputs -------------------------------------------------
assert("rejects null", !isWidgetNode(null));
assert("rejects undefined", !isWidgetNode(undefined));
assert("rejects bare string", !isWidgetNode("Text"));
assert("rejects array", !isWidgetNode([validText]));
assert("rejects empty object", !isWidgetNode({}));
assert("rejects unknown type", !isWidgetNode({ type: "WebView", src: "x" }));
assert("rejects Text without text", !isWidgetNode({ type: "Text" }));
assert(
  "rejects Text with non-string text",
  !isWidgetNode({ type: "Text", text: 42 }),
);
assert(
  "rejects Image missing source",
  !isWidgetNode({ type: "Image", accessibilityLabel: "x" }),
);
assert(
  "rejects Image missing accessibilityLabel",
  !isWidgetNode({ type: "Image", source: "x" }),
);
assert(
  "rejects Pressable with non-redeem action",
  !isWidgetNode({ type: "Pressable", action: "dismiss", text: "x" }),
);
assert(
  "rejects Pressable without text",
  !isWidgetNode({ type: "Pressable", action: "redeem" }),
);
assert(
  "rejects View with non-array children",
  !isWidgetNode({ type: "View", children: "kids" }),
);
assert(
  "rejects View with one bad child",
  !isWidgetNode({
    type: "View",
    children: [validText, { type: "WebView" }],
  }),
);
assert(
  "rejects className wrong type",
  !isWidgetNode({ type: "Text", text: "x", className: 42 }),
);

// ---- depth bound ------------------------------------------------------------
assert("accepts depth 11 (within bound)", isWidgetNode(nestedView(11)));
assert("rejects depth 14 (over bound)", !isWidgetNode(nestedView(14)));
// Defends against runaway recursion if the LLM emits something absurd.
const startedAt = Date.now();
const tooDeep = !isWidgetNode(nestedView(1000));
const elapsed = Date.now() - startedAt;
assert("rejects depth 1000", tooDeep);
assert(
  "depth-1000 validation completes under 100ms",
  elapsed < 100,
);

// ---- coerceWidgetNode -------------------------------------------------------
const validTree: WidgetNode = {
  type: "View",
  children: [validText],
};
assert(
  "coerceWidgetNode passes valid tree through",
  coerceWidgetNode(validTree) === validTree,
);
assert(
  "coerceWidgetNode falls back on garbage",
  coerceWidgetNode({ type: "Garbage" }) === fallbackWidgetSpec,
);
assert(
  "coerceWidgetNode falls back on null",
  coerceWidgetNode(null) === fallbackWidgetSpec,
);

// ---- fallback identity is stable -------------------------------------------
const fallbackSnapshot = JSON.stringify(fallbackWidgetSpec);
coerceWidgetNode({ type: "Garbage" });
coerceWidgetNode(undefined);
assert(
  "fallback widget is not mutated by repeated coerce calls",
  JSON.stringify(fallbackWidgetSpec) === fallbackSnapshot,
);

// ---- exit -------------------------------------------------------------------
if (failures > 0) {
  // eslint-disable-next-line no-console
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
// eslint-disable-next-line no-console
console.log("\nAll widgetSchema tests passed.");

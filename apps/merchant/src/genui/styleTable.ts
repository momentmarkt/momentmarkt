import type { CSSProperties } from "react";

// Web mirror of the mobile s() helper (apps/mobile/src/styles.ts). Same token
// vocabulary, same color values — the merchant inbox renders generated widget
// JSON identically to the wallet so the demo's "merchant approved this →
// customer sees this" loop reads as one surface, not two.
//
// Token coverage focuses on what the Opportunity Agent actually emits today
// (rain widget + safe-fallback widget) plus headroom for what an LLM might
// reasonably generate inside the same vocabulary.

export const colors = {
  cream: "#fff8ee",
  ink: "#17120f",
  cocoa: "#6f3f2c",
  spark: "#f2542d",
  rain: "#356f95",
  white: "#ffffff",
  neutral600: "#525252",
  neutral200: "#e5e5e5",
};

const table: Record<string, CSSProperties> = {
  // layout
  "flex-1": { flex: 1 },
  "flex-row": { display: "flex", flexDirection: "row" },
  "items-center": { alignItems: "center" },
  "items-start": { alignItems: "flex-start" },
  "justify-center": { justifyContent: "center" },
  "justify-between": { justifyContent: "space-between" },
  "self-center": { alignSelf: "center" },
  "self-start": { alignSelf: "flex-start" },
  "self-stretch": { alignSelf: "stretch" },
  "text-center": { textAlign: "center" },
  uppercase: { textTransform: "uppercase" },

  // weights / families
  "font-light": { fontWeight: 300 },
  "font-semibold": { fontWeight: 600 },
  "font-bold": { fontWeight: 700 },
  "font-black": { fontWeight: 900 },

  // backgrounds
  "bg-cream": { backgroundColor: colors.cream },
  "bg-cream/10": { backgroundColor: "rgba(255, 248, 238, 0.1)" },
  "bg-cream/20": { backgroundColor: "rgba(255, 248, 238, 0.2)" },
  "bg-ink": { backgroundColor: colors.ink },
  "bg-cocoa": { backgroundColor: colors.cocoa },
  "bg-rain": { backgroundColor: colors.rain },
  "bg-spark": { backgroundColor: colors.spark },
  "bg-white": { backgroundColor: colors.white },
  "bg-white/10": { backgroundColor: "rgba(255, 255, 255, 0.1)" },
  "bg-white/15": { backgroundColor: "rgba(255, 255, 255, 0.15)" },
  "bg-white/20": { backgroundColor: "rgba(255, 255, 255, 0.2)" },
  "bg-white/40": { backgroundColor: "rgba(255, 255, 255, 0.4)" },

  // text colors
  "text-cream": { color: colors.cream },
  "text-cream/60": { color: "rgba(255, 248, 238, 0.6)" },
  "text-cream/70": { color: "rgba(255, 248, 238, 0.7)" },
  "text-cream/80": { color: "rgba(255, 248, 238, 0.8)" },
  "text-ink": { color: colors.ink },
  "text-cocoa": { color: colors.cocoa },
  "text-rain": { color: colors.rain },
  "text-spark": { color: colors.spark },
  "text-white": { color: colors.white },
  "text-white/60": { color: "rgba(255, 255, 255, 0.6)" },
  "text-white/70": { color: "rgba(255, 255, 255, 0.7)" },
  "text-white/80": { color: "rgba(255, 255, 255, 0.8)" },
  "text-neutral-600": { color: colors.neutral600 },

  // text sizes / line-heights / tracking
  "text-xs": { fontSize: 12 },
  "text-sm": { fontSize: 14 },
  "text-base": { fontSize: 16 },
  "text-2xl": { fontSize: 24 },
  "text-3xl": { fontSize: 30 },
  "text-4xl": { fontSize: 36 },
  "text-5xl": { fontSize: 48 },
  "text-[11px]": { fontSize: 11 },
  "text-[40px]": { fontSize: 40 },
  "leading-5": { lineHeight: "20px" },
  "leading-6": { lineHeight: "24px" },
  "leading-9": { lineHeight: "36px" },
  "leading-[44px]": { lineHeight: "44px" },
  "tracking-[1px]": { letterSpacing: 1 },
  "tracking-[2px]": { letterSpacing: 2 },
  "tracking-[3px]": { letterSpacing: 3 },

  // radius
  "rounded-full": { borderRadius: 999 },
  "rounded-2xl": { borderRadius: 16 },
  "rounded-3xl": { borderRadius: 24 },
  "rounded-[22px]": { borderRadius: 22 },
  "rounded-[32px]": { borderRadius: 32 },
  "rounded-[34px]": { borderRadius: 34 },
  "rounded-t-[34px]": { borderTopLeftRadius: 34, borderTopRightRadius: 34 },

  // size
  "h-1": { height: 4 },
  "w-1": { width: 4 },
  "h-2": { height: 8 },
  "w-2": { width: 8 },
  "h-9": { height: 36 },
  "w-9": { width: 36 },
  "h-10": { height: 40 },
  "w-10": { width: 40 },
  "h-32": { height: 128 },
  "w-32": { width: 128 },
  "h-36": { height: 144 },
  "h-44": { height: 176 },
  "h-72": { height: 288 },
  "w-72": { width: 288 },
  "w-full": { width: "100%" },

  // spacing — gaps
  "gap-1": { gap: 4 },
  "gap-2": { gap: 8 },
  "gap-3": { gap: 12 },
  "gap-4": { gap: 16 },

  // spacing — padding
  "p-4": { padding: 16 },
  "p-5": { padding: 20 },
  "p-6": { padding: 24 },
  "px-2": { paddingLeft: 8, paddingRight: 8 },
  "px-3": { paddingLeft: 12, paddingRight: 12 },
  "px-4": { paddingLeft: 16, paddingRight: 16 },
  "px-5": { paddingLeft: 20, paddingRight: 20 },
  "py-2": { paddingTop: 8, paddingBottom: 8 },
  "py-3": { paddingTop: 12, paddingBottom: 12 },
  "py-4": { paddingTop: 16, paddingBottom: 16 },
  "py-6": { paddingTop: 24, paddingBottom: 24 },
  "pl-3": { paddingLeft: 12 },
  "pl-4": { paddingLeft: 16 },
  "pr-2": { paddingRight: 8 },
  "pr-3": { paddingRight: 12 },
  "pr-4": { paddingRight: 16 },

  // spacing — margin (only the ones the agent emits today + small headroom)
  "mt-1": { marginTop: 4 },
  "mt-2": { marginTop: 8 },
  "mt-3": { marginTop: 12 },
  "mt-4": { marginTop: 16 },
  "mt-5": { marginTop: 20 },
  "mt-6": { marginTop: 24 },
  "mt-8": { marginTop: 32 },
  "mb-3": { marginBottom: 12 },
  "mb-4": { marginBottom: 16 },
  "mb-5": { marginBottom: 20 },

  // misc
  "opacity-50": { opacity: 0.5 },
  "opacity-60": { opacity: 0.6 },
  "opacity-70": { opacity: 0.7 },
  "overflow-hidden": { overflow: "hidden" },
};

export function s(...classNames: Array<string | false | null | undefined>): CSSProperties {
  const result: CSSProperties = {};
  for (const group of classNames) {
    if (!group) continue;
    for (const token of String(group).split(/\s+/)) {
      const style = table[token];
      if (style) Object.assign(result, style);
    }
  }
  return result;
}

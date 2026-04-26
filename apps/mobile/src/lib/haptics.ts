/**
 * Centralised haptics helper (issue #104).
 *
 * Wraps `expo-haptics` behind a dynamic require + try/catch so the app keeps
 * working in builds where the native module isn't installed (Expo Go without
 * the dev-client, web preview, snapshot tests, etc). Mirrors the pattern
 * pioneered in CheckoutSuccessScreen (#27).
 *
 * Usage:
 *   import { lightTap, mediumTap, heavyTap, selectionTick, successNotification } from "../lib/haptics";
 *   <Pressable onPress={() => { lightTap(); doThing(); }} />
 *
 * All helpers fire-and-forget — they never throw and never await, so callers
 * stay synchronous. Fire BEFORE the action callback so the tap feels
 * responsive on the user's finger rather than after the screen reacts.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Haptics: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Haptics = require("expo-haptics");
} catch {
  // expo-haptics not installed in this build; helpers below all no-op.
}

/** Subtle bump — list-row taps, chips, secondary CTAs. */
export function lightTap(): void {
  try {
    if (Haptics?.impactAsync && Haptics?.ImpactFeedbackStyle?.Light) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
        // best-effort; swallow
      });
    }
  } catch {
    // best-effort; swallow
  }
}

/** Mid-strength bump — primary CTAs ("Jetzt sichern"), confirmations. */
export function mediumTap(): void {
  try {
    if (Haptics?.impactAsync && Haptics?.ImpactFeedbackStyle?.Medium) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {
        // best-effort; swallow
      });
    }
  } catch {
    // best-effort; swallow
  }
}

/** Strong thump — simulated NFC card tap, big "commit" moments. */
export function heavyTap(): void {
  try {
    if (Haptics?.impactAsync && Haptics?.ImpactFeedbackStyle?.Heavy) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {
        // best-effort; swallow
      });
    }
  } catch {
    // best-effort; swallow
  }
}

/** Selection tick — toggles, segmented controls, picker scrubs. */
export function selectionTick(): void {
  try {
    if (Haptics?.selectionAsync) {
      Haptics.selectionAsync().catch(() => {
        // best-effort; swallow
      });
    }
  } catch {
    // best-effort; swallow
  }
}

/** Success ding — checkout success, cashback credited. */
export function successNotification(): void {
  try {
    if (Haptics?.notificationAsync && Haptics?.NotificationFeedbackType?.Success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {
        // best-effort; swallow
      });
    }
  } catch {
    // best-effort; swallow
  }
}

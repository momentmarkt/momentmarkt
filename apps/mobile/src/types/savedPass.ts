/**
 * SavedPass — a variant the user has swiped right on in Discover but
 * hasn't yet redeemed. Lives in App.tsx's `savedPasses` state and is
 * rendered by WalletView (issue #154).
 *
 * No persistence — session-local only. Issue #148 covers the AsyncStorage
 * roadmap (paired with the on-device SLM swap so prefs ride along).
 *
 * Identity:
 *   - `id` is a client-side uuid generated at save time so the same
 *     variant can theoretically be saved twice without collisions.
 *     (We don't dedup at save — the user could intentionally swipe
 *     a card twice, and the duplicate makes the "I really want this"
 *     signal more visible.)
 *   - `saved_at_iso` lets the list sort newest-first without any
 *     extra wire data.
 */

import type { AlternativeOffer } from "../lib/api";

export type SavedPass = {
  id: string;
  variant: AlternativeOffer;
  saved_at_iso: string;
};

/**
 * Generate a SavedPass id without pulling in a uuid dep. Combines the
 * variant id (already unique per LLM round) with a millisecond timestamp
 * + a small random suffix so two saves of the same variant in the same
 * tick still produce different ids.
 */
export function makeSavedPassId(variantId: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.floor(Math.random() * 1e6).toString(36);
  return `pass-${variantId}-${ts}-${rand}`;
}

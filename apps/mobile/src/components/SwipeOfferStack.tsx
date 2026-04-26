/**
 * TODO(#137): "Why am I seeing this?" affordance — long-press on a
 * swipe card should reveal the matched signals + the lens that picked
 * it (DESIGN_PRINCIPLES.md #5: reasoning is inspectable). For the
 * lens-as-primary-surface ship we accept that the chip in the row IS
 * a lightweight version of this (the user can see which strategy is
 * curating). Full long-press transparency view is a follow-up.
 */

/**
 * SwipeOfferStack — 3-card swipeable variant stack (issue #132).
 *
 * Renders a stack of `AlternativeOffer` cards (cheapest → most generous,
 * top of stack first). The user swipes RIGHT to settle on a variant
 * ("I want this") or LEFT to advance to the next card ("show me another").
 * After every card is left-swiped we fall through to `onAllPassed` which
 * App.tsx wires to dismiss back to the silent wallet.
 *
 * Mechanic story: dwell time per card + swipe direction is the on-device
 * preference signal — the user reveals their reservation price by swiping
 * right on the smallest acceptable variant. For the demo the dwell ms is
 * console.logged only; a real on-device preference model is post-hackathon.
 *
 * Visual:
 *   - Top card is interactive (pan gesture). The card behind peeks at
 *     scale 0.95, translateY +12 so the stack reads as a *stack*, not as
 *     a single card.
 *   - Each card is a `WidgetRenderer` rendering its `widget_spec`.
 *   - A bright spark-tinted discount pill chip floats in the top-right
 *     corner so the user can see the discount escalating across swipes
 *     (−10% → −15% → −20% in the default 3-variant ladder).
 *
 * Physics (issue #158 — Tinder-grade motion craft, recovery of #157):
 *   - All commit/snap/peek transitions go through `withSpring` with
 *     centralized SPRING_* configs. The pan-release fling injects the
 *     gesture's velocityX into the spring so the card carries momentum.
 *   - Tilt rotation is interpolated continuously from translateX so the
 *     card pivots into the swipe direction up to ±15°, then keeps
 *     rotating with momentum during the off-screen exit.
 *   - Stack peek (depth=1, depth=2) reads its slot from a continuous
 *     `stackPosition` shared value. When the top card commits, the
 *     parent springs that SV from 1 → 0, so the next card "rises" into
 *     place on the same SPRING_SETTLE curve — no React-render snap.
 *   - Weak releases spring back to (0,0) with SPRING_BACK (slight
 *     overshoot for a physical feel).
 *   - On `pan.onBegin`, the card scales to 0.985 with SPRING_FAST so
 *     the user gets a "lift to grab" affordance.
 *   - Initial mount + variant-swap entrance: each card ghosts in from
 *     scale 0.95 + opacity 0, staggered ~60ms by depth.
 *   - Idle micro-motion: top card breathes ±0.4% scale on a 4.5s
 *     sin-eased loop. Subtle; would be one of the first things to drop
 *     if framerate suffered, but on the simulator + iPhone 12+ stays at
 *     60fps.
 *
 * Inline styles vs token utilities: the styles helper silently drops any
 * token not in its allow-list. Layout primitives this component needs
 * (absolute insets, dynamic minHeight, transform/opacity) aren't tokenized,
 * so we inline them. Color + typography stays in the token vocabulary so
 * the wallet palette stays consistent.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, Text, useWindowDimensions, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import type { SharedValue } from "react-native-reanimated";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import type { AlternativeOffer } from "../lib/api";
import { lightTap, mediumTap } from "../lib/haptics";
import { s } from "../styles";
import { WidgetRenderer } from "./WidgetRenderer";

const THRESHOLD_X = 100;
const THRESHOLD_VX = 600;

/**
 * Spring config dictionary — centralized so every motion in the swipe
 * stack reads from the same physical vocabulary. Tuned for "Tinder-grade"
 * feel after a few rounds of trial-and-error in the simulator (issue #158).
 *
 *   FAST    — micro-interactions (press-down on grab, scale-back on release).
 *             High stiffness so the user reads it as instant feedback.
 *   SETTLE  — stack peek transitions (depth=2 → depth=1 → top promotion).
 *             Mid stiffness, mid damping — confident settle, no oscillation.
 *   FLING   — off-screen exit on swipe commit. Low stiffness so the velocity
 *             we inject from `e.velocityX` actually carries the card out
 *             with momentum (high stiffness would clamp the velocity into
 *             a uniform-feeling exit). Tested at 14 damping → no overshoot
 *             past the screen edge while still reading as physical.
 *   BACK    — snap back to center on weak release. Slight overshoot
 *             (damping 14 + stiffness 140) so the card "settles" rather
 *             than just stops.
 *
 * The ghost-in entrance is a `withTiming` (not a spring) because the
 * staggered per-depth window math wants a deterministic 0 → 1 ramp the
 * peek cards can interpolate into their own slot windows.
 */
const SPRING_FAST = { stiffness: 200, damping: 20, mass: 0.6 } as const;
const SPRING_SETTLE = { stiffness: 120, damping: 18, mass: 1 } as const;
const SPRING_FLING = { stiffness: 80, damping: 14, mass: 0.6 } as const;
const SPRING_BACK = { stiffness: 140, damping: 14, mass: 0.8 } as const;

/** Synthetic velocity for tap-button-driven flings (px/s). Picked to feel
 *  comparable to a confident user flick — high enough that SPRING_FLING's
 *  low stiffness still produces a fast off-screen exit. */
const TAP_FLING_VELOCITY = 1500;

/** Rotation cap (degrees) for the tilt-on-pan effect. ±15 matches Tinder's
 *  feel without making the card look like it's tipping over. */
const ROTATION_MAX_DEG = 15;

// Card-size pair for the two render modes. The drawer keeps the
// in-sheet vertical budget (used by the alternatives step inside
// the BottomSheet); the Discover view (issue #152) renders a
// simplified Tinder-style card without the dark cocoa block / CTA /
// 3-dot indicator and uses a larger card height so the photo
// dominates the surface.
const STACK_MIN_HEIGHT_DRAWER = 460;
const STACK_MIN_HEIGHT_DISCOVER = 540;
const CARD_SURFACE_MIN_HEIGHT_DRAWER = 420;
const CARD_SURFACE_MIN_HEIGHT_DISCOVER = 500;

export type DwellByVariant = Record<string, number>;

/** Render-size variant.
 *
 *   "drawer"   — in-sheet sizing. Used by the alternatives step inside
 *                the BottomSheet (merchant-tap-from-Browse-list flow)
 *                so the swipe stack fits the sheet's 80% snap.
 *   "discover" — Discover view (issue #152). Larger cards + the
 *                SimplifiedCardSurface: no dark cocoa block, no CTA,
 *                no eyebrow, no 3-dot indicator. Tinder essence
 *                (photo + minimal overlay text + discount badge + swipe).
 */
export type SwipeCardScale = "drawer" | "discover";

type Props = {
  variants: AlternativeOffer[];
  /** Fired when the user swipes RIGHT on a card. */
  onSettle: (variant: AlternativeOffer, dwellMsByVariant: DwellByVariant) => void;
  /** Fired when every card has been swiped LEFT. */
  onAllPassed: (dwellMsByVariant: DwellByVariant) => void;
  /** Render-size variant. Defaults to "drawer" so the in-sheet
   *  alternatives step keeps its layout unchanged. DiscoverView (issue
   *  #152) passes "discover" to bump the card height + swap in the
   *  SimplifiedCardSurface. Physics + dwell tracking are identical
   *  across modes. */
  cardScale?: SwipeCardScale;
  /** Issue #175 — fired with the variant_id of every card the user
   *  actually swipes through (left OR right). DiscoverView threads this
   *  up to App.tsx so the unseen-special tracker can decrement its set
   *  as the user consumes cards. The decrement happens regardless of
   *  swipe direction — both gestures count as "I saw this card". */
  onCardConsumed?: (variantId: string) => void;
};

export function SwipeOfferStack({
  variants,
  onSettle,
  onAllPassed,
  cardScale = "drawer",
  onCardConsumed,
}: Props) {
  const { width } = useWindowDimensions();
  // Index of the top-of-stack card. Bumping advances to the next variant.
  const [index, setIndex] = useState(0);
  // Per-variant accumulated dwell ms (mount → swipe). Lives in a ref so the
  // tally survives re-renders triggered by index changes.
  const dwellRef = useRef<DwellByVariant>({});
  // mountedAt tracking is per-card-position so we can compute dwell on swipe.
  const mountedAtRef = useRef<number>(Date.now());

  // Reset the mount clock every time a new top card appears.
  useEffect(() => {
    mountedAtRef.current = Date.now();
  }, [index]);

  const recordDwell = useCallback((variantId: string) => {
    const elapsed = Date.now() - mountedAtRef.current;
    dwellRef.current = {
      ...dwellRef.current,
      [variantId]: (dwellRef.current[variantId] ?? 0) + elapsed,
    };
  }, []);

  // Stack-position shared value (issue #158, polish #3). Each peek card
  // reads its slot via `slot - stackPosition.value`. When the top card
  // commits and we bump the React index, we ALSO spring this SV from
  // 1 → 0 — that lets the depth=1 card rise into the depth=0 slot on
  // the same SPRING_SETTLE curve instead of snapping into place when
  // React re-renders. Net effect: the new top card "rises" into view.
  const stackPosition = useSharedValue(0);

  // Ghost-in shared value (polish #6). Animates 0 → 1 over ~320ms when
  // the stack first mounts or `variants` swaps in. PeekCard / SwipeCard
  // read this via depth-staggered interpolation so the top card arrives
  // first, then depth=1, then depth=2. Re-keyed on the first variant id
  // so a fresh fetch retriggers the entrance — but cosmetic re-renders
  // (e.g. the index advance) don't.
  const ghostProgress = useSharedValue(0);
  const stackKey = variants[0]?.variant_id ?? "empty";
  useEffect(() => {
    ghostProgress.value = 0;
    ghostProgress.value = withTiming(1, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
    });
    // A new fetch should land flat — reset the promotion SV so we don't
    // start the new stack mid-springpath from the previous run.
    stackPosition.value = 0;
    // We deliberately depend on stackKey only so cosmetic re-renders
    // don't re-trigger the entrance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stackKey]);

  // Promote the stack one slot. Bump stackPosition to −1 (so the next
  // card is visually still in its old depth=1 slot for one frame), then
  // spring it back to 0. Peek cards read slot − stackPosition.value, so
  // as the SV travels −1 → 0, the depth=1 card slides into depth=0
  // (matching the just-departed top card's geometry) on the SPRING_SETTLE
  // curve. The depth=2 card simultaneously slides into depth=1. The new
  // top SwipeCard reads `0 − stackPosition.value` for its own
  // effectiveDepth so it ALSO grows from the peek1 geometry into the top
  // slot on the same curve — no static pop-in (#170 fix 1).
  const promoteStack = useCallback(() => {
    stackPosition.value = -1;
    stackPosition.value = withSpring(0, SPRING_SETTLE);
  }, [stackPosition]);

  const handleRight = useCallback(
    (variant: AlternativeOffer) => {
      recordDwell(variant.variant_id);
      lightTap();
      // Issue #175 — count the right-swipe as "card consumed" so the
      // Discover-tab unseen-special badge decrements as the user
      // actually swipes through specials. Fires BEFORE onSettle so the
      // parent state mutations land in the same React batch.
      onCardConsumed?.(variant.variant_id);
      // eslint-disable-next-line no-console
      console.log("settled", variant.variant_id, dwellRef.current);
      onSettle(variant, { ...dwellRef.current });
    },
    [onSettle, recordDwell, onCardConsumed],
  );

  const handleLeft = useCallback(
    (variant: AlternativeOffer) => {
      recordDwell(variant.variant_id);
      // Issue #175 — left-swipe also counts as "consumed" — the user
      // saw the card and explicitly chose to skip. Fires for every
      // left-swipe in the round, including the final one that triggers
      // onAllPassed.
      onCardConsumed?.(variant.variant_id);
      const next = index + 1;
      if (next >= variants.length) {
        // eslint-disable-next-line no-console
        console.log("all passed", dwellRef.current);
        onAllPassed({ ...dwellRef.current });
        return;
      }
      promoteStack();
      setIndex(next);
    },
    [
      index,
      variants.length,
      onAllPassed,
      recordDwell,
      promoteStack,
      onCardConsumed,
    ],
  );

  // Programmatic-fling handle on the top card so the Tinder-style tap
  // buttons below the stack can drive the same swipe path the gesture
  // does. Re-keyed per top-card mount so the ref always points at the
  // currently-mounted SwipeCard's flingOff (issue #146).
  const swipeHandleRef = useRef<SwipeCardHandle | null>(null);

  const triggerSwipeRight = useCallback(() => {
    swipeHandleRef.current?.flingOff("right", TAP_FLING_VELOCITY);
  }, []);
  const triggerSwipeLeft = useCallback(() => {
    swipeHandleRef.current?.flingOff("left", -TAP_FLING_VELOCITY);
  }, []);

  if (variants.length === 0) return null;

  // Render up to 3 cards: top (interactive) + 2 peeks behind it. Showing
  // two peek layers makes the stack visually read as a stack — the user
  // sees "there are more" without text (issue #146 polish #3). Anything
  // beyond layer 3 is invisible to the user and would just bloat the
  // layout.
  const top = variants[index];
  const peek1 = variants[index + 1];
  const peek2 = variants[index + 2];

  const stackMinHeight =
    cardScale === "discover"
      ? STACK_MIN_HEIGHT_DISCOVER
      : STACK_MIN_HEIGHT_DRAWER;
  const surfaceMinHeight =
    cardScale === "discover"
      ? CARD_SURFACE_MIN_HEIGHT_DISCOVER
      : CARD_SURFACE_MIN_HEIGHT_DRAWER;
  // Discover mode (#152) hides the 3-dot position indicator — the stack
  // peek already telegraphs "there are more cards" without the extra
  // dot row competing with the photo for visual weight.
  const showDots = cardScale !== "discover";
  const useSimplified = cardScale === "discover";

  return (
    <View style={{ width: "100%" }}>
      {/* Position-in-stack dot row. One dot per variant; the active dot
          is spark-tinted, inactive dots are ink/15. Replaces the older
          "Card N of M / ← skip · keep →" text strip — the dots + the
          Tinder-style buttons below the stack carry the same signal
          with less visual weight (issue #146 polish #4).
          Discover mode (#152) hides the dot row — the stack peek
          already shows there's more, and Tinder essence wants the
          minimum overlay text. */}
      {showDots ? (
        <View
          style={[
            ...s("flex-row items-center justify-center"),
            { marginBottom: 10, gap: 4 },
          ]}
        >
          {variants.map((v, i) => (
            <View
              key={`dot-${v.variant_id}`}
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor:
                  i === index ? "#f2542d" : "rgba(23, 18, 15, 0.15)",
              }}
            />
          ))}
        </View>
      ) : null}

      <View style={{ width: "100%", minHeight: stackMinHeight, position: "relative" }}>
        {/* Layer 3 (deepest peek) — rendered FIRST so it sits underneath
            layer 2 in z-order. */}
        {peek2 ? (
          <PeekCard
            key={`peek2-${peek2.variant_id}`}
            variant={peek2}
            surfaceMinHeight={surfaceMinHeight}
            slot={2}
            stackPosition={stackPosition}
            ghostProgress={ghostProgress}
            simplified={useSimplified}
          />
        ) : null}
        {peek1 ? (
          <PeekCard
            key={`peek1-${peek1.variant_id}`}
            variant={peek1}
            surfaceMinHeight={surfaceMinHeight}
            slot={1}
            stackPosition={stackPosition}
            ghostProgress={ghostProgress}
            simplified={useSimplified}
          />
        ) : null}
        {top ? (
          <SwipeCard
            key={`top-${top.variant_id}-${index}`}
            variant={top}
            screenWidth={width}
            surfaceMinHeight={surfaceMinHeight}
            handleRef={swipeHandleRef}
            simplified={useSimplified}
            ghostProgress={ghostProgress}
            stackPosition={stackPosition}
            onSwipeRight={() => handleRight(top)}
            onSwipeLeft={() => handleLeft(top)}
          />
        ) : null}
      </View>

      {/* Tinder-style tap shortcuts. Both buttons are ADDITIVE to the
          existing pan gesture — they call the same internal flingOff()
          path on the top card, so the dwell signal + animation stays
          identical regardless of input modality (issue #146 polish #4).
          Tap-button flings inject a synthetic velocity (±TAP_FLING_VELOCITY)
          so they go through the SAME SPRING_FLING physics as a real
          gesture (issue #158 polish #7). */}
      {top ? (
        <View
          style={[
            ...s("flex-row items-center justify-center"),
            { marginTop: 16, gap: 24 },
          ]}
        >
          <SwipeButton
            symbol="xmark.circle.fill"
            tintColor="rgba(23, 18, 15, 0.35)"
            accessibilityLabel="Skip this merchant"
            onPress={triggerSwipeLeft}
          />
          <SwipeButton
            symbol="heart.circle.fill"
            tintColor="#f2542d"
            accessibilityLabel="Keep this merchant"
            onPress={triggerSwipeRight}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Imperative handle exposed by the top-of-stack `SwipeCard` so the
 * Tinder-style tap buttons in the parent stack can fire the same
 * `flingOff()` the pan gesture uses. Keeping the handle internal to
 * this module means the swipe physics live in exactly one place.
 *
 * `velocity` (px/s) is optional — when present it's injected as the
 * spring's initial velocity, giving tap-button flings the same
 * momentum-carrying feel as a real swipe gesture (issue #158 polish #7).
 */
type SwipeCardHandle = {
  flingOff: (dir: "left" | "right", velocity?: number) => void;
};

/**
 * Round icon button used for the Tinder-style swipe shortcuts beneath
 * the card. Uses SF Symbols for consistency with the lens chip row +
 * the rest of the wallet's iOS-native vocabulary.
 */
function SwipeButton({
  symbol,
  tintColor,
  accessibilityLabel,
  onPress,
}: {
  symbol: "xmark.circle.fill" | "heart.circle.fill";
  tintColor: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={12}
      onPress={() => {
        lightTap();
        onPress();
      }}
      style={({ pressed }) => ({
        width: 52,
        height: 52,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <SymbolView
        name={symbol}
        tintColor={tintColor}
        size={52}
        weight="regular"
        style={{ width: 52, height: 52 }}
      />
    </Pressable>
  );
}

/**
 * The stack card behind the top card. Static (no gesture), peek-only.
 * Scaled down + nudged so the user sees the *next* card waiting.
 *
 * Issue #158 (polish #3 + #6): the depth tier is no longer a static
 * lookup. We compute `effectiveDepth = slot - stackPosition.value` —
 * when the parent springs `stackPosition` from 1 → 0 after a commit,
 * the depth=1 card visually rises to depth=0 (which is the same scale
 * & translateY as the just-departed top card had), giving a smooth
 * promotion. The interpolation reads continuous depth so scale +
 * translateY + translateX + opacity all travel together on the same
 * SPRING_SETTLE curve.
 *
 * Ghost-in (polish #6): on initial mount + variant swap, the card
 * lands from scale * 0.95, opacity 0, with a depth-staggered window
 * so the top card arrives first (window [0, 0.6]), then depth=1
 * ([0.18, 0.78]), then depth=2 ([0.36, 0.96]). Stagger reads as the
 * deck of cards "fanning in" from a single point.
 */
function PeekCard({
  variant,
  surfaceMinHeight,
  slot,
  stackPosition,
  ghostProgress,
  simplified,
}: {
  variant: AlternativeOffer;
  surfaceMinHeight: number;
  /** This card's slot in the stack at React-render time: 1 = immediate
   *  next, 2 = third-deep. Effective depth = slot - stackPosition.value. */
  slot: 1 | 2;
  stackPosition: SharedValue<number>;
  ghostProgress: SharedValue<number>;
  /** When true, render the simplified Tinder-essence card (issue #152). */
  simplified?: boolean;
}) {
  // Continuous effective depth driven by the parent's stackPosition SV.
  // As stackPosition springs 1 → 0, this card's effectiveDepth slides
  // from (slot - 1) → slot — every visual property travels along on the
  // SPRING_SETTLE curve.
  const effectiveDepth = useDerivedValue(() => slot - stackPosition.value);

  // Per-depth ghost-in window so the top card arrives first, then
  // depth=1, then depth=2. Window is [start, end] mapped from
  // ghostProgress in [0, 1]. Overlapping but offset so the deck "fans".
  const ghostStart = slot === 1 ? 0.18 : 0.36;
  const ghostEnd = slot === 1 ? 0.78 : 0.96;

  const animatedStyle = useAnimatedStyle(() => {
    const d = effectiveDepth.value;
    // depth 0 = top-card geometry (scale 1, translateY 0, opacity 1)
    // depth 1 = first peek (scale 0.93, translateY 14, opacity 0.5)
    // depth 2 = second peek (scale 0.86, translateY 28, opacity 0.25)
    const scale = interpolate(d, [0, 1, 2], [1, 0.93, 0.86], Extrapolation.CLAMP);
    const translateY = interpolate(d, [0, 1, 2], [0, 14, 28], Extrapolation.CLAMP);
    const translateX = interpolate(d, [0, 1, 2], [0, 6, 12], Extrapolation.CLAMP);
    const depthOpacity = interpolate(d, [0, 1, 2], [1, 0.5, 0.25], Extrapolation.CLAMP);

    // Ghost-in: scale up from 0.95 + opacity 0 to full, mapped through
    // the per-slot window. We multiply rather than replace so the
    // depth-driven scale + opacity still apply once the entrance is done.
    const ghost = interpolate(
      ghostProgress.value,
      [ghostStart, ghostEnd],
      [0, 1],
      Extrapolation.CLAMP,
    );
    const ghostScale = interpolate(ghost, [0, 1], [0.95, 1], Extrapolation.CLAMP);
    const ghostOpacity = ghost;

    return {
      transform: [
        { translateX },
        { translateY },
        { scale: scale * ghostScale },
      ],
      opacity: depthOpacity * ghostOpacity,
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          zIndex: slot === 1 ? 1 : 0,
        },
        animatedStyle,
      ]}
    >
      {simplified ? (
        <SimplifiedCardSurface
          variant={variant}
          surfaceMinHeight={surfaceMinHeight}
          interactive={false}
        />
      ) : (
        <CardSurface
          variant={variant}
          interactive={false}
          surfaceMinHeight={surfaceMinHeight}
        />
      )}
    </Animated.View>
  );
}

/**
 * The interactive top-of-stack card. Owns the pan gesture + animation. On
 * release we either fling off-screen (commit the swipe direction, with
 * gesture velocity injected into the spring) or spring back to center
 * (weak pan).
 *
 * Issue #158 motion-craft additions:
 *   - `pressScale` runs on `pan.onBegin` (lift-to-grab) and resets on
 *     `onFinalize` so a fling exit also restores the scale (the new top
 *     card under it would otherwise inherit the press-down). FAST spring.
 *   - `cardStyle` interpolates `translateX` → rotation deg ±15 with clamp.
 *     Rotation continues to interpolate during the fling-off, so the card
 *     keeps tilting as it leaves the screen — feels like it's tumbling
 *     out, not sliding.
 *   - `idleScale` is a 4.5s sin-eased ±0.4% breath. Layered on the press +
 *     ghost scales via multiplication. Subtle enough that the user reads
 *     it as "the deck is alive" not "something is glitching".
 *   - On weak release, translateX/Y go through SPRING_BACK (slight
 *     overshoot) instead of withTiming. The card "settles" into center.
 */
function SwipeCard({
  variant,
  screenWidth,
  surfaceMinHeight,
  handleRef,
  simplified,
  ghostProgress,
  stackPosition,
  onSwipeRight,
  onSwipeLeft,
}: {
  variant: AlternativeOffer;
  screenWidth: number;
  surfaceMinHeight: number;
  handleRef?: React.MutableRefObject<SwipeCardHandle | null>;
  /** When true, render the simplified Tinder-essence card (issue #152). */
  simplified?: boolean;
  /** Stack-level entrance progress (0 → 1 over ~320ms on mount/swap). */
  ghostProgress: SharedValue<number>;
  /** Same SV peek cards consume. promoteStack jumps it to −1 then springs
   *  back to 0; top card's effectiveDepth is `0 − stackPosition.value`,
   *  so the just-promoted card travels from peek1 geometry → top geometry
   *  on the SPRING_SETTLE curve — no static pop-in (#170 fix 1). */
  stackPosition: SharedValue<number>;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
}) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  // Press-down scale on grab. 1.0 at rest, 0.985 while panning. Multiplied
  // into the final transform alongside the ghost-in + idle-breath scales.
  const pressScale = useSharedValue(1);
  // Idle micro-motion (polish #8). Started after mount, runs forever.
  // ±0.4% scale on a 4.5s loop. Sin-eased via the timing easing function.
  const idleScale = useSharedValue(1);

  useEffect(() => {
    // Kick off the breathing loop. Use withRepeat + withSequence so each
    // half of the cycle uses a sin-flavored curve — pure timing easing
    // gives the "easeInOut" approximation Tinder uses for idle decks.
    idleScale.value = withRepeat(
      withSequence(
        withTiming(1.004, { duration: 2250, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.0, { duration: 2250, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    return () => {
      // Clamp to 1 on unmount so any captured-mid-cycle frame doesn't
      // leave a stale scale value behind on a recycled SV.
      idleScale.value = 1;
    };
  }, [idleScale]);

  const flingOff = useCallback(
    (dir: "left" | "right", velocity?: number) => {
      const target = dir === "right" ? screenWidth + 200 : -screenWidth - 200;
      // Inject the user's release velocity into the spring (polish #1).
      // Default to a confident synthetic velocity if the caller didn't
      // supply one (e.g. a tap-button caller on a fresh mount).
      const vx = velocity ?? (dir === "right" ? TAP_FLING_VELOCITY : -TAP_FLING_VELOCITY);
      translateX.value = withSpring(target, {
        ...SPRING_FLING,
        velocity: vx,
      });
      // Let the slight vertical follow ease back to 0 during the exit so
      // the card doesn't trail off at a downward angle.
      translateY.value = withSpring(0, SPRING_SETTLE);
      // Restore press-scale even if the user released without lifting
      // their finger (e.g. tap-button path).
      pressScale.value = withSpring(1, SPRING_FAST);
      mediumTap();
      if (dir === "right") onSwipeRight();
      else onSwipeLeft();
    },
    [onSwipeLeft, onSwipeRight, screenWidth, translateX, translateY, pressScale],
  );

  // Wire the imperative handle so the parent's tap buttons can fire the
  // SAME flingOff path the pan gesture uses (issue #146 polish #4).
  // Re-published on every render so the ref always points at the
  // currently-mounted card's handler — important when the stack
  // advances and a new SwipeCard takes over the top slot.
  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = { flingOff };
    return () => {
      if (handleRef.current?.flingOff === flingOff) {
        handleRef.current = null;
      }
    };
  }, [flingOff, handleRef]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10])
        .onBegin(() => {
          // Lift-to-grab affordance (polish #5). Snap the card to a
          // slightly smaller scale so the user reads "I've got it".
          pressScale.value = withSpring(0.985, SPRING_FAST);
        })
        .onChange((e) => {
          translateX.value = e.translationX;
          // Slight vertical follow so the card feels picked-up, not ratcheted.
          translateY.value = e.translationY * 0.15;
        })
        .onEnd((e) => {
          const goRight =
            e.translationX > THRESHOLD_X || e.velocityX > THRESHOLD_VX;
          const goLeft =
            e.translationX < -THRESHOLD_X || e.velocityX < -THRESHOLD_VX;
          if (goRight) {
            runOnJS(flingOff)("right", e.velocityX);
          } else if (goLeft) {
            runOnJS(flingOff)("left", e.velocityX);
          } else {
            // Snap-back spring (polish #4). Slight overshoot reads as
            // "physical card returning to its pile" instead of a flat
            // ease-out timing curve.
            translateX.value = withSpring(0, SPRING_BACK);
            translateY.value = withSpring(0, SPRING_BACK);
            pressScale.value = withSpring(1, SPRING_FAST);
          }
        })
        .onFinalize(() => {
          // Defensive: if the gesture is interrupted (e.g. a parent
          // ScrollView grabs it back), restore the press scale so the
          // card doesn't get stuck small.
          pressScale.value = withSpring(1, SPRING_FAST);
        }),
    [flingOff, translateX, translateY, pressScale],
  );

  const cardStyle = useAnimatedStyle(() => {
    // Tilt rotation (polish #2) — interpolate translateX to ±15deg with
    // clamping. Rotation continues during fling-off because translateX
    // keeps animating to ±(screenWidth + 200), so the card rotates as
    // it leaves the screen — that's the "tumble out" feel.
    const rotation = interpolate(
      translateX.value,
      [-screenWidth, 0, screenWidth],
      [-ROTATION_MAX_DEG, 0, ROTATION_MAX_DEG],
      Extrapolation.CLAMP,
    );
    // Ghost-in: top card uses [0, 0.6] window so it lands first.
    const ghost = interpolate(
      ghostProgress.value,
      [0, 0.6],
      [0, 1],
      Extrapolation.CLAMP,
    );
    const ghostScale = interpolate(ghost, [0, 1], [0.95, 1], Extrapolation.CLAMP);
    const ghostOpacity = ghost;
    // Promotion travel (#170 fix 1). When the parent's promoteStack()
    // jumps stackPosition → −1 then springs to 0, this card's
    // effectiveDepth slides from 1 → 0 on the SPRING_SETTLE curve. We
    // interpolate to the SAME peek1 geometry the PeekCard at slot=1
    // used (scale 0.93 + translateY 14 + translateX 6) so the visual
    // hand-off lands exactly where the peek was — no static pop-in.
    const effectiveDepth = 0 - stackPosition.value;
    const promotionScale = interpolate(effectiveDepth, [0, 1], [1, 0.93], Extrapolation.CLAMP);
    const promotionY = interpolate(effectiveDepth, [0, 1], [0, 14], Extrapolation.CLAMP);
    const promotionX = interpolate(effectiveDepth, [0, 1], [0, 6], Extrapolation.CLAMP);
    // Final scale = press × idle × ghost × promotion. Four SVs all
    // multiplied so each can run independently without one stomping the
    // other.
    const finalScale = pressScale.value * idleScale.value * ghostScale * promotionScale;
    return {
      opacity: ghostOpacity,
      transform: [
        { translateX: translateX.value + promotionX },
        { translateY: translateY.value + promotionY },
        { rotateZ: `${rotation}deg` },
        { scale: finalScale },
      ],
    };
  });

  // Accept (right swipe) overlay — fades in as user pans right.
  const acceptStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, THRESHOLD_X],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));
  // Skip (left swipe) overlay — fades in as user pans left.
  const skipStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-THRESHOLD_X, 0],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          { position: "absolute", left: 0, right: 0, top: 0, zIndex: 2 },
          cardStyle,
        ]}
      >
        {simplified ? (
          <SimplifiedCardSurface
            variant={variant}
            surfaceMinHeight={surfaceMinHeight}
            interactive
          />
        ) : (
          <CardSurface
            variant={variant}
            interactive
            surfaceMinHeight={surfaceMinHeight}
          />
        )}
        {/* Issue #156 — "⚡ JUST FOR YOU" badge on the top card when the
            backend flagged this variant as the fresh special surface.
            Sits in the photo's TOP-LEFT corner, opposite the discount
            pill in the TOP-RIGHT, so the two pills frame the photo
            without competing for the same anchor. Only renders on the
            top-of-stack interactive card; peek cards never paint it
            (the visual reward should land on what the user is acting on,
            not on stale cards behind it). */}
        {variant.is_special_surface ? (
          <View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                top: 14,
                left: 14,
                zIndex: 6,
                backgroundColor: "rgba(242, 84, 45, 0.95)",
                borderRadius: 999,
                paddingHorizontal: 10,
                height: 28,
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            <Text
              style={{
                color: "#ffffff",
                fontSize: 10,
                fontWeight: "900",
                letterSpacing: 2,
                textTransform: "uppercase",
                lineHeight: 12,
              }}
            >
              ⚡ Just for you
            </Text>
          </View>
        ) : null}
        {/* Accept / skip overlays — Tinder-style stamps centered on the
            card. Wrappers fill the entire card surface and center their
            stamp child so the label appears at true vertical+horizontal
            middle (not in a corner anchor). Each stamp is a bordered
            block, slightly tilted (KEEP −10°, SKIP +10°) so the labels
            read as physical "stamps" pressed onto the card as the user
            commits to a direction. pointerEvents="none" on the wrapper
            preserves the underlying pan gesture. */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              alignItems: "center",
              justifyContent: "center",
              zIndex: 7,
            },
            acceptStyle,
          ]}
        >
          <View
            style={{
              borderWidth: 4,
              borderColor: "#F2542D",
              borderRadius: 12,
              paddingHorizontal: 18,
              paddingVertical: 8,
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              transform: [{ rotate: "-10deg" }],
            }}
          >
            <Text
              style={{
                color: "#F2542D",
                fontSize: 36,
                fontWeight: "900",
                letterSpacing: 4,
                textTransform: "uppercase",
              }}
            >
              Keep
            </Text>
          </View>
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              alignItems: "center",
              justifyContent: "center",
              zIndex: 7,
            },
            skipStyle,
          ]}
        >
          <View
            style={{
              borderWidth: 4,
              borderColor: "#3A2418",
              borderRadius: 12,
              paddingHorizontal: 18,
              paddingVertical: 8,
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              transform: [{ rotate: "10deg" }],
            }}
          >
            <Text
              style={{
                color: "#3A2418",
                fontSize: 36,
                fontWeight: "900",
                letterSpacing: 4,
                textTransform: "uppercase",
              }}
            >
              Skip
            </Text>
          </View>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

/**
 * Static card body — the validated GenUI widget plus a discount chip in the
 * corner so the escalation reads visually. Used by both the interactive top
 * card and the static peek behind it.
 */
function CardSurface({
  variant,
  interactive,
  surfaceMinHeight,
}: {
  variant: AlternativeOffer;
  interactive: boolean;
  surfaceMinHeight: number;
}) {
  // Render-side dedup of the duplicate discount label (issue #146 polish
  // #1). The backend's `_build_widget_spec` (alternatives.py) emits a
  // cocoa-tinted pill carrying the same `−30%` text we already render
  // as the spark pill in the photo's top-right corner — keeping both
  // shouts the discount twice. We strip the first child of the body
  // View (children[1].children[0]) so the photo pill remains the single
  // discount surface. TODO: dedup at backend in v2 once the spec gains
  // an explicit `discount_callout` slot we can control from the client.
  const dedupedSpec = useMemo(
    () => stripDuplicateDiscountCallout(variant.widget_spec),
    [variant.widget_spec],
  );
  return (
    <View style={{ width: "100%" }}>
      {/* Discount pill chip — top-right corner so it doesn't fight the
          GenUI hero image's own top-left rain badge. */}
      <View
        pointerEvents="none"
        style={[
          ...s("rounded-full bg-spark px-3 py-2"),
          { position: "absolute", top: 12, right: 12, zIndex: 5 },
        ]}
      >
        <Text style={s("text-xs font-black uppercase tracking-[2px] text-white")}>
          {variant.discount_label}
        </Text>
      </View>
      {/* The GenUI widget itself. enterAnimation=false because the swipe
          stack already animates entry/exit at the card level — letting the
          renderer animate would double-bounce on every advance. */}
      <View
        style={{
          width: "100%",
          minHeight: surfaceMinHeight,
          opacity: interactive ? 1 : 0.92,
        }}
      >
        <WidgetRenderer
          node={dedupedSpec}
          // The inline CTA tap is intentionally a no-op while inside the
          // swipe stack — the canonical commit is the right-swipe gesture
          // so the dwell signal stays clean. Once App.tsx routes the
          // settled variant into the focused offer view, the renderer's
          // onRedeem there points at the real redeem flow.
          onRedeem={() => undefined}
          enterAnimation={false}
        />
      </View>
    </View>
  );
}

/**
 * Simplified card surface for the Discover view (issue #152).
 *
 * Tinder essence — drop everything that competes with the photo:
 *   • NO dark cocoa block under the photo (the original split the
 *     card photo + text into two halves; we keep the photo full-bleed)
 *   • NO bottom "Go to {merchant}" CTA (swipe right IS the CTA)
 *   • NO eyebrow MERCHANT NAME small caps (photo + headline + the
 *     navbar are enough merchant context)
 *
 * Keep:
 *   • Photo full-bleed (≈70% of card height)
 *   • Discount badge top-right of photo (existing spark pill renders
 *     in SwipeCard's parent — see CardSurface; we replicate it here
 *     so the simplified card still carries the discount signal)
 *   • Headline as a large white overlay at the bottom of the photo,
 *     with a dark gradient under it for legibility. The gradient is
 *     a real react-native-svg LinearGradient (no expo-linear-gradient
 *     dep needed — we already pull react-native-svg via
 *     react-native-qrcode-svg). The previous 3-rect stepped overlay
 *     read as visible bands of black against bright photos.
 *   • Subhead just below the headline overlay (small light text;
 *     Agent 21 is improving the LLM-generated subhead copy quality
 *     in parallel — this surface auto-picks up the better text)
 *
 * Pulls subhead + image URL out of the LLM-emitted widget_spec via
 * `extractDisplaySlots()` so we never duplicate the per-category copy
 * that lives server-side in `apps/backend/.../alternatives.py`.
 */
function SimplifiedCardSurface({
  variant,
  surfaceMinHeight,
  interactive,
}: {
  variant: AlternativeOffer;
  surfaceMinHeight: number;
  interactive: boolean;
}) {
  const slots = useMemo(
    () => extractDisplaySlots(variant.widget_spec),
    [variant.widget_spec],
  );
  return (
    <View
      style={{
        width: "100%",
        minHeight: surfaceMinHeight,
        borderRadius: 28,
        overflow: "hidden",
        backgroundColor: "#17120f",
        opacity: interactive ? 1 : 0.92,
        shadowColor: "#17120f",
        shadowOpacity: 0.18,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
      }}
    >
      {slots.imageUrl ? (
        <Image
          source={{ uri: slots.imageUrl }}
          accessibilityLabel={slots.imageAlt}
          resizeMode="cover"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: "100%",
            height: "100%",
          }}
        />
      ) : (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "#6f3f2c",
          }}
        />
      )}

      {/* Discount pill — top-right corner, spark tint. Same vocabulary
          as the legacy CardSurface's pill so the discount signal lands
          in the same spot regardless of card mode. */}
      <View
        pointerEvents="none"
        style={[
          ...s("rounded-full bg-spark px-3 py-2"),
          { position: "absolute", top: 14, right: 14, zIndex: 5 },
        ]}
      >
        <Text style={s("text-xs font-black uppercase tracking-[2px] text-white")}>
          {variant.discount_label}
        </Text>
      </View>

      {/* Bottom dark gradient — real SVG linear gradient (top → bottom)
          via react-native-svg, replacing the previous 3-rect stepped
          overlay (which read as visible bands of black against the
          photo). preserveAspectRatio="none" stretches the gradient
          across whatever aspect ratio the slot becomes. Stops tuned:
          clear at top, soft mid, deep at bottom — the headline (which
          sits in the bottom 22pt of the card) lands on the densest
          portion so white text always has contrast. The wrapper View
          pins the SVG to the bottom 55% of the card, the same slot
          the old layered stack used. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "55%",
        }}
      >
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="cardTitleFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#17120F" stopOpacity="0" />
              <Stop offset="0.35" stopColor="#17120F" stopOpacity="0.20" />
              <Stop offset="0.7" stopColor="#17120F" stopOpacity="0.55" />
              <Stop offset="1" stopColor="#17120F" stopOpacity="0.85" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#cardTitleFade)" />
        </Svg>
      </View>

      {/* Headline + subhead overlay — bottom of the card. Headline
          large white; subhead one shade dimmer + smaller. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 20,
          right: 20,
          bottom: 22,
          zIndex: 6,
        }}
      >
        <Text
          style={{
            color: "#ffffff",
            fontSize: 24,
            fontWeight: "900",
            letterSpacing: -0.4,
            lineHeight: 30,
          }}
          numberOfLines={3}
        >
          {variant.headline}
        </Text>
        {slots.subhead ? (
          <Text
            style={{
              marginTop: 6,
              color: "rgba(255, 255, 255, 0.85)",
              fontSize: 14,
              fontWeight: "500",
              lineHeight: 19,
            }}
            numberOfLines={2}
          >
            {slots.subhead}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Mine the LLM-emitted widget_spec for the photo URL + subhead text we
 * need to render the simplified Discover-card overlay. Defensive: if
 * the spec shape doesn't match what `_build_widget_spec()` emits, we
 * return empty slots and the card falls through to a flat cocoa
 * background + headline-only overlay — still readable, just less
 * cinematic.
 *
 * Spec shape we expect (mirrors `apps/backend/.../alternatives.py`):
 *   { type: "ScrollView", children: [
 *       { type: "Image", source, accessibilityLabel },
 *       { type: "View", children: [discountPill, eyebrow, headline, subhead, redeem] }
 *   ] }
 *
 * We pluck `children[0].source` for the image and `children[1].children[3].text`
 * for the subhead. Both lookups are isObject-guarded, so a spec
 * authored by hand or by an unrelated LLM still degrades safely.
 */
function extractDisplaySlots(spec: unknown): {
  imageUrl: string | null;
  imageAlt: string;
  subhead: string | null;
} {
  const empty = { imageUrl: null, imageAlt: "Offer photo", subhead: null };
  if (!spec || typeof spec !== "object") return empty;
  const root = spec as Record<string, unknown>;
  if (!Array.isArray(root.children)) return empty;
  const children = root.children as unknown[];
  // Image lookup — first ScrollView child, expected to be Image.
  let imageUrl: string | null = null;
  let imageAlt = "Offer photo";
  const firstChild = children[0] as Record<string, unknown> | undefined;
  if (firstChild && firstChild.type === "Image") {
    if (typeof firstChild.source === "string") imageUrl = firstChild.source;
    if (typeof firstChild.accessibilityLabel === "string") {
      imageAlt = firstChild.accessibilityLabel;
    }
  }
  // Subhead lookup — second ScrollView child is a body View whose
  // last Text child carries the subhead. We walk the body's children
  // back-to-front to find the last Text child whose className includes
  // "leading-6" (the canonical subhead className). This is more
  // robust than indexing because the backend recently added/removed
  // an eyebrow Text node in the same body (#147 / #151).
  const body = children[1] as Record<string, unknown> | undefined;
  let subhead: string | null = null;
  if (body && body.type === "View" && Array.isArray(body.children)) {
    const bodyChildren = body.children as unknown[];
    for (let i = bodyChildren.length - 1; i >= 0; i--) {
      const child = bodyChildren[i] as Record<string, unknown> | undefined;
      if (
        child &&
        child.type === "Text" &&
        typeof child.text === "string" &&
        typeof child.className === "string" &&
        child.className.includes("leading-6")
      ) {
        subhead = child.text;
        break;
      }
    }
  }
  return { imageUrl, imageAlt, subhead };
}

/**
 * Render-side strip of the redundant discount-callout block emitted by
 * `apps/backend/.../alternatives.py::_build_widget_spec`. The backend
 * spec is a `ScrollView` whose second child is a body `View` whose first
 * child is the cocoa-tinted discount pill. We render an equivalent pill
 * already (the spark pill above the photo), so we drop the spec's copy
 * to avoid the duplicate badge Doruk flagged. The mutation is a deep,
 * defensive clone so we never reach into the cached `widget_spec` the
 * fetch layer holds.
 */
function stripDuplicateDiscountCallout(spec: unknown): unknown {
  if (!spec || typeof spec !== "object") return spec;
  const root = spec as Record<string, unknown>;
  if (root.type !== "ScrollView" || !Array.isArray(root.children)) return spec;
  const children = root.children as unknown[];
  if (children.length < 2) return spec;
  const body = children[1] as Record<string, unknown> | undefined;
  if (
    !body ||
    body.type !== "View" ||
    !Array.isArray(body.children) ||
    body.children.length === 0
  ) {
    return spec;
  }
  const bodyChildren = body.children as unknown[];
  const firstBodyChild = bodyChildren[0] as Record<string, unknown> | undefined;
  // Only strip if the first body child looks like the discount pill —
  // a small View with a single Text child. Don't strip arbitrary first
  // children (which could be a future merchant logo or eyebrow).
  if (!firstBodyChild || firstBodyChild.type !== "View") return spec;
  const className =
    typeof firstBodyChild.className === "string" ? firstBodyChild.className : "";
  if (!className.includes("rounded-full")) return spec;
  return {
    ...root,
    children: [
      children[0],
      {
        ...body,
        children: bodyChildren.slice(1),
      },
    ],
  };
}

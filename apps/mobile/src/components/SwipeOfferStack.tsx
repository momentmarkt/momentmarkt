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
 * Physics:
 *   - Swipe right when translationX > THRESHOLD_X *or* velocityX > THRESHOLD_VX.
 *   - Swipe left mirrors with negated thresholds.
 *   - Weak pans spring back to center with a 220ms ease-out.
 *
 * Inline styles vs token utilities: the styles helper silently drops any
 * token not in its allow-list. Layout primitives this component needs
 * (absolute insets, dynamic minHeight, transform/opacity) aren't tokenized,
 * so we inline them. Color + typography stays in the token vocabulary so
 * the wallet palette stays consistent.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import type { AlternativeOffer } from "../lib/api";
import { lightTap, mediumTap } from "../lib/haptics";
import { s } from "../styles";
import { WidgetRenderer } from "./WidgetRenderer";

const THRESHOLD_X = 100;
const THRESHOLD_VX = 600;
const SWIPE_OUT_DURATION = 240;
const SPRING_BACK_DURATION = 220;
// Card-size pair for the two render modes. The drawer keeps the existing
// in-sheet vertical budget; the full-screen overlay (issue #145) bumps the
// stack to ~520pt so the cards take over the screen Tinder-style on a
// 6.7" iPhone (Pro Max). Inner CardSurface bumps the WidgetRenderer's
// minHeight in tandem so the photo-led GenUI hero scales with the stack.
const STACK_MIN_HEIGHT_DRAWER = 460;
const STACK_MIN_HEIGHT_FULLSCREEN = 540;
const CARD_SURFACE_MIN_HEIGHT_DRAWER = 420;
const CARD_SURFACE_MIN_HEIGHT_FULLSCREEN = 500;

export type DwellByVariant = Record<string, number>;

/** Render-size variant. Drawer = current in-sheet sizing. FullScreen =
 *  larger cards used by `SwipeFullScreenOverlay` (issue #145). */
export type SwipeCardScale = "drawer" | "fullScreen";

type Props = {
  variants: AlternativeOffer[];
  /** Fired when the user swipes RIGHT on a card. */
  onSettle: (variant: AlternativeOffer, dwellMsByVariant: DwellByVariant) => void;
  /** Fired when every card has been swiped LEFT. */
  onAllPassed: (dwellMsByVariant: DwellByVariant) => void;
  /** Issue #145 — render-size variant. Defaults to "drawer" so existing
   *  call sites (silent-step wallet, alternatives step) keep their layout
   *  unchanged. The full-screen overlay passes "fullScreen" to bump the
   *  card height. Physics + dwell tracking are identical across modes. */
  cardScale?: SwipeCardScale;
};

export function SwipeOfferStack({
  variants,
  onSettle,
  onAllPassed,
  cardScale = "drawer",
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

  const handleRight = useCallback(
    (variant: AlternativeOffer) => {
      recordDwell(variant.variant_id);
      lightTap();
      // eslint-disable-next-line no-console
      console.log("settled", variant.variant_id, dwellRef.current);
      onSettle(variant, { ...dwellRef.current });
    },
    [onSettle, recordDwell],
  );

  const handleLeft = useCallback(
    (variant: AlternativeOffer) => {
      recordDwell(variant.variant_id);
      const next = index + 1;
      if (next >= variants.length) {
        // eslint-disable-next-line no-console
        console.log("all passed", dwellRef.current);
        onAllPassed({ ...dwellRef.current });
        return;
      }
      setIndex(next);
    },
    [index, variants.length, onAllPassed, recordDwell],
  );

  // Programmatic-fling handle on the top card so the Tinder-style tap
  // buttons below the stack can drive the same swipe path the gesture
  // does. Re-keyed per top-card mount so the ref always points at the
  // currently-mounted SwipeCard's flingOff (issue #146).
  const swipeHandleRef = useRef<SwipeCardHandle | null>(null);

  const triggerSwipeRight = useCallback(() => {
    swipeHandleRef.current?.flingOff("right");
  }, []);
  const triggerSwipeLeft = useCallback(() => {
    swipeHandleRef.current?.flingOff("left");
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
    cardScale === "fullScreen"
      ? STACK_MIN_HEIGHT_FULLSCREEN
      : STACK_MIN_HEIGHT_DRAWER;
  const surfaceMinHeight =
    cardScale === "fullScreen"
      ? CARD_SURFACE_MIN_HEIGHT_FULLSCREEN
      : CARD_SURFACE_MIN_HEIGHT_DRAWER;

  return (
    <View style={{ width: "100%" }}>
      {/* Position-in-stack dot row. One dot per variant; the active dot
          is spark-tinted, inactive dots are ink/15. Replaces the older
          "Card N of M / ← skip · keep →" text strip — the dots + the
          Tinder-style buttons below the stack carry the same signal
          with less visual weight (issue #146 polish #4). */}
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

      <View style={{ width: "100%", minHeight: stackMinHeight, position: "relative" }}>
        {/* Layer 3 (deepest peek) — rendered FIRST so it sits underneath
            layer 2 in z-order. */}
        {peek2 ? (
          <PeekCard
            key={`peek2-${peek2.variant_id}`}
            variant={peek2}
            surfaceMinHeight={surfaceMinHeight}
            depth={2}
          />
        ) : null}
        {peek1 ? (
          <PeekCard
            key={`peek1-${peek1.variant_id}`}
            variant={peek1}
            surfaceMinHeight={surfaceMinHeight}
            depth={1}
          />
        ) : null}
        {top ? (
          <SwipeCard
            key={`top-${top.variant_id}-${index}`}
            variant={top}
            screenWidth={width}
            surfaceMinHeight={surfaceMinHeight}
            handleRef={swipeHandleRef}
            onSwipeRight={() => handleRight(top)}
            onSwipeLeft={() => handleLeft(top)}
          />
        ) : null}
      </View>

      {/* Tinder-style tap shortcuts. Both buttons are ADDITIVE to the
          existing pan gesture — they call the same internal flingOff()
          path on the top card, so the dwell signal + animation stays
          identical regardless of input modality (issue #146 polish #4). */}
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
 */
type SwipeCardHandle = {
  flingOff: (dir: "left" | "right") => void;
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
 * Scaled down + nudged so the user sees the *next* card waiting. Two
 * depth tiers (issue #146 polish #3): depth=1 is the immediate next
 * card; depth=2 is the third-deep peek that shows "there are more"
 * without text. Each tier nudges further down + smaller + dimmer.
 */
function PeekCard({
  variant,
  surfaceMinHeight,
  depth,
}: {
  variant: AlternativeOffer;
  surfaceMinHeight: number;
  depth: 1 | 2;
}) {
  const layer =
    depth === 1
      ? { scale: 0.93, translateY: 14, opacity: 0.5, translateX: 6 }
      : { scale: 0.86, translateY: 28, opacity: 0.25, translateX: 12 };
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        zIndex: depth === 1 ? 1 : 0,
        transform: [
          { translateX: layer.translateX },
          { translateY: layer.translateY },
          { scale: layer.scale },
        ],
        opacity: layer.opacity,
      }}
    >
      <CardSurface
        variant={variant}
        interactive={false}
        surfaceMinHeight={surfaceMinHeight}
      />
    </View>
  );
}

/**
 * The interactive top-of-stack card. Owns the pan gesture + animation. On
 * release we either fling off-screen (commit the swipe direction) or spring
 * back to center (weak pan).
 */
function SwipeCard({
  variant,
  screenWidth,
  surfaceMinHeight,
  handleRef,
  onSwipeRight,
  onSwipeLeft,
}: {
  variant: AlternativeOffer;
  screenWidth: number;
  surfaceMinHeight: number;
  handleRef?: React.MutableRefObject<SwipeCardHandle | null>;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
}) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const flingOff = useCallback(
    (dir: "left" | "right") => {
      const target = dir === "right" ? screenWidth + 200 : -screenWidth - 200;
      translateX.value = withTiming(target, {
        duration: SWIPE_OUT_DURATION,
        easing: Easing.out(Easing.exp),
      });
      mediumTap();
      if (dir === "right") onSwipeRight();
      else onSwipeLeft();
    },
    [onSwipeLeft, onSwipeRight, screenWidth, translateX],
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
            runOnJS(flingOff)("right");
          } else if (goLeft) {
            runOnJS(flingOff)("left");
          } else {
            translateX.value = withTiming(0, {
              duration: SPRING_BACK_DURATION,
              easing: Easing.out(Easing.exp),
            });
            translateY.value = withTiming(0, {
              duration: SPRING_BACK_DURATION,
              easing: Easing.out(Easing.exp),
            });
          }
        }),
    [flingOff, translateX, translateY],
  );

  const cardStyle = useAnimatedStyle(() => {
    const rotation = interpolate(
      translateX.value,
      [-screenWidth, 0, screenWidth],
      [-12, 0, 12],
      Extrapolation.CLAMP,
    );
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotateZ: `${rotation}deg` },
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
        <CardSurface
          variant={variant}
          interactive
          surfaceMinHeight={surfaceMinHeight}
        />
        {/* Accept / skip overlays — corner badges so the swipe direction is
            unambiguous as the user pans. */}
        <Animated.View
          pointerEvents="none"
          style={[
            ...s("rounded-full bg-spark px-3 py-2"),
            { position: "absolute", top: 24, left: 24 },
            acceptStyle,
          ]}
        >
          <Text style={s("text-xs font-black uppercase tracking-[2px] text-white")}>
            ✓ Keep
          </Text>
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[
            ...s("rounded-full bg-cocoa px-3 py-2"),
            { position: "absolute", top: 24, right: 24 },
            skipStyle,
          ]}
        >
          <Text style={s("text-xs font-black uppercase tracking-[2px] text-white")}>
            ✗ Skip
          </Text>
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

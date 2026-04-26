import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { SymbolView } from "expo-symbols";
import {
  type ReactElement,
  type ReactNode,
  useEffect,
} from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { type MerchantListItem } from "../lib/api";
import { s } from "../styles";
import { MerchantSearchList } from "./MerchantSearchList";

type Props = {
  /** City label rendered inside the chip + weather widget. */
  cityLabel?: string;
  /** Backend city slug used by the merchant search list (e.g. "berlin"). */
  citySlug?: string;
  /** Current temperature (°C) shown as the big number in the weather widget. */
  tempC?: number;
  /** Short condition label, e.g. "overcast • rain in ~22 min". */
  weatherLabel?: string;
  /** Short pulse-chip headline (e.g. "Rain in ~22 min"). */
  pulseLabel?: string;
  /**
   * Bottom sheet animated index. Used to fade in the bottom weather card
   * tier as the user drags the drawer up. Sheet snaps used by App.tsx:
   *   0 → 25% (collapsed): brand chip + search bar
   *   1 → 55% (medium): + list (top of list visible)
   *   2 → 80% (expanded): + weather card
   */
  animatedIndex?: SharedValue<number>;
  /**
   * Slot for legacy expanded content (issue #122 era). Post-#152 the
   * drawer is browse-only — search + list + weather card — and this
   * slot is unused by App.tsx. Kept on the prop API for tests /
   * storybook that may still pass it.
   */
  expandedSlot?: ReactNode;
  /**
   * Pre-#160 tap handler. App.tsx used to wire this to the alternatives
   * swipe flow when `merchant.active_offer != null`. Post-#160 the
   * Browse tap target is the merchant detail view (`onMerchantOpen`
   * below). Kept on the prop API so legacy callers / tests still work.
   * Issue #116.
   */
  onMerchantTap?: (merchant: MerchantListItem) => void;
  /**
   * Issue #160 — Browse merchant-first tap target. Tap a merchant row
   * in the wallet drawer's merchant list → App.tsx opens the slide-in
   * MerchantDetailView for that merchant. The deal lives INSIDE that
   * view (as one section among the hero photo + info row + opening
   * hours), not as a takeover swipe — that's Discover's mental model.
   * Threaded straight through to MerchantSearchList.
   */
  onMerchantOpen?: (merchant: MerchantListItem) => void;
  /**
   * Fired when the user taps the search input. App.tsx wires this to
   * snap the bottom sheet to its top snap (80%) so the keyboard rises
   * into a fully-revealed list. Issue #125.
   */
  onSearchFocus?: () => void;
};

/**
 * Wallet-style sheet content — the body of the Browse view's bottom
 * drawer (issue #152, post-IA refactor).
 *
 * Browse-only: search bar at the top → MerchantSearchList → weather
 * card at the bottom. The lens chip row + swipe stack moved to the
 * Discover view (the full-screen surface behind the bottom navbar's
 * "Discover" tab). The drawer no longer has a "swipe vs list" mode
 * toggle — there's only one mode here now (list).
 *
 * Per `context/DESIGN_PRINCIPLES.md`:
 *   #1 list-as-ground-truth: this surface is the unfiltered catalog
 *      sorted by distance. The Discover view's lens chips never
 *      remove merchants from this view.
 *   #7 the search is text-match only: tap to filter, no LLM rerank.
 */
export function WalletSheetContent({
  cityLabel = "Berlin Mitte",
  citySlug = "berlin",
  tempC = 11,
  weatherLabel = "overcast • rain in ~22 min",
  pulseLabel = "Rain in ~22 min",
  animatedIndex,
  expandedSlot,
  onMerchantTap,
  onMerchantOpen,
  onSearchFocus,
}: Props): ReactElement {
  const pulse = useSharedValue(0);
  const dot = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    dot.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [dot, pulse]);

  const chipStyle = useAnimatedStyle(() => ({
    opacity: 0.7 + pulse.value * 0.3,
    transform: [{ scale: 0.97 + pulse.value * 0.06 }],
  }));

  const dotStyle = useAnimatedStyle(() => ({
    opacity: 0.25 + dot.value * 0.55,
  }));

  const expandedLayerStyle = useAnimatedStyle(() => {
    if (!animatedIndex) return { opacity: 1 };
    const opacity = interpolate(
      animatedIndex.value,
      [1, 1.4, 2],
      [0, 0.4, 1],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  return (
    // Cream wallet drawer (matches the Settings + History page palette).
    <BottomSheetScrollView
      style={s("flex-1")}
      contentContainerStyle={[
        ...s("px-5"),
        { paddingTop: 8, paddingBottom: 20 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={s("items-center")}>
        <Text
          style={[
            ...s("text-[11px] font-semibold uppercase tracking-[3px] text-cocoa"),
            { opacity: 0.55 },
          ]}
        >
          MomentMarkt
        </Text>
      </View>

      {/* Search bar + merchant list. The list is the unfiltered ground
          truth (DESIGN_PRINCIPLES.md #1) — every merchant in the city
          catalog, sorted by distance. The Discover view's lens chips
          never remove merchants from this surface. */}
      <View style={s("mt-3")}>
        <MerchantSearchList
          city={citySlug}
          onMerchantTap={onMerchantTap}
          onMerchantOpen={onMerchantOpen}
          onSearchFocus={onSearchFocus}
        />
      </View>

      <View style={s("mt-4")}>
        {/* Weather card — bottom of the drawer, persistent regardless
            of search query so the user always has the city's pulse
            signal visible. */}
        <View
          style={[
            ...s("rounded-[22px] bg-white p-5"),
            {
              borderWidth: 1,
              borderColor: "rgba(23, 18, 15, 0.06)",
            },
          ]}
        >
          <View style={s("flex-row items-center justify-between")}>
            <Text
              style={s(
                "text-xs font-semibold uppercase tracking-[2px] text-cocoa",
              )}
            >
              {cityLabel}
            </Text>
            <Text style={s("text-xs font-semibold text-neutral-600")}>
              Weather
            </Text>
          </View>

          <View style={s("mt-4 flex-row items-center justify-between")}>
            <Text
              style={[
                ...s("text-[40px] font-light text-ink"),
                { lineHeight: 44 },
              ]}
            >
              {Math.round(tempC)}°
            </Text>
            <SymbolView
              name="cloud.fill"
              tintColor="#6f3f2c"
              size={28}
              weight="medium"
              style={{ width: 28, height: 28 }}
            />
          </View>

          <Text style={s("mt-2 text-sm font-semibold text-cocoa")}>
            {weatherLabel}
          </Text>

          <Animated.View
            style={[
              chipStyle,
              ...s("mt-4 rounded-full bg-spark px-3 py-2"),
              { alignSelf: "flex-start" },
            ]}
          >
            <Text
              style={s(
                "text-[11px] font-bold uppercase tracking-[2px] text-white",
              )}
            >
              {pulseLabel}
            </Text>
          </Animated.View>
        </View>
      </View>

      <Animated.View style={[expandedLayerStyle, ...s("flex-1 mt-4")]}>
        {expandedSlot ?? (
          <View style={s("items-center mt-6")}>
            <Animated.View
              style={[
                dotStyle,
                ...s("h-1 w-1 rounded-full"),
                { backgroundColor: "rgba(23, 18, 15, 0.35)" },
              ]}
            />
          </View>
        )}
      </Animated.View>
    </BottomSheetScrollView>
  );
}


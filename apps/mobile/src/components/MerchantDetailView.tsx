import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type MerchantListItem } from "../lib/api";
import { categoryToIcon } from "../lib/categoryIcon";
import { lightTap } from "../lib/haptics";
import { s } from "../styles";

/**
 * MerchantDetailView — slide-in merchant-first detail overlay reached
 * from the Browse tab's merchant list (issue #160).
 *
 * Mental-model split (pre-#160 vs post-#160):
 *   Discover tab = "I want a deal"   → LLM-curated swipe stack
 *   Browse  tab  = "I want to see what's around" → merchant-first catalog
 *
 * Pre-#160 tapping a merchant in Browse fired the alternatives swipe
 * (Discover's job). Post-#160 the tap opens this detail surface; the
 * deal lives INSIDE the merchant context as one section among the
 * info row + hero photo + opening hours, not as a takeover swipe.
 *
 * Animation + dismiss-gesture choreography mirrors SettingsScreen:
 *   - 300ms slide-in from the right (Easing.out(Easing.exp))
 *   - 280ms slide-out to the right (Easing.in(Easing.exp))
 *   - mount-gating so the exit animation gets a chance to play
 *   - swipe-right (≥35% width or velocity > 600) → close
 *   - swipe-down  (≥25% height or velocity > 700) → close
 *   - Gesture.Race so whichever direction commits first wins
 *
 * The CTA on the active offer card hands control back to the parent
 * via `onRedeem(merchant)` so App.tsx can flip the demo state machine
 * into `step="offer" → "redeeming" → "success"` without this component
 * knowing about widget specs.
 *
 * Aesthetic: cream surface (matches Settings + History) with a
 * full-bleed merchant hero photo + a single white card per content
 * section. SF Symbols throughout for the native iOS feel.
 */

type Props = {
  /** The merchant to render. When null, the overlay is dismissed. */
  merchant: MerchantListItem | null;
  /** Tap handler for the chevron / swipe-right dismissal. */
  onClose: () => void;
  /**
   * Fired when the user taps "Redeem now" on the active offer card.
   * App.tsx flips the demo state machine into the existing
   * offer→redeeming→success path so we don't have to know about
   * widget specs in here.
   */
  onRedeem: (merchant: MerchantListItem) => void;
  /**
   * Fired when the user taps "Open Discover" on the no-offer
   * placeholder card. App.tsx flips `viewMode` to "discover".
   */
  onGoToDiscover: () => void;
};

/**
 * Picks a hero image for the merchant. We don't have backend-served
 * photos yet; we re-use the canonical rainHero unsplash photo for the
 * Cafe Bondi demo merchant (so the hero matches the offer surface) and
 * fall back to a category-shaped unsplash photo otherwise. Keeps the
 * detail view feeling alive without any new asset pipeline.
 */
function heroImageFor(merchant: MerchantListItem): string {
  if (merchant.id === "berlin-mitte-cafe-bondi") {
    return "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=1200&q=80";
  }
  switch (merchant.category) {
    case "cafe":
      return "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80";
    case "bakery":
      return "https://images.unsplash.com/photo-1568254183919-78a4f43a2877?auto=format&fit=crop&w=1200&q=80";
    case "bookstore":
      return "https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=1200&q=80";
    case "ice_cream":
      return "https://images.unsplash.com/photo-1501443762994-82bd5dace89a?auto=format&fit=crop&w=1200&q=80";
    case "restaurant":
      return "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80";
    case "bar":
      return "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=1200&q=80";
    case "boutique":
      return "https://images.unsplash.com/photo-1521334884684-d80222895322?auto=format&fit=crop&w=1200&q=80";
    case "florist":
      return "https://images.unsplash.com/photo-1469371670807-013ccf25f16a?auto=format&fit=crop&w=1200&q=80";
    case "kiosk":
      return "https://images.unsplash.com/photo-1572162018073-93dc60a4ff95?auto=format&fit=crop&w=1200&q=80";
    default:
      return "https://images.unsplash.com/photo-1559925393-8be0ec4767c8?auto=format&fit=crop&w=1200&q=80";
  }
}

function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

function formatCategory(c: string): string {
  const clean = c.replace(/_/g, " ");
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export function MerchantDetailView({
  merchant,
  onClose,
  onRedeem,
  onGoToDiscover,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  // Whether the overlay is logically visible. We treat `merchant != null`
  // as the show signal; the actual unmount waits for the exit animation
  // to finish (mount-gating mirrors SettingsScreen).
  const visible = merchant != null;

  const translateX = useSharedValue(width);
  const translateY = useSharedValue(0);
  const [mounted, setMounted] = useState(visible);
  // Cache the merchant object across the dismissal animation so the
  // content keeps rendering while the overlay slides off-screen. Without
  // this the parent flips `merchant` to null, our memoised content goes
  // empty, and the user sees a blank cream rectangle for 280ms.
  const [activeMerchant, setActiveMerchant] = useState<MerchantListItem | null>(
    merchant,
  );
  useEffect(() => {
    if (merchant) setActiveMerchant(merchant);
  }, [merchant]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateX.value = withTiming(0, {
        duration: 300,
        easing: Easing.out(Easing.exp),
      });
      translateY.value = 0;
    } else {
      translateX.value = withTiming(
        width,
        { duration: 280, easing: Easing.in(Easing.exp) },
        (finished) => {
          if (finished) {
            runOnJS(setMounted)(false);
          }
        },
      );
    }
  }, [visible, width, translateX, translateY]);

  const overlayStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  // Mirror SettingsScreen — swipe-right dismiss, ≥12pt activation, fail
  // if vertical motion ≥15pt so the swipe-down gesture wins for that
  // axis. ≥35% width or velocity > 600 commits the dismissal.
  const swipeRight = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([12, 9999])
        .failOffsetY([-15, 15])
        .onChange((e) => {
          translateX.value = Math.max(0, e.translationX);
        })
        .onEnd((e) => {
          const shouldClose =
            e.translationX > width * 0.35 || e.velocityX > 600;
          if (shouldClose) {
            translateX.value = withTiming(width, {
              duration: 220,
              easing: Easing.out(Easing.exp),
            });
            runOnJS(onClose)();
          } else {
            translateX.value = withTiming(0, {
              duration: 220,
              easing: Easing.out(Easing.exp),
            });
          }
        }),
    [width, translateX, onClose],
  );

  // Companion swipe-down dismissal — same shape as SettingsScreen.
  const swipeDown = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([12, 9999])
        .failOffsetX([-15, 15])
        .onChange((e) => {
          translateY.value = Math.max(0, e.translationY);
        })
        .onEnd((e) => {
          const shouldClose =
            e.translationY > height * 0.25 || e.velocityY > 700;
          if (shouldClose) {
            translateY.value = withTiming(height, {
              duration: 220,
              easing: Easing.out(Easing.exp),
            });
            runOnJS(onClose)();
          } else {
            translateY.value = withTiming(0, {
              duration: 220,
              easing: Easing.out(Easing.exp),
            });
          }
        }),
    [height, translateY, onClose],
  );

  const dismissGesture = useMemo(
    () => Gesture.Race(swipeRight, swipeDown),
    [swipeRight, swipeDown],
  );

  if (!mounted || !activeMerchant) return null;

  const m = activeMerchant;
  const icon = categoryToIcon(m.category);
  const heroUri = heroImageFor(m);
  const hasOffer = m.active_offer != null;

  return (
    <GestureDetector gesture={dismissGesture}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          ...s("bg-cream"),
          overlayStyle,
          { paddingTop: insets.top + 10 },
        ]}
        pointerEvents="auto"
      >
        {/* Header: chevron-back + merchant name + category badge */}
        <View
          style={[
            ...s("flex-row items-center px-5"),
            { paddingTop: 8, paddingBottom: 12, gap: 8 },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Browse"
            onPress={() => {
              lightTap();
              onClose();
            }}
            hitSlop={12}
            style={({ pressed }) => [
              ...s("flex-row items-center"),
              {
                opacity: pressed ? 0.55 : 1,
                marginLeft: -6,
                paddingVertical: 6,
                paddingRight: 4,
              },
            ]}
          >
            <SymbolView
              name="chevron.left"
              tintColor="#f2542d"
              size={22}
              weight="semibold"
              style={{ width: 22, height: 22 }}
            />
          </Pressable>
          <Text
            style={[
              ...s("flex-1 text-lg font-black text-ink"),
              { letterSpacing: -0.3 },
            ]}
            numberOfLines={1}
          >
            {m.display_name}
          </Text>
          <View
            style={[
              ...s("rounded-full flex-row items-center"),
              {
                backgroundColor: "rgba(23, 18, 15, 0.06)",
                paddingHorizontal: 10,
                paddingVertical: 5,
                gap: 6,
              },
            ]}
          >
            <SymbolView
              name={icon.sfSymbol}
              tintColor={icon.tintColor}
              size={12}
              weight="semibold"
              style={{ width: 12, height: 12 }}
            />
            <Text
              style={s(
                "text-[10px] font-bold uppercase tracking-[1px] text-cocoa",
              )}
            >
              {formatCategory(m.category)}
            </Text>
          </View>
        </View>

        <ScrollView
          style={s("flex-1")}
          contentContainerStyle={[
            ...s("px-5"),
            { paddingBottom: Math.max(insets.bottom, 16) + 32, paddingTop: 4 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero photo — full-bleed, ~250pt tall, rounded corners. */}
          <View
            style={[
              ...s("rounded-2xl"),
              {
                width: "100%",
                height: 250,
                overflow: "hidden",
                backgroundColor: "rgba(23, 18, 15, 0.06)",
              },
            ]}
          >
            <Image
              source={{ uri: heroUri }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
              accessibilityLabel={`${m.display_name} storefront photo`}
            />
          </View>

          {/* Info row: distance · neighborhood / hours / map link */}
          <View
            style={[
              ...s("rounded-2xl bg-white mt-4"),
              {
                borderWidth: 1,
                borderColor: "rgba(23, 18, 15, 0.06)",
                overflow: "hidden",
              },
            ]}
          >
            <InfoRow
              sfSymbol="location.fill"
              tint="#356f95"
              label={`${formatDistance(m.distance_m)} · ${m.neighborhood}`}
            />
            <RowSeparator />
            <InfoRow
              sfSymbol="clock.fill"
              tint="#6f3f2c"
              label="Open until 18:00"
            />
            <RowSeparator />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View on map (coming soon)"
              onPress={() => lightTap()}
              style={({ pressed }) => [
                ...s("flex-row items-center justify-between px-4"),
                {
                  paddingVertical: 14,
                  minHeight: 52,
                  opacity: pressed ? 0.55 : 1,
                },
              ]}
            >
              <View style={s("flex-row items-center")}>
                <SymbolView
                  name="map.fill"
                  tintColor="#f2542d"
                  size={14}
                  weight="semibold"
                  style={{ width: 16, height: 16, marginRight: 10 }}
                />
                <Text style={s("text-sm font-bold text-spark")}>
                  View on map
                </Text>
              </View>
              <SymbolView
                name="chevron.right"
                tintColor="rgba(23, 18, 15, 0.3)"
                size={12}
                weight="medium"
                style={{ width: 12, height: 12 }}
              />
            </Pressable>
          </View>

          {/* Active offer card OR no-offer placeholder */}
          {hasOffer && m.active_offer ? (
            <View
              style={[
                ...s("rounded-2xl bg-white mt-4 p-5"),
                {
                  borderWidth: 1,
                  borderColor: "rgba(23, 18, 15, 0.08)",
                },
              ]}
            >
              <View style={s("flex-row items-start justify-between")}>
                <View style={[...s("flex-1"), { paddingRight: 12 }]}>
                  <Text
                    style={s(
                      "text-[11px] font-bold uppercase tracking-[2px] text-cocoa",
                    )}
                  >
                    Active offer
                  </Text>
                  <Text
                    style={[
                      ...s("mt-2 text-lg font-black text-ink"),
                      { letterSpacing: -0.2, lineHeight: 24 },
                    ]}
                  >
                    {m.active_offer.headline}
                  </Text>
                </View>
                <View
                  style={[
                    ...s("rounded-full bg-spark"),
                    {
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      alignSelf: "flex-start",
                    },
                  ]}
                >
                  <Text
                    style={s(
                      "text-xs font-black uppercase tracking-[1px] text-white",
                    )}
                  >
                    {m.active_offer.discount}
                  </Text>
                </View>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Redeem this offer"
                onPress={() => {
                  lightTap();
                  onRedeem(m);
                }}
                style={({ pressed }) => [
                  ...s("rounded-2xl bg-spark mt-5 items-center justify-center"),
                  {
                    paddingVertical: 14,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text
                  style={s(
                    "text-sm font-black uppercase tracking-[1px] text-white",
                  )}
                >
                  Redeem now
                </Text>
              </Pressable>
            </View>
          ) : (
            <View
              style={[
                ...s("rounded-2xl mt-4 p-5"),
                {
                  borderWidth: 1,
                  borderColor: "rgba(23, 18, 15, 0.08)",
                  borderStyle: "dashed",
                  backgroundColor: "rgba(255, 248, 238, 0.6)",
                },
              ]}
            >
              <Text
                style={s(
                  "text-[11px] font-bold uppercase tracking-[2px] text-cocoa",
                )}
              >
                No active offer
              </Text>
              <Text
                style={[
                  ...s("mt-2 text-sm text-neutral-600"),
                  { lineHeight: 20 },
                ]}
              >
                No active offer right now — check Discover for what&apos;s
                trending nearby.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open Discover tab"
                onPress={() => {
                  lightTap();
                  onGoToDiscover();
                }}
                hitSlop={8}
                style={({ pressed }) => [
                  ...s("flex-row items-center mt-3"),
                  { opacity: pressed ? 0.55 : 1 },
                ]}
              >
                <SymbolView
                  name="sparkles"
                  tintColor="#f2542d"
                  size={14}
                  weight="semibold"
                  style={{ width: 14, height: 14, marginRight: 6 }}
                />
                <Text style={s("text-sm font-bold text-spark")}>
                  Open Discover
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </GestureDetector>
  );
}

function InfoRow({
  sfSymbol,
  tint,
  label,
}: {
  sfSymbol: Parameters<typeof SymbolView>[0]["name"];
  tint: string;
  label: string;
}) {
  return (
    <View
      style={[
        ...s("flex-row items-center px-4"),
        { paddingVertical: 14, minHeight: 52 },
      ]}
    >
      <SymbolView
        name={sfSymbol}
        tintColor={tint}
        size={14}
        weight="semibold"
        style={{ width: 16, height: 16, marginRight: 10 }}
      />
      <Text style={s("flex-1 text-sm text-ink")} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function RowSeparator() {
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: "rgba(23, 18, 15, 0.08)",
        marginLeft: 16,
      }}
    />
  );
}

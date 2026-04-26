/**
 * BottomNavBar — custom JS bottom navbar (issue #152, expanded in #154,
 * badge mechanics overhauled in #175, Discover hero-circle in #181).
 *
 * Five top-level views switched by a 5-tab navbar:
 *   • Discover (default) — full-screen swipe stack + lens chips, no map.
 *   • Wallet              — saved-passes list (added in #154).
 *   • Browse              — map + drawer (search + list + weather card).
 *   • History             — past redemptions list (was overlay pre-#154).
 *   • Settings            — settings + dev panel (was overlay pre-#154).
 *
 * Tab order (#181 promoted Discover to the geometric center):
 *
 *     [Wallet]  [Browse]  [Discover ✨]  [History]  [Settings]
 *                            ▲ HERO (lifted spark circle)
 *
 * The navbar replaces the floating gear/clock icons that used to live in
 * the top-right of the Browse view — those are now tabs. The top-LEFT
 * weather pill (city-swap affordance) stays since it's not navigation.
 *
 * Why custom JS instead of `react-native-bottom-tabs`:
 *   The native UITabBarController route was tried in #103 and abandoned —
 *   we want full control over the visual (cream palette, spark active
 *   styling, the lifted Discover FAB-circle, no system blur) plus we
 *   want the wallet drawer to lay out *under* the navbar without iOS'
 *   additionalSafeAreaInsets piping the navbar height into every child
 *   scene's safe-area inset (which double-counts when the drawer also
 *   reads bottom-inset for its own layout).
 *
 * Visual (matches the cream wallet palette):
 *   - Cream background (`#fff8ee`), height ~64pt + bottom safe-area
 *     inset. The navbar's paddingTop bumps up by ~10pt to accommodate
 *     the lifted Discover circle without it clipping above the navbar.
 *   - Subtle top border `rgba(23, 18, 15, 0.08)` so the navbar separates
 *     from the view content above it without a hard line.
 *   - Outer tabs (Wallet / Browse / History / Settings):
 *       Active   — spark icon (`#f2542d`) + spark label, semibold weight.
 *       Inactive — cocoa icon + cocoa label (`#6f3f2c`).
 *   - Discover hero (#181):
 *       ~56pt circle, ALWAYS displays the white `sparkles` symbol.
 *       Active   — spark fill (`#f2542d`), spark stroke ring offset 3pt
 *                  beyond the edge, spark "Discover" label below the
 *                  circle.
 *       Inactive — ink fill (`#17120f`), no ring, NO label (the icon is
 *                  iconic enough on its own — the bare circle silhouette
 *                  doubles as the affordance).
 *       Lift     — translateY=-8 so the circle visually sits slightly
 *                  above the navbar's top edge (Apple Music's center
 *                  player icon pattern).
 *       Shadow   — soft spark-tinted shadow under the circle so it pops
 *                  off the navbar baseline.
 *   - Issue #175 — counted badges on Discover + Wallet. Both replace the
 *     old boolean red dot with a pill that shows a digit (count of
 *     unseen specials / saved passes). Spark fill on Wallet (against
 *     cream); ink fill on Discover when the circle is spark, spark fill
 *     when the circle is ink — the badge always carries a 1.5pt cream
 *     border so it pops against either backdrop. Hidden when count = 0.
 *
 * Layout — Approach A (absolute floating circle, #181):
 *   The 4 outer tabs lay out in a `flex-row justify-around` row at the
 *   navbar baseline. The Discover circle is absolutely positioned —
 *   centered horizontally with `left:0, right:0, alignItems:center` —
 *   and lifted up by translateY=-8. This frees the outer-tab row from
 *   having to size around the larger circle, and keeps the lift effect
 *   from collapsing the row's flex math. A center spacer in the row
 *   reserves horizontal real estate so the outer tabs don't drift under
 *   the circle.
 *
 * The component is purely presentational — App.tsx owns `viewMode` and
 * reacts to `onViewChange`. Tap fires a `lightTap` haptic so the switch
 * feels deliberate.
 */

import { SymbolView } from "expo-symbols";
import type { ReactElement } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SFSymbol } from "sf-symbols-typescript";

import { lightTap } from "../lib/haptics";
import { s } from "../styles";

export type ViewMode =
  | "discover"
  | "wallet"
  | "browse"
  | "history"
  | "settings";

type TabSpec = {
  key: ViewMode;
  label: string;
  sfSymbol: SFSymbol;
};

// Outer tabs only (4 of 5). Discover is rendered separately as the
// centered hero circle — see <DiscoverHeroTab/>. Order is L→R as it
// appears in the navbar baseline row, with the Discover circle floating
// over the gap between Browse and History.
const OUTER_TABS: readonly TabSpec[] = [
  { key: "wallet", label: "Wallet", sfSymbol: "wallet.pass.fill" },
  { key: "browse", label: "Browse", sfSymbol: "map.fill" },
  { key: "history", label: "History", sfSymbol: "clock.fill" },
  { key: "settings", label: "Settings", sfSymbol: "gearshape.fill" },
] as const;

const DISCOVER_TAB: TabSpec = {
  key: "discover",
  label: "Discover",
  sfSymbol: "sparkles",
};

// Discover hero geometry. The 56pt circle is the iOS-HIG minimum tap
// target. The 8pt lift is small enough that the circle still visually
// belongs to the navbar (vs floating completely free) but large enough
// to read as "elevated above the rest of the row".
const DISCOVER_CIRCLE = 56;
const DISCOVER_LIFT = 8;
// Active ring sits 3pt off the circle's edge — the gap is what makes it
// read as a *ring* rather than a thicker stroke on the circle itself.
const DISCOVER_RING_OFFSET = 3;
const DISCOVER_RING_WIDTH = 1.5;

type Props = {
  activeView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  /** Issue #175 — counted badge on the Discover tab. Shows the integer
   *  count of unseen `is_special_surface=true` variants the user hasn't
   *  yet swiped through. The badge persists across tab switches — it's
   *  only cleared as the user actually consumes (swipes left/right) the
   *  underlying special cards in DiscoverView. 0 hides the badge. */
  discoverBadgeCount?: number;
  /** Issue #175 — counted badge on the Wallet tab. Shows the integer
   *  count of saved passes (`savedPasses.length` in App.tsx). 0 hides
   *  the badge. Decrements automatically when passes are redeemed or
   *  removed since both flow back through `savedPasses` state. */
  walletBadgeCount?: number;
};

export function BottomNavBar({
  activeView,
  onViewChange,
  discoverBadgeCount = 0,
  walletBadgeCount = 0,
}: Props): ReactElement {
  const insets = useSafeAreaInsets();
  const handleSelect = (key: ViewMode) => {
    if (key !== activeView) {
      lightTap();
      onViewChange(key);
    }
  };
  return (
    <View
      style={[
        ...s("bg-cream"),
        {
          paddingBottom: insets.bottom,
          // Top padding bumped from 6→16 (#181) so the lifted Discover
          // circle has visual clearance above the navbar's top edge
          // without clipping. Combined with the circle's translateY=-8,
          // the circle's apex sits ~16pt above the inner content row.
          paddingTop: 16,
          // Hard 64pt content row above the safe-area inset — bumped
          // slightly to host the lifted hero. Total bar height ≈
          // 64 + insets.bottom on iPhones with a home indicator.
          minHeight: 64,
          borderTopWidth: 1,
          borderTopColor: "rgba(23, 18, 15, 0.08)",
        },
      ]}
    >
      {/* Outer tab row — 4 tabs with a center spacer carved out so the
          floating Discover circle doesn't sit on top of any sibling. */}
      <View style={s("flex-row")}>
        <OuterNavTab
          spec={OUTER_TABS[0]}
          active={activeView === OUTER_TABS[0].key}
          badgeCount={walletBadgeCount}
          onPress={() => handleSelect(OUTER_TABS[0].key)}
        />
        <OuterNavTab
          spec={OUTER_TABS[1]}
          active={activeView === OUTER_TABS[1].key}
          badgeCount={0}
          onPress={() => handleSelect(OUTER_TABS[1].key)}
        />
        {/* Center spacer — same flex weight as a tab so the 4 outer
            tabs remain evenly spaced and the Discover circle has its
            own column to float over. */}
        <View style={{ flex: 1 }} />
        <OuterNavTab
          spec={OUTER_TABS[2]}
          active={activeView === OUTER_TABS[2].key}
          badgeCount={0}
          onPress={() => handleSelect(OUTER_TABS[2].key)}
        />
        <OuterNavTab
          spec={OUTER_TABS[3]}
          active={activeView === OUTER_TABS[3].key}
          badgeCount={0}
          onPress={() => handleSelect(OUTER_TABS[3].key)}
        />
      </View>

      {/* Discover hero — absolutely positioned, horizontally centered
          over the full navbar width, lifted via translateY. Lives outside
          the flex row so the lift doesn't push the row down. */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          alignItems: "center",
        }}
      >
        <DiscoverHeroTab
          spec={DISCOVER_TAB}
          active={activeView === DISCOVER_TAB.key}
          badgeCount={discoverBadgeCount}
          onPress={() => handleSelect(DISCOVER_TAB.key)}
        />
      </View>
    </View>
  );
}

function OuterNavTab({
  spec,
  active,
  badgeCount,
  onPress,
}: {
  spec: TabSpec;
  active: boolean;
  badgeCount: number;
  onPress: () => void;
}): ReactElement {
  const tintColor = active ? "#f2542d" : "#6f3f2c";
  const showBadge = badgeCount > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        showBadge
          ? `Switch to ${spec.label} — ${badgeCount} new`
          : `Switch to ${spec.label}`
      }
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        ...s("flex-1 items-center justify-center"),
        { opacity: pressed ? 0.7 : 1, paddingTop: 6, paddingBottom: 4 },
      ]}
    >
      {/* Wrap the icon so the counted badge can absolute-position
          relative to the icon (top-right). The wrapper is a fixed
          22x22 square matching the SymbolView's intrinsic size so the
          badge anchor stays stable across active/inactive weight
          changes. */}
      <View style={{ width: 22, height: 22 }}>
        <SymbolView
          name={spec.sfSymbol}
          tintColor={tintColor}
          size={22}
          weight={active ? "semibold" : "regular"}
          style={{ width: 22, height: 22 }}
        />
        {showBadge ? (
          // Issue #175 — counted badge. Spark fill, white border so it
          // reads against the cream navbar AND against the spark icon
          // when the tab is active. Anchored top-right of the icon —
          // Apple Mail / iMessage badge convention. minWidth=16 + auto
          // width keeps the pill snug for single digits and grows
          // gracefully for 2+ digits without ever clipping.
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: -6,
              right: -10,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              paddingHorizontal: 5,
              backgroundColor: "#f2542d",
              borderWidth: 1,
              borderColor: "#fff8ee",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: "#ffffff",
                fontSize: 10,
                fontWeight: "800",
                lineHeight: 12,
                letterSpacing: 0.1,
              }}
            >
              {String(badgeCount)}
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        style={{
          fontSize: 10,
          marginTop: 2,
          fontWeight: active ? "800" : "600",
          color: tintColor,
          letterSpacing: 0.1,
        }}
      >
        {spec.label}
      </Text>
    </Pressable>
  );
}

/**
 * DiscoverHeroTab — the centered FAB-style spark circle (#181). This is
 * the visual focal point of the navbar; it reads as the primary action
 * of the app. Always renders the white `sparkles` symbol so the icon is
 * recognizable regardless of active/inactive state — what changes is
 * the circle fill, the optional ring, and the optional label.
 */
function DiscoverHeroTab({
  spec,
  active,
  badgeCount,
  onPress,
}: {
  spec: TabSpec;
  active: boolean;
  badgeCount: number;
  onPress: () => void;
}): ReactElement {
  const showBadge = badgeCount > 0;
  // Inverse of the outer tabs: spark fill when active, ink when inactive
  // (vs cream/cocoa-text on the others). The contrast inversion is what
  // makes the circle read as "different rhythm" from its siblings.
  const circleBackground = active ? "#f2542d" : "#17120f";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        showBadge
          ? `Switch to ${spec.label} — ${badgeCount} new`
          : `Switch to ${spec.label}`
      }
      accessibilityState={{ selected: active }}
      onPress={onPress}
      // Tap target is the full hero column: the 56pt circle plus its
      // lift area plus the label slot below — comfortably above the
      // 56pt iOS HIG minimum. Hit-slop bumped slightly to forgive
      // edge-of-circle taps that hit the lift gap.
      hitSlop={8}
      style={({ pressed }) => ({
        opacity: pressed ? 0.85 : 1,
        alignItems: "center",
        // Lifts the entire hero column so the circle's apex sits above
        // the navbar's top edge. The label below the circle rides up
        // with it, keeping the icon-to-label rhythm tight.
        transform: [{ translateY: -DISCOVER_LIFT }],
      })}
    >
      {/* Circle wrapper — sized to fit both the circle and its outer
          ring. Position-relative so the absolute ring + badge anchor
          against the circle's geometry. */}
      <View
        style={{
          width: DISCOVER_CIRCLE,
          height: DISCOVER_CIRCLE,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Active ring — sits 3pt off the circle's edge as a faint
            spark stroke. Rendered before the circle so the circle's
            shadow sits on top of the ring's pixels (the ring is below
            the circle in the visual stack but doesn't matter visually
            since they don't overlap). */}
        {active ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              width: DISCOVER_CIRCLE + DISCOVER_RING_OFFSET * 2,
              height: DISCOVER_CIRCLE + DISCOVER_RING_OFFSET * 2,
              borderRadius:
                (DISCOVER_CIRCLE + DISCOVER_RING_OFFSET * 2) / 2,
              borderWidth: DISCOVER_RING_WIDTH,
              borderColor: "#f2542d",
              opacity: 0.55,
            }}
          />
        ) : null}

        {/* The circle itself. Shadow tints spark so the lifted-FAB
            effect reads warm rather than gray. */}
        <View
          style={{
            width: DISCOVER_CIRCLE,
            height: DISCOVER_CIRCLE,
            borderRadius: DISCOVER_CIRCLE / 2,
            backgroundColor: circleBackground,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#f2542d",
            shadowOpacity: 0.18,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            // Android shadow approximation. Subtle to avoid the gray-
            // ring elevation outline on Material backgrounds.
            elevation: 6,
          }}
        >
          <SymbolView
            name={spec.sfSymbol}
            tintColor="#ffffff"
            size={22}
            weight="semibold"
            style={{ width: 22, height: 22 }}
          />
        </View>

        {/* Counted badge (#175, repositioned in #181). Anchored to the
            circle's top-right. Cream 1.5pt border bumps the contrast
            against either the spark or ink circle backdrop. Fill flips
            against the circle: ink-on-spark when active, spark-on-ink
            when inactive — either way the badge reads as a distinct
            chip rather than blending into the circle. */}
        {showBadge ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              // Top-right of the circle — the badge straddles the
              // circle's edge so it anchors to the circle, not the
              // surrounding ring slot.
              top: -2,
              right: -6,
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              paddingHorizontal: 5,
              backgroundColor: active ? "#17120f" : "#f2542d",
              borderWidth: 1.5,
              borderColor: "#fff8ee",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: "#ffffff",
                fontSize: 10,
                fontWeight: "800",
                lineHeight: 12,
                letterSpacing: 0.1,
              }}
            >
              {String(badgeCount)}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Label only when active — the iconic spark circle is enough to
          identify the tab on its own when inactive, so the label is
          dropped to keep the inactive state quieter than its siblings.
          Reserve a fixed-height slot either way so the circle's
          vertical position doesn't shift between active/inactive
          (otherwise the lifted column would visibly bob on tab change). */}
      <View style={{ height: 14, marginTop: 2, justifyContent: "center" }}>
        {active ? (
          <Text
            style={{
              fontSize: 10,
              fontWeight: "800",
              color: "#f2542d",
              letterSpacing: 0.1,
            }}
          >
            {spec.label}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

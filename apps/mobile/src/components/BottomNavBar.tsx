/**
 * BottomNavBar — custom JS bottom navbar (issue #152, expanded in #154).
 *
 * Five top-level views switched by a 5-tab navbar:
 *   • Discover (default) — full-screen swipe stack + lens chips, no map.
 *   • Wallet              — saved-passes list (added in #154).
 *   • Browse              — map + drawer (search + list + weather card).
 *   • History             — past redemptions list (was overlay pre-#154).
 *   • Settings            — settings + dev panel (was overlay pre-#154).
 *
 * The navbar replaces the floating gear/clock icons that used to live in
 * the top-right of the Browse view — those are now tabs. The top-LEFT
 * weather pill (city-swap affordance) stays since it's not navigation.
 *
 * Why custom JS instead of `react-native-bottom-tabs`:
 *   The native UITabBarController route was tried in #103 and abandoned —
 *   we want full control over the visual (cream palette, spark active dot,
 *   no system blur) plus we want the wallet drawer to lay out *under*
 *   the navbar without iOS' additionalSafeAreaInsets piping the navbar
 *   height into every child scene's safe-area inset (which double-counts
 *   when the drawer also reads bottom-inset for its own layout).
 *
 * Visual (matches the cream wallet palette):
 *   - Cream background (`#fff8ee`), height ~64pt + bottom safe-area inset.
 *   - Subtle top border `rgba(23, 18, 15, 0.08)` so the navbar separates
 *     from the view content above it without a hard line.
 *   - Active tab: spark text (`#f2542d`) + small spark dot below the icon.
 *   - Inactive tab: cocoa text (`#6f3f2c`), no dot.
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

const TABS: readonly TabSpec[] = [
  { key: "discover", label: "Discover", sfSymbol: "sparkles" },
  { key: "wallet", label: "Wallet", sfSymbol: "wallet.pass.fill" },
  { key: "browse", label: "Browse", sfSymbol: "map.fill" },
  { key: "history", label: "History", sfSymbol: "clock.fill" },
  { key: "settings", label: "Settings", sfSymbol: "gearshape.fill" },
] as const;

type Props = {
  activeView: ViewMode;
  onViewChange: (view: ViewMode) => void;
};

export function BottomNavBar({ activeView, onViewChange }: Props): ReactElement {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        ...s("flex-row bg-cream"),
        {
          paddingBottom: insets.bottom,
          paddingTop: 6,
          // Hard 64pt content row above the safe-area inset. Total bar
          // height ≈ 64 + insets.bottom on iPhones with a home indicator.
          minHeight: 64,
          borderTopWidth: 1,
          borderTopColor: "rgba(23, 18, 15, 0.08)",
        },
      ]}
    >
      {TABS.map((tab) => {
        const isActive = tab.key === activeView;
        return (
          <NavTab
            key={tab.key}
            spec={tab}
            active={isActive}
            onPress={() => {
              if (!isActive) {
                lightTap();
                onViewChange(tab.key);
              }
            }}
          />
        );
      })}
    </View>
  );
}

function NavTab({
  spec,
  active,
  onPress,
}: {
  spec: TabSpec;
  active: boolean;
  onPress: () => void;
}): ReactElement {
  const tintColor = active ? "#f2542d" : "#6f3f2c";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Switch to ${spec.label}`}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        ...s("flex-1 items-center justify-center"),
        { opacity: pressed ? 0.7 : 1, paddingTop: 6, paddingBottom: 4 },
      ]}
    >
      <SymbolView
        name={spec.sfSymbol}
        tintColor={tintColor}
        size={22}
        weight={active ? "semibold" : "regular"}
        style={{ width: 22, height: 22 }}
      />
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
      {/* Small spark dot under the active label — subtle indicator of
          which view is current. Inactive tabs render an equally-sized
          transparent spacer so labels stay vertically aligned across
          tap states. */}
      <View
        style={{
          width: 4,
          height: 4,
          borderRadius: 2,
          marginTop: 3,
          backgroundColor: active ? "#f2542d" : "transparent",
        }}
      />
    </Pressable>
  );
}

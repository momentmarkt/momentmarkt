import { type ReactElement, type ReactNode, useMemo } from "react";
import { View } from "react-native";
import TabView from "react-native-bottom-tabs";
// SFSymbol comes from sf-symbols-typescript (a transitive dep of
// react-native-bottom-tabs). The lib's AppleIcon shape is `{ sfSymbol:
// SFSymbol }` — using that strict union here keeps typos in symbol names
// catchable at compile time.
import type { SFSymbol } from "sf-symbols-typescript";

import { s } from "../styles";

/**
 * NativeTabBar — Phase 1 of the native tab bar swap (issue #102 Track 1).
 *
 * Wraps `react-native-bottom-tabs` so the existing custom JS bottom menu in
 * App.tsx can be replaced with a real iOS UITabBarController (and an Android
 * BottomNavigationView) by Track 2 (#103). Because this lib is a *native*
 * module, an EAS / dev-client rebuild is required before the component
 * actually mounts on device — Track 2 owns that rebuild. Until then this
 * file is dormant and only needs to typecheck.
 *
 * Prop contract (designed to drop in cleanly when Track 2 rewrites App.tsx):
 *   - `activeTab`       — the currently selected tab key
 *   - `onChangeTab`     — called when the user taps a different tab
 *   - `children`        — a map keyed by TabKey of each tab's screen content
 *
 * The 5 tabs (Home / Offer / QR / History / Settings) match the existing
 * inline `<BottomMenu />` in App.tsx (5-tab layout post-issue #87). App.tsx
 * uses different internal state names (`silent`, `redeeming`) for some of
 * these tabs — Track 2 will translate between this component's TabKey and
 * the demo state machine when wiring it in.
 *
 * SF Symbols are used for icons because react-native-bottom-tabs renders the
 * icon natively (UITabBarController on iOS expects either a UIImage or an
 * SF Symbol name). The Ionicons used elsewhere in the app are JS-rendered
 * and can't be passed through to the native tab bar — using SF Symbols here
 * is what makes the bar feel like a real iOS tab bar instead of a JS shim.
 * (See README + types.ts in node_modules/react-native-bottom-tabs for the
 * accepted icon shapes.)
 */

export type NativeTabKey = "home" | "qr" | "history" | "settings";

export type NativeTabBarProps = {
  activeTab: NativeTabKey;
  onChangeTab: (tab: NativeTabKey) => void;
  children: Record<NativeTabKey, ReactNode>;
};

type TabDef = {
  key: NativeTabKey;
  title: string;
  /** SF Symbol name for the inactive state. iOS auto-fills the active
   *  variant when the tab is selected; passing the outline form here gives
   *  us the standard Apple "outline → fill" toggle without a second symbol
   *  declaration. */
  sfSymbol: SFSymbol;
};

// "Offer" intentionally omitted — surfacing fires inside the wallet drawer
// on the Home tab, so a standalone Offer tab was redundant. The drawer's
// expanded slot is the canonical surface for the active offer.
const TABS: ReadonlyArray<TabDef> = [
  { key: "home", title: "Home", sfSymbol: "house" },
  { key: "qr", title: "QR", sfSymbol: "qrcode" },
  { key: "history", title: "History", sfSymbol: "clock" },
  { key: "settings", title: "Settings", sfSymbol: "gearshape" },
];

type Route = {
  key: NativeTabKey;
  title: string;
  // The lib's BaseRoute accepts `{ sfSymbol: SFSymbol }` for focusedIcon.
  // SFSymbol is a closed string union from sf-symbols-typescript so typos
  // in icon names fail at compile time.
  focusedIcon: { sfSymbol: SFSymbol };
};

export function NativeTabBar({
  activeTab,
  onChangeTab,
  children,
}: NativeTabBarProps): ReactElement {
  const routes = useMemo<Route[]>(
    () =>
      TABS.map((t) => ({
        key: t.key,
        title: t.title,
        focusedIcon: { sfSymbol: t.sfSymbol },
      })),
    [],
  );

  const index = Math.max(
    0,
    TABS.findIndex((t) => t.key === activeTab),
  );

  const navigationState = { index, routes };

  return (
    // TabView is the default export of react-native-bottom-tabs. It expects
    // navigationState ({ index, routes }) + renderScene + onIndexChange,
    // mirroring react-native-tab-view's shape. The active/inactive tint
    // colors match the spark/neutral palette used by the existing JS
    // BottomMenu so the visual identity is preserved across the swap.
    <View style={s("flex-1")}>
      {/* TabView is generic over its Route type; passing our Route
          ensures focusedIcon ({ sfSymbol }) and key are typed end-to-end. */}
      <TabView<Route>
        navigationState={navigationState}
        onIndexChange={(i: number) => {
          const next = TABS[i];
          if (next) onChangeTab(next.key);
        }}
        renderScene={({ route }) =>
          (children[route.key] ?? null) as ReactElement | null
        }
        // Cream/cocoa palette to match Settings + History (the rest of the
        // app's primary surfaces). Active tint stays spark so the selected
        // icon reads as the brand accent. Translucent UITabBar over the
        // cream tint gives the same frosted-cream material the Settings
        // header uses, so the bar never looks out of place when the dark
        // wallet sheet (Home tab) extends behind it.
        tabBarStyle={{ backgroundColor: "#fff8ee" }}
        tabBarActiveTintColor="#f2542d"
        tabBarInactiveTintColor="#6f3f2c"
        sidebarAdaptable={false}
        hapticFeedbackEnabled
      />
    </View>
  );
}

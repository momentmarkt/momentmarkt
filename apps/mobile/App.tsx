import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
// (BottomSheetView still used as wrapper for redeem/success steps; the
// scroll-aware sheet content lives inside WalletSheetContent — issue #88.
// BottomSheetScrollView is also used inside SheetBody's focused offer view —
// issue #122.)
import { StatusBar } from "expo-status-bar";
import {
  type ComponentProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SymbolView } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";

import { BottomNavBar, type ViewMode } from "./src/components/BottomNavBar";
import { CityMap } from "./src/components/CityMap";
import { DevPanel, type DevPanelSignal } from "./src/components/DevPanel";
import { DiscoverView } from "./src/components/DiscoverView";
import { DEFAULT_LENS, type LensKey } from "./src/components/LensChips";
import { MerchantDetailView } from "./src/components/MerchantDetailView";
import { RedeemFlow } from "./src/components/RedeemFlow";
import { RedeemOverlay } from "./src/components/RedeemOverlay";
import { WalletSheetContent } from "./src/components/WalletSheetContent";
import { WalletView } from "./src/components/WalletView";
import { WidgetRenderer } from "./src/components/WidgetRenderer";
import {
  type AlternativeOffer,
  type MerchantListItem,
  type PriorSwipe,
} from "./src/lib/api";
import { lightTap } from "./src/lib/haptics";
import { makeSavedPassId, type SavedPass } from "./src/types/savedPass";
import { useSignals } from "./src/lib/useSignals";
import { cityProfiles, type DemoCityId, type DemoCityProfile } from "./src/demo/cityProfiles";
import { miaRainOffer } from "./src/demo/miaOffer";
import { demoWidgetSpecs } from "./src/demo/widgetSpecs";
import { CheckoutSuccessScreen } from "./src/screens/CheckoutSuccessScreen";
import { HistoryScreen } from "./src/screens/HistoryScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { s } from "./src/styles";
import { scoreSurfacing, type SurfacingInput } from "./src/surfacing/surfacingScore";

/**
 * App.tsx — demo state machine (issue #29) + bottom-sheet wallet drawer (#37).
 *
 * Drives the 11-beat demo cut from SPEC §The demo:
 *   silent → surfacing → offer → redeeming → success → silent
 *
 * Layout (post-#37 — Apple Wallet / Find My pattern)
 *   - Full-bleed Apple Map (PROVIDER_DEFAULT, native iOS Maps) lives in the
 *     background via StyleSheet.absoluteFill. Map is interactive (pan/zoom)
 *     only when the bottom sheet is at its lowest snap.
 *   - <BottomSheet /> from @gorhom/bottom-sheet is the wallet drawer with
 *     three snap points: 25% (collapsed), 60% (medium), 95% (expanded).
 *     The sheet's animatedIndex drives both content fade-in AND map dimming.
 *   - When the surfacing agent fires (step → "surfacing"/"offer"), we
 *     snapToIndex(2) so the offer card is revealed without a separate
 *     notification banner. The sheet expansion IS the surface event — the
 *     old SurfaceNotification banner overlay is no longer rendered.
 *   - Bottom tab bar (issue #103) is now a real iOS UITabBarController via
 *     <NativeTabBar /> (react-native-bottom-tabs). Each tab is a separate
 *     scene; the TabView renders one at a time and the native bar persists
 *     across switches with SF Symbol icons + native blur + haptics. The
 *     standalone wrench DevPanelTrigger that used to live top-right is GONE
 *     — Settings tab is the durable entry point for DevPanel content
 *     (DevPanel is folded into Settings as the "Demo & Debug" section per
 *     #80, and the contextual MapTopChip on the silent Home step still
 *     opens the DevPanelOverlay during the demo).
 *   - The canonical demo cut still runs entirely inside the Home tab's
 *     bottom sheet (silent → surfacing → offer → redeeming → success). The
 *     Offer / QR tabs are standalone consumer surfaces — useful for casual
 *     browsing but NOT what drives the recorded cut.
 *   - Wide viewports (≥820px logical width — landscape iPad / Mac sim
 *     window): the wallet area + DevPanel sidecar render directly without
 *     the NativeTabBar wrapper (the wide layout is dev-only, not the
 *     demo-recording surface).
 */

type DemoStep =
  | "silent"
  | "surfacing"
  | "offer"
  | "redeeming"
  | "success";
type WidgetVariant = keyof typeof demoWidgetSpecs;

const SIDE_BY_SIDE_BREAKPOINT = 820;
const FALLBACK_CASHBACK_EUR = 1.85;
// Issue #89: lowered top snap from 95% → 80% so the full-bleed Apple Map
// always peeks through the top strip ("wallet over a real city map" is the
// persistent backdrop). Middle snap nudged 60→55 to keep distribution roughly
// symmetric. All five demo steps verified to fit inside the 80% drawer; the
// offer step now relies on BottomSheetScrollView (issue #88) inside
// WalletSheetContent for any minor overflow on small phones.
const SHEET_SNAP_POINTS = ["25%", "55%", "80%"] as const;
// react-native-bottom-tabs renders a real UITabBarController. iOS
// propagates the tab bar's height into each child scene's
// `additionalSafeAreaInsets`, so `useSafeAreaInsets().bottom` *inside* the
// Home scene already accounts for both the home-indicator inset and the
// visible tab bar height. We use that value directly as the BottomSheet's
// bottomInset — adding a separate TAB_BAR_HEIGHT constant on top
// double-counts and lifts the sheet above the tab bar with a visible gap.

export default function App() {
  const [step, setStep] = useState<DemoStep>("silent");
  const [highIntent, setHighIntent] = useState(false);
  const [city, setCity] = useState<DemoCityId>("berlin");
  const [widgetVariant, setWidgetVariant] = useState<WidgetVariant>("rainHero");
  // Issue #132 — `settledVariant` survives the in-drawer alternatives
  // swipe path's #174 cleanup because the Wallet-tab redeem flow still
  // uses it: tapping a saved pass calls `handleRedeemPass` which sets
  // the variant + flips to step="offer" so SheetBody renders that
  // variant's widget_spec via WidgetRenderer. The MerchantDetailView
  // "Redeem now" path (#160) also clears it back to null so the
  // canonical demo widget renders for that flow.
  const [settledVariant, setSettledVariant] = useState<AlternativeOffer | null>(null);
  // Issue #156 phase 4 / Issue #175 — Discover-tab counted badge. The
  // tracker carries the variant_id of every `is_special_surface=true`
  // card the user has NOT yet swiped through. Each fresh
  // /offers/alternatives result adds new specials; each consumed card
  // (left or right swipe in DiscoverView) removes its id. The
  // BottomNavBar reads `unseenSpecialCount` and paints a counted pill.
  //
  // The badge persists across tab switches; opening Discover does NOT
  // clear it (#175 requirement — only actually swiping through the
  // cards decrements the count). `unseenSpecialIds` lives in a ref so
  // we can mutate it in-place across the add + decrement paths without
  // re-allocating a Set on every change; `unseenSpecialCount` mirrors
  // its size as state purely so the BottomNavBar re-renders when the
  // count changes (refs alone don't trigger re-renders). The two are
  // kept in sync inside `handleVariantsResolved` and `markSpecialSeen`.
  //
  // `everSeenSpecialIds` plays the dedupe role the old `seenSpecialIds`
  // ref played pre-#175 — once a special has EVER been added to the
  // unseen set, a re-fetch that re-surfaces it must NOT re-increment
  // the badge after the user already swiped through it.
  const unseenSpecialIds = useRef<Set<string>>(new Set());
  const everSeenSpecialIds = useRef<Set<string>>(new Set());
  const [unseenSpecialCount, setUnseenSpecialCount] = useState(0);
  // Issue #136 — preference history persisted across swipe rounds in this
  // session. Each round's PriorSwipe entries get appended; we send the
  // accumulated history with the NEXT /offers/alternatives call so the
  // backend's preference agent can re-rank cross-merchant candidates by
  // inferred user taste. Resets on city swap (preferences don't transfer
  // across cultural contexts; cf. DESIGN_PRINCIPLES.md #8).
  const [swipeHistory, setSwipeHistory] = useState<PriorSwipe[]>([]);
  // DevPanel overlay state (issue #70). In compact mode (<820px) the
  // engineering surface lives behind the MapTopChip; tapping it slides the
  // full DevPanel in from the right. Wide mode keeps its sidecar layout.
  const [devPanelOpen, setDevPanelOpen] = useState(false);
  const [sheetIndex, setSheetIndex] = useState(0);
  // Issue #154 — settingsOpen / historyOpen state removed. Both surfaces
  // are now navbar tabs (viewMode === "settings" / "history"); the
  // open/close lifecycle is owned by viewMode, not local booleans. The
  // overlay codepath inside SettingsScreen + HistoryScreen still works
  // for backwards compat with any direct caller, but App.tsx no longer
  // mounts them as overlays.
  // Real toggles wired through to DevPanel + (cosmetically) WalletSheetContent.
  // Cosmetic toggles inside SettingsScreen own their own local state — no
  // need to lift them up.
  const [showPrivacyEnvelope, setShowPrivacyEnvelope] = useState(true);
  const [language, setLanguage] = useState<"de" | "en">("de");
  // Issue #152 — 2-view IA refactor (now 5-view per #154). The app
  // has five top-level surfaces switched by a custom JS bottom navbar:
  //   "discover" (DEFAULT) — full-screen swipe + lens chips, no map.
  //   "wallet"             — saved-passes list (#154).
  //   "browse"             — map + drawer (search + list + weather).
  //   "history"            — past redemptions list (was overlay pre-#154).
  //   "settings"           — settings + dev panel (was overlay pre-#154).
  // The lens + swipeHistory + variants pool live here so flipping
  // views preserves the user's session state — flip to Browse, flip
  // back to Discover, the lens choice survives.
  const [viewMode, setViewMode] = useState<ViewMode>("discover");
  const [discoverLens, setDiscoverLens] = useState<LensKey>(DEFAULT_LENS);
  // Issue #154 — saved-passes mechanic. Right-swipe in Discover adds
  // a SavedPass here; the Wallet tab renders the list. Tap a pass →
  // commit to redeem flow (the same step="offer" → step="redeeming"
  // path the merchant-tap-from-Browse-list flow uses). On successful
  // redemption, the pass is removed (handled in handleRedeemComplete).
  // Session-local — see types/savedPass.ts for the persistence note.
  const [savedPasses, setSavedPasses] = useState<SavedPass[]>([]);
  // Tracks which saved pass (if any) the current redeem flow originated
  // from, so handleRedeemComplete can pop it from the list. Null for the
  // legacy demo flow + the merchant-tap-from-Browse-list flow (those
  // commits don't come from the Wallet tab).
  const [redeemingPassId, setRedeemingPassId] = useState<string | null>(null);
  // Issue #160 — merchant-first Browse: tapping a merchant in the
  // wallet drawer's merchant list opens this slide-in detail view
  // instead of triggering the alternatives swipe (which is Discover's
  // job — that's the deal-flow surface). Null while no detail is open.
  // The detail view's "Redeem now" CTA hands back to
  // handleRedeemFromMerchantDetail which routes into the existing
  // offer→redeeming→success state machine.
  const [merchantDetail, setMerchantDetail] =
    useState<MerchantListItem | null>(null);

  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const sideBySide = width >= SIDE_BY_SIDE_BREAKPOINT;

  const sheetRef = useRef<BottomSheet>(null);
  const animatedIndex = useSharedValue(0);

  const cityProfile = cityProfiles[city];
  // Issue #124: live weather + pulse strings sourced from the FastAPI
  // `/signals/{city}` endpoint, with a deterministic per-city fallback so
  // the demo recording survives an unreachable Hugging Face Space.
  const citySignals = useSignals(city);
  const surfacing = useMemo(
    () => scoreSurfacing({ ...cityProfile.surfacingInput, highIntent }),
    [cityProfile, highIntent],
  );

  const breakdown = useMemo(
    () => buildBreakdown(cityProfile.surfacingInput, highIntent),
    [cityProfile, highIntent],
  );

  const compositeState = useMemo(() => {
    const weatherChip = city === "berlin" ? "rain_incoming" : "clear";
    const demandChip =
      cityProfile.surfacingInput.demandGapRatio >= 0.4 ? "demand_gap" : "demand_normal";
    const intentChip = highIntent ? "in_market" : "browsing";
    return `${weatherChip} · ${demandChip} · ${intentChip}`;
  }, [city, cityProfile, highIntent]);

  const signals = useMemo<DevPanelSignal[]>(
    () => [
      {
        label: "weather",
        value: city === "berlin" ? "rain ~12m" : "clear",
        tone: city === "berlin" ? "warning" : "neutral",
      },
      {
        label: "demand",
        value: `${Math.round(cityProfile.surfacingInput.demandGapRatio * 100)}% gap`,
        tone: cityProfile.surfacingInput.demandGapRatio >= 0.4 ? "warning" : "neutral",
      },
      {
        label: "proximity",
        value: `${cityProfile.surfacingInput.distanceM} m`,
        tone: cityProfile.surfacingInput.distanceM <= 100 ? "good" : "neutral",
      },
    ],
    [city, cityProfile],
  );

  const aggressiveHeadline = highIntent ? surfacing.headline : null;

  useEffect(() => {
    if (step === "silent") {
      sheetRef.current?.snapToIndex(0);
      return;
    }
    // surfacing, offer, redeeming, success — all want the sheet
    // expanded so the offer widget is fully visible.
    sheetRef.current?.snapToIndex(2);
  }, [step]);

  const mapInteractive = sheetIndex <= 0;

  const handleRunSurfacing = useCallback(() => {
    setStep("surfacing");
    setTimeout(() => setStep("offer"), 250);
  }, []);

  const handleSwapCity = useCallback(() => {
    setCity((prev) => (prev === "berlin" ? "zurich" : "berlin"));
    setStep("silent");
    // Reset swipe history on city swap — preferences for Berlin cafés
    // shouldn't bias Zurich cafés (DESIGN_PRINCIPLES.md #8).
    setSwipeHistory([]);
  }, []);

  const handleToggleHighIntent = useCallback(() => {
    setHighIntent((prev) => !prev);
  }, []);

  const handleAdvanceFromOffer = useCallback(() => {
    setStep("redeeming");
  }, []);

  const handleRedeemComplete = useCallback(() => {
    // Issue #154 — if the redeem originated from a Wallet pass tap,
    // remove the pass from the saved list now that it's redeemed.
    // Defensive: clearing redeemingPassId regardless covers the
    // success-then-cancel path so a subsequent demo run doesn't
    // accidentally re-pop a stale id.
    if (redeemingPassId) {
      setSavedPasses((prev) => prev.filter((p) => p.id !== redeemingPassId));
      setRedeemingPassId(null);
    }
    setStep("success");
  }, [redeemingPassId]);

  const handleResetToSilent = useCallback(() => {
    setRedeemingPassId(null);
    setStep("silent");
  }, []);

  // Issue #154 — saved-pass save/remove/redeem handlers. Save fires
  // from the Discover swipe-right; redeem fires from the Wallet tab
  // tap; remove fires from the Wallet tab long-press confirmation.
  const handleSavePass = useCallback((variant: AlternativeOffer) => {
    const newPass: SavedPass = {
      id: makeSavedPassId(variant.variant_id),
      variant,
      saved_at_iso: new Date().toISOString(),
    };
    setSavedPasses((prev) => [newPass, ...prev]);
  }, []);

  const handleRemovePass = useCallback((id: string) => {
    setSavedPasses((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleRedeemPass = useCallback((pass: SavedPass) => {
    // Mirror the merchant-tap path: settle on the variant, jump to
    // step="offer" so SheetBody renders the focused widget. The user
    // then taps the widget CTA → step="redeeming" → step="success" →
    // handleRedeemComplete pops the pass.
    setSettledVariant(pass.variant);
    setRedeemingPassId(pass.id);
    // The redeem flow lives inside the Browse view's BottomSheet (the
    // existing focused-offer surface). Flip to Browse so the sheet is
    // visible while step !== "silent". The navbar auto-hides per
    // showNavBar = step === "silent".
    setViewMode("browse");
    setStep("offer");
  }, []);

  // Issue #160 — merchant-first Browse handlers. Tapping a merchant in
  // the Browse list opens the slide-in detail view (cream overlay,
  // hero photo, info row, active offer card). The detail view is a
  // pure presentation surface — no fetch, no state machine — so the
  // open/close is a one-line setState.
  const handleOpenMerchantDetail = useCallback(
    (merchant: MerchantListItem) => {
      lightTap();
      setMerchantDetail(merchant);
    },
    [],
  );
  const handleCloseMerchantDetail = useCallback(() => {
    setMerchantDetail(null);
  }, []);
  // "Redeem now" inside the detail view → close the detail + route into
  // the existing offer→redeeming→success state machine. Setting
  // settledVariant=null + step="offer" makes SheetBody render the
  // focused OfferStack with the canonical demo widget. The merchant's
  // discount headline shows on the detail view itself; the focused
  // offer widget is the commit surface that owns the QR + cashback
  // choreography. (#174 cleanup: the in-drawer alternatives swipe
  // stack — Discover's deal-flow path — used to live alongside this
  // and was removed; Discover stays the single deal-swipe surface.)
  const handleRedeemFromMerchantDetail = useCallback(
    (_merchant: MerchantListItem) => {
      setMerchantDetail(null);
      setSettledVariant(null);
      setViewMode("browse");
      setStep("offer");
    },
    [],
  );
  // No-offer placeholder CTA → close detail + flip to Discover so the
  // user sees the LLM-curated swipe stack. Discover is the "I want a
  // deal" mental-model surface; jumping there from a no-offer Browse
  // detail is the clean handoff per Doruk's #160 split.
  const handleGoToDiscoverFromDetail = useCallback(() => {
    setMerchantDetail(null);
    setViewMode("discover");
  }, []);

  // Issue #156 phase 4 — fired by DiscoverView (and the merchant-tap
  // handler) whenever a fresh variants[] is resolved. Records every
  // is_special_surface=true variant_id in `seenSpecialIds` if the
  // user is currently on Discover (they'll see it directly, no dot
  // needed); arms the dot if they're on a non-Discover tab. The
  // dedupe via seenSpecialIds means a re-fetch of the same special
  // doesn't re-trigger the dot every time.
  const handleVariantsResolved = useCallback(
    (resolvedVariants: AlternativeOffer[]) => {
      const specials = resolvedVariants.filter((v) => v.is_special_surface);
      if (specials.length === 0) return;
      const seen = seenSpecialIds.current;
      const fresh = specials.filter((v) => !seen.has(v.variant_id));
      if (fresh.length === 0) return;
      if (viewMode === "discover") {
        // User is already on Discover — they're seeing the special directly,
        // record it as seen so a follow-up fetch doesn't arm the dot.
        for (const v of fresh) seen.add(v.variant_id);
        return;
      }
      // Non-Discover tab: arm the dot AND record the ids so the next
      // re-fetch doesn't keep re-triggering. Recording-on-arm matches
      // the spec — the user "sees" the dot from the moment we set it,
      // even though they haven't opened Discover yet.
      for (const v of fresh) seen.add(v.variant_id);
      setHasUnseenSpecial(true);
    },
    [viewMode],
  );

  // Issue #137 — DiscoverView appends fresh PriorSwipe entries here
  // so App.tsx remains the single source of truth for accumulated
  // history. The lens-driven swipe stack inside Discover writes to
  // this state via setSwipeHistory; the next /offers/alternatives
  // call carries the history forward so the backend's preference
  // agent re-ranks cross-merchant candidates by inferred user taste.
  // (#174 cleanup: the in-drawer alternatives swipe path — which used
  // to share this state via its own merchant-tap handler — was
  // removed; Discover is now the only writer.)
  const handleAppendSwipeHistory = useCallback((entries: PriorSwipe[]) => {
    if (entries.length === 0) return;
    setSwipeHistory((prev) => [...prev, ...entries]);
  }, []);

  const handleSheetChange = useCallback((index: number) => {
    setSheetIndex(index);
  }, []);

  // Issue #125: tapping the search input inside the wallet drawer's
  // "Offers for you" surface auto-snaps the bottom sheet to its top snap
  // (index 2 — 80%) so the keyboard rises into a fully-revealed list
  // instead of cropping it at whatever snap the user was at. `sheetRef`
  // is a ref (stable identity) so the dep array stays empty.
  const handleSearchFocus = useCallback(() => {
    sheetRef.current?.snapToIndex(2);
  }, []);

  // Issue #119: handleOpenDevPanel removed — the MapTopChip was the last
  // caller. DevPanel is now reachable only through Settings → Demo & Debug,
  // which has its own onRunSurfacing wrapper (settingsDevPanelProps below).
  const handleCloseDevPanel = useCallback(() => {
    setDevPanelOpen(false);
  }, []);
  // Issue #154 — handleOpenSettings / handleOpenHistory / handleCloseSettings /
  // handleCloseHistory removed. Settings + History are now navbar tabs;
  // the open/close lifecycle is owned by viewMode, not local boolean state.
  // The settingsOpen / historyOpen useState calls + the SettingsScreen +
  // HistoryScreen overlay renders at the App return have been dropped too.
  const handleTogglePrivacyEnvelope = useCallback(() => {
    setShowPrivacyEnvelope((prev) => !prev);
  }, []);
  const handleSetLanguage = useCallback((lang: "de" | "en") => {
    setLanguage(lang);
  }, []);
  const handleResetDemoFromSettings = useCallback(() => {
    setStep("silent");
  }, []);

  const devPanelProps: ComponentProps<typeof DevPanel> = {
    compositeState,
    signals,
    score: surfacing.score,
    threshold: surfacing.threshold,
    breakdown,
    intentToken: cityProfile.privacy.intent_token,
    h3Cell: cityProfile.privacy.h3_cell_r8,
    highIntent,
    onToggleHighIntent: handleToggleHighIntent,
    city,
    onSwapCity: handleSwapCity,
    onRunSurfacing: handleRunSurfacing,
    showPrivacyEnvelope,
  };

  const mapOverlayStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      animatedIndex.value,
      [0, 1, 2],
      [0, 0.25, 0.45],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  // Top-of-map overlay fade-and-slide as the drawer expands. At snap 0
  // (collapsed), pill + icons sit at full opacity in their natural
  // position. As the user drags the sheet up, the LEFT pill slides
  // further left and the RIGHT icons slide further right, fading out so
  // they're invisible by the time the sheet reaches the medium snap.
  // Apple Maps does this exact motion when the place card opens — the
  // floating buttons get out of the way of the content surface.
  const topOverlayLeftStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      animatedIndex.value,
      [0, 0.6, 1],
      [1, 0.5, 0],
      Extrapolation.CLAMP,
    );
    const translateX = interpolate(
      animatedIndex.value,
      [0, 1],
      [0, -32],
      Extrapolation.CLAMP,
    );
    return { opacity, transform: [{ translateX }] };
  });

  const topOverlayRightStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      animatedIndex.value,
      [0, 0.6, 1],
      [1, 0.5, 0],
      Extrapolation.CLAMP,
    );
    const translateX = interpolate(
      animatedIndex.value,
      [0, 1],
      [0, 32],
      Extrapolation.CLAMP,
    );
    return { opacity, transform: [{ translateX }] };
  });

  // Issue #159 — top-CENTER variant of the overlay fade. Post-#154 the
  // gear + clock moved into the BottomNavBar, leaving the top-right of
  // Browse empty — the weather pill in the top-left was visually
  // unbalanced. Repositioning it dead-center is the cleanest fix.
  // A horizontal slide from center looks weird (drifts past the Dynamic
  // Island), so this variant rises slightly (translateY: -8) as the
  // sheet expands so the pill ducks toward the status bar while fading
  // out — mirrors Apple Maps' "place card opens, the top chip lifts
  // away" choreography while staying horizontally anchored.
  const topOverlayCenterStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      animatedIndex.value,
      [0, 0.6, 1],
      [1, 0.5, 0],
      Extrapolation.CLAMP,
    );
    const translateY = interpolate(
      animatedIndex.value,
      [0, 1],
      [0, -8],
      Extrapolation.CLAMP,
    );
    return { opacity, transform: [{ translateY }] };
  });

  // Issue #152 — cross-fade between Discover + Browse views. 250ms
  // is enough to feel like a deliberate switch without dragging on
  // the user; no slide so the navbar tap reads as instant. Both
  // views render absolute-positioned (so the unfocused one stays
  // mounted to keep its fetch state hot) but only the active one
  // accepts pointer events.
  // Issue #154 — only animate the Discover↔Browse cross-fade. The other
  // tabs (Wallet / History / Settings) swap in instantly because they
  // render only when active and a fade-out beat to a static list feels
  // laggy. The cross-fade keeps the demo cut from #152 (Discover + Browse
  // remain mounted across switches so their fetch state stays hot).
  // When the user navigates between non-cross-fade tabs (e.g. Wallet→
  // History), viewFade snaps instantly without animating so the brief
  // intermediate frame doesn't show the wrong cross-fade target.
  const viewFade = useSharedValue(viewMode === "discover" ? 0 : 1);
  useEffect(() => {
    if (viewMode === "discover") {
      viewFade.value = withTiming(0, {
        duration: 250,
        easing: Easing.out(Easing.exp),
      });
    } else if (viewMode === "browse") {
      viewFade.value = withTiming(1, {
        duration: 250,
        easing: Easing.out(Easing.exp),
      });
    } else {
      // Tabs that overlay browse (Wallet / History / Settings): pin
      // viewFade at 1 so the underlying Browse keeps its full-opacity
      // state (the overlay tab is opaque cream so the Browse content
      // is hidden anyway, but a snap to 0 here would cause a flicker
      // when the user navigates Wallet → Discover).
      viewFade.value = 1;
    }
  }, [viewMode, viewFade]);
  const discoverFadeStyle = useAnimatedStyle(() => ({
    opacity: 1 - viewFade.value,
  }));
  const browseFadeStyle = useAnimatedStyle(() => ({
    opacity: viewFade.value,
  }));
  const handleViewChange = useCallback((next: ViewMode) => {
    setViewMode(next);
  }, []);
  const handleGoToDiscover = useCallback(() => {
    setViewMode("discover");
  }, []);

  // Issue #156 phase 4 — clear the unread-special dot whenever the
  // user actually opens Discover. The dedupe set already retains the
  // variant_ids that armed the dot, so a re-fetch returning the same
  // specials won't re-trigger the badge.
  useEffect(() => {
    if (viewMode !== "discover") return;
    setHasUnseenSpecial(false);
  }, [viewMode]);

  const walletArea = (
    <View style={s("flex-1")}>
      {/* Full-bleed Apple Map background. Tapping a merchant's offer
          callout (issue #43) advances the demo to the offer beat so the
          wallet sheet snaps to its full snap and the GenUI widget reveals
          — the callout is the in-context anchor, the sheet is the rich
          surface. */}
      <View style={StyleSheet.absoluteFill}>
        <CityMap
          centerLat={cityProfile.mapCenter.lat}
          centerLng={cityProfile.mapCenter.lng}
          pins={cityProfile.mapPins}
          interactive={mapInteractive}
          style={StyleSheet.absoluteFill}
          onOfferPress={() => setStep("offer")}
        />
      </View>

      {/* Subtle dimming overlay tied to sheet index. */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: "rgba(13, 17, 23, 1)" },
          mapOverlayStyle,
        ]}
      />

      {/* Issue #119: the centred MapTopChip search-style pill was dropped in
          favour of a top-LEFT frosted weather pill + a top-RIGHT icon cluster
          (rendered one level up in the compact branch below). DevPanel is now
          reachable only through Settings → Demo & Debug. */}

      {/* Issue #103: the top-right wrench DevPanelTrigger has been removed.
          Settings is now a real bottom tab (UITabBarController) and the
          DevPanel is folded into the Settings tab as the "Demo & Debug"
          section (#80). */}

      {/* Bottom sheet wallet drawer. `bottomInset={0}` lets the sheet
          extend all the way to the screen bottom, so the cream
          UITabBarController sits in front of the dark sheet — the
          wallet visually flows under the tab bar instead of hovering
          above it (Apple Music / Apple Maps pattern). */}
      <BottomSheet
        ref={sheetRef}
        index={0}
        snapPoints={SHEET_SNAP_POINTS as unknown as string[]}
        animatedIndex={animatedIndex}
        onChange={handleSheetChange}
        bottomInset={0}
        // Issue #100: respect the safe-area top so the 80% snap doesn't
        // collide with the iOS status bar / Dynamic Island. gorhom's
        // `topInset` is the floor distance the sheet keeps from the top
        // edge; +10 leaves a tiny breathing strip below the island.
        topInset={insets.top + 10}
        backgroundStyle={{
          backgroundColor: "#fff8ee",
          borderTopLeftRadius: 34,
          borderTopRightRadius: 34,
        }}
        handleIndicatorStyle={{
          backgroundColor: "rgba(23, 18, 15, 0.25)",
          width: 44,
          height: 5,
        }}
        handleStyle={{ paddingTop: 10, paddingBottom: 6 }}
        enablePanDownToClose={false}
      >
        {/* Issue #88: SheetBody returns either WalletSheetContent (which now
            wraps itself in BottomSheetScrollView for native scroll/sheet
            gesture integration) OR a redeem/success screen wrapped in
            BottomSheetView. Both cases produce a single direct child of
            <BottomSheet />, which is what gorhom requires. */}
        <SheetBody
          step={step}
          city={city}
          cityProfile={cityProfile}
          widgetVariant={widgetVariant}
          highIntent={highIntent}
          aggressiveHeadline={aggressiveHeadline}
          animatedIndex={animatedIndex}
          tempC={citySignals.tempC}
          weatherLabel={citySignals.weatherLabel}
          pulseLabel={citySignals.pulseLabel}
          settledVariant={settledVariant}
          onWidgetVariantChange={setWidgetVariant}
          onWidgetCta={handleAdvanceFromOffer}
          onRedeemComplete={handleRedeemComplete}
          onSuccessDone={handleResetToSilent}
          onMerchantOpen={handleOpenMerchantDetail}
          onSearchFocus={handleSearchFocus}
        />
      </BottomSheet>

      {/* Issue #103: the History overlay, BottomMenu, and SettingsScreen
          render have moved out of walletArea — they're now sibling NativeTabBar
          scenes one level up (see App return). Keeping them out of the home
          scene avoids them being mounted while another tab is active. */}

      {/* DevPanel overlay (issue #70 part B). Compact mode only — wide-mode
          keeps the existing right-side sidecar layout. Slides in from the
          right (translateX 100% → 0, 300ms easing-out). Tap-outside or the
          top-right ✕ closes it. Reachable on Home via the MapTopChip on
          the silent beat; the standalone wrench trigger was removed in
          #103 since the Settings tab is the durable engineering entry. */}
      {!sideBySide ? (
        <DevPanelOverlay
          visible={devPanelOpen}
          onClose={handleCloseDevPanel}
          devPanelProps={{
            ...devPanelProps,
            onRunSurfacing: () => {
              setDevPanelOpen(false);
              handleRunSurfacing();
            },
          }}
        />
      ) : null}
    </View>
  );

  // DevPanel passthrough used inside the Settings tab (#154). We wrap
  // `onRunSurfacing` so triggering surfacing from the Demo & Debug
  // section flips back to the Browse tab — otherwise the sheet snaps to
  // its 80% offer state behind the Settings tab content (which doesn't
  // host the BottomSheet) and the surfacing beat plays invisible.
  const settingsDevPanelProps: ComponentProps<typeof DevPanel> = {
    ...devPanelProps,
    onRunSurfacing: () => {
      setViewMode("browse");
      setStep("silent");
      handleRunSurfacing();
    },
  };

  // Issue #152 / #154 — Browse view = walletArea (map + drawer) wrapped
  // in a stack that owns the silent-step top-LEFT weather pill. Per #154
  // the top-RIGHT clock + gear icons are GONE — their function moved to
  // the navbar's History + Settings tabs. The weather pill stays because
  // it's the city-swap affordance, not navigation. The wrapper renders
  // the pill only when `step === "silent"` AND `viewMode === "browse"`
  // so the focused offer / redeem / success surfaces inside the
  // BottomSheet don't compete with the floating pill.
  const browseView = (
    <View style={s("flex-1")}>
      {walletArea}
      {viewMode === "browse" && step === "silent" ? (
        // Issue #159 — repositioned from top-LEFT (legacy) to top-CENTER.
        // After #154 moved gear+clock into the BottomNavBar, the top-right
        // of Browse went empty and a pill anchored hard left looked
        // off-balance. left:0 + right:0 + justifyContent:"center" lets
        // the pill size to its content and sit on the horizontal axis
        // — the natural focal point of the map's top edge. Pointer
        // events still gate on sheetIndex so the pill never intercepts
        // taps once the drawer has expanded past the collapsed snap.
        // Wrapped in `topOverlayCenterStyle` (translateY-only fade) so
        // the pill ducks toward the status bar as the drawer expands
        // instead of sliding sideways from center (which looked drifty).
        <View
          style={[
            ...s("absolute flex-row items-center justify-center"),
            {
              top: insets.top + 12,
              left: 0,
              right: 0,
            },
          ]}
          pointerEvents={sheetIndex >= 1 ? "none" : "box-none"}
        >
          <Animated.View style={topOverlayCenterStyle}>
            <MapWeatherPill
              cityName={city === "berlin" ? "Berlin" : "Zurich"}
              neighborhood={city === "berlin" ? "Mitte" : "HB"}
              tempC={citySignals.tempC}
              sfSymbol={citySignals.weatherSfSymbol}
              onPress={handleSwapCity}
            />
          </Animated.View>
        </View>
      ) : null}
    </View>
  );

  // Issue #152 — Discover view (full-screen swipe + lens chips). Lives
  // as a sibling to Browse; the BottomNavBar swaps which one is
  // pointer-active. Owns its own per-lens variant fetch so flipping
  // away to Browse and back doesn't cost a re-fetch beat.
  const discoverView = (
    <DiscoverView
      citySlug={city}
      lens={discoverLens}
      onLensChange={setDiscoverLens}
      swipeHistory={swipeHistory}
      onAppendSwipeHistory={handleAppendSwipeHistory}
      onSavePass={handleSavePass}
      onVariantsResolved={handleVariantsResolved}
    />
  );

  // Hide the navbar whenever a focused overlay step has taken over
  // (surfacing / offer / redeeming / success). The navbar reappears
  // as soon as we're back at silent. This applies to both views —
  // Browse's BottomSheet renders the focused screens, Discover doesn't
  // initiate any non-silent step today but the logic is shared so the
  // demo cut feels consistent.
  const showNavBar = step === "silent";

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={s("flex-1 bg-ink")}>
        <StatusBar style="light" />
        {sideBySide ? (
          // Wide (≥820px): the dev-only layout keeps the existing
          // walletArea + DevPanel sidecar — no view switching, no
          // navbar. The wide layout is for development on tablets /
          // simulators only; the recordable demo runs in compact mode.
          <View style={[...s("flex-1"), { flexDirection: "row" }]}>
            {walletArea}
            <DevPanel {...devPanelProps} />
          </View>
        ) : (
          // Compact (<820px): the recordable demo surface. Five tabs
          // routed by the BottomNavBar. Discover + Browse stay mounted
          // (cross-fade) so their fetch state survives switches; the
          // other three tabs render only when active to keep the safe-
          // area inset budget clean. The bottom navbar hides on every
          // non-silent step so focused overlay flows aren't competed
          // with by tab bar chrome.
          <View style={s("flex-1")}>
            <View style={s("flex-1")}>
              <Animated.View
                style={[StyleSheet.absoluteFill, browseFadeStyle]}
                pointerEvents={viewMode === "browse" ? "auto" : "none"}
              >
                {browseView}
              </Animated.View>
              <Animated.View
                style={[StyleSheet.absoluteFill, discoverFadeStyle]}
                pointerEvents={viewMode === "discover" ? "auto" : "none"}
              >
                {discoverView}
              </Animated.View>
              {viewMode === "wallet" ? (
                <View style={StyleSheet.absoluteFill}>
                  <WalletView
                    passes={savedPasses}
                    onPassTap={handleRedeemPass}
                    onRemovePass={handleRemovePass}
                    onGoToDiscover={handleGoToDiscover}
                  />
                </View>
              ) : null}
              {viewMode === "history" ? (
                <View style={StyleSheet.absoluteFill}>
                  <HistoryScreen />
                </View>
              ) : null}
              {viewMode === "settings" ? (
                <View style={StyleSheet.absoluteFill}>
                  <SettingsScreen
                    mode="tab"
                    showPrivacyEnvelope={showPrivacyEnvelope}
                    onTogglePrivacyEnvelope={handleTogglePrivacyEnvelope}
                    language={language}
                    onSetLanguage={handleSetLanguage}
                    onResetDemo={handleResetDemoFromSettings}
                    devPanelProps={settingsDevPanelProps}
                    // Issue #159 — promote city swap to a top-level
                    // Settings row. The DevPanel city control inside
                    // Demo & Debug stays as the engineering surface;
                    // this exposes the swap as a consumer-facing
                    // affordance one tap deep instead of four sections
                    // deep. handleSwapCity owns the full reload chain
                    // (/merchants, /signals, map flyTo, swipeHistory
                    // reset) so passing it directly preserves the
                    // existing demo-safe behaviour.
                    currentCity={city}
                    onSwapCity={handleSwapCity}
                  />
                </View>
              ) : null}
            </View>
            {showNavBar ? (
              <BottomNavBar
                activeView={viewMode}
                onViewChange={handleViewChange}
                hasUnseenDiscover={hasUnseenSpecial}
              />
            ) : null}
          </View>
        )}

        {/* Issue #154 — the Settings + History slide-in overlays are no
            longer rendered. Their function moved to navbar tabs (Settings
            tab + History tab). The overlay code path lives on inside both
            screens for backwards compat with any direct caller, but App.tsx
            no longer mounts them as overlays. */}

        {/* Issue #160 — merchant-first Browse detail view. Slides in
            from the right (Settings pattern) when the user taps a
            merchant in the Browse list. Mounted at the App root so it
            sits ABOVE the BottomNavBar and the BottomSheet — both
            gesture surfaces stay reachable underneath because the
            detail view's own swipe-right + swipe-down dismiss takes
            care of returning the user to Browse. The overlay is
            unmounted entirely (mount-gating inside the component)
            once the slide-out animation finishes, so there's zero
            cost when no detail is open. */}
        <MerchantDetailView
          merchant={merchantDetail}
          onClose={handleCloseMerchantDetail}
          onRedeem={handleRedeemFromMerchantDetail}
          onGoToDiscover={handleGoToDiscoverFromDetail}
        />
      </View>
    </GestureHandlerRootView>
  );
}

/** Round 44pt button for the map's top-right corner — clock + gear icons.
 *  Issue #119: bumped from 36→44pt + SF Symbol 18→22pt, swapped solid white
 *  for a frosted-glass-ish look (semi-transparent white + shadow) so the
 *  controls read as Apple-Maps-style floating buttons. Real iOS BlurView
 *  via expo-blur would be most native but isn't installed and would force
 *  a 10-15 min native rebuild — semi-transparent white + shadow gets us
 *  ~80% of the way there with zero rebuild. */
function MapIconButton({
  sfSymbol,
  accessibilityLabel,
  onPress,
}: {
  sfSymbol: "clock" | "gearshape";
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={10}
      style={[
        ...s("rounded-full items-center justify-center"),
        {
          width: 44,
          height: 44,
          backgroundColor: "rgba(255, 255, 255, 0.88)",
          borderWidth: 1,
          borderColor: "rgba(23, 18, 15, 0.12)",
          shadowColor: "#17120f",
          shadowOpacity: 0.12,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
        },
      ]}
    >
      <SymbolView
        name={sfSymbol}
        tintColor="#17120f"
        size={22}
        weight="medium"
        style={{ width: 22, height: 22 }}
      />
    </Pressable>
  );
}

/** Static info-only weather pill for the map's top-LEFT corner (issue #119).
 *  Matches MapIconButton's frosted-glass look so the LEFT pill + RIGHT icon
 *  cluster read as one visual family. No onPress — DevPanel is reachable
 *  only through Settings → Demo & Debug now.
 *  Issue #120: emoji glyph replaced by a typed SF Symbol via expo-symbols
 *  so the pill renders a crisp vector icon instead of an OS-dependent emoji. */
function MapWeatherPill({
  cityName,
  neighborhood,
  tempC,
  sfSymbol,
  tintColor = "#356f95",
  onPress,
}: {
  /** Full city name shown prominently — e.g. "Berlin", "Zurich". */
  cityName: string;
  /** Short locality suffix — e.g. "Mitte", "HB". */
  neighborhood: string;
  tempC: number;
  sfSymbol: SFSymbol;
  tintColor?: string;
  /** Optional tap handler. When provided, the pill becomes a Pressable
   *  with a tiny "arrow.2.squarepath" affordance to hint at the swap
   *  action (city toggle on the live demo). */
  onPress?: () => void;
}) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={
        onPress ? `Swap city — currently ${cityName}` : undefined
      }
      onPress={onPress}
      style={({ pressed }: { pressed?: boolean } = {}) => [
        ...s("rounded-full flex-row items-center gap-2 pl-3 pr-4"),
        {
          backgroundColor: "rgba(255, 255, 255, 0.88)",
          borderWidth: 1,
          borderColor: "rgba(23, 18, 15, 0.12)",
          height: 44,
          shadowColor: "#17120f",
          shadowOpacity: 0.12,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <SymbolView
        name={sfSymbol}
        tintColor={tintColor}
        size={20}
        weight="semibold"
        style={{ width: 20, height: 20 }}
      />
      <View>
        <Text
          style={[
            ...s("text-sm font-black text-ink"),
            { letterSpacing: -0.3, lineHeight: 16 },
          ]}
        >
          {cityName}
        </Text>
        <Text
          style={[
            ...s("text-[10px] font-semibold text-cocoa"),
            { letterSpacing: 0.3, lineHeight: 12, marginTop: 1 },
          ]}
        >
          {Math.round(tempC)}° · {neighborhood}
        </Text>
      </View>
      {onPress ? (
        <SymbolView
          name="arrow.2.squarepath"
          tintColor="rgba(23, 18, 15, 0.45)"
          size={12}
          weight="semibold"
          style={{ width: 12, height: 12, marginLeft: 4 }}
        />
      ) : null}
    </Wrapper>
  );
}

type SheetBodyProps = {
  step: DemoStep;
  city: DemoCityId;
  cityProfile: DemoCityProfile;
  widgetVariant: WidgetVariant;
  highIntent: boolean;
  aggressiveHeadline: string | null;
  animatedIndex: ReturnType<typeof useSharedValue<number>>;
  /**
   * Live (or fallback) weather strings sourced from `useSignals(city)` in
   * App() and threaded through to the silent-step WalletSheetContent. Issue
   * #124. SheetBody is a pure pass-through — the hook + fetch contract live
   * one level up so this component stays test-friendly.
   */
  tempC: number;
  weatherLabel: string;
  pulseLabel: string;
  /** Issue #132 — once the user commits to a Wallet-tab saved pass via
   *  `handleRedeemPass`, the chosen variant lives here and the focused
   *  offer view renders its widget_spec instead of the demo
   *  `widgetVariant` switch. Null for the canonical demo flow + the
   *  MerchantDetailView "Redeem now" path. */
  settledVariant: AlternativeOffer | null;
  onWidgetVariantChange: (variant: WidgetVariant) => void;
  onWidgetCta: () => void;
  onRedeemComplete: () => void;
  onSuccessDone: () => void;
  /** Issue #160 — Browse merchant-first tap target. Tap a merchant
   *  row → App.tsx opens the slide-in MerchantDetailView. */
  onMerchantOpen: ComponentProps<typeof WalletSheetContent>["onMerchantOpen"];
  /** Threaded down to MerchantSearchList's <TextInput onFocus> so tapping
   *  the search bar auto-snaps the sheet to its 80% top snap. Issue #125. */
  onSearchFocus: ComponentProps<typeof WalletSheetContent>["onSearchFocus"];
};

function SheetBody({
  step,
  city,
  cityProfile,
  widgetVariant,
  highIntent,
  aggressiveHeadline,
  animatedIndex,
  tempC,
  weatherLabel,
  pulseLabel,
  settledVariant,
  onWidgetVariantChange,
  onWidgetCta,
  onRedeemComplete,
  onSuccessDone,
  onMerchantOpen,
  onSearchFocus,
}: SheetBodyProps) {
  // Issue #182: redeem branches (offer / surfacing / redeeming / success)
  // moved OUT of SheetBody and INTO RedeemOverlay at App.tsx top-level.
  // SheetBody is now silent-only — the BottomSheet only ever shows the
  // browse drawer (search + list + weather card). Bug pre-#182: tapping
  // a saved pass from Wallet flipped step → "offer" but the redeem
  // rendered inside the Browse-only BottomSheet, yanking the user into
  // Browse. Post-#182: the redeem renders as a slide-up overlay above
  // ANY view via RedeemOverlay (App.tsx top-level).

  // WalletSheetContent renders BottomSheetScrollView at its root (issue #88)
  // so it doubles as the gorhom scroll surface — no extra wrapper needed.
  // Post-#152 the drawer is browse-only (search + list + weather card);
  // the swipe + lens chips live in the Discover view rendered as a
  // sibling at App.tsx.
  return (
    <WalletSheetContent
      cityLabel={cityProfile.cityLabel}
      citySlug={city}
      tempC={tempC}
      weatherLabel={weatherLabel}
      pulseLabel={pulseLabel}
      animatedIndex={animatedIndex}
      onMerchantOpen={onMerchantOpen}
      onSearchFocus={onSearchFocus}
    />
  );
}

function OfferStack({
  widgetVariant,
  highIntent,
  aggressiveHeadline,
  onWidgetVariantChange,
  onWidgetCta,
}: {
  widgetVariant: WidgetVariant;
  highIntent: boolean;
  aggressiveHeadline: string | null;
  onWidgetVariantChange: (variant: WidgetVariant) => void;
  onWidgetCta: () => void;
}) {
  return (
    <View style={s("flex-1")}>
      {aggressiveHeadline ? (
        <View style={s("mb-3 rounded-2xl bg-spark px-4 py-3")}>
          <Text style={s("text-xs font-bold uppercase tracking-[2px] text-white")}>
            High-intent boost
          </Text>
          <Text style={s("mt-1 text-base font-black leading-6 text-white")}>
            {aggressiveHeadline}
          </Text>
        </View>
      ) : null}

      <View style={s("mb-3 flex-row gap-2")}>
        <VariantButton
          active={widgetVariant === "rainHero"}
          label="Rain"
          onPress={() => onWidgetVariantChange("rainHero")}
        />
        <VariantButton
          active={widgetVariant === "quietStack"}
          label="Quiet"
          onPress={() => onWidgetVariantChange("quietStack")}
        />
        <VariantButton
          active={widgetVariant === "preEventTicket"}
          label="Event"
          onPress={() => onWidgetVariantChange("preEventTicket")}
        />
      </View>

      <View style={s("flex-1")}>
        <WidgetRenderer node={demoWidgetSpecs[widgetVariant]} onRedeem={onWidgetCta} />
      </View>

      {!highIntent ? (
        <Text style={s("mt-3 text-xs text-white/50 text-center")}>
          Toggle high-intent in the dev panel to re-skin the headline.
        </Text>
      ) : null}
    </View>
  );
}

function VariantButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={s("flex-1 rounded-2xl px-3 py-2", active ? "bg-spark" : "bg-white/15")}
      onPress={onPress}
    >
      <Text style={s("text-center text-xs font-black", active ? "text-white" : "text-white/70")}>
        {label}
      </Text>
    </Pressable>
  );
}


function DevPanelOverlay({
  visible,
  onClose,
  devPanelProps,
}: {
  visible: boolean;
  onClose: () => void;
  devPanelProps: ComponentProps<typeof DevPanel>;
}) {
  // Slide-in container (right edge of screen → 0). Width is capped at 320 so
  // the underlying map peeks through on the left, signalling "this is a
  // sidecar, not a fullscreen takeover". Tap-outside dismisses; the small ✕
  // in the header gives an explicit close affordance.
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const panelWidth = Math.min(320, Math.round(screenWidth * 0.86));
  const translateX = useSharedValue(panelWidth);

  useEffect(() => {
    translateX.value = withTiming(visible ? 0 : panelWidth, {
      duration: 300,
      easing: Easing.out(Easing.exp),
    });
  }, [visible, panelWidth, translateX]);

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Tap-outside scrim. Subtle dimming so the map still reads behind. */}
      <Pressable
        accessibilityLabel="Close dev panel"
        onPress={onClose}
        style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0, 0, 0, 0.35)" }]}
      />
      <Animated.View
        style={[
          slideStyle,
          {
            position: "absolute",
            top: 0,
            bottom: 0,
            right: 0,
            width: panelWidth,
            backgroundColor: "#0d1117",
            paddingTop: Math.max(insets.top, 0),
            shadowColor: "#000",
            shadowOpacity: 0.4,
            shadowRadius: 12,
            shadowOffset: { width: -4, height: 0 },
            elevation: 8,
          },
        ]}
      >
        <View
          style={[
            ...s("flex-row items-center justify-between px-4"),
            {
              paddingTop: 10,
              paddingBottom: 8,
              borderBottomColor: "#30363d",
              borderBottomWidth: 1,
            },
          ]}
        >
          <Text style={s("mono text-[10px] uppercase tracking-[0.5px] text-gh-low")}>
            dev_panel
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close dev panel"
            onPress={onClose}
            hitSlop={10}
            style={({ pressed }) => [
              {
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: "#1f2937",
                borderWidth: 1,
                borderColor: "#30363d",
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <Text style={[...s("text-white"), { fontSize: 12, lineHeight: 14, fontWeight: "700" }]}>
              ✕
            </Text>
          </Pressable>
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 12) }}
          showsVerticalScrollIndicator={false}
        >
          <DevPanel {...devPanelProps} />
        </ScrollView>
      </Animated.View>
    </View>
  );
}

function buildBreakdown(
  input: Omit<SurfacingInput, "highIntent">,
  highIntent: boolean,
) {
  const weather = input.weatherTrigger === "rain_incoming" ? 0.28 : 0;
  const event = input.eventEndingSoon ? 0.08 : 0;
  const demand = clamp(input.demandGapRatio, 0, 0.6) * 0.7;
  const proximity =
    input.distanceM <= 100 ? 0.2 : input.distanceM <= 250 ? 0.12 : 0.04;
  const highIntentBoost = highIntent ? 0.16 : 0;
  return { weather, event, demand, proximity, highIntent: highIntentBoost };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

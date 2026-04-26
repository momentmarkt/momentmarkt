/**
 * WalletView — saved-passes surface (issue #154).
 *
 * The Wallet tab in the 5-tab navbar (Discover / Wallet / Browse /
 * History / Settings). Pre-#154 the swipe-right gesture in Discover
 * fired the redeem flow immediately; post-#154 it adds a SavedPass to
 * the in-memory list this view renders. The user picks WHEN to redeem
 * by tapping a pass here.
 *
 * State ownership: App.tsx owns `savedPasses` + expiry cleanup. This
 * component is presentational — it renders the list and fires `onPassTap`
 * to commit a redemption.
 *
 * No persistence: per CLAUDE.md / DESIGN_PRINCIPLES.md the demo is
 * session-local. Issue #148 tracks AsyncStorage persistence as v2 —
 * paired with the on-device SLM swap so the storage layer can carry
 * inferred preferences alongside the literal pass list.
 *
 * Empty state: sparkles SF Symbol + a "Discover more" CTA back to the
 * Discover tab. The CTA is a hint, not the only path — the user can
 * always tap the Discover tab in the navbar directly.
 */

import { SymbolView } from "expo-symbols";
import { type ReactElement, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { lightTap } from "../lib/haptics";
import { s } from "../styles";
import type { SavedPass } from "../types/savedPass";

type Props = {
  passes: SavedPass[];
  /** Tap a pass → commit to the redeem flow with that variant. */
  onPassTap: (pass: SavedPass) => void;
  /** "Discover more" link → switches the active tab back to Discover. */
  onGoToDiscover: () => void;
};

export function WalletView({
  passes,
  onPassTap,
  onGoToDiscover,
}: Props): ReactElement {
  const insets = useSafeAreaInsets();
  return (
    <View style={[...s("flex-1 bg-cream"), { paddingTop: insets.top + 10 }]}>
      {/* Sticky header (issue #171) — pinned at the top of the wrapper,
          OUTSIDE the ScrollView, so it stays put while saved-pass rows
          scroll beneath. Mirrors the SettingsScreen pattern so all four
          tab surfaces share the same upper-header rhythm.

          Composition: bold "Wallet" title (matches Settings/History/
          Discover), subtitle line ("{N} saved offers"), and the
          Discover-more shortcut link to keep the existing affordance.
          The title row uses Settings' text-3xl font-black + -0.5
          letter-spacing so the four titles read as one type system. */}
      <View
        style={[
          ...s("px-5"),
          { paddingTop: 8, paddingBottom: 12 },
        ]}
      >
        <View style={s("flex-row items-end justify-between")}>
          <Text
            style={[
              ...s("text-3xl font-black text-ink"),
              { letterSpacing: -0.5 },
            ]}
          >
            Wallet
          </Text>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Discover more offers"
            onPress={() => {
              lightTap();
              onGoToDiscover();
            }}
            hitSlop={8}
            style={({ pressed }) => ({
              opacity: pressed ? 0.55 : 1,
              paddingBottom: 6,
            })}
          >
            <Text
              style={[
                ...s("text-xs font-bold uppercase tracking-[2px]"),
                { color: "#f2542d" },
              ]}
            >
              Discover more →
            </Text>
          </Pressable>
        </View>
        <Text
          style={[
            ...s("text-sm text-neutral-600"),
            { marginTop: 4 },
          ]}
        >
          {passes.length === 0
            ? "Nothing saved yet"
            : `${passes.length} saved offer${passes.length === 1 ? "" : "s"}`}
        </Text>
      </View>

      {passes.length === 0 ? (
        <WalletEmptyState onGoToDiscover={onGoToDiscover} />
      ) : (
        <ScrollView
          style={s("flex-1")}
          contentContainerStyle={[
            ...s("px-5"),
            { paddingTop: 4, paddingBottom: 32 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {passes.map((pass, idx) => (
            <View
              key={pass.id}
              style={{ marginBottom: idx === passes.length - 1 ? 0 : 12 }}
            >
              <SavedPassCard pass={pass} onTap={() => onPassTap(pass)} />
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function WalletEmptyState({
  onGoToDiscover,
}: {
  onGoToDiscover: () => void;
}): ReactElement {
  return (
    <View
      style={[
        ...s("flex-1 items-center justify-center"),
        { paddingHorizontal: 32 },
      ]}
    >
      <SymbolView
        name="sparkles"
        tintColor="#6f3f2c"
        size={40}
        weight="medium"
        style={{ width: 40, height: 40 }}
      />
      <Text
        style={[
          ...s("mt-4 text-base font-black text-ink text-center"),
          { letterSpacing: -0.2 },
        ]}
      >
        No saved offers yet
      </Text>
      <Text
        style={[
          ...s("mt-2 text-sm text-neutral-600 text-center"),
          { lineHeight: 20 },
        ]}
      >
        Swipe right in Discover to add an offer to your wallet. Tap a saved
        pass to redeem it.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go to Discover"
        onPress={() => {
          lightTap();
          onGoToDiscover();
        }}
        style={({ pressed }) => [
          ...s("rounded-full bg-spark px-5"),
          {
            marginTop: 20,
            paddingVertical: 12,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Text
          style={[
            ...s("text-sm font-black uppercase tracking-[2px] text-white"),
          ]}
        >
          Open Discover
        </Text>
      </Pressable>
    </View>
  );
}

const ROW_HEIGHT = 120;

/**
 * Single saved-pass row.
 *
 * Layout (~120pt tall):
 *   • 96×96 photo on the left (square, rounded). Falls back to a flat
 *     cocoa block when the LLM-emitted widget_spec didn't ship an image
 *     (defensive — the spec shape is `unknown` on the wire).
 *   • Right column:
 *       merchant name (bold ink) + small subhead (cocoa)
 *       spark-tinted discount badge
 *       "Tap to redeem →" affordance at bottom
 *
 * Tap → onTap (commits to redeem flow). Cleanup is automatic via expiry.
 */
function SavedPassCard({
  pass,
  onTap,
}: {
  pass: SavedPass;
  onTap: () => void;
}): ReactElement {
  const [imgFailed, setImgFailed] = useState(false);
  const photoUrl = extractPhotoUrl(pass.variant.widget_spec);
  const expiryLabel = formatExpiryLabel(pass.expires_at_iso);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${pass.variant.merchant_display_name} — ${pass.variant.discount_label}. Tap to redeem.`}
      onPress={() => {
        lightTap();
        onTap();
      }}
      style={({ pressed }) => [
        ...s("flex-row rounded-2xl bg-white"),
        {
          height: ROW_HEIGHT,
          padding: 12,
          borderWidth: 1,
          borderColor: "rgba(23, 18, 15, 0.08)",
          opacity: pressed ? 0.85 : 1,
          shadowColor: "#17120f",
          shadowOpacity: 0.06,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
        },
      ]}
    >
      {photoUrl && !imgFailed ? (
        <Image
          source={{ uri: photoUrl }}
          onError={() => setImgFailed(true)}
          resizeMode="cover"
          style={{
            width: 96,
            height: 96,
            borderRadius: 14,
            backgroundColor: "rgba(23, 18, 15, 0.06)",
          }}
        />
      ) : (
        <View
          style={{
            width: 96,
            height: 96,
            borderRadius: 14,
            backgroundColor: "#6f3f2c",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SymbolView
            name="wallet.pass.fill"
            tintColor="rgba(255, 248, 238, 0.7)"
            size={28}
            weight="regular"
            style={{ width: 28, height: 28 }}
          />
        </View>
      )}

      <View
        style={{
          flex: 1,
          paddingLeft: 12,
          justifyContent: "space-between",
        }}
      >
        {/* Top row — merchant name + discount badge inline */}
        <View>
          <View
            style={[
              ...s("flex-row items-start justify-between"),
              { gap: 8 },
            ]}
          >
            <Text
              style={[
                ...s("text-base font-black text-ink"),
                { flex: 1, letterSpacing: -0.2, lineHeight: 20 },
              ]}
              numberOfLines={2}
            >
              {pass.variant.merchant_display_name}
            </Text>
            <View
              style={[
                ...s("rounded-full bg-spark px-2"),
                { paddingVertical: 3 },
              ]}
            >
              <Text
                style={[
                  ...s("text-white"),
                  {
                    fontSize: 10,
                    fontWeight: "900",
                    letterSpacing: 1,
                    textTransform: "uppercase",
                  },
                ]}
              >
                {pass.variant.discount_label}
              </Text>
            </View>
          </View>
          <Text
            style={[
              ...s("mt-1 text-xs text-neutral-600"),
              { lineHeight: 16 },
            ]}
            numberOfLines={2}
          >
            {pass.variant.headline}
          </Text>
        </View>

        <View style={s("flex-row items-center justify-between")}>
          <Text
            style={[
              ...s("text-neutral-500"),
              {
                fontSize: 11,
                fontWeight: "700",
                letterSpacing: 0.4,
              },
            ]}
          >
            {expiryLabel}
          </Text>
          <Text
            style={[
              ...s("text-cocoa"),
              {
                fontSize: 11,
                fontWeight: "800",
                textTransform: "uppercase",
                letterSpacing: 1.2,
              },
            ]}
          >
            Tap to redeem →
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function formatExpiryLabel(expiresAtIso: string): string {
  const expiresAtMs = Date.parse(expiresAtIso);
  if (!Number.isFinite(expiresAtMs)) return "Expires soon";
  const days = Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 86_400_000));
  if (days <= 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `Expires in ${days} days`;
}

/**
 * Pull the photo URL out of the LLM-emitted widget_spec. Mirrors the
 * SimplifiedCardSurface helper in SwipeOfferStack so the saved-pass
 * card shows the same photo the user swiped on. Defensive — returns
 * null on any shape mismatch and the card falls through to the cocoa
 * placeholder block.
 */
function extractPhotoUrl(spec: unknown): string | null {
  if (!spec || typeof spec !== "object") return null;
  const root = spec as Record<string, unknown>;
  if (!Array.isArray(root.children)) return null;
  const first = (root.children as unknown[])[0] as
    | Record<string, unknown>
    | undefined;
  if (first && first.type === "Image" && typeof first.source === "string") {
    return first.source;
  }
  return null;
}

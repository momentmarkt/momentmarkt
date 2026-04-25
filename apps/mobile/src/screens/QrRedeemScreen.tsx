import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

import type { DemoOffer } from "../demo/miaOffer";
import { generateRedeemToken } from "../lib/redeem";

type Props = {
  offer: DemoOffer;
  /** Optional fixed token override — primarily for tests / Storybook. */
  tokenOverride?: string;
  /** Seconds until the token expires. Defaults to 90s — comfortable demo window. */
  expiresInSeconds?: number;
  onTap: (token: string) => void;
  onCancel: () => void;
};

const DEFAULT_EXPIRES_IN_S = 90;

/**
 * Standalone full-screen QR redeem view. Uses the same NativeWind
 * palette as the rest of the app (ink / cream / cocoa / spark / rain).
 * Designed to be dropped in by RedeemFlow once the user's #5 widget
 * renderer work lands.
 */
export function QrRedeemScreen({
  offer,
  tokenOverride,
  expiresInSeconds = DEFAULT_EXPIRES_IN_S,
  onTap,
  onCancel,
}: Props) {
  const token = useMemo(
    () => tokenOverride ?? generateRedeemToken(offer.id),
    [offer.id, tokenOverride],
  );
  const [secondsLeft, setSecondsLeft] = useState(expiresInSeconds);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
      const remaining = Math.max(0, expiresInSeconds - elapsed);
      setSecondsLeft(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresInSeconds]);

  const expired = secondsLeft === 0;

  return (
    <View className="flex-1 bg-ink px-5 py-6">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-xs font-bold uppercase tracking-[3px] text-cream/60">
            Simulated checkout
          </Text>
          <Text className="mt-1 text-2xl font-black text-cream">
            {offer.merchantName}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          className="rounded-full bg-cream/10 px-4 py-2"
          onPress={onCancel}
        >
          <Text className="text-xs font-black uppercase tracking-[2px] text-cream">
            Cancel
          </Text>
        </Pressable>
      </View>

      <View className="mt-6 items-center rounded-[34px] bg-cream p-6">
        <Text className="text-xs font-semibold uppercase tracking-[3px] text-rain">
          Show this at the till
        </Text>

        <View className="mt-4 rounded-2xl border-4 border-cocoa bg-white p-4">
          <QRCode
            value={token}
            size={200}
            color="#17120f"
            backgroundColor="#ffffff"
          />
        </View>

        <Text
          className="mt-4 text-base font-black tracking-[1px] text-cocoa"
          style={{ fontFamily: "Courier" }}
        >
          {token}
        </Text>

        <View className="mt-3 flex-row items-center gap-2">
          <View
            className={`h-2 w-2 rounded-full ${expired ? "bg-spark" : "bg-cocoa"}`}
          />
          <Text className="text-xs font-semibold uppercase tracking-[2px] text-rain">
            {expired
              ? "Token expired — cancel and re-open"
              : `Expires in ${formatCountdown(secondsLeft)}`}
          </Text>
        </View>
      </View>

      <View className="mt-5 rounded-3xl bg-cream/10 p-4">
        <Text className="text-xs font-semibold uppercase tracking-[2px] text-cream/60">
          Offer
        </Text>
        <Text className="mt-2 text-base font-bold text-cream">
          {offer.discount} · {offer.distanceM} m · expires {offer.expiresAt}
        </Text>
        <Text className="mt-1 text-sm leading-5 text-cream/70">
          {offer.subhead}
        </Text>
      </View>

      <View className="flex-1" />

      <Pressable
        accessibilityRole="button"
        disabled={expired}
        className={`rounded-2xl px-5 py-4 ${expired ? "bg-cream/20" : "bg-spark"}`}
        onPress={() => onTap(token)}
      >
        <Text className="text-center text-base font-black text-white">
          {expired ? "Token expired" : "Simulate girocard tap"}
        </Text>
      </Pressable>
    </View>
  );
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

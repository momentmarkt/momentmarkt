import { StatusBar } from "expo-status-bar";
import "./global.css";

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { WidgetRenderer } from "./src/components/WidgetRenderer";
import { miaRainOffer } from "./src/demo/miaOffer";

type DemoStep = "silent" | "surface" | "redeem" | "success";

export default function App() {
  const [step, setStep] = useState<DemoStep>("silent");

  return (
    <SafeAreaView className="flex-1 bg-cream">
      <StatusBar style="dark" />
      <View className="flex-1 px-5 py-6">
        <View className="mb-5 flex-row items-center justify-between">
          <View>
            <Text className="text-xs font-semibold uppercase tracking-[3px] text-rain">
              MomentMarkt
            </Text>
            <Text className="mt-1 text-2xl font-bold text-ink">Hi Mia, the city is quiet.</Text>
          </View>
          <View className="rounded-full bg-spark px-3 py-2">
            <Text className="text-xs font-bold text-white">LIVE</Text>
          </View>
        </View>

        <View className="rounded-[32px] bg-white p-5 shadow-sm">
          <Text className="text-sm font-semibold uppercase tracking-[2px] text-rain">
            Berlin Mitte · 13:30
          </Text>
          {step === "silent" ? (
            <>
              <Text className="mt-3 text-3xl font-black leading-9 text-ink">
                Silence until the moment is right.
              </Text>
              <Text className="mt-4 text-base leading-6 text-neutral-600">
                MomentMarkt stays quiet while Mia walks. When rain and a Cafe Bondi
                demand gap align, the wallet can surface one precise offer.
              </Text>
            </>
          ) : (
            <>
              <Text className="mt-3 text-3xl font-black leading-9 text-ink">
                {miaRainOffer.headline}
              </Text>
              <Text className="mt-4 text-base leading-6 text-neutral-600">
                {miaRainOffer.discount} · {miaRainOffer.distanceM} m away · expires {miaRainOffer.expiresAt}
              </Text>
            </>
          )}

          <View className="mt-6 gap-3">
            {miaRainOffer.whySignals.map((signal) => (
              <Signal key={signal.label} label={signal.label} value={signal.value} />
            ))}
            <Signal
              label="Privacy"
              value={`{${miaRainOffer.privacyEnvelope.intent_token}, ${miaRainOffer.privacyEnvelope.h3_cell_r8}}`}
            />
          </View>

          {step === "silent" ? (
            <Pressable className="mt-6 rounded-2xl bg-ink px-5 py-4" onPress={() => setStep("surface")}>
              <Text className="text-center text-base font-black text-cream">
                Simulate rain + demand trigger
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View className="mt-5 flex-1">
          {step === "surface" ? (
            <WidgetRenderer node={miaRainOffer.widgetSpec} onRedeem={() => setStep("redeem")} />
          ) : null}

          {step === "redeem" ? <RedeemCard onConfirm={() => setStep("success")} /> : null}

          {step === "success" ? <SuccessCard onReset={() => setStep("silent")} /> : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

function Signal({ label, value }: { label: string; value: string }) {
  return (
    <View className="rounded-2xl border border-neutral-200 bg-cream px-4 py-3">
      <Text className="text-xs font-semibold uppercase tracking-[2px] text-rain">{label}</Text>
      <Text className="mt-1 text-base font-semibold text-ink">{value}</Text>
    </View>
  );
}

function RedeemCard({ onConfirm }: { onConfirm: () => void }) {
  return (
    <View className="rounded-[34px] bg-ink p-5">
      <Text className="text-xs font-bold uppercase tracking-[3px] text-cream/60">Dynamic token</Text>
      <View className="my-6 items-center rounded-3xl bg-cream p-6">
        <View className="h-36 w-36 items-center justify-center rounded-2xl border-4 border-cocoa bg-white">
          <Text className="text-center text-sm font-black text-cocoa">QR{"\n"}BNDI-1330</Text>
        </View>
      </View>
      <Text className="text-base leading-6 text-cream/80">
        Simulated checkout: scan token, tap girocard, receive cashback credit.
      </Text>
      <Pressable className="mt-5 rounded-2xl bg-cream px-5 py-4" onPress={onConfirm}>
        <Text className="text-center text-base font-black text-cocoa">Tap girocard</Text>
      </Pressable>
    </View>
  );
}

function SuccessCard({ onReset }: { onReset: () => void }) {
  return (
    <View className="rounded-[34px] bg-spark p-5">
      <Text className="text-xs font-bold uppercase tracking-[3px] text-white/70">Cashback confirmed</Text>
      <Text className="mt-3 text-3xl font-black leading-9 text-white">
        Cafe Bondi redeemed. Merchant counter +1.
      </Text>
      <Text className="mt-4 text-base leading-6 text-white/80">
        The fallback loop is recordable: trigger, GenUI-style widget, token, simulated checkout.
      </Text>
      <Pressable className="mt-5 rounded-2xl bg-white px-5 py-4" onPress={onReset}>
        <Text className="text-center text-base font-black text-spark">Reset demo</Text>
      </Pressable>
    </View>
  );
}

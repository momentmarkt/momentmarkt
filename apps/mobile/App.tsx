import { StatusBar } from "expo-status-bar";
import "./global.css";

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { WidgetRenderer } from "./src/components/WidgetRenderer";
import { cityProfiles, type DemoCityId } from "./src/demo/cityProfiles";
import { miaRainOffer } from "./src/demo/miaOffer";
import { demoWidgetSpecs } from "./src/demo/widgetSpecs";
import { scoreSurfacing } from "./src/surfacing/surfacingScore";

type DemoStep = "silent" | "surface" | "redeem" | "success";
type WidgetVariant = keyof typeof demoWidgetSpecs;

export default function App() {
  const [step, setStep] = useState<DemoStep>("silent");
  const [widgetVariant, setWidgetVariant] = useState<WidgetVariant>("rainHero");
  const [highIntent, setHighIntent] = useState(false);
  const [cityId, setCityId] = useState<DemoCityId>("berlin");
  const city = cityProfiles[cityId];
  const surfacing = scoreSurfacing({
    ...city.surfacingInput,
    highIntent,
  });

  return (
    <SafeAreaView className="flex-1 bg-cream">
      <StatusBar style="dark" />
      <View className="flex-1 px-5 py-6">
        <View className="mb-5 flex-row items-center justify-between">
          <View>
            <Text className="text-xs font-semibold uppercase tracking-[3px] text-rain">
              MomentMarkt
            </Text>
            <Text className="mt-1 text-2xl font-bold text-ink">{city.greeting}</Text>
          </View>
          <View className="rounded-full bg-spark px-3 py-2">
            <Text className="text-xs font-bold text-white">{city.currency}</Text>
          </View>
        </View>

        <View className="rounded-[32px] bg-white p-5 shadow-sm">
          <View className="mb-4 flex-row gap-2">
            <CityButton
              active={cityId === "berlin"}
              label="Berlin"
              onPress={() => {
                setCityId("berlin");
                setStep("silent");
              }}
            />
            <CityButton
              active={cityId === "zurich"}
              label="Zurich"
              onPress={() => {
                setCityId("zurich");
                setStep("silent");
              }}
            />
          </View>
          <Text className="text-sm font-semibold uppercase tracking-[2px] text-rain">
            {city.cityLabel}
          </Text>
          {step === "silent" ? (
            <>
              <Text className="mt-3 text-3xl font-black leading-9 text-ink">
                {city.silentTitle}
              </Text>
              <Text className="mt-4 text-base leading-6 text-neutral-600">
                {city.silentBody}
              </Text>
            </>
          ) : (
            <>
              <Text className="mt-3 text-3xl font-black leading-9 text-ink">
                {surfacing.headline}
              </Text>
              <Text className="mt-4 text-base leading-6 text-neutral-600">
                {cityId === "berlin"
                  ? `${miaRainOffer.discount} · ${miaRainOffer.distanceM} m away · expires ${miaRainOffer.expiresAt}`
                  : city.offerSummary}
              </Text>
            </>
          )}

          <View className="mt-6 gap-3">
            <Signal label="City config" value={`${city.cityConfigLabel} · ${city.weatherLabel}`} />
            <Signal label="Privacy" value={`{${city.privacy.intent_token}, ${city.privacy.h3_cell_r8}}`} />
          </View>

          <Pressable
            className={`mt-4 rounded-2xl px-5 py-3 ${highIntent ? "bg-spark" : "bg-rain"}`}
            onPress={() => setHighIntent((value) => !value)}
          >
            <Text className="text-center text-sm font-black text-white">
              High-intent surfacing: {highIntent ? "ON" : "OFF"}
            </Text>
          </Pressable>

          {step === "silent" ? (
            <Pressable
              className="mt-4 rounded-2xl bg-ink px-5 py-4"
              onPress={() => (surfacing.shouldSurface ? setStep("surface") : setStep("silent"))}
            >
              <Text className="text-center text-base font-black text-cream">
                Run Surfacing Agent
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View className="mt-5 flex-1">
          {step === "surface" ? (
            <>
              <View className="mb-3 flex-row gap-2">
                <VariantButton
                  active={widgetVariant === "rainHero"}
                  label="Rain"
                  onPress={() => setWidgetVariant("rainHero")}
                />
                <VariantButton
                  active={widgetVariant === "quietStack"}
                  label="Quiet"
                  onPress={() => setWidgetVariant("quietStack")}
                />
                <VariantButton
                  active={widgetVariant === "preEventTicket"}
                  label="Event"
                  onPress={() => setWidgetVariant("preEventTicket")}
                />
              </View>
              <WidgetRenderer node={demoWidgetSpecs[widgetVariant]} onRedeem={() => setStep("redeem")} />
            </>
          ) : null}

          {step === "redeem" ? <RedeemCard onConfirm={() => setStep("success")} /> : null}

          {step === "success" ? <SuccessCard onReset={() => setStep("silent")} /> : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

function CityButton({
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
      className={`flex-1 rounded-2xl px-3 py-3 ${active ? "bg-rain" : "bg-cream"}`}
      onPress={onPress}
    >
      <Text className={`text-center text-xs font-black ${active ? "text-white" : "text-ink"}`}>
        {label}
      </Text>
    </Pressable>
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
      className={`flex-1 rounded-2xl px-3 py-2 ${active ? "bg-ink" : "bg-white"}`}
      onPress={onPress}
    >
      <Text className={`text-center text-xs font-black ${active ? "text-cream" : "text-ink"}`}>
        {label}
      </Text>
    </Pressable>
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

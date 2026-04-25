import { useEffect } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { coerceWidgetNode } from "../genui/widgetSchema";
import type { WidgetNode } from "../genui/widgetSchema";
import { s } from "../styles";

type Props = {
  node: unknown;
  onRedeem: () => void;
  /**
   * When true (default), the rendered widget mounts with a subtle
   * slide-up + fade-in motion. Set to false when wrapping the renderer
   * inside another container that already animates on entry (e.g. the
   * #37 bottom-sheet) to avoid double-bounce.
   */
  enterAnimation?: boolean;
};

/**
 * Outer wrapper that plays a 300ms slide-up + fade on mount. We animate
 * only the OUTER View — never the validated JSON spec children — so the
 * GenUI rendering pipeline stays untouched.
 */
export function WidgetRenderer({ node, onRedeem, enterAnimation = true }: Props) {
  const translateY = useSharedValue(enterAnimation ? 32 : 0);
  const opacity = useSharedValue(enterAnimation ? 0 : 1);

  useEffect(() => {
    if (!enterAnimation) return;
    translateY.value = withTiming(0, {
      duration: 300,
      easing: Easing.out(Easing.exp),
    });
    opacity.value = withTiming(1, {
      duration: 300,
      easing: Easing.out(Easing.exp),
    });
  }, [enterAnimation, opacity, translateY]);

  const enterStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[...s("flex-1"), enterStyle]}>
      <ValidatedWidgetRenderer node={coerceWidgetNode(node)} onRedeem={onRedeem} />
    </Animated.View>
  );
}

function ValidatedWidgetRenderer({ node, onRedeem }: { node: WidgetNode; onRedeem: () => void }) {
  switch (node.type) {
    case "View":
      return (
        <View style={s(node.className)}>
          {node.children?.map((child, index) => (
            <ValidatedWidgetRenderer key={index} node={child} onRedeem={onRedeem} />
          ))}
        </View>
      );
    case "ScrollView":
      return (
        <ScrollView style={s(node.className)} bounces={false}>
          {node.children?.map((child, index) => (
            <ValidatedWidgetRenderer key={index} node={child} onRedeem={onRedeem} />
          ))}
        </ScrollView>
      );
    case "Text":
      return <Text style={s(node.className)}>{node.text}</Text>;
    case "Image":
      return (
        <Image
          accessibilityLabel={node.accessibilityLabel}
          style={s(node.className) as never}
          resizeMode="cover"
          source={{ uri: node.source }}
        />
      );
    case "Pressable":
      return (
        <Pressable style={s(node.className)} onPress={onRedeem}>
          <Text style={s("text-center text-base font-black text-cocoa")}>{node.text}</Text>
        </Pressable>
      );
  }
}

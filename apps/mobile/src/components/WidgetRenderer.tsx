import { Image, Pressable, ScrollView, Text, View } from "react-native";

import type { WidgetNode } from "../demo/miaOffer";

type Props = {
  node: WidgetNode;
  onRedeem: () => void;
};

export function WidgetRenderer({ node, onRedeem }: Props) {
  switch (node.type) {
    case "View":
      return (
        <View className={node.className}>
          {node.children?.map((child, index) => (
            <WidgetRenderer key={index} node={child} onRedeem={onRedeem} />
          ))}
        </View>
      );
    case "ScrollView":
      return (
        <ScrollView className={node.className} bounces={false}>
          {node.children?.map((child, index) => (
            <WidgetRenderer key={index} node={child} onRedeem={onRedeem} />
          ))}
        </ScrollView>
      );
    case "Text":
      return <Text className={node.className}>{node.text}</Text>;
    case "Image":
      return (
        <Image
          accessibilityLabel={node.accessibilityLabel}
          className={node.className}
          resizeMode="cover"
          source={{ uri: node.source }}
        />
      );
    case "Pressable":
      return (
        <Pressable className={node.className} onPress={onRedeem}>
          <Text className="text-center text-base font-black text-cocoa">{node.text}</Text>
        </Pressable>
      );
  }
}

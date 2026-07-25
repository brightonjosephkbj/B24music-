import React, { useEffect, useRef } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions } from "react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const MENU_WIDTH = 220;

// Glass action card that scales up from wherever the long-press happened,
// per your "More" popup spec (anchored to the tap position, not a generic
// modal fade). anchor = { x, y } page coordinates from the long-press event.
export default function ContextMenuCard({ visible, anchor, actions, onClose }) {
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scale.setValue(0);
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 6 }).start();
    }
  }, [visible]);

  if (!visible || !anchor) return null;

  // Keep the menu on-screen: flip left if it would overflow the right edge,
  // flip up if it would overflow the bottom edge.
  const left = Math.min(anchor.x, SCREEN_WIDTH - MENU_WIDTH - 16);
  const estimatedHeight = actions.length * 48 + 16;
  const top = anchor.y + estimatedHeight > SCREEN_HEIGHT ? anchor.y - estimatedHeight : anchor.y;

  return (
    <Modal transparent visible={visible} onRequestClose={onClose} animationType="fade">
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <Animated.View
          style={[
            styles.menu,
            { left, top, transform: [{ scale }], opacity: scale },
          ]}
        >
          {actions.map((action, i) => (
            <TouchableOpacity
              key={action.key}
              style={[styles.item, i === actions.length - 1 && styles.itemLast]}
              onPress={() => {
                onClose();
                action.onPress();
              }}
            >
              <Text style={[styles.itemText, action.destructive && styles.itemTextDestructive]}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  menu: {
    position: "absolute",
    width: MENU_WIDTH,
    backgroundColor: "rgba(30,30,34,0.96)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    overflow: "hidden",
  },
  item: {
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  itemLast: { borderBottomWidth: 0 },
  itemText: { color: "#fff", fontSize: 15, fontWeight: "500" },
  itemTextDestructive: { color: "#FF6B6B" },
});

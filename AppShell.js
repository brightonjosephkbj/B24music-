import React, { useRef, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Image } from "react-native";

// Shared shell: renders whichever screen is active as children, then
// overlays the persistent bottom nav pill + mini-disc on top of it.
// This is what should now own navigation + nowPlaying state, instead of
// HomeScreen holding its own copy of the nav bar.
const NAV_ITEMS = [
  { key: "home", label: "Home" },
  { key: "library", label: "Library" },
  { key: "search", label: "Search" },
  { key: "settings", label: "Settings" },
];

const ACCENT = "#FF6B6B";
const GLASS_BORDER = "rgba(255,255,255,0.25)";

export default function AppShell({
  children,
  activeNav,
  onNavPress,
  nowPlaying,
  onDiscPress,
}) {
  const discRotation = useRef(new Animated.Value(0)).current;
  const spinLoop = useRef(null);

  useEffect(() => {
    if (nowPlaying) {
      spinLoop.current = Animated.loop(
        Animated.timing(discRotation, {
          toValue: 1,
          duration: 6000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      spinLoop.current.start();
    } else {
      spinLoop.current && spinLoop.current.stop();
    }
    return () => spinLoop.current && spinLoop.current.stop();
  }, [nowPlaying]);

  const spinDeg = discRotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <View style={styles.root}>
      {/* Active screen renders here, full bleed underneath the nav */}
      <View style={styles.screenArea}>{children}</View>

      {/* Persistent nav shell - same on Home, Library, Search, Settings */}
      <View style={styles.navShellRow} pointerEvents="box-none">
        <View style={styles.navPill}>
          {NAV_ITEMS.map((item) => {
            const active = item.key === activeNav;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.navItem, active && styles.navItemActive]}
                onPress={() => onNavPress && onNavPress(item.key)}
              >
                <Text style={[styles.navItemText, active && styles.navItemTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {nowPlaying && (
          <TouchableOpacity onPress={onDiscPress} style={styles.discWrap}>
            <Animated.View style={[styles.disc, { transform: [{ rotate: spinDeg }] }]}>
              <Image source={nowPlaying.artwork ? { uri: nowPlaying.artwork } : undefined} style={styles.discArt} />
              <View style={styles.discHole} />
            </Animated.View>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  screenArea: { flex: 1 },
  navShellRow: {
    position: "absolute", left: 20, right: 20, bottom: 24, flexDirection: "row", alignItems: "center",
  },
  navPill: {
    flex: 1, flexDirection: "row", backgroundColor: "rgba(20,20,25,0.55)", borderRadius: 30,
    borderWidth: 1, borderColor: GLASS_BORDER, paddingVertical: 8, paddingHorizontal: 6, justifyContent: "space-around",
  },
  navItem: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  navItemActive: { backgroundColor: ACCENT },
  navItemText: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "600" },
  navItemTextActive: { color: "#fff" },
  discWrap: { marginLeft: 12 },
  disc: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: "#111",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.3)", overflow: "hidden",
    justifyContent: "center", alignItems: "center",
  },
  discArt: { ...StyleSheet.absoluteFillObject, borderRadius: 26 },
  discHole: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#000", borderWidth: 1, borderColor: "rgba(255,255,255,0.4)" },
});

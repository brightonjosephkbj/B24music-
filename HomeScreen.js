import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Animated,
  PanResponder,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
// Points at your deployed b24music backend. Swap this for an env/config
// value later if you need different URLs for dev vs. production builds.
const API_BASE = "https://nrighton233j-b24music.hf.space";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = SCREEN_WIDTH * 0.78;

// Sunset gradient from your confirmed color system.
const GRADIENT_COLORS = ["#FF6B6B", "#FFA751", "#4ECDC4"];

// Category chips under the greeting. "All" and "Trending" both read the
// real /trending response - "New" and "Top Songs" just re-sort what we
// already fetched, client-side, until the backend grows dedicated logic
// for those categories.
const CHIPS = ["All", "Trending", "New", "Top Songs"];

// The 7 Glass Drawer tiles from your plan. Each one maps to a backend
// blueprint that already exists - "The Rest" bundles space/wiki/commons/
// met/flights, which don't need their own top-level tile.
const DRAWER_TILES = [
  { key: "weather", label: "Weather", accent: "#4ECDC4" },
  { key: "jokes", label: "Jokes", accent: "#FFA751" },
  { key: "food", label: "Food", accent: "#FF6B6B" },
  { key: "art", label: "Art", accent: "#F7B2C4" },
  { key: "trivia", label: "Trivia", accent: "#FFD166" },
  { key: "news", label: "News", accent: "#6BCB77" },
  { key: "rest", label: "The Rest", accent: "#B983FF" },
];

// onSearchPress / onDrawerTilePress / onTrackPress are plain callbacks so
// this screen doesn't assume any particular navigation library - wire them
// up to whatever you're using (React Navigation, a simple state switch,
// etc.) from the parent.
export default function HomeScreen({ onSearchPress, onDrawerTilePress, onTrackPress }) {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeChip, setActiveChip] = useState("All");

  // Drawer animation: translateX runs from DRAWER_WIDTH (fully hidden, off
  // the right edge of the screen) to 0 (fully open). Using core Animated +
  // PanResponder here instead of Reanimated/gesture-handler keeps this
  // screen dependency-free - nothing new to install or rebuild for.
  const drawerX = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openDrawer = () => {
    setDrawerOpen(true);
    Animated.spring(drawerX, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 4,
    }).start();
  };

  const closeDrawer = () => {
    Animated.timing(drawerX, {
      toValue: DRAWER_WIDTH,
      duration: 220,
      useNativeDriver: true,
    }).start(() => setDrawerOpen(false));
  };

  // Swipe-left-anywhere-on-Home gesture. Only kicks in once a drag is
  // clearly more horizontal than vertical, so normal vertical scrolling of
  // the page is never hijacked, and a plain tap still behaves like a tap.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => {
        return (
          Math.abs(gesture.dx) > 12 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5
        );
      },
      onPanResponderMove: (_, gesture) => {
        if (drawerOpen) return; // the drawer's own responder owns the gesture once open
        if (gesture.dx < 0) {
          const next = Math.max(DRAWER_WIDTH + gesture.dx, 0);
          drawerX.setValue(next);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (drawerOpen) return;
        const openedFarEnough = gesture.dx < -DRAWER_WIDTH * 0.35;
        const fastSwipe = gesture.vx < -0.5;
        if (openedFarEnough || fastSwipe) {
          openDrawer();
        } else {
          closeDrawer();
        }
      },
    })
  ).current;

  // Separate responder so the open drawer can be swiped shut on its own.
  const drawerPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 12 && gesture.dx > 0,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dx > 0) {
          drawerX.setValue(Math.min(gesture.dx, DRAWER_WIDTH));
        }
      },
      onPanResponderRelease: (_, gesture) => {
        const closedFarEnough = gesture.dx > DRAWER_WIDTH * 0.3;
        const fastSwipe = gesture.vx > 0.5;
        if (closedFarEnough || fastSwipe) {
          closeDrawer();
        } else {
          openDrawer();
        }
      },
    })
  ).current;

  const fetchTrending = async () => {
    try {
      setError(null);
      const res = await fetch(`${API_BASE}/api/music/trending?limit=15`);
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();
      setTracks(data.tracks || []);
    } catch (err) {
      setError(err.message || "Couldn't load trending tracks");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTrending();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTrending();
  };

  const displayedTracks = (() => {
    if (activeChip === "New") {
      return [...tracks].reverse();
    }
    if (activeChip === "Top Songs") {
      return [...tracks].sort((a, b) => (b.duration || 0) - (a.duration || 0));
    }
    return tracks;
  })();

  return (
    <View style={styles.root} {...panResponder.panHandlers}>
      <LinearGradient
        colors={GRADIENT_COLORS}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
        }
      >
        {/* ---------- Header: avatar + greeting + search ---------- */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitial}>B</Text>
            </View>
            <Text style={styles.greeting}>Hey there</Text>
          </View>
          <TouchableOpacity style={styles.iconButton} onPress={onSearchPress}>
            <Text style={styles.iconGlyph}>Search</Text>
          </TouchableOpacity>
        </View>

        {/* ---------- Category chips ---------- */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {CHIPS.map((chip) => {
            const active = chip === activeChip;
            return (
              <TouchableOpacity
                key={chip}
                onPress={() => setActiveChip(chip)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{chip}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ---------- Trending section (real data from /api/music/trending) ---------- */}
        <Text style={styles.sectionTitle}>Trending now</Text>

        {loading && <ActivityIndicator color="#fff" style={{ marginTop: 20 }} />}

        {!loading && error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={fetchTrending} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !error && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.trackRow}
          >
            {displayedTracks.map((track) => (
              <TouchableOpacity
                key={`${track.provider}-${track.id}`}
                style={styles.trackCard}
                onPress={() => onTrackPress && onTrackPress(track)}
              >
                <Image
                  source={track.artwork ? { uri: track.artwork } : undefined}
                  style={styles.trackArt}
                />
                <Text numberOfLines={1} style={styles.trackTitle}>{track.title}</Text>
                <Text numberOfLines={1} style={styles.trackArtist}>{track.artist}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* ---------- Quick-access strip hinting at the Glass Drawer ---------- */}
        <Text style={styles.sectionTitle}>More</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tileRow}
        >
          {DRAWER_TILES.map((tile) => (
            <TouchableOpacity
              key={tile.key}
              style={[styles.quickTile, { borderColor: tile.accent }]}
              onPress={openDrawer}
            >
              <Text style={styles.quickTileText}>{tile.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.hint}>Swipe left anywhere to open the drawer</Text>
      </ScrollView>

      {/* ---------- Backdrop: tap outside the open drawer to close it ---------- */}
      {drawerOpen && (
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeDrawer} />
      )}

      {/* ---------- Glass Drawer ---------- */}
      <Animated.View
        {...drawerPanResponder.panHandlers}
        style={[styles.drawer, { transform: [{ translateX: drawerX }] }]}
      >
        <Text style={styles.drawerTitle}>More</Text>
        {DRAWER_TILES.map((tile) => (
          <TouchableOpacity
            key={tile.key}
            style={[styles.drawerTile, { borderLeftColor: tile.accent }]}
            onPress={() => {
              closeDrawer();
              onDrawerTilePress && onDrawerTilePress(tile.key);
            }}
          >
            <Text style={styles.drawerTileText}>{tile.label}</Text>
          </TouchableOpacity>
        ))}
      </Animated.View>
    </View>
  );
}

const GLASS_BG = "rgba(255,255,255,0.14)";
const GLASS_BORDER = "rgba(255,255,255,0.25)";

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  scrollContent: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 140 },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarInitial: { color: "#fff", fontWeight: "700", fontSize: 16 },
  greeting: { color: "#fff", fontSize: 20, fontWeight: "700" },
  iconButton: {
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 20,
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    justifyContent: "center",
    alignItems: "center",
  },
  iconGlyph: { color: "#fff", fontSize: 13, fontWeight: "600" },

  chipRow: { marginBottom: 20 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    marginRight: 10,
  },
  chipActive: { backgroundColor: "rgba(255,255,255,0.9)" },
  chipText: { color: "#fff", fontWeight: "600" },
  chipTextActive: { color: "#FF6B6B" },

  sectionTitle: { color: "#fff", fontSize: 17, fontWeight: "700", marginBottom: 12, marginTop: 4 },

  trackRow: { paddingRight: 20 },
  trackCard: { width: 130, marginRight: 14 },
  trackArt: {
    width: 130,
    height: 130,
    borderRadius: 14,
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    marginBottom: 8,
  },
  trackTitle: { color: "#fff", fontWeight: "600", fontSize: 13 },
  trackArtist: { color: "rgba(255,255,255,0.75)", fontSize: 12 },

  tileRow: { paddingRight: 20, marginBottom: 8 },
  quickTile: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: GLASS_BG,
    borderWidth: 1.5,
    marginRight: 12,
  },
  quickTileText: { color: "#fff", fontWeight: "600" },

  hint: { color: "rgba(255,255,255,0.5)", fontSize: 12, textAlign: "center", marginTop: 10 },

  errorBox: { alignItems: "center", marginTop: 20 },
  errorText: { color: "#fff", marginBottom: 10 },
  retryButton: {
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  retryText: { color: "#fff", fontWeight: "700" },

  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  drawer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: "rgba(20,20,25,0.92)",
    borderLeftWidth: 1,
    borderLeftColor: GLASS_BORDER,
    paddingTop: 70,
    paddingHorizontal: 20,
  },
  drawerTitle: { color: "#fff", fontSize: 20, fontWeight: "700", marginBottom: 20 },
  drawerTile: {
    paddingVertical: 16,
    borderLeftWidth: 4,
    paddingLeft: 14,
    marginBottom: 4,
  },
  drawerTileText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});

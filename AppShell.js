import React, { useRef, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Image } from "react-native";
import { VideoView } from "expo-video";
import { useDownloads } from "./DownloadsContext";

// Shared shell: renders whichever screen is active as children, then
// overlays the persistent bottom nav + mini player trigger on top of it.
//
// Two states:
//   State A (default) - full nav pill (Home/Library/Search/Settings) with a
//     spinning CD disc (audio) or small video box (video) floating to its
//     right, only when something's playing.
//   State B (player expanded) - nav pill shrinks to a small 20px-radius pill
//     on the left; the caller (App.js) is responsible for rendering the
//     actual expanded Player/full-screen video on top of this shell.
const NAV_ITEMS = [
  { key: "home", label: "Home" },
  { key: "library", label: "Library" },
  { key: "search", label: "Search" },
];

const ACCENT = "#FF6B6B";
const GLASS_BORDER = "rgba(255,255,255,0.25)";

export default function AppShell({
  children,
  activeNav,
  onNavPress,
  nowPlaying,      // track object, or null
  engine,          // result of usePlaybackEngine(nowPlaying), or null
  playerExpanded,  // true once the user has tapped into State B
  onExpandPress,   // tap the disc/video box -> expand
  onCollapsePress, // tap the shrunken nav pill -> collapse back to State A
  onSkipNext,      // skip to the next track in the queue
  onSkipPrev,      // skip to the previous track in the queue
}) {
  const { hasActiveDownloads } = useDownloads();

  // Flickering blue dot while any download is active.
  const dotOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let loop;
    if (hasActiveDownloads) {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(dotOpacity, { toValue: 0.2, duration: 500, useNativeDriver: true }),
          Animated.timing(dotOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      loop.start();
    } else {
      dotOpacity.setValue(1);
    }
    return () => loop && loop.stop();
  }, [hasActiveDownloads]);
  const discRotation = useRef(new Animated.Value(0)).current;
  const spinLoop = useRef(null);

  const isVideo = nowPlaying?.type === "video";
  const isPlaying = !!engine?.isPlaying;

  useEffect(() => {
    if (nowPlaying && !isVideo && isPlaying) {
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
    // Rotation deliberately keeps its current value (not reset) when paused,
    // so resuming playback continues the spin from wherever it left off
    // rather than snapping back to 0deg.
  }, [nowPlaying, isVideo, isPlaying]);

  const spinDeg = discRotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <View style={styles.root}>
      {/* Active screen renders here, full bleed underneath the nav */}
      <View style={styles.screenArea}>{children}</View>

      {/* Persistent nav shell - collapses to a small pill in State B */}
      <View style={styles.navShellRow} pointerEvents="box-none">
        {playerExpanded ? (
          <TouchableOpacity style={styles.navMiniPill} onPress={onCollapsePress}>
            <Text style={styles.navMiniGlyph}>⌄</Text>
          </TouchableOpacity>
        ) : (
          <>
            <View style={[styles.navPill, nowPlaying && styles.navPillCompact]}>
              {NAV_ITEMS.map((item) => {
                const active = item.key === activeNav;
                const showDot = item.key === "library" && hasActiveDownloads;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[
                      styles.navItem,
                      nowPlaying && styles.navItemCompact,
                      active && styles.navItemActive,
                    ]}
                    onPress={() => onNavPress && onNavPress(item.key)}
                  >
                    <View style={styles.navItemLabelRow}>
                      <Text
                        style={[
                          styles.navItemText,
                          nowPlaying && styles.navItemTextCompact,
                          active && styles.navItemTextActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                      {showDot && <Animated.View style={[styles.downloadDot, { opacity: dotOpacity }]} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Compact transport cluster: prev, disc/video (tap to expand), play/pause, next.
                Only rendered once something's loaded - matches the old disc-only behavior
                for "nothing playing", just with real controls now that a queue exists. */}
            {nowPlaying && (
              <View style={styles.playerCluster}>
                <TouchableOpacity
                  onPress={() => onSkipPrev && onSkipPrev()}
                  style={styles.transportMini}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Text style={styles.transportMiniGlyph}>{"‹‹"}</Text>
                </TouchableOpacity>

                {!isVideo ? (
                  <TouchableOpacity onPress={onExpandPress} style={styles.discWrap}>
                    <Animated.View style={[styles.disc, { transform: [{ rotate: spinDeg }] }]}>
                      {!!nowPlaying.artwork && (
                        <Image
                          source={{ uri: nowPlaying.artwork }}
                          style={styles.discArt}
                          resizeMode="cover"
                          onError={(e) => console.warn("[disc artwork] failed to load:", nowPlaying.artwork, e.nativeEvent?.error)}
                        />
                      )}
                      <View style={styles.discHole} />
                    </Animated.View>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={onExpandPress} style={styles.videoBoxWrap}>
                    {engine?.videoPlayer ? (
                      <VideoView
                        player={engine.videoPlayer}
                        style={styles.videoBox}
                        contentFit="cover"
                        nativeControls={false}
                      />
                    ) : (
                      <View style={[styles.videoBox, styles.videoBoxFallback]} />
                    )}
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  onPress={() => engine?.toggle && engine.toggle()}
                  style={styles.transportMini}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Text style={styles.transportMiniGlyph}>{isPlaying ? "❚❚" : "▶"}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => onSkipNext && onSkipNext()}
                  style={styles.transportMini}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Text style={styles.transportMiniGlyph}>{"››"}</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
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
  // Nav pill shares the row with the transport cluster once something's
  // playing, so it needs to give up some breathing room.
  navPillCompact: { paddingHorizontal: 3 },
  navItem: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  navItemCompact: { paddingHorizontal: 7 },
  navItemActive: { backgroundColor: ACCENT },
  navItemText: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "600" },
  navItemLabelRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  downloadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#4EA1FF" },
  navItemTextCompact: { fontSize: 11 },
  navItemTextActive: { color: "#fff" },

  // Compact prev/disc-or-video/play-pause/next cluster, shown to the right
  // of the nav pill whenever a track is loaded.
  playerCluster: {
    flexDirection: "row", alignItems: "center", marginLeft: 8,
    backgroundColor: "rgba(20,20,25,0.55)", borderRadius: 26,
    borderWidth: 1, borderColor: GLASS_BORDER, paddingHorizontal: 4, paddingVertical: 4,
  },
  transportMini: { width: 26, height: 44, justifyContent: "center", alignItems: "center" },
  transportMiniGlyph: { color: "#fff", fontSize: 13, fontWeight: "700" },

  // State B: shrunken nav pill, tucked to the left, tap to collapse the player.
  navMiniPill: {
    width: 44, height: 44, borderRadius: 20, backgroundColor: "rgba(20,20,25,0.7)",
    borderWidth: 1, borderColor: GLASS_BORDER, justifyContent: "center", alignItems: "center",
  },
  navMiniGlyph: { color: "#fff", fontSize: 18, fontWeight: "700" },

  discWrap: {},
  disc: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: "#111",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.3)", overflow: "hidden",
    justifyContent: "center", alignItems: "center",
  },
  discArt: { width: "100%", height: "100%", borderRadius: 22, position: "absolute", top: 0, left: 0 },
  discHole: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#000", borderWidth: 1, borderColor: "rgba(255,255,255,0.4)" },

  // Video mini box: rectangular instead of circular, shows the actual
  // playing frame (muted-scale preview) rather than static artwork.
  videoBoxWrap: {},
  videoBox: {
    width: 60, height: 40, borderRadius: 10, backgroundColor: "#111",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.3)", overflow: "hidden",
  },
  videoBoxFallback: { justifyContent: "center", alignItems: "center" },
});

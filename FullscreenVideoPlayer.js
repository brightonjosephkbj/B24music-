import React, { useState, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Animated } from "react-native";
import { VideoView } from "expo-video";

const ACCENT = "#FF6B6B";

function formatTime(sec) {
  if (!sec && sec !== 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// track: normalized track object (title, artist, provider, id, type: "video").
// engine: usePlaybackEngine(track) from App.js - exposes videoPlayer directly
// for VideoView, plus the same isPlaying/position/duration/toggle shape
// PlayerCard uses for audio.
// onClose: collapses back to State A (same as PlayerCard's onCollapse).
// onNext / onPrev: skip within the same queue audio tracks use.
export default function FullscreenVideoPlayer({ track, engine, onClose, onNext, onPrev }) {
  const [chromeVisible, setChromeVisible] = useState(true);
  const playScale = useRef(new Animated.Value(1)).current;

  const onPlayPausePress = () => {
    Animated.sequence([
      Animated.timing(playScale, { toValue: 0.85, duration: 90, useNativeDriver: true }),
      Animated.spring(playScale, { toValue: 1, useNativeDriver: true, bounciness: 10 }),
    ]).start();
    engine?.toggle();
  };

  if (!engine?.videoPlayer) return null;

  const progressPct = engine?.duration ? Math.min(1, engine.position / engine.duration) : 0;

  return (
    <View style={styles.root}>
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={() => setChromeVisible((v) => !v)}
      >
        <VideoView
          player={engine.videoPlayer}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          nativeControls={false}
        />
      </TouchableOpacity>

      {engine.isBuffering && (
        <View style={styles.bufferingWrap} pointerEvents="none">
          <View style={styles.bufferingDot} />
        </View>
      )}

      {chromeVisible && (
        <>
          {/* Top bar */}
          <View style={styles.topBar}>
            <TouchableOpacity onPress={onClose} style={styles.iconButton}>
              <Text style={styles.iconText}>Close</Text>
            </TouchableOpacity>
            <View style={styles.topBarTitleWrap}>
              <Text style={styles.topBarTitle} numberOfLines={1}>{track?.title}</Text>
              <Text style={styles.topBarArtist} numberOfLines={1}>{track?.artist}</Text>
            </View>
            <View style={{ width: 76 }} />
          </View>

          {/* Bottom controls */}
          <View style={styles.bottomBar}>
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progressPct * 100}%` }]} />
                <View style={[styles.progressDot, { left: `${progressPct * 100}%` }]} />
              </View>
              <View style={styles.timeRow}>
                <Text style={styles.timeText}>{formatTime(engine?.position)}</Text>
                <Text style={styles.timeText}>{formatTime(engine?.duration)}</Text>
              </View>
            </View>

            <View style={styles.controlsRow}>
              <TouchableOpacity onPress={() => onPrev && onPrev()} style={styles.transportButton}>
                <Text style={styles.transportGlyph}>‹‹</Text>
              </TouchableOpacity>

              <Animated.View style={{ transform: [{ scale: playScale }] }}>
                <TouchableOpacity onPress={onPlayPausePress} style={styles.playButton}>
                  <Text style={styles.playGlyph}>{engine?.isPlaying ? "❚❚" : "▶"}</Text>
                </TouchableOpacity>
              </Animated.View>

              <TouchableOpacity onPress={() => onNext && onNext()} style={styles.transportButton}>
                <Text style={styles.transportGlyph}>››</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#000" },

  bufferingWrap: { position: "absolute", top: "50%", left: "50%", marginLeft: -6, marginTop: -6 },
  bufferingDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.6)" },

  topBar: {
    position: "absolute", top: 50, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  iconButton: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, width: 76,
    backgroundColor: "rgba(255,255,255,0.14)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
  },
  iconText: { color: "#fff", fontWeight: "600", fontSize: 13, textAlign: "center" },
  topBarTitleWrap: { flex: 1, alignItems: "center", paddingHorizontal: 8 },
  topBarTitle: { color: "#fff", fontSize: 14, fontWeight: "700" },
  topBarArtist: { color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 2 },

  bottomBar: { position: "absolute", left: 0, right: 0, bottom: 40, paddingHorizontal: 24 },
  progressRow: { marginBottom: 20 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)" },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: ACCENT },
  progressDot: {
    position: "absolute", top: -4, width: 12, height: 12, borderRadius: 6,
    backgroundColor: ACCENT, marginLeft: -6,
  },
  timeRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  timeText: { color: "rgba(255,255,255,0.6)", fontSize: 11 },

  controlsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 30 },
  transportButton: { padding: 10 },
  transportGlyph: { color: "#fff", fontSize: 22, fontWeight: "700" },
  playButton: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: ACCENT,
    justifyContent: "center", alignItems: "center",
  },
  playGlyph: { color: "#fff", fontSize: 24, fontWeight: "700" },
});

import React, { useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Animated, PanResponder, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { VideoView } from "expo-video";

const ACCENT = "#FF6B6B";
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const SWIPE_THRESHOLD = 60;
const TAP_THRESHOLD = 10;

function formatTime(sec) {
  if (!sec && sec !== 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function FullscreenVideoPlayer({ track, engine, onClose, onNext, onPrev }) {
  const [chromeVisible, setChromeVisible] = useState(true);
  const playScale = useRef(new Animated.Value(1)).current;

  const [rotated, setRotated] = useState(false);
  const toggleRotate = () => setRotated((r) => !r);

  // ---- Draggable seek bar ----
  // Uses the track's measured absolute screen position + the touch's
  // absolute screen coordinate (gestureState.moveX), NOT locationX -
  // locationX during PanResponder move events is known to be unreliable
  // (the exact cause of the old "hard to drag, snaps back" bug).
  const trackRef = useRef(null);
  const trackPageXRef = useRef(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubPct, setScrubPct] = useState(0);
  const scrubPctRef = useRef(0);

  const measureTrack = () => {
    if (trackRef.current) {
      trackRef.current.measure((x, y, width, height, pageX) => {
        trackPageXRef.current = pageX;
        setTrackWidth(width);
      });
    }
  };

  const updateScrubFromAbsoluteX = (absX) => {
    if (!trackWidth) return;
    const relativeX = absX - trackPageXRef.current;
    const pct = Math.max(0, Math.min(1, relativeX / trackWidth));
    scrubPctRef.current = pct;
    setScrubPct(pct);
  };

  const seekPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt, gestureState) => {
        setScrubbing(true);
        updateScrubFromAbsoluteX(gestureState.x0);
      },
      onPanResponderMove: (evt, gestureState) => {
        updateScrubFromAbsoluteX(gestureState.moveX);
      },
      onPanResponderRelease: () => {
        const seconds = scrubPctRef.current * (engine?.duration || 0);
        engine?.seekTo(seconds);
        setScrubbing(false);
      },
    })
  ).current;

  // ---- Swipe gestures on the video itself ----
  // Small movement (below TAP_THRESHOLD) is treated as a plain tap, toggling
  // the chrome - same as before. A clear swipe picks whichever direction
  // moved further: down to minimize, left for next, right for previous.
  const videoPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8,
      onPanResponderRelease: (_, g) => {
        const absDx = Math.abs(g.dx);
        const absDy = Math.abs(g.dy);

        if (absDx < TAP_THRESHOLD && absDy < TAP_THRESHOLD) {
          setChromeVisible((v) => !v);
          return;
        }

        if (absDy > absDx && g.dy > SWIPE_THRESHOLD) {
          onClose && onClose();
          return;
        }

        if (absDx > absDy) {
          if (g.dx < -SWIPE_THRESHOLD) {
            onNext && onNext();
          } else if (g.dx > SWIPE_THRESHOLD) {
            onPrev && onPrev();
          }
        }
      },
    })
  ).current;

  // Auto-advance to the next track once playback reaches the end.
  const hasAdvancedRef = useRef(false);
  useEffect(() => {
    hasAdvancedRef.current = false;
  }, [track?.id]);

  useEffect(() => {
    if (!engine?.duration || hasAdvancedRef.current) return;
    const nearEnd = engine.position >= engine.duration - 0.5;
    if (nearEnd) {
      hasAdvancedRef.current = true;
      onNext && onNext();
    }
  }, [engine?.position, engine?.duration]);

  const onPlayPausePress = () => {
    Animated.sequence([
      Animated.timing(playScale, { toValue: 0.85, duration: 90, useNativeDriver: true }),
      Animated.spring(playScale, { toValue: 1, useNativeDriver: true, bounciness: 10 }),
    ]).start();
    engine?.toggle();
  };

  if (!engine?.videoPlayer) return null;

  const progressPct = scrubbing
    ? scrubPct
    : engine?.duration
    ? Math.min(1, engine.position / engine.duration)
    : 0;
  const displayedPosition = scrubbing ? scrubPct * (engine?.duration || 0) : engine?.position;

  const videoStyle = rotated
    ? {
        position: "absolute",
        top: (SCREEN_HEIGHT - SCREEN_WIDTH) / 2,
        left: (SCREEN_WIDTH - SCREEN_HEIGHT) / 2,
        width: SCREEN_HEIGHT,
        height: SCREEN_WIDTH,
        transform: [{ rotate: "90deg" }],
      }
    : StyleSheet.absoluteFill;

  return (
    <View style={styles.root}>
      <View style={StyleSheet.absoluteFill} {...videoPanResponder.panHandlers}>
        <VideoView
          player={engine.videoPlayer}
          style={videoStyle}
          contentFit="contain"
          nativeControls={false}
        />
      </View>

      {engine.isBuffering && (
        <View style={styles.bufferingWrap} pointerEvents="none">
          <View style={styles.bufferingDot} />
        </View>
      )}

      {chromeVisible && (
        <>
          <View style={styles.topBar} pointerEvents="box-none">
            <TouchableOpacity onPress={onClose} style={styles.iconButton}>
              <Text style={styles.iconText}>Close</Text>
            </TouchableOpacity>
            <View style={styles.topBarTitleWrap}>
              <Text style={styles.topBarTitle} numberOfLines={1}>{track?.title}</Text>
              <Text style={styles.topBarArtist} numberOfLines={1}>{track?.artist}</Text>
            </View>
            <TouchableOpacity onPress={toggleRotate} style={styles.iconButton}>
              <Text style={styles.iconText}>{rotated ? "Portrait" : "Rotate"}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.bottomBar} pointerEvents="box-none">
            <View style={styles.progressRow}>
              <View
                ref={trackRef}
                style={styles.progressTrack}
                onLayout={measureTrack}
                {...seekPanResponder.panHandlers}
                hitSlop={{ top: 14, bottom: 14 }}
              >
                <View style={[styles.progressFill, { width: `${progressPct * 100}%` }]} />
                <View style={[styles.progressDot, { left: `${progressPct * 100}%` }]} />
              </View>
              <View style={styles.timeRow}>
                <Text style={styles.timeText}>{formatTime(displayedPosition)}</Text>
                <Text style={styles.timeText}>{formatTime(engine?.duration)}</Text>
              </View>
            </View>

            <View style={styles.controlsRow}>
              <TouchableOpacity onPress={() => onPrev && onPrev()} style={styles.transportButton}>
                <Text style={styles.transportGlyph}>‹‹</Text>
              </TouchableOpacity>

              <Animated.View style={{ transform: [{ scale: playScale }] }}>
                <TouchableOpacity onPress={onPlayPausePress} style={styles.playButton}>
                  <Ionicons name={engine?.isPlaying ? "pause" : "play"} size={24} color="#fff" />
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
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)", justifyContent: "center" },
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

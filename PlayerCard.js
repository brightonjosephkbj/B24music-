import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import ContextMenuCard from "./ContextMenuCard";

const API_BASE = "https://nrighton233j-b24music.hf.space";
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_HEIGHT = Dimensions.get("window").height * 0.7;

const GLASS_BG = "rgba(255,255,255,0.14)";
const GLASS_BORDER = "rgba(255,255,255,0.25)";
const ACCENT = "#FF6B6B";

function formatTime(sec) {
  if (!sec && sec !== 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// Finds the last lyric line whose timestamp has passed the current position.
function activeLyricIndex(lyrics, position) {
  if (!lyrics || lyrics.length === 0) return -1;
  let idx = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].time <= position) idx = i;
    else break;
  }
  return idx;
}

// track: normalized track object from the backend (title, artist, artwork, provider, id).
// engine: result of usePlaybackEngine(track) from the parent.
// onCollapse: tap the shrunken nav pill -> collapse back to State A.
// onNext / onPrev: skip within the real queue lifted up in App.js.
// onPlayTrack: play a specific track (e.g. a tapped related-track result),
// separate from onNext so skip and "play this" no longer fight over one prop.
export default function PlayerCard({ track, engine, onCollapse, onNext, onPrev, onPlayTrack, onShuffleToggle }) {
  const [panel, setPanel] = useState(0); // 0 = Photo, 1 = Lyrics, 2 = Related
  const scrollRef = useRef(null);

  const [lyrics, setLyrics] = useState([]);
  const [lyricsLoading, setLyricsLoading] = useState(true);
  const [hasSynced, setHasSynced] = useState(false);

  const [related, setRelated] = useState([]);
  const [relatedLoading, setRelatedLoading] = useState(true);

  const [shuffleOn, setShuffleOn] = useState(false);

  const [moreVisible, setMoreVisible] = useState(false);
  const [moreAnchor, setMoreAnchor] = useState(null);

  // ---- Breathing artwork pulse while playing ----
  const breathe = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let loop;
    if (engine?.isPlaying) {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(breathe, { toValue: 1.03, duration: 1800, useNativeDriver: true }),
          Animated.timing(breathe, { toValue: 1, duration: 1800, useNativeDriver: true }),
        ])
      );
      loop.start();
    } else {
      breathe.setValue(1);
    }
    return () => loop && loop.stop();
  }, [engine?.isPlaying]);

  // ---- Lyric line crossfade ----
  const lyricOpacity = useRef(new Animated.Value(1)).current;
  const lyricTranslate = useRef(new Animated.Value(0)).current;
  const lastLineIndexRef = useRef(-1);

  const currentLineIndex = activeLyricIndex(lyrics, engine?.position || 0);
  useEffect(() => {
    if (currentLineIndex !== lastLineIndexRef.current) {
      lastLineIndexRef.current = currentLineIndex;
      lyricOpacity.setValue(0);
      lyricTranslate.setValue(8);
      Animated.parallel([
        Animated.timing(lyricOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.timing(lyricTranslate, { toValue: 0, duration: 280, useNativeDriver: true }),
      ]).start();
    }
  }, [currentLineIndex]);

  const currentLine = currentLineIndex >= 0 ? lyrics[currentLineIndex]?.text : null;

  // ---- Play/pause button bounce ----
  const playScale = useRef(new Animated.Value(1)).current;
  const onPlayPausePress = () => {
    Animated.sequence([
      Animated.timing(playScale, { toValue: 0.85, duration: 90, useNativeDriver: true }),
      Animated.spring(playScale, { toValue: 1, useNativeDriver: true, bounciness: 10 }),
    ]).start();
    engine?.toggle();
  };

  // ---- Fetch lyrics once per track ----
  useEffect(() => {
    let cancelled = false;
    setLyricsLoading(true);
    setLyrics([]);
    setHasSynced(false);

    if (!track?.artist || !track?.title) {
      setLyricsLoading(false);
      return;
    }

    const params = new URLSearchParams({ artist: track.artist, title: track.title });
    if (track.duration) params.set("duration", String(Math.round(track.duration)));

    fetch(`${API_BASE}/api/music/lyrics?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setLyrics(data.lyrics || []);
        setHasSynced(!!data.hasSynced);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLyricsLoading(false));

    return () => {
      cancelled = true;
    };
  }, [track?.id, track?.provider]);

  // ---- Fetch related tracks once per track (Last.fm similar) ----
  useEffect(() => {
    let cancelled = false;
    setRelatedLoading(true);
    setRelated([]);

    if (!track?.artist || !track?.title) {
      setRelatedLoading(false);
      return;
    }

    const params = new URLSearchParams({ track: track.title, artist: track.artist });
    fetch(`${API_BASE}/api/music/lastfm/similar?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setRelated(data.similar || []);
      })
      .catch(() => {})
      .finally(() => !cancelled && setRelatedLoading(false));

    return () => {
      cancelled = true;
    };
  }, [track?.id, track?.provider]);

  const onPanelScrollEnd = (evt) => {
    const idx = Math.round(evt.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setPanel(idx);
  };

  const goToPanel = (idx) => {
    scrollRef.current?.scrollTo({ x: idx * SCREEN_WIDTH, animated: true });
    setPanel(idx);
  };

  const toggleShuffle = () => {
    setShuffleOn((s) => !s);
    onShuffleToggle && onShuffleToggle(!shuffleOn);
  };

  const openMore = (evt) => {
    const { pageX, pageY } = evt.nativeEvent;
    setMoreAnchor({ x: pageX - 180, y: pageY - 220 });
    setMoreVisible(true);
  };

  const moreActions = [
    { key: "eq", label: "Equalizer", onPress: () => {} },
    { key: "themes", label: "Player Themes", onPress: () => {} },
    { key: "sleep", label: "Sleep Timer", onPress: () => {} },
    { key: "speed", label: "Playback Speed", onPress: () => {} },
  ];

  const progressPct = engine?.duration ? Math.min(1, engine.position / engine.duration) : 0;

  // Related tracks are just { title, artist } from Last.fm - tapping one
  // resolves it to a real playable track via search, first match wins.
  const playRelated = async (item) => {
    try {
      const params = new URLSearchParams({ q: `${item.artist} ${item.title}`, limit: "1" });
      const res = await fetch(`${API_BASE}/api/music/search?${params.toString()}`);
      const data = await res.json();
      const found = data.tracks && data.tracks[0];
      if (found && onPlayTrack) onPlayTrack(found);
    } catch {
      // silently ignore - related tracks are a nice-to-have, not critical path
    }
  };

  return (
    <View style={styles.overlay}>
      <LinearGradient colors={["#0d0d0f", "#1a1a1a"]} style={StyleSheet.absoluteFill} />

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onPanelScrollEnd}
        style={styles.panelScroll}
      >
        {/* ---------------- Panel 0: Photo ---------------- */}
        <View style={styles.panel}>
          <Animated.View style={[styles.artworkWrap, { transform: [{ scale: breathe }] }]}>
            <Image
              source={track?.artwork ? { uri: track.artwork } : undefined}
              style={styles.artwork}
            />
            {!!currentLine && (
              <Animated.View
                style={[
                  styles.lyricOverlay,
                  { opacity: lyricOpacity, transform: [{ translateY: lyricTranslate }] },
                ]}
              >
                <Text style={styles.lyricOverlayText} numberOfLines={2}>
                  {currentLine}
                </Text>
              </Animated.View>
            )}
          </Animated.View>

          <Text style={styles.trackTitle} numberOfLines={1}>{track?.title}</Text>
          <Text style={styles.trackArtist} numberOfLines={1}>{track?.artist}</Text>

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
            <TouchableOpacity onPress={toggleShuffle} style={styles.sideButton}>
              <Text style={[styles.sideButtonText, shuffleOn && { color: ACCENT }]}>Shuffle</Text>
            </TouchableOpacity>

            <View style={styles.centerControls}>
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

            <TouchableOpacity onPress={openMore} style={styles.sideButton}>
              <Text style={styles.sideButtonText}>More</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ---------------- Panel 1: Lyrics ---------------- */}
        <View style={styles.panel}>
          <Text style={styles.panelHeading}>Lyrics</Text>
          {lyricsLoading ? (
            <ActivityIndicator color="#fff" style={{ marginTop: 30 }} />
          ) : lyrics.length === 0 ? (
            <Text style={styles.emptyText}>No lyrics found for this track.</Text>
          ) : (
            <ScrollView style={styles.lyricsScroll} contentContainerStyle={{ paddingBottom: 60 }}>
              {lyrics.map((line, i) => (
                <Text
                  key={i}
                  style={[styles.lyricLine, i === currentLineIndex && styles.lyricLineActive]}
                >
                  {line.text}
                </Text>
              ))}
            </ScrollView>
          )}
        </View>

        {/* ---------------- Panel 2: Related ---------------- */}
        <View style={styles.panel}>
          <Text style={styles.panelHeading}>Related</Text>
          {relatedLoading ? (
            <ActivityIndicator color="#fff" style={{ marginTop: 30 }} />
          ) : related.length === 0 ? (
            <Text style={styles.emptyText}>No related tracks found.</Text>
          ) : (
            <ScrollView style={styles.relatedScroll} contentContainerStyle={{ paddingBottom: 60 }}>
              {related.map((item, i) => (
                <TouchableOpacity key={i} style={styles.relatedRow} onPress={() => playRelated(item)}>
                  <Text style={styles.relatedTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.relatedArtist} numberOfLines={1}>{item.artist}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </ScrollView>

      {/* Panel dot indicators */}
      <View style={styles.dotsRow}>
        {[0, 1, 2].map((i) => (
          <TouchableOpacity key={i} onPress={() => goToPanel(i)} style={styles.dotTouch}>
            <View style={[styles.dot, panel === i && styles.dotActive]} />
          </TouchableOpacity>
        ))}
      </View>

      <ContextMenuCard
        visible={moreVisible}
        anchor={moreAnchor}
        actions={moreActions}
        onClose={() => setMoreVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    height: CARD_HEIGHT, backgroundColor: "#0d0d0f",
    borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden",
  },
  panelScroll: { flex: 1 },
  panel: { width: SCREEN_WIDTH, paddingHorizontal: 24, paddingTop: 36, alignItems: "center" },

  artworkWrap: {
    width: SCREEN_WIDTH - 80, height: SCREEN_WIDTH - 80, borderRadius: 20,
    overflow: "hidden", backgroundColor: GLASS_BG, marginBottom: 20,
  },
  artwork: { width: "100%", height: "100%" },
  lyricOverlay: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.55)", paddingVertical: 12, paddingHorizontal: 14,
  },
  lyricOverlayText: { color: "#fff", fontSize: 14, fontWeight: "600", textAlign: "center" },

  trackTitle: { color: "#fff", fontSize: 19, fontWeight: "700", marginTop: 4 },
  trackArtist: { color: "rgba(255,255,255,0.65)", fontSize: 13, marginTop: 2, marginBottom: 20 },

  progressRow: { width: "100%", marginBottom: 24 },
  progressTrack: {
    height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", overflow: "visible",
  },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: ACCENT },
  progressDot: {
    position: "absolute", top: -4, width: 12, height: 12, borderRadius: 6,
    backgroundColor: ACCENT, marginLeft: -6,
  },
  timeRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  timeText: { color: "rgba(255,255,255,0.5)", fontSize: 11 },

  controlsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" },
  sideButton: { width: 60 },
  sideButtonText: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "600" },
  centerControls: { flexDirection: "row", alignItems: "center", gap: 22 },
  transportButton: { padding: 8 },
  transportGlyph: { color: "#fff", fontSize: 20, fontWeight: "700" },
  playButton: {
    width: 62, height: 62, borderRadius: 31, backgroundColor: ACCENT,
    justifyContent: "center", alignItems: "center",
  },
  playGlyph: { color: "#fff", fontSize: 22, fontWeight: "700" },

  panelHeading: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 16, alignSelf: "flex-start" },
  emptyText: { color: "rgba(255,255,255,0.5)", marginTop: 30, textAlign: "center" },

  lyricsScroll: { width: "100%" },
  lyricLine: { color: "rgba(255,255,255,0.4)", fontSize: 16, lineHeight: 26, marginBottom: 4 },
  lyricLineActive: { color: "#fff", fontWeight: "700" },

  relatedScroll: { width: "100%" },
  relatedRow: {
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.1)", width: "100%",
  },
  relatedTitle: { color: "#fff", fontSize: 14, fontWeight: "600" },
  relatedArtist: { color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 },

  dotsRow: { flexDirection: "row", justifyContent: "center", paddingBottom: 16, gap: 8 },
  dotTouch: { padding: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.3)" },
  dotActive: { backgroundColor: ACCENT, width: 18 },
});

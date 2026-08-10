import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, Image, TouchableOpacity, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { getListeningHistory } from "./listeningHistory";
import { API_BASE, gatewayHeaders } from "./apiClient";

// ---------------------------------------------------------------------------
// Two feature cards for the top of Home: Paste URL (left) + Recent Played
// (right). Onyx/Candy Blue palette, matching RecentScreen.js.
// ---------------------------------------------------------------------------
const ONYX = "#020202";
const CANDY_BLUE = "#B2D5E5";
const GLASS_BG = "rgba(178,213,229,0.10)";
const GLASS_BORDER = "rgba(178,213,229,0.28)";

// Same line-matching approach as PlayerCard.js's activeLyricIndex - finds
// the last lyric line whose timestamp has passed the current position.
function activeLyricIndex(lyrics, position) {
  if (!lyrics || lyrics.length === 0) return -1;
  let idx = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].time <= position) idx = i;
    else break;
  }
  return idx;
}

export function PasteUrlCard({ onPress }) {
  const PHRASES = [
    "Paste a YouTube link\u2026",
    "Works with Spotify too\u2026",
    "Download in seconds\u2026",
    "Any song, any link\u2026",
  ];
  const [phraseIndex, setPhraseIndex] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
        setPhraseIndex((i) => (i + 1) % PHRASES.length);
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
      });
    }, 2600);
    return () => clearInterval(interval);
  }, []);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <LinearGradient colors={[ONYX, "#0c1113"]} style={StyleSheet.absoluteFill} />
      <View style={styles.pasteIconGlass}>
        <Ionicons name="link" size={20} color={CANDY_BLUE} />
      </View>
      <Text style={styles.pasteTitle}>Paste a Link</Text>
      <Animated.Text style={[styles.pasteSubtitle, { opacity }]} numberOfLines={1}>
        {PHRASES[phraseIndex]}
      </Animated.Text>
    </TouchableOpacity>
  );
}

export function RecentPlayedCard({ nowPlaying, engine, onTrackPress }) {
  const [entry, setEntry] = useState(null);
  const [lyrics, setLyrics] = useState([]);
  const lyricsLoadedFor = useRef(null);

  useEffect(() => {
    getListeningHistory().then((h) => setEntry(h[0] || null));
  }, []);

  const isActive =
    !!entry &&
    !!nowPlaying &&
    String(nowPlaying.id) === String(entry.id) &&
    (nowPlaying.provider || null) === (entry.provider || null);

  // Only fetch lyrics once this card's track actually becomes the active
  // global track - no point loading lyrics for a card sitting idle.
  useEffect(() => {
    if (!isActive || !entry?.artist || !entry?.title) return;
    const cacheKey = `${entry.provider || ""}-${entry.id}`;
    if (lyricsLoadedFor.current === cacheKey) return;
    lyricsLoadedFor.current = cacheKey;

    const params = new URLSearchParams({ artist: entry.artist, title: entry.title });
    fetch(`${API_BASE}/api/apicache/api/music/lyrics?${params.toString()}`, { headers: gatewayHeaders() })
      .then((res) => res.json())
      .then((data) => setLyrics(data.lyrics || []))
      .catch(() => {});
  }, [isActive, entry]);

  const position = isActive ? engine?.position || 0 : 0;
  const lineIndex = activeLyricIndex(lyrics, position);
  const currentLine = lineIndex >= 0 ? lyrics[lineIndex]?.text : null;

  // Crossfade the visible line whenever it changes, same feel as
  // PlayerCard's lyric overlay.
  const lineOpacity = useRef(new Animated.Value(1)).current;
  const lineTranslate = useRef(new Animated.Value(0)).current;
  const lastLine = useRef(null);
  useEffect(() => {
    if (currentLine && currentLine !== lastLine.current) {
      lastLine.current = currentLine;
      lineOpacity.setValue(0);
      lineTranslate.setValue(6);
      Animated.parallel([
        Animated.timing(lineOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(lineTranslate, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]).start();
    }
  }, [currentLine]);

  const handlePlay = () => {
    if (!entry) return;
    if (isActive) {
      engine?.toggle && engine.toggle();
      return;
    }
    const track = {
      id: entry.id,
      provider: entry.provider,
      title: entry.title,
      artist: entry.artist,
      artwork: entry.artwork,
      type: entry.type,
      localUri: entry.localUri,
      stream_url: entry.stream_url,
      download_url: entry.download_url,
    };
    onTrackPress && onTrackPress(track);
  };

  if (!entry) {
    return (
      <View style={styles.card}>
        <LinearGradient colors={[ONYX, "#0c1113"]} style={StyleSheet.absoluteFill} />
        <Text style={styles.emptyLabel}>RECENT PLAYED</Text>
        <Text style={styles.emptySubtext}>Nothing played yet</Text>
      </View>
    );
  }

  const showingLyric = isActive && !!currentLine;

  return (
    <TouchableOpacity style={styles.card} onPress={handlePlay} activeOpacity={0.9}>
      <Image
        source={entry.artwork ? { uri: entry.artwork } : undefined}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={["transparent", "rgba(2,2,2,0.55)", "rgba(2,2,2,0.92)"]}
        style={StyleSheet.absoluteFill}
      />
      <Text style={styles.recentLabel}>RECENT PLAYED</Text>
      <TouchableOpacity style={styles.playButtonGlass} onPress={handlePlay} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name={isActive && engine?.isPlaying ? "pause" : "play"} size={16} color={ONYX} />
      </TouchableOpacity>

      <View style={styles.recentBottom}>
        {showingLyric ? (
          <Animated.Text
            style={[styles.lyricLine, { opacity: lineOpacity, transform: [{ translateY: lineTranslate }] }]}
            numberOfLines={2}
          >
            {currentLine}
          </Animated.Text>
        ) : (
          <>
            <Text numberOfLines={1} style={styles.recentTitle}>{entry.title}</Text>
            <Text numberOfLines={1} style={styles.recentArtist}>{entry.artist}</Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

const CARD_HEIGHT = 148;

const styles = StyleSheet.create({
  card: {
    flex: 1,
    height: CARD_HEIGHT,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    backgroundColor: GLASS_BG,
    padding: 12,
    justifyContent: "space-between",
  },

  // Paste URL card
  pasteIconGlass: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  pasteTitle: { color: "#fff", fontSize: 15, fontWeight: "700", marginTop: 8 },
  pasteSubtitle: { color: CANDY_BLUE, fontSize: 12, marginTop: 4 },

  // Recent Played card
  recentLabel: {
    color: CANDY_BLUE,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  playButtonGlass: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: CANDY_BLUE,
    alignItems: "center",
    justifyContent: "center",
  },
  recentBottom: { marginTop: "auto" },
  recentTitle: { color: "#fff", fontSize: 14, fontWeight: "700" },
  recentArtist: { color: "rgba(255,255,255,0.65)", fontSize: 12, marginTop: 2 },
  lyricLine: { color: "#fff", fontSize: 13, fontWeight: "600", lineHeight: 18 },

  emptyLabel: { color: CANDY_BLUE, fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },
  emptySubtext: { color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: "auto" },
});

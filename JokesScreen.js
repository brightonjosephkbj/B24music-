import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Switch,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

// Points at your deployed b24meet backend.
const API_BASE = "https://nrighton233j-b24music.hf.space";
const ACCENT = "#FFA751"; // Jokes tile accent from the Glass Drawer

const CATEGORIES = ["Any", "Misc", "Programming", "Dark", "Pun", "Spooky", "Christmas"];

const GLASS_BG = "rgba(255,255,255,0.14)";
const GLASS_BORDER = "rgba(255,255,255,0.25)";

// Backend joins twopart jokes as "setup ... delivery" - split back apart
// here so we can reveal the punchline a beat after the setup.
function splitJoke(joke, type) {
  if (type !== "twopart" || !joke) return { setup: joke, punchline: null };
  const sep = " ... ";
  const idx = joke.indexOf(sep);
  if (idx === -1) return { setup: joke, punchline: null };
  return { setup: joke.slice(0, idx), punchline: joke.slice(idx + sep.length) };
}

let nextKey = 1;

// ---------------------------------------------------------------------------
// Frosted skeleton placeholder shown at the top of the feed while a new
// joke is loading. Same glass card shape as a real joke card, with a
// looping opacity pulse standing in for the text.
// ---------------------------------------------------------------------------
function SkeletonCard() {
  const pulse = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.85, duration: 550, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 550, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <Animated.View style={[styles.skelChip, { opacity: pulse }]} />
      </View>
      <Animated.View style={[styles.skelLine, { width: "90%", opacity: pulse }]} />
      <Animated.View style={[styles.skelLine, { width: "70%", opacity: pulse }]} />
      <Animated.View style={[styles.skelLine, { width: "45%", opacity: pulse }]} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// A single loaded joke card. Twopart jokes show the setup immediately and
// fade the punchline in automatically ~1.5s later - no tap required.
// ---------------------------------------------------------------------------
function JokeCard({ item }) {
  const punchlineOpacity = useRef(new Animated.Value(0)).current;
  const [showPunchline, setShowPunchline] = useState(!item.punchline);

  useEffect(() => {
    if (!item.punchline) return;
    const timer = setTimeout(() => {
      setShowPunchline(true);
      Animated.timing(punchlineOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }, 1500);
    return () => clearTimeout(timer);
  }, [item.punchline, punchlineOpacity]);

  return (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <View style={styles.categoryPill}>
          <Text style={styles.categoryPillText}>{item.category}</Text>
        </View>
        {!item.safe && (
          <View style={[styles.categoryPill, styles.unsafePill]}>
            <Text style={styles.categoryPillText}>Not Safe</Text>
          </View>
        )}
      </View>

      <Text style={styles.setupText}>{item.setup}</Text>

      {item.punchline && !showPunchline && (
        <View style={styles.punchlineSkeletonRow}>
          <Animated.View style={styles.punchlineDot} />
          <Animated.View style={styles.punchlineDot} />
          <Animated.View style={styles.punchlineDot} />
        </View>
      )}

      {item.punchline && showPunchline && (
        <Animated.Text style={[styles.punchlineText, { opacity: punchlineOpacity }]}>
          {item.punchline}
        </Animated.Text>
      )}
    </View>
  );
}

export default function JokesScreen({ onBack }) {
  const [category, setCategory] = useState("Any");
  const [safeMode, setSafeMode] = useState(true);
  const [feed, setFeed] = useState([]); // [{ key, status: 'loading'|'loaded'|'error', ... }]
  const [busy, setBusy] = useState(false);

  const fetchNewJoke = async () => {
    if (busy) return;
    setBusy(true);
    const key = `joke-${nextKey++}`;
    setFeed((prev) => [{ key, status: "loading" }, ...prev]);

    try {
      const params = new URLSearchParams({ category, safe: safeMode ? "true" : "false" });
      const res = await fetch(`${API_BASE}/api/jokes/random?${params.toString()}`);
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const { setup, punchline } = splitJoke(data.joke, data.type);
      setFeed((prev) =>
        prev.map((it) =>
          it.key === key
            ? { key, status: "loaded", category: data.category, setup, punchline, safe: data.safe }
            : it
        )
      );
    } catch (err) {
      setFeed((prev) =>
        prev.map((it) =>
          it.key === key
            ? { key, status: "error", message: err.message || "Couldn't load a joke" }
            : it
        )
      );
    } finally {
      setBusy(false);
    }
  };

  // Load one joke on first mount so the feed isn't empty.
  useEffect(() => {
    fetchNewJoke();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#1a1a1a", "#2b1a0d"]} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Jokes</Text>
        <View style={styles.safeToggleWrap}>
          <Text style={styles.safeToggleLabel}>Safe</Text>
          <Switch
            value={safeMode}
            onValueChange={setSafeMode}
            trackColor={{ false: "rgba(255,255,255,0.2)", true: ACCENT }}
            thumbColor="#fff"
          />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {CATEGORIES.map((cat) => {
          const active = cat === category;
          return (
            <TouchableOpacity
              key={cat}
              onPress={() => setCategory(cat)}
              style={[styles.chip, active && { backgroundColor: ACCENT, borderColor: ACCENT }]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        style={[styles.newJokeButton, busy && styles.newJokeButtonDisabled]}
        onPress={fetchNewJoke}
        disabled={busy}
      >
        <Text style={styles.newJokeButtonText}>{busy ? "Loading…" : "New Joke"}</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.list}>
        {feed.length === 0 && (
          <Text style={styles.emptyText}>Tap "New Joke" to get started.</Text>
        )}

        {feed.map((item) => {
          if (item.status === "loading") return <SkeletonCard key={item.key} />;
          if (item.status === "error") {
            return (
              <View key={item.key} style={[styles.card, styles.errorCard]}>
                <Text style={styles.errorText}>{item.message}</Text>
              </View>
            );
          }
          return <JokeCard key={item.key} item={item} />;
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backButton: { width: 60 },
  backText: { color: "#fff", fontWeight: "600" },
  title: { color: "#fff", fontSize: 20, fontWeight: "700" },
  safeToggleWrap: { flexDirection: "row", alignItems: "center", width: 70, justifyContent: "flex-end" },
  safeToggleLabel: { color: "rgba(255,255,255,0.7)", fontSize: 12, marginRight: 6 },

  chipRow: { paddingLeft: 20, marginBottom: 14, flexGrow: 0 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    marginRight: 10,
  },
  chipText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  chipTextActive: { color: "#2b1a0d" },

  newJokeButton: {
    marginHorizontal: 20,
    marginBottom: 16,
    height: 46,
    borderRadius: 23,
    backgroundColor: ACCENT,
    justifyContent: "center",
    alignItems: "center",
  },
  newJokeButtonDisabled: { opacity: 0.6 },
  newJokeButtonText: { color: "#2b1a0d", fontWeight: "700", fontSize: 15 },

  list: { paddingHorizontal: 20, paddingBottom: 150 },

  card: {
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
  },
  cardTopRow: { flexDirection: "row", marginBottom: 12 },
  categoryPill: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 8,
  },
  unsafePill: { backgroundColor: "rgba(255,107,107,0.25)" },
  categoryPillText: { color: "#fff", fontSize: 11, fontWeight: "700" },

  setupText: { color: "#fff", fontSize: 16, lineHeight: 22, fontWeight: "600" },

  punchlineSkeletonRow: { flexDirection: "row", marginTop: 12, gap: 6 },
  punchlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  punchlineText: { color: ACCENT, fontSize: 16, lineHeight: 22, fontWeight: "600", marginTop: 12 },

  errorCard: { borderColor: "rgba(255,107,107,0.5)" },
  errorText: { color: "#fff" },

  emptyText: { color: "rgba(255,255,255,0.6)", textAlign: "center", marginTop: 30 },

  skelChip: { width: 60, height: 20, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.25)" },
  skelLine: {
    height: 14,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.25)",
    marginBottom: 10,
  },
});

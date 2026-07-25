import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as FileSystem from "expo-file-system";
import { getDownloads, saveDownloads } from "./libraryStorage";

const API_BASE = "https://nrighton233j-b24music.hf.space";
const GRADIENT_COLORS = ["#FF6B6B", "#FFA751", "#4ECDC4"];
const GLASS_BG = "rgba(255,255,255,0.14)";
const GLASS_BORDER = "rgba(255,255,255,0.25)";
const ACCENT = "#FF6B6B";

// Matches the "category" field your /api/music/search response groups
// Archive.org results into - anything else (Audius/Deezer/Jamendo/ccMixter)
// comes back tagged "music".
const CATEGORY_LABELS = {
  music: "Music",
  podcast: "Podcasts",
  lecture: "Lectures",
  audiobook: "Audiobooks",
};
function categoryLabel(key) {
  return CATEGORY_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

function formatDuration(sec) {
  if (!sec && sec !== 0) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function safeFilename(title, ext) {
  const clean = (title || "download").replace(/[^A-Za-z0-9 _-]/g, "").trim() || "download";
  return `${clean}.${ext}`;
}

function trackKey(t) {
  return `${t.provider}-${t.id}`;
}

// onTrackPress(track) - plays a search result, same track shape everywhere else uses.
export default function SearchScreen({ onTrackPress }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [categories, setCategories] = useState({}); // { music: [...], podcast: [...], ... }
  const [searched, setSearched] = useState(false);

  // One download at a time - kind to the free-tier backend, and simpler to
  // show clear per-row progress without juggling multiple progress bars.
  const [downloadingKey, setDownloadingKey] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadedIds, setDownloadedIds] = useState(() => new Set());

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const params = new URLSearchParams({ q });
      const res = await fetch(`${API_BASE}/api/music/search?${params.toString()}`);
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();
      setCategories(data.categories || {});
    } catch (err) {
      setError(err.message || "Search failed");
      setCategories({});
    } finally {
      setLoading(false);
    }
  };

  const downloadTrack = async (track) => {
    const key = trackKey(track);
    if (downloadingKey) return; // one at a time
    setDownloadingKey(key);
    setDownloadProgress(0);
    try {
      const localUri = FileSystem.documentDirectory + safeFilename(track.title, "mp3");

      const downloadResumable = FileSystem.createDownloadResumable(
        track.download_url,
        localUri,
        {},
        (progressEvent) => {
          const pct =
            progressEvent.totalBytesExpectedToWrite > 0
              ? progressEvent.totalBytesWritten / progressEvent.totalBytesExpectedToWrite
              : 0;
          setDownloadProgress(pct);
        }
      );
      await downloadResumable.downloadAsync();

      const entry = {
        id: key,
        type: "audio",
        title: track.title,
        artist: track.artist,
        artwork: track.artwork,
        localUri,
        duration: track.duration || 0,
        source: track.provider,
        addedAt: Date.now(),
      };
      const existing = await getDownloads();
      await saveDownloads([...existing, entry]);
      setDownloadedIds((prev) => new Set(prev).add(key));
    } catch (err) {
      setError(err.message || "Download failed");
    } finally {
      setDownloadingKey(null);
    }
  };

  const renderRow = (track) => {
    const key = trackKey(track);
    const isDownloading = downloadingKey === key;
    const isDownloaded = downloadedIds.has(key);

    return (
      <TouchableOpacity
        key={key}
        style={styles.row}
        onPress={() => onTrackPress && onTrackPress(track)}
      >
        <Image source={track.artwork ? { uri: track.artwork } : undefined} style={styles.rowArt} />
        <View style={styles.rowTextWrap}>
          <Text numberOfLines={1} style={styles.rowTitle}>{track.title}</Text>
          <View style={styles.rowMetaRow}>
            <Text numberOfLines={1} style={styles.rowArtist}>{track.artist}</Text>
            <Text style={styles.providerBadge}>{track.provider}</Text>
          </View>
        </View>
        <Text style={styles.rowDuration}>{formatDuration(track.duration)}</Text>

        {track.downloadable && (
          isDownloading ? (
            <View style={styles.downloadWrap}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.downloadPct}>{Math.round(downloadProgress * 100)}%</Text>
            </View>
          ) : isDownloaded ? (
            <Text style={styles.downloadedGlyph}>Saved</Text>
          ) : (
            <TouchableOpacity
              onPress={() => downloadTrack(track)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.downloadTouch}
            >
              <Text style={styles.downloadGlyph}>Download</Text>
            </TouchableOpacity>
          )
        )}
      </TouchableOpacity>
    );
  };

  const categoryEntries = Object.entries(categories).filter(([, items]) => items.length > 0);

  return (
    <View style={styles.root}>
      <LinearGradient colors={GRADIENT_COLORS} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Search</Text>

        <View style={styles.inputRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={runSearch}
            placeholder="Song, artist, podcast..."
            placeholderTextColor="rgba(255,255,255,0.5)"
            returnKeyType="search"
            style={styles.input}
          />
          <TouchableOpacity onPress={runSearch} style={styles.searchButton}>
            <Text style={styles.searchButtonText}>Search</Text>
          </TouchableOpacity>
        </View>

        {loading && <ActivityIndicator color="#fff" style={{ marginTop: 24 }} />}

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        {!loading && searched && !error && categoryEntries.length === 0 && (
          <Text style={styles.emptyText}>No results for "{query}".</Text>
        )}

        {!searched && !loading && (
          <Text style={styles.hint}>Search across Audius, Deezer, Jamendo, ccMixter, and Archive.org.</Text>
        )}

        {categoryEntries.map(([cat, items]) => (
          <View key={cat} style={{ marginTop: 20 }}>
            <Text style={styles.sectionTitle}>{categoryLabel(cat)}</Text>
            {items.map(renderRow)}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  content: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 150 },
  title: { color: "#fff", fontSize: 22, fontWeight: "700", marginBottom: 16 },

  inputRow: { flexDirection: "row", gap: 10 },
  input: {
    flex: 1,
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#fff",
  },
  searchButton: { backgroundColor: ACCENT, borderRadius: 14, paddingHorizontal: 18, justifyContent: "center" },
  searchButtonText: { color: "#fff", fontWeight: "700" },

  hint: { color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 20, textAlign: "center" },
  emptyText: { color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 24, textAlign: "center" },
  errorText: {
    color: "#fff",
    backgroundColor: "rgba(200,50,50,0.4)",
    padding: 12,
    borderRadius: 10,
    marginTop: 16,
  },

  sectionTitle: { color: "#fff", fontSize: 16, fontWeight: "700", marginBottom: 10 },

  row: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  rowArt: { width: 46, height: 46, borderRadius: 8, backgroundColor: GLASS_BG, marginRight: 12 },
  rowTextWrap: { flex: 1, marginRight: 8 },
  rowTitle: { color: "#fff", fontWeight: "600", fontSize: 14 },
  rowMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  rowArtist: { color: "rgba(255,255,255,0.7)", fontSize: 12, flexShrink: 1 },
  providerBadge: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  rowDuration: { color: "rgba(255,255,255,0.6)", fontSize: 11, marginRight: 8 },

  downloadWrap: { flexDirection: "row", alignItems: "center", gap: 4 },
  downloadPct: { color: "#fff", fontSize: 10 },
  downloadTouch: {
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  downloadGlyph: { color: "#fff", fontSize: 10, fontWeight: "700" },
  downloadedGlyph: { color: "#6BCB77", fontSize: 11, fontWeight: "700" },
});

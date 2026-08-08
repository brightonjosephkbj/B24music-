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
  Modal,
  Pressable,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import * as FileSystem from "expo-file-system/legacy";
import { getDownloads, saveDownloads } from "./libraryStorage";
import { useDownloads } from "./DownloadsContext";

import { authedHeaders } from "./apiClient";

const API_BASE = "https://gateway-cah4.onrender.com";
const GRADIENT_COLORS = ["#FF6B6B", "#FFA751", "#4ECDC4"];
const GLASS_BG = "rgba(255,255,255,0.14)";
const GLASS_BORDER = "rgba(255,255,255,0.25)";
const ACCENT = "#FF6B6B";

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

// The formats/qualities actually offered by the backend for a YouTube
// result: /api/fetch/lightning_stream and /api/fetch/download both accept
// mode ("audio"|"video") and quality - these three cover what's real,
// not invented options the backend can't actually deliver.
const QUALITY_OPTIONS = [
  { key: "audio_high", mode: "audio", quality: "high", ext: "mp3", label: "Audio - High Quality (MP3)" },
  { key: "audio_medium", mode: "audio", quality: "medium", ext: "mp3", label: "Audio - Medium Quality (MP3)" },
  { key: "video_720", mode: "video", quality: "medium", ext: "mp4", label: "Video - 720p (MP4)" },
];

// onTrackPress(track) - plays a search result, same track shape everywhere else uses.
export default function SearchScreen({ onTrackPress }) {
  const { startDownload, updateProgress, finishDownload, registerControls, isCancelled } = useDownloads();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [categories, setCategories] = useState({}); // { music: [...], podcast: [...], ... }
  const [searched, setSearched] = useState(false);

  const [downloadingKey, setDownloadingKey] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadedIds, setDownloadedIds] = useState(() => new Set());

  const [ytResults, setYtResults] = useState([]);
  const [resolvingIds, setResolvingIds] = useState(() => new Set());

  // Quality-picker sheet - opened for a YouTube result, closed by tapping
  // anywhere on the blurred backdrop (including the sheet's own blank space).
  const [sheetItem, setSheetItem] = useState(null);
  const sheetVisible = !!sheetItem;

  // Multi-select for batch download: a set of selected YouTube result ids,
  // a separate small sheet to pick one format/quality applied to the whole
  // batch, and simple running-count progress while it works through them
  // one at a time (same one-at-a-time pattern as everywhere else here).
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [batchSheetOpen, setBatchSheetOpen] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const params = new URLSearchParams({ q });

      const [libraryRes, ytRes] = await Promise.allSettled([
        fetch(`${API_BASE}/api/apicache/api/music/search?${params.toString()}`, { headers: await authedHeaders() }),
        fetch(`${API_BASE}/api/downloads/remote/search?${params.toString()}`, { headers: await authedHeaders() }),
      ]);

      let catList = [];
      if (libraryRes.status === "fulfilled" && libraryRes.value.ok) {
        const data = await libraryRes.value.json();
        const cats = data.categories || {};
        setCategories(cats);
        catList = Object.values(cats).flat();
      } else {
        setCategories({});
      }

      let ytList = [];
      if (ytRes.status === "fulfilled" && ytRes.value.ok) {
        const ytData = await ytRes.value.json();
        ytList = (ytData.ok ? ytData.data : []) || [];
        setYtResults(ytList);
      } else {
        setYtResults([]);
      }

      syncDownloadedIds(catList, ytList);
    } catch (err) {
      setError(err.message || "Search failed");
      setCategories({});
      setYtResults([]);
    } finally {
      setLoading(false);
    }
  };

  // Checks which of the current results already exist in the persisted
  // downloads list (not just this session's downloadedIds), so "Saved"
  // shows correctly even for tracks downloaded in a previous session.
  const syncDownloadedIds = async (catItems, ytItems) => {
    try {
      const existing = await getDownloads();
      const existingIds = new Set(existing.map((d) => d.id));
      const next = new Set();
      catItems.forEach((t) => {
        const k = trackKey(t);
        if (existingIds.has(k)) next.add(k);
      });
      ytItems.forEach((yt) => {
        QUALITY_OPTIONS.forEach((opt) => {
          const k = `youtube-${yt.id}-${opt.key}`;
          if (existingIds.has(k)) next.add(k);
        });
      });
      if (next.size > 0) {
        setDownloadedIds((prev) => new Set([...prev, ...next]));
      }
    } catch {
      // Non-critical - worst case the button just re-shows "Download"
    }
  };

  const downloadTrack = async (track) => {
    const key = trackKey(track);
    if (downloadingKey) return;
    setDownloadingKey(key);
    setDownloadProgress(0);
    startDownload(key, { title: track.title });
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
          updateProgress(key, pct);
        }
      );
      registerControls(key, {
        pause: () => downloadResumable.pauseAsync().catch(() => {}),
        resume: () => downloadResumable.resumeAsync().catch(() => {}),
        cancel: () => downloadResumable.pauseAsync().catch(() => {}),
      });
      await downloadResumable.downloadAsync();
      if (isCancelled(key)) return;

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
      if (!isCancelled(key)) setError(err.message || "Download failed");
    } finally {
      setDownloadingKey(null);
      finishDownload(key);
    }
  };

  const openQualitySheet = (ytItem) => setSheetItem(ytItem);
  const closeQualitySheet = () => setSheetItem(null);

  // Resolves the tapped YouTube result at a specific format/quality (chosen
  // in the sheet) and either plays it or downloads it.
  const resolveAtQuality = async (ytItem, option) => {
    const id = `${ytItem.id}-${option.key}`;
    setResolvingIds((prev) => new Set(prev).add(id));
    try {
      const params = new URLSearchParams({ url: ytItem.url, mode: option.mode, quality: option.quality });
      const res = await fetch(`${API_BASE}/api/downloads/remote/stream-info?${params.toString()}`, { headers: await authedHeaders() });
      if (!res.ok) throw new Error(`Resolve failed (${res.status})`);
      return await res.json();
    } catch (err) {
      setError(err.message || "Could not load that track");
      return null;
    } finally {
      setResolvingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleSheetPlay = async (option) => {
    const ytItem = sheetItem;
    closeQualitySheet();
    if (!ytItem) return;
    const streamInfo = await resolveAtQuality(ytItem, option);
    if (!streamInfo) return;

    const track = {
      provider: "youtube",
      id: ytItem.id,
      type: option.mode === "video" ? "video" : "audio",
      title: streamInfo.title || ytItem.title,
      artist: ytItem.uploader,
      artwork: ytItem.thumbnail,
      duration: ytItem.duration,
      downloadable: true,
      download_url: streamInfo.stream_url,
      stream_url: streamInfo.stream_url,
    };
    onTrackPress && onTrackPress(track);
  };

  const handleSheetDownload = async (option) => {
    const ytItem = sheetItem;
    closeQualitySheet();
    if (!ytItem) return;
    const key = `youtube-${ytItem.id}-${option.key}`;
    if (downloadingKey) return;

    const streamInfo = await resolveAtQuality(ytItem, option);
    if (!streamInfo) return;

    setDownloadingKey(key);
    setDownloadProgress(0);
    startDownload(key, { title: streamInfo.title || ytItem.title });
    try {
      const localUri = FileSystem.documentDirectory + safeFilename(streamInfo.title || ytItem.title, streamInfo.ext || option.ext);

      const downloadResumable = FileSystem.createDownloadResumable(
        streamInfo.stream_url,
        localUri,
        {},
        (progressEvent) => {
          const pct =
            progressEvent.totalBytesExpectedToWrite > 0
              ? progressEvent.totalBytesWritten / progressEvent.totalBytesExpectedToWrite
              : 0;
          setDownloadProgress(pct);
          updateProgress(key, pct);
        }
      );
      registerControls(key, {
        pause: () => downloadResumable.pauseAsync().catch(() => {}),
        resume: () => downloadResumable.resumeAsync().catch(() => {}),
        cancel: () => downloadResumable.pauseAsync().catch(() => {}),
      });
      await downloadResumable.downloadAsync();
      if (isCancelled(key)) return;

      const entry = {
        id: key,
        type: option.mode === "video" ? "video" : "audio",
        title: streamInfo.title || ytItem.title,
        artist: ytItem.uploader,
        artwork: ytItem.thumbnail,
        localUri,
        duration: ytItem.duration || 0,
        source: "youtube",
        addedAt: Date.now(),
      };
      const existing = await getDownloads();
      await saveDownloads([...existing, entry]);
      setDownloadedIds((prev) => new Set(prev).add(key));
    } catch (err) {
      if (!isCancelled(key)) setError(err.message || "Download failed");
    } finally {
      setDownloadingKey(null);
      finishDownload(key);
    }
  };

  const openBatchQualitySheet = () => setBatchSheetOpen(true);
  const closeBatchQualitySheet = () => setBatchSheetOpen(false);

  // Runs through every selected YouTube result at one chosen quality,
  // one at a time - resolves, downloads, saves, then moves to the next.
  // A single failed track doesn't stop the rest of the batch.
  const handleBatchDownload = async (option) => {
    closeBatchQualitySheet();
    const items = ytResults.filter((yt) => selectedIds.has(yt.id));
    if (items.length === 0) return;

    setBatchRunning(true);
    setBatchProgress({ current: 0, total: items.length });

    for (let i = 0; i < items.length; i++) {
      const ytItem = items[i];
      setBatchProgress({ current: i + 1, total: items.length });

      const key = `youtube-${ytItem.id}-${option.key}`;
      if (downloadedIds.has(key)) continue;

      const streamInfo = await resolveAtQuality(ytItem, option);
      if (!streamInfo) continue;

      try {
        const localUri = FileSystem.documentDirectory + safeFilename(streamInfo.title || ytItem.title, streamInfo.ext || option.ext);
        const downloadResumable = FileSystem.createDownloadResumable(streamInfo.stream_url, localUri, {});
        await downloadResumable.downloadAsync();

        const entry = {
          id: key,
          type: option.mode === "video" ? "video" : "audio",
          title: streamInfo.title || ytItem.title,
          artist: ytItem.uploader,
          artwork: ytItem.thumbnail,
          localUri,
          duration: ytItem.duration || 0,
          source: "youtube",
          addedAt: Date.now(),
        };
        const existing = await getDownloads();
        await saveDownloads([...existing, entry]);
        setDownloadedIds((prev) => new Set(prev).add(key));
      } catch (err) {
        console.warn(`Batch download failed for "${ytItem.title}":`, err);
      }
    }

    setBatchRunning(false);
    setSelectedIds(new Set());
  };

  const renderYoutubeRow = (ytItem) => {
    const isSelected = selectedIds.has(ytItem.id);
    return (
      <View key={`youtube-${ytItem.id}`} style={styles.row}>
        <TouchableOpacity
          onPress={() => toggleSelected(ytItem.id)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[styles.checkbox, isSelected && styles.checkboxChecked]}
        >
          {isSelected && <Text style={styles.checkboxMark}>✓</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.rowBody}
          onPress={() => openQualitySheet(ytItem)}
        >
          <Image source={ytItem.thumbnail ? { uri: ytItem.thumbnail } : undefined} style={styles.rowArt} />
          <View style={styles.rowTextWrap}>
            <Text numberOfLines={1} style={styles.rowTitle}>{ytItem.title}</Text>
            <View style={styles.rowMetaRow}>
              <Text numberOfLines={1} style={styles.rowArtist}>{ytItem.uploader}</Text>
              <Text style={styles.providerBadge}>YouTube</Text>
            </View>
          </View>
          <Text style={styles.rowDuration}>{formatDuration(ytItem.duration)}</Text>
        </TouchableOpacity>
      </View>
    );
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

        {!loading && searched && !error && categoryEntries.length === 0 && ytResults.length === 0 && (
          <Text style={styles.emptyText}>No results for "{query}".</Text>
        )}

        {!searched && !loading && (
          <Text style={styles.hint}>Search across Audius, Deezer, Jamendo, ccMixter, Archive.org, and YouTube.</Text>
        )}

        {ytResults.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <Text style={styles.sectionTitle}>From YouTube</Text>

            {selectedIds.size > 0 && (
              <View style={styles.batchBar}>
                {batchRunning ? (
                  <>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={styles.batchBarText}>
                      Downloading {batchProgress.current}/{batchProgress.total}...
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.batchBarText}>{selectedIds.size} selected</Text>
                    <TouchableOpacity onPress={openBatchQualitySheet} style={styles.batchButton}>
                      <Text style={styles.batchButtonText}>Download Selected</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

            {ytResults.map(renderYoutubeRow)}
          </View>
        )}

        {categoryEntries.map(([cat, items]) => (
          <View key={cat} style={{ marginTop: 20 }}>
            <Text style={styles.sectionTitle}>{categoryLabel(cat)}</Text>
            {items.map(renderRow)}
          </View>
        ))}
      </ScrollView>

      {/* ---------- Quality/format picker sheet ---------- */}
      <Modal visible={sheetVisible} transparent animationType="fade" onRequestClose={closeQualitySheet}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeQualitySheet}>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        </Pressable>
        <View style={styles.sheetCenterWrap} pointerEvents="box-none">
          <View style={styles.sheetCard}>
            {sheetItem && (
              <>
                <Text numberOfLines={2} style={styles.sheetTitle}>{sheetItem.title}</Text>
                <Text style={styles.sheetSubtitle}>Choose a format and quality</Text>

                {QUALITY_OPTIONS.map((option) => {
                  const resolving = resolvingIds.has(`${sheetItem.id}-${option.key}`);
                  const optionKey = `youtube-${sheetItem.id}-${option.key}`;
                  const optionDownloaded = downloadedIds.has(optionKey);
                  return (
                    <View key={option.key} style={styles.sheetOptionRow}>
                      <Text style={styles.sheetOptionLabel}>{option.label}</Text>
                      {resolving ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <View style={styles.sheetOptionActions}>
                          <TouchableOpacity onPress={() => handleSheetPlay(option)} style={styles.sheetActionButton}>
                            <Text style={styles.sheetActionText}>Play</Text>
                          </TouchableOpacity>
                          {!optionDownloaded && (
                            <TouchableOpacity onPress={() => handleSheetDownload(option)} style={styles.sheetActionButton}>
                              <Text style={styles.sheetActionText}>Save</Text>
                            </TouchableOpacity>
                          )}
                          {optionDownloaded && <Text style={styles.downloadedGlyph}>Saved</Text>}
                        </View>
                      )}
                    </View>
                  );
                })}
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ---------- Batch download quality/format picker ---------- */}
      <Modal visible={batchSheetOpen} transparent animationType="fade" onRequestClose={closeBatchQualitySheet}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeBatchQualitySheet}>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        </Pressable>
        <View style={styles.sheetCenterWrap} pointerEvents="box-none">
          <View style={styles.sheetCard}>
            <Text style={styles.sheetTitle}>{selectedIds.size} songs selected</Text>
            <Text style={styles.sheetSubtitle}>Choose a format and quality for all of them</Text>

            {QUALITY_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={styles.sheetOptionRow}
                onPress={() => handleBatchDownload(option)}
              >
                <Text style={styles.sheetOptionLabel}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
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
  rowBody: { flex: 1, flexDirection: "row", alignItems: "center" },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: GLASS_BORDER,
    marginRight: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: { backgroundColor: ACCENT, borderColor: ACCENT },
  checkboxMark: { color: "#fff", fontSize: 13, fontWeight: "700" },

  batchBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
    gap: 8,
  },
  batchBarText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  batchButton: { backgroundColor: ACCENT, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 },
  batchButtonText: { color: "#fff", fontWeight: "700", fontSize: 12 },
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

  sheetCenterWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  sheetCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    borderRadius: 22,
    padding: 20,
  },
  sheetTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  sheetSubtitle: { color: "rgba(255,255,255,0.65)", fontSize: 12, marginTop: 4, marginBottom: 16 },
  sheetOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  sheetOptionLabel: { color: "#fff", fontSize: 13, fontWeight: "600", flex: 1, marginRight: 10 },
  sheetOptionActions: { flexDirection: "row", gap: 8 },
  sheetActionButton: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sheetActionText: { color: "#fff", fontSize: 12, fontWeight: "700" },
});

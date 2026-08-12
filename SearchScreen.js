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
import { BlurView } from "expo-blur";
import * as FileSystem from "expo-file-system/legacy";
import { getDownloads, saveDownloads } from "./libraryStorage";
import { useDownloads } from "./DownloadsContext";

import { authedHeaders } from "./apiClient";
import { buildLibraryFilename } from "./libraryFileNaming";
import { saveDownloadToSharedStorage } from "./mediaLibrarySave";

const API_BASE = "https://gateway-cah4.onrender.com";
const JET_BLACK = "#1D1D1D";
const ORCHID = "#E5BDDF";
const GLASS_BG = "rgba(229,189,223,0.06)";
const GLASS_BORDER = "rgba(229,189,223,0.15)";
const GLASS_BG_FOCUS = "rgba(229,189,223,0.1)";
const TEXT_PRIMARY = "#FFFFFF";
const TEXT_SECONDARY = "rgba(255,255,255,0.6)";
const ACCENT = ORCHID; // primary call-to-action color throughout
const ACCENT_ON = JET_BLACK; // text/icon color when sitting on an ACCENT fill

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
      const localUri = FileSystem.documentDirectory + buildLibraryFilename(track.title, track.artist, key, "mp3");

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
      await saveDownloadToSharedStorage(localUri);

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
      const localUri = FileSystem.documentDirectory + buildLibraryFilename(streamInfo.title || ytItem.title, ytItem.uploader, key, streamInfo.ext || option.ext);

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
      await saveDownloadToSharedStorage(localUri);

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
        const localUri = FileSystem.documentDirectory + buildLibraryFilename(streamInfo.title || ytItem.title, ytItem.uploader, key, streamInfo.ext || option.ext);
        const downloadResumable = FileSystem.createDownloadResumable(streamInfo.stream_url, localUri, {});
        await downloadResumable.downloadAsync();
        await saveDownloadToSharedStorage(localUri);

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
      <View key={`youtube-${ytItem.id}`} style={styles.glassCard}>
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
              <Text style={styles.providerBadge}>YOUTUBE</Text>
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
        style={styles.glassCard}
        onPress={() => onTrackPress && onTrackPress(track)}
      >
        <Image source={track.artwork ? { uri: track.artwork } : undefined} style={styles.rowArt} />
        <View style={styles.rowTextWrap}>
          <Text numberOfLines={1} style={styles.rowTitle}>{track.title}</Text>
          <View style={styles.rowMetaRow}>
            <Text numberOfLines={1} style={styles.rowArtist}>{track.artist}</Text>
            <Text style={styles.providerBadge}>{(track.provider || "").toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.rowDuration}>{formatDuration(track.duration)}</Text>

        {track.downloadable && (
          isDownloading ? (
            <View style={styles.downloadWrap}>
              <ActivityIndicator color={ORCHID} size="small" />
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
      <View pointerEvents="none" style={[styles.orb, styles.orb1]} />
      <View pointerEvents="none" style={[styles.orb, styles.orb2]} />
      <View pointerEvents="none" style={[styles.orb, styles.orb3]} />
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

        {loading && <ActivityIndicator color={ORCHID} style={{ marginTop: 24 }} />}

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
                    <ActivityIndicator color={ORCHID} size="small" />
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
                        <ActivityIndicator color={ORCHID} size="small" />
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
  root: { flex: 1, backgroundColor: JET_BLACK },
  content: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 150 },

  orb: { position: "absolute", borderRadius: 999, backgroundColor: ORCHID },
  orb1: { top: -60, left: -60, width: 250, height: 250, opacity: 0.1 },
  orb2: { bottom: 120, right: -70, width: 300, height: 300, opacity: 0.07 },
  orb3: { top: 380, left: 40, width: 200, height: 200, opacity: 0.05 },

  title: { color: TEXT_PRIMARY, fontSize: 28, fontWeight: "700", letterSpacing: -0.5, marginBottom: 20 },

  inputRow: { flexDirection: "row", gap: 10 },
  input: {
    flex: 1,
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: TEXT_PRIMARY,
    fontSize: 15,
  },
  searchButton: { backgroundColor: ACCENT, borderRadius: 20, paddingHorizontal: 20, justifyContent: "center" },
  searchButtonText: { color: ACCENT_ON, fontWeight: "700", fontSize: 14 },

  hint: { color: TEXT_SECONDARY, fontSize: 13, marginTop: 24, textAlign: "center" },
  emptyText: { color: TEXT_SECONDARY, fontSize: 13, marginTop: 24, textAlign: "center" },
  errorText: {
    color: TEXT_PRIMARY,
    backgroundColor: "rgba(200,50,50,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,100,100,0.3)",
    padding: 12,
    borderRadius: 14,
    marginTop: 16,
  },

  sectionTitle: {
    color: ORCHID,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },

  glassCard: {
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 20,
    padding: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
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
  checkboxMark: { color: ACCENT_ON, fontSize: 13, fontWeight: "700" },

  batchBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
    gap: 8,
  },
  batchBarText: { color: TEXT_PRIMARY, fontSize: 13, fontWeight: "600" },
  batchButton: { backgroundColor: ACCENT, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 },
  batchButtonText: { color: ACCENT_ON, fontWeight: "700", fontSize: 12 },

  rowArt: { width: 56, height: 56, borderRadius: 12, backgroundColor: GLASS_BG, marginRight: 14 },
  rowTextWrap: { flex: 1, marginRight: 8 },
  rowTitle: { color: TEXT_PRIMARY, fontWeight: "600", fontSize: 15, marginBottom: 4 },
  rowMetaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowArtist: { color: TEXT_SECONDARY, fontSize: 13, flexShrink: 1 },
  providerBadge: {
    color: ORCHID,
    fontSize: 10,
    fontWeight: "700",
    backgroundColor: "rgba(229,189,223,0.15)",
    borderWidth: 1,
    borderColor: "rgba(229,189,223,0.2)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  rowDuration: { color: TEXT_SECONDARY, fontSize: 12, marginRight: 8 },

  downloadWrap: { flexDirection: "row", alignItems: "center", gap: 4 },
  downloadPct: { color: TEXT_PRIMARY, fontSize: 10 },
  downloadTouch: {
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  downloadGlyph: { color: ACCENT_ON, fontSize: 10, fontWeight: "700" },
  downloadedGlyph: { color: "#8CE0A0", fontSize: 11, fontWeight: "700" },

  sheetCenterWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  sheetCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "rgba(29,29,29,0.9)",
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 22,
    padding: 20,
  },
  sheetTitle: { color: TEXT_PRIMARY, fontSize: 16, fontWeight: "700" },
  sheetSubtitle: { color: TEXT_SECONDARY, fontSize: 12, marginTop: 4, marginBottom: 16 },
  sheetOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: GLASS_BORDER,
  },
  sheetOptionLabel: { color: TEXT_PRIMARY, fontSize: 13, fontWeight: "600", flex: 1, marginRight: 10 },
  sheetOptionActions: { flexDirection: "row", gap: 8 },
  sheetActionButton: {
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    backgroundColor: GLASS_BG_FOCUS,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sheetActionText: { color: ORCHID, fontSize: 12, fontWeight: "700" },
});

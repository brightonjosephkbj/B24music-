import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ScrollView,
  Modal,
  Pressable,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import * as FileSystem from "expo-file-system/legacy";
import { buildLibraryFilename } from "./libraryFileNaming";
import { saveDownloadToSharedStorage } from "./mediaLibrarySave";
import {
  resolveUrl,
  backendDownloadUrl,
  lightningExtract,
  isSpotifyPlaylistUrl,
  fetchSpotifyPlaylist,
  searchYoutubeMatch,
} from "./urlFetchClient";
import { getDownloads, saveDownloads, createPlaylist, addTrackToPlaylist, getPlaylists, updatePlaylist } from "./libraryStorage";
import { useDownloads } from "./DownloadsContext";

const GRADIENT_COLORS = ["#FF6B6B", "#FFA751", "#4ECDC4"];
const GLASS_BG = "rgba(255,255,255,0.14)";
const GLASS_BORDER = "rgba(255,255,255,0.25)";
const ACCENT = "#FF6B6B";

const SPOTIFY_QUALITY_OPTIONS = [
  { key: "audio_high", quality: "high", ext: "mp3", label: "High Quality (MP3)" },
  { key: "audio_medium", quality: "medium", ext: "mp3", label: "Medium Quality (MP3)" },
];
const SPOTIFY_SHEET_THRESHOLD = 5;
const SPOTIFY_DEFAULT_OPTION = SPOTIFY_QUALITY_OPTIONS[1];

function safeFilename(title, ext) {
  const clean = (title || "download").replace(/[^A-Za-z0-9 _-]/g, "").trim() || "download";
  return `${clean}.${ext}`;
}

function formatDuration(sec) {
  if (!sec && sec !== 0) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function PasteUrlScreen({ onTrackPress, onBack }) {
  const { startDownload, updateProgress, finishDownload, registerControls, isCancelled } = useDownloads();

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [result, setResult] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadedEntry, setDownloadedEntry] = useState(null);

  const [spotifyPlaylist, setSpotifyPlaylist] = useState(null);
  const [spotifyPlaylistId, setSpotifyPlaylistId] = useState(null);
  const [spotifyBatchRunning, setSpotifyBatchRunning] = useState(false);
  const [spotifyBatchProgress, setSpotifyBatchProgress] = useState({ current: 0, total: 0 });
  const [spotifyQualitySheetOpen, setSpotifyQualitySheetOpen] = useState(false);

  const onFetch = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setDownloadedEntry(null);
    setSpotifyPlaylist(null);
    setSpotifyPlaylistId(null);

    if (isSpotifyPlaylistUrl(trimmed)) {
      try {
        const data = await fetchSpotifyPlaylist(trimmed);

        // Same Spotify playlist pasted again? Reuse the existing playlist
        // instead of creating a duplicate, and pre-mark whichever tracks
        // are already downloaded so the batch only fetches what's missing.
        const existingLists = await getPlaylists();
        const existing = data.playlist_id
          ? existingLists.find((p) => p.spotifySourceId === data.playlist_id)
          : null;

        let alreadyDownloadedIds = new Set();
        if (existing) {
          setSpotifyPlaylistId(existing.id);
          const allDownloads = await getDownloads();
          const existingTrackIds = new Set(existing.trackIds || []);
          allDownloads.forEach((d) => {
            if (d.spotifyId && existingTrackIds.has(d.id)) alreadyDownloadedIds.add(d.spotifyId);
          });
        }

        setSpotifyPlaylist({
          title: data.playlist_title || "Playlist",
          art: data.playlist_art || null,
          sourceId: data.playlist_id || null,
          tracks: (data.tracks || []).map((t, i) => ({
            ...t,
            _key: i,
            selected: false,
            downloaded: !!(t.spotify_id && alreadyDownloadedIds.has(t.spotify_id)),
          })),
        });
      } catch (err) {
        setError(err.message || "Couldn't read that playlist");
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const resolved = await resolveUrl(trimmed);
      setResult(resolved);
    } catch (err) {
      setError(err.message || "Couldn't read that link");
    } finally {
      setLoading(false);
    }
  };

  const onDownload = async (mode = "video") => {
    if (!result) return;
    setDownloading(true);
    setDownloadProgress(0);
    const dlKey = `pasteurl_${result.provider}_${Date.now()}`;
    startDownload(dlKey, { title: result.title });
    try {
      let remoteUrl;
      if (mode === "video" && result.method === "scrape") {
        remoteUrl = result.downloadUrl;
      } else if (result.method === "ytdlp") {
        const lightningResult = await lightningExtract(result.sourceUrl, mode, "medium");
        remoteUrl = lightningResult.stream_url;
      } else {
        const backendSourceUrl = result.method === "scrape" ? result.downloadUrl : result.sourceUrl;
        remoteUrl = backendDownloadUrl(backendSourceUrl, mode);
      }

      const ext = mode === "audio" ? "mp3" : "mp4";
      const localUri = FileSystem.documentDirectory + buildLibraryFilename(result.title, result.artist, dlKey, ext);

      const downloadResumable = FileSystem.createDownloadResumable(
        remoteUrl,
        localUri,
        {},
        (progressEvent) => {
          const pct =
            progressEvent.totalBytesExpectedToWrite > 0
              ? progressEvent.totalBytesWritten / progressEvent.totalBytesExpectedToWrite
              : 0;
          setDownloadProgress(pct);
          updateProgress(dlKey, pct);
        }
      );
      await downloadResumable.downloadAsync();

        await saveDownloadToSharedStorage(localUri);

      const entry = {
        id: `${result.provider}_${Date.now()}`,
        type: result.method === "scrape" ? "video" : mode,
        title: result.title,
        artist: result.artist,
        artwork: result.artwork,
        localUri,
        duration: result.duration || 0,
        source: result.method,
        addedAt: Date.now(),
      };

      const existing = await getDownloads();
      await saveDownloads([...existing, entry]);
      setDownloadedEntry(entry);
    } catch (err) {
      setError(err.message || "Download failed");
    } finally {
      setDownloading(false);
      finishDownload(dlKey);
    }
  };

  const canPlay = !!(result && (result.method === "scrape" || downloadedEntry));
  const playTarget = result?.method === "scrape" ? result : downloadedEntry;

  const toggleSpotifyTrack = (key) => {
    setSpotifyPlaylist((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tracks: prev.tracks.map((t) => (t._key === key ? { ...t, selected: !t.selected } : t)),
      };
    });
  };

  const selectedSpotifyTracks = spotifyPlaylist ? spotifyPlaylist.tracks.filter((t) => t.selected && !t.downloaded) : [];

  const onSpotifyDownloadPress = () => {
    if (selectedSpotifyTracks.length === 0) return;
    if (selectedSpotifyTracks.length <= SPOTIFY_SHEET_THRESHOLD) {
      setSpotifyQualitySheetOpen(true);
    } else {
      runSpotifyBatch(SPOTIFY_DEFAULT_OPTION);
    }
  };

  const runSpotifyBatch = async (option) => {
    setSpotifyQualitySheetOpen(false);
    const tracksToRun = spotifyPlaylist.tracks.filter((t) => t.selected && !t.downloaded);
    if (tracksToRun.length === 0) return;

    setSpotifyBatchRunning(true);
    setSpotifyBatchProgress({ current: 0, total: tracksToRun.length });

    let playlistId = spotifyPlaylistId;
    if (!playlistId) {
      const playlist = await createPlaylist(spotifyPlaylist.title, spotifyPlaylist.art);
      playlistId = playlist.id;
      if (spotifyPlaylist.sourceId) {
        await updatePlaylist(playlistId, { spotifySourceId: spotifyPlaylist.sourceId });
      }
      setSpotifyPlaylistId(playlistId);
    }

    for (let i = 0; i < tracksToRun.length; i++) {
      const track = tracksToRun[i];
      setSpotifyBatchProgress({ current: i + 1, total: tracksToRun.length });

      const dlKey = `spotify_${playlistId}_${track._key}`;
      startDownload(dlKey, { title: `${track.artist} - ${track.title}` });

      try {
        const match = await searchYoutubeMatch(`${track.artist} ${track.title}`);
        if (!match) {
          console.warn(`No YouTube match found for "${track.title}" by ${track.artist}`);
          continue;
        }

        const streamInfo = await lightningExtract(match.url, "audio", option.quality);
        if (isCancelled(dlKey)) continue;

        const localUri = FileSystem.documentDirectory + buildLibraryFilename(track.title, track.artist, dlKey, streamInfo.ext || option.ext);

        const downloadResumable = FileSystem.createDownloadResumable(
          streamInfo.stream_url,
          localUri,
          {},
          (progressEvent) => {
            const pct =
              progressEvent.totalBytesExpectedToWrite > 0
                ? progressEvent.totalBytesWritten / progressEvent.totalBytesExpectedToWrite
                : 0;
            updateProgress(dlKey, pct);
          }
        );
        registerControls(dlKey, {
          pause: () => downloadResumable.pauseAsync().catch(() => {}),
          resume: () => downloadResumable.resumeAsync().catch(() => {}),
          cancel: () => downloadResumable.pauseAsync().catch(() => {}),
        });

        await downloadResumable.downloadAsync();
        if (isCancelled(dlKey)) continue;
        await saveDownloadToSharedStorage(localUri);

        const entryId = dlKey;
        const entry = {
          id: entryId,
          type: "audio",
          title: track.title,
          artist: track.artist,
          artwork: track.album_art || spotifyPlaylist.art,
          localUri,
          duration: Math.round((track.duration_ms || 0) / 1000),
          source: "spotify",
          spotifyId: track.spotify_id || null,
          addedAt: Date.now(),
        };

        const existing = await getDownloads();
        await saveDownloads([...existing, entry]);
        await addTrackToPlaylist(playlistId, entryId);

        setSpotifyPlaylist((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            tracks: prev.tracks.map((t) => (t._key === track._key ? { ...t, downloaded: true, selected: false } : t)),
          };
        });
      } catch (err) {
        console.warn(`Spotify track download failed for "${track.title}":`, err);
      } finally {
        finishDownload(dlKey);
      }
    }

    setSpotifyBatchRunning(false);
  };

  const spotifyAllSelected = spotifyPlaylist ? spotifyPlaylist.tracks.every((t) => t.downloaded || t.selected) : false;
  const toggleSelectAllSpotify = () => {
    setSpotifyPlaylist((prev) => {
      if (!prev) return prev;
      const nextSelected = !spotifyAllSelected;
      return {
        ...prev,
        tracks: prev.tracks.map((t) => (t.downloaded ? t : { ...t, selected: nextSelected })),
      };
    });
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={GRADIENT_COLORS} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Paste a link</Text>
          <View style={{ width: 60 }} />
        </View>
        <Text style={styles.subtitle}>
          We try to grab the video straight from the page first - no server involved.
          If the site hides it, we fall back to a backend fetch. Spotify playlist links
          import the full track list so you can pick which songs to download.
        </Text>

        <View style={styles.inputRow}>
          <View style={styles.inputWrap}>
            <TextInput
              value={url}
              onChangeText={setUrl}
              placeholder="https://..."
              placeholderTextColor="rgba(255,255,255,0.5)"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            {!!url && (
              <TouchableOpacity
                onPress={() => setUrl("")}
                style={styles.clearButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.clearButtonText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={onFetch} style={styles.fetchButton}>
            <Text style={styles.fetchButtonText}>Go</Text>
          </TouchableOpacity>
        </View>

        {loading && <ActivityIndicator color="#fff" style={{ marginTop: 20 }} />}

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        {spotifyPlaylist && (
          <View style={styles.spotifyCard}>
            <View style={styles.spotifyHeaderRow}>
              <Image source={spotifyPlaylist.art ? { uri: spotifyPlaylist.art } : undefined} style={styles.spotifyArt} />
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text numberOfLines={2} style={styles.spotifyTitle}>{spotifyPlaylist.title}</Text>
                <Text style={styles.spotifySubtitle}>{spotifyPlaylist.tracks.length} tracks</Text>
              </View>
            </View>

            <TouchableOpacity onPress={toggleSelectAllSpotify} style={styles.selectAllRow}>
              <Text style={styles.selectAllText}>{spotifyAllSelected ? "Deselect All" : "Select All"}</Text>
            </TouchableOpacity>

            {spotifyPlaylist.tracks.map((t) => (
              <View key={t._key} style={styles.spotifyTrackRow}>
                <TouchableOpacity
                  onPress={() => !t.downloaded && toggleSpotifyTrack(t._key)}
                  disabled={t.downloaded}
                  style={[styles.checkbox, t.selected && styles.checkboxChecked, t.downloaded && styles.checkboxDone]}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  {t.downloaded ? (
                    <Text style={styles.checkboxMark}>✓</Text>
                  ) : t.selected ? (
                    <Text style={styles.checkboxMark}>✓</Text>
                  ) : null}
                </TouchableOpacity>
                <Image source={t.album_art ? { uri: t.album_art } : undefined} style={styles.spotifyTrackArt} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text numberOfLines={1} style={styles.spotifyTrackTitle}>{t.title}</Text>
                  <Text numberOfLines={1} style={styles.spotifyTrackArtist}>{t.artist}</Text>
                </View>
                <Text style={styles.spotifyTrackDuration}>{formatDuration(Math.round((t.duration_ms || 0) / 1000))}</Text>
              </View>
            ))}
          </View>
        )}

        {result && (
          <View style={styles.resultCard}>
            <Image source={result.artwork ? { uri: result.artwork } : undefined} style={styles.thumb} />
            <Text style={styles.resultTitle} numberOfLines={2}>{result.title}</Text>
            <Text style={styles.resultMeta}>{result.artist}</Text>
            <Text style={styles.methodBadge}>
              {result.method === "scrape" ? "Grabbed directly from the page" : "Resolved via yt-dlp"}
            </Text>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.playButton, !canPlay && styles.playButtonDisabled]}
                onPress={() => canPlay && onTrackPress && onTrackPress(playTarget)}
                disabled={!canPlay}
              >
                <Text style={styles.playButtonText}>
                  {canPlay ? "Play" : "Download first to play"}
                </Text>
              </TouchableOpacity>

              {!downloading && !downloadedEntry && (
                <>
                  <TouchableOpacity style={styles.downloadButton} onPress={() => onDownload("video")}>
                    <Text style={styles.downloadButtonText}>Download video</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.downloadButton} onPress={() => onDownload("audio")}>
                    <Text style={styles.downloadButtonText}>Download audio</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {downloading && (
              <View style={styles.progressWrap}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${downloadProgress * 100}%` }]} />
                </View>
                <Text style={styles.progressText}>{Math.round(downloadProgress * 100)}%</Text>
              </View>
            )}

            {downloadedEntry && <Text style={styles.doneText}>Saved to your Library</Text>}
          </View>
        )}
      </ScrollView>

      {spotifyPlaylist && (selectedSpotifyTracks.length > 0 || spotifyBatchRunning) && (
        <View style={styles.spotifyBatchBar}>
          {spotifyBatchRunning ? (
            <>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.spotifyBatchBarText}>
                Downloading {spotifyBatchProgress.current}/{spotifyBatchProgress.total}...
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.spotifyBatchBarText}>{selectedSpotifyTracks.length} selected</Text>
              <TouchableOpacity onPress={onSpotifyDownloadPress} style={styles.spotifyBatchButton}>
                <Text style={styles.spotifyBatchButtonText}>Download Selected</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      <Modal visible={spotifyQualitySheetOpen} transparent animationType="fade" onRequestClose={() => setSpotifyQualitySheetOpen(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setSpotifyQualitySheetOpen(false)}>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        </Pressable>
        <View style={styles.sheetCenterWrap} pointerEvents="box-none">
          <View style={styles.sheetCard}>
            <Text style={styles.sheetTitle}>{selectedSpotifyTracks.length} songs selected</Text>
            <Text style={styles.sheetSubtitle}>Choose a quality for all of them</Text>
            {SPOTIFY_QUALITY_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={styles.sheetOptionRow}
                onPress={() => runSpotifyBatch(option)}
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
  content: { paddingTop: 70, paddingHorizontal: 20, paddingBottom: 140 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  backButton: { width: 60 },
  backText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  title: { color: "#fff", fontSize: 20, fontWeight: "700", textAlign: "center", flex: 1 },
  subtitle: { color: "rgba(255,255,255,0.75)", fontSize: 13, marginBottom: 20, lineHeight: 18 },

  inputRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  inputWrap: { flex: 1, position: "relative", justifyContent: "center" },
  input: {
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingRight: 36,
    paddingVertical: 12,
    color: "#fff",
  },
  clearButton: {
    position: "absolute",
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  clearButtonText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  fetchButton: { backgroundColor: ACCENT, borderRadius: 14, paddingHorizontal: 20, justifyContent: "center" },
  fetchButtonText: { color: "#fff", fontWeight: "700" },

  errorText: {
    color: "#fff",
    backgroundColor: "rgba(200,50,50,0.4)",
    padding: 12,
    borderRadius: 10,
    marginTop: 16,
  },

  resultCard: {
    marginTop: 24,
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 18,
    padding: 16,
    alignItems: "center",
  },
  thumb: { width: 160, height: 160, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.1)", marginBottom: 14 },
  resultTitle: { color: "#fff", fontSize: 16, fontWeight: "700", textAlign: "center" },
  resultMeta: { color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 4 },
  methodBadge: { color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 8, marginBottom: 16 },

  actionRow: { flexDirection: "row", gap: 10, flexWrap: "wrap", justifyContent: "center" },
  playButton: { backgroundColor: ACCENT, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 },
  playButtonDisabled: { backgroundColor: "rgba(255,255,255,0.2)" },
  playButtonText: { color: "#fff", fontWeight: "700" },
  downloadButton: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
  },
  downloadButtonText: { color: "#fff", fontWeight: "600" },

  progressWrap: { width: "100%", marginTop: 16 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.2)" },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: ACCENT },
  progressText: { color: "#fff", fontSize: 11, marginTop: 6, textAlign: "center" },

  doneText: { color: "#6BCB77", fontWeight: "700", marginTop: 16 },

  spotifyCard: {
    marginTop: 24,
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 18,
    padding: 16,
  },
  spotifyHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  spotifyArt: { width: 72, height: 72, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.1)" },
  spotifyTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  spotifySubtitle: { color: "rgba(255,255,255,0.65)", fontSize: 12, marginTop: 4 },

  selectAllRow: { alignSelf: "flex-start", marginBottom: 10 },
  selectAllText: { color: ACCENT, fontSize: 13, fontWeight: "700" },

  spotifyTrackRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
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
  checkboxDone: { backgroundColor: "#6BCB77", borderColor: "#6BCB77" },
  checkboxMark: { color: "#fff", fontSize: 13, fontWeight: "700" },
  spotifyTrackArt: { width: 40, height: 40, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.1)" },
  spotifyTrackTitle: { color: "#fff", fontWeight: "600", fontSize: 13 },
  spotifyTrackArtist: { color: "rgba(255,255,255,0.65)", fontSize: 11, marginTop: 2 },
  spotifyTrackDuration: { color: "rgba(255,255,255,0.5)", fontSize: 11, marginLeft: 8 },

  spotifyBatchBar: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 100,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(20,20,25,0.95)",
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  spotifyBatchBarText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  spotifyBatchButton: { backgroundColor: ACCENT, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 },
  spotifyBatchButtonText: { color: "#fff", fontWeight: "700", fontSize: 12 },

  sheetCenterWrap: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
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
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  sheetOptionLabel: { color: "#fff", fontSize: 14, fontWeight: "600" },
});

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
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { resolveUrl, backendDownloadUrl } from "./urlFetchClient";
import { getDownloads, saveDownloads } from "./libraryStorage";

const GRADIENT_COLORS = ["#FF6B6B", "#FFA751", "#4ECDC4"];
const GLASS_BG = "rgba(255,255,255,0.14)";
const GLASS_BORDER = "rgba(255,255,255,0.25)";
const ACCENT = "#FF6B6B";

function safeFilename(title, ext) {
  const clean = (title || "download").replace(/[^A-Za-z0-9 _-]/g, "").trim() || "download";
  return `${clean}.${ext}`;
}

// onTrackPress(track) - plays whatever was resolved, using the exact same
// track shape (title/artist/artwork/type + stream_url or localUri) every
// other screen already passes into usePlaybackEngine.
export default function PasteUrlScreen({ onTrackPress, onBack }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // resolved track-shaped object
  const [error, setError] = useState(null);

  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadedEntry, setDownloadedEntry] = useState(null);

  const onFetch = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setDownloadedEntry(null);
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
    try {
      // Where the bytes actually come from depends on how this link was
      // resolved:
      //  - "scrape": we already found a direct file URL on the phone -
      //    download straight from it, no backend involved at all.
      //  - "ytdlp": we only have metadata so far - the real file only gets
      //    produced by the backend's yt-dlp endpoint, which also handles
      //    audio-vs-video and the ffmpeg conversion.
      // Video from a "scrape" result is already a direct file URL - download
      // it straight from the source, no backend involved. Audio always needs
      // ffmpeg extraction though, so it goes through the backend either way;
      // for a scraped result we hand the backend the raw media URL we already
      // found (result.downloadUrl) instead of the original page, so it can
      // convert it directly without re-scraping anything itself.
      let remoteUrl;
      if (mode === "video" && result.method === "scrape") {
        remoteUrl = result.downloadUrl;
      } else {
        const backendSourceUrl = result.method === "scrape" ? result.downloadUrl : result.sourceUrl;
        remoteUrl = backendDownloadUrl(backendSourceUrl, mode);
      }

      const ext = mode === "audio" ? "mp3" : "mp4";
      const localUri = FileSystem.documentDirectory + safeFilename(result.title, ext);

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
        }
      );

      await downloadResumable.downloadAsync();

      try {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === "granted") {
          await MediaLibrary.saveToLibraryAsync(localUri);
        }
      } catch (mediaErr) {
        // Non-fatal: the file still downloaded and plays fine from the
        // app's own storage even if it couldn't be mirrored into the
        // public MediaLibrary.
        console.warn("Couldn't save to public MediaLibrary:", mediaErr);
      }

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
    }
  };

  // Playable immediately if we scraped a direct stream URL; otherwise only
  // playable once the yt-dlp download has actually finished.
  const canPlay = !!(result && (result.method === "scrape" || downloadedEntry));
  const playTarget = result?.method === "scrape" ? result : downloadedEntry;

  return (
    <View style={styles.root}>
      <LinearGradient colors={GRADIENT_COLORS} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Paste a link</Text>
          <View style={{ width: 60 }} />
        </View>
        <Text style={styles.subtitle}>
          We try to grab the video straight from the page first - no server involved.
          If the site hides it, we fall back to a backend fetch.
        </Text>

        <View style={styles.inputRow}>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://..."
            placeholderTextColor="rgba(255,255,255,0.5)"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <TouchableOpacity onPress={onFetch} style={styles.fetchButton}>
            <Text style={styles.fetchButtonText}>Go</Text>
          </TouchableOpacity>
        </View>

        {loading && <ActivityIndicator color="#fff" style={{ marginTop: 20 }} />}

        {!!error && <Text style={styles.errorText}>{error}</Text>}

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
});

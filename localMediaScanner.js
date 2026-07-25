import * as MediaLibrary from "expo-media-library";

// Scans the phone's actual storage for playable audio/video files and
// normalizes them into the same shape as an app "download" entry, so
// LibraryScreen can render them side by side without special-casing.
// Note: MediaLibrary only exposes filename/duration/uri - no ID3 tags -
// so title falls back to the filename and artist to "Unknown Artist".

function stripExtension(filename) {
  return filename.replace(/\.[^/.]+$/, "");
}

function toLibraryItem(asset, type) {
  return {
    id: `device_${asset.id}`,
    type, // "audio" | "video"
    title: stripExtension(asset.filename || "Untitled"),
    artist: "Unknown Artist",
    artwork: null,
    localUri: asset.uri,
    duration: asset.duration || 0,
    source: "device", // distinguishes scanned files from app-initiated downloads
    addedAt: asset.creationTime || Date.now(),
  };
}

// Call this from a "Scan device" button. Returns { granted, audio, video }.
// If permission is denied, granted is false and audio/video are empty -
// the caller should show a message rather than silently showing nothing.
export async function scanDeviceMedia() {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== "granted") {
    return { granted: false, audio: [], video: [] };
  }

  const [audioResult, videoResult] = await Promise.all([
    MediaLibrary.getAssetsAsync({ mediaType: MediaLibrary.MediaType.audio, first: 500 }),
    MediaLibrary.getAssetsAsync({ mediaType: MediaLibrary.MediaType.video, first: 500 }),
  ]);

  return {
    granted: true,
    audio: audioResult.assets.map((a) => toLibraryItem(a, "audio")),
    video: videoResult.assets.map((a) => toLibraryItem(a, "video")),
  };
}

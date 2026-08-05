import * as MediaLibrary from "expo-media-library/legacy";

// Scans the phone's actual storage for playable audio/video files and
// normalizes them into the same shape as an app "download" entry, so
// LibraryScreen can render them side by side without special-casing.
//
// Deliberately does NOT read ID3 tags or embedded artwork here - an
// earlier version used expo-music-info-2 to read title/artist/album per
// file, firing one native-bridge call per audio file via Promise.all.
// With a real library (hundreds of files) that meant hundreds of
// simultaneous bridge calls at once, which is what was causing the app to
// lag every time Library was opened. Title falls back to the filename and
// artist to "Unknown Artist" - fast and reliable for any library size.

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
  let status;
  try {
    const permResult = await MediaLibrary.requestPermissionsAsync();
    status = permResult.status;
    console.log("[scanDeviceMedia] permission status:", status, permResult);
  } catch (err) {
    console.error("[scanDeviceMedia] requestPermissionsAsync threw:", err);
    return { granted: false, audio: [], video: [], error: `Permission request failed: ${err.message}` };
  }

  if (status !== "granted") {
    return { granted: false, audio: [], video: [], error: `Permission not granted (status: ${status})` };
  }

  try {
    const [audioResult, videoResult] = await Promise.all([
      MediaLibrary.getAssetsAsync({ mediaType: MediaLibrary.MediaType.audio, first: 500 }),
      MediaLibrary.getAssetsAsync({ mediaType: MediaLibrary.MediaType.video, first: 500 }),
    ]);

    console.log(
      "[scanDeviceMedia] found",
      audioResult.assets.length,
      "audio and",
      videoResult.assets.length,
      "video assets on device"
    );

    return {
      granted: true,
      audio: audioResult.assets.map((a) => toLibraryItem(a, "audio")),
      video: videoResult.assets.map((a) => toLibraryItem(a, "video")),
      error: null,
    };
  } catch (err) {
    console.error("[scanDeviceMedia] getAssetsAsync threw:", err);
    return { granted: true, audio: [], video: [], error: `Scan failed: ${err.message}` };
  }
}

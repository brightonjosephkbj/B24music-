import * as MediaLibrary from "expo-media-library/legacy";
import MusicInfo from "expo-music-info-2";

// Scans the phone's actual storage for playable audio/video files and
// normalizes them into the same shape as an app "download" entry, so
// LibraryScreen can render them side by side without special-casing.
//
// Title/artist/album come from the file's real ID3 tags when present
// (via expo-music-info-2, pure JS, no native module) - falls back to the
// filename/"Unknown Artist" only when a file has no tags at all.
//
// Artwork is intentionally NOT extracted here - pulling embedded cover
// images out of every file during a scan would slow scanning down
// noticeably for a large library. Use getArtworkForTrack() below to fetch
// it lazily, only for the one track that's actually about to play.

function stripExtension(filename) {
  return filename.replace(/\.[^/.]+$/, "");
}

async function readTags(uri) {
  try {
    const info = await MusicInfo.getMusicInfoAsync(uri, {
      title: true,
      artist: true,
      album: true,
      picture: false, // deliberately skipped here - see getArtworkForTrack()
    });
    return info || {};
  } catch (err) {
    // Not every file has valid/parseable tags - that's normal, not an
    // error worth logging loudly for every untagged file in a library.
    return {};
  }
}

async function toLibraryItem(asset, type) {
  const tags = type === "audio" ? await readTags(asset.uri) : {};

  return {
    id: `device_${asset.id}`,
    type, // "audio" | "video"
    title: tags.title || stripExtension(asset.filename || "Untitled"),
    artist: tags.artist || "Unknown Artist",
    album: tags.album || null,
    artwork: null, // fetched on demand - see getArtworkForTrack()
    localUri: asset.uri,
    duration: asset.duration || 0,
    source: "device", // distinguishes scanned files from app-initiated downloads
    addedAt: asset.creationTime || Date.now(),
  };
}

// Call this once a track is actually about to play (or becomes visible in
// a list) to pull its embedded cover art on demand. Returns a base64 data
// URI ready to drop straight into <Image source={{ uri }} />, or null if
// the file has no embedded artwork.
export async function getArtworkForTrack(localUri) {
  try {
    const info = await MusicInfo.getMusicInfoAsync(localUri, {
      title: false,
      artist: false,
      album: false,
      picture: true,
    });
    return info?.picture?.pictureData || null;
  } catch (err) {
    return null;
  }
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

    const [audio, video] = await Promise.all([
      Promise.all(audioResult.assets.map((a) => toLibraryItem(a, "audio"))),
      Promise.all(videoResult.assets.map((a) => toLibraryItem(a, "video"))),
    ]);

    return { granted: true, audio, video, error: null };
  } catch (err) {
    console.error("[scanDeviceMedia] getAssetsAsync threw:", err);
    return { granted: true, audio: [], video: [], error: `Scan failed: ${err.message}` };
  }
}

import * as MediaLibrary from "expo-media-library/legacy";
import { parseLibraryFilename } from "./libraryFileNaming";

// Scans the WHOLE device for audio/video, not just the app's own "B24
// Music" album. Previously scoped to just that album to avoid picking up
// WhatsApp voice notes, screen recordings, etc as "Unknown Artist" - that
// filtering is gone now, so expect that noise back if it's present on a
// given device. Title/artist come from the filename itself where B24's own
// naming convention was used (see libraryFileNaming.js); anything else
// just falls back to whatever parseLibraryFilename does with an arbitrary
// filename.

function toLibraryItem(asset, type) {
  const { title, artist } = parseLibraryFilename(asset.filename);
  return {
    id: `device_${asset.id}`,
    type, // "audio" | "video"
    title,
    artist,
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
      MediaLibrary.getAssetsAsync({ mediaType: MediaLibrary.MediaType.audio, first: 2000 }),
      MediaLibrary.getAssetsAsync({ mediaType: MediaLibrary.MediaType.video, first: 2000 }),
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

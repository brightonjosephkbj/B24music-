import * as MediaLibrary from "expo-media-library/legacy";
import { parseLibraryFilename, B24_ALBUM_NAME } from "./libraryFileNaming";

// Scans only the app's own "B24 Music" album (not the whole device - that
// used to pull in WhatsApp voice notes, random screen recordings, etc, all
// showing as "Unknown Artist"). Title/artist come from the filename itself
// (see libraryFileNaming.js), which survives an uninstall/reinstall since
// it's baked in at save time - no ID3 reads, no bridge-call lag.

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
    const album = await MediaLibrary.getAlbumAsync(B24_ALBUM_NAME);
    if (!album) {
      return { granted: true, audio: [], video: [], error: null };
    }

    const [audioResult, videoResult] = await Promise.all([
      MediaLibrary.getAssetsAsync({ album, mediaType: MediaLibrary.MediaType.audio, first: 500 }),
      MediaLibrary.getAssetsAsync({ album, mediaType: MediaLibrary.MediaType.video, first: 500 }),
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

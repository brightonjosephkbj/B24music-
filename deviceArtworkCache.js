import AsyncStorage from "@react-native-async-storage/async-storage";

// Keyed cache so a device-scanned file's ID3 art is only ever read once,
// not on every single playthrough. Cheap since it's just a base64 string
// per track, keyed by the stable device_<assetId> id.
const PREFIX = "b24music_artwork_";

export async function getCachedArtwork(trackId) {
  try {
    return await AsyncStorage.getItem(PREFIX + trackId);
  } catch {
    return null;
  }
}

export async function setCachedArtwork(trackId, uri) {
  try {
    await AsyncStorage.setItem(PREFIX + trackId, uri);
  } catch {
    // Non-critical - worst case it just re-reads ID3 next play.
  }
}

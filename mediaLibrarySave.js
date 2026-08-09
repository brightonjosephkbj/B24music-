import * as MediaLibrary from "expo-media-library";
import { B24_ALBUM_NAME } from "./libraryFileNaming";

// Copies a downloaded file into public/shared storage under the "B24 Music"
// album, so tracks show up in the Files app and other media apps, and
// survive an app reinstall (the on-disk filename encodes title/artist for
// that recovery scan - see libraryFileNaming.js and localMediaScanner.js).
// Failures here are swallowed - the app-private copy at localUri still
// works fine for in-app playback either way; this is purely for visibility
// outside the app.
export async function saveDownloadToSharedStorage(localUri) {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== "granted") return null;

    const asset = await MediaLibrary.createAssetAsync(localUri);

    const existingAlbum = await MediaLibrary.getAlbumAsync(B24_ALBUM_NAME);
    if (existingAlbum) {
      await MediaLibrary.addAssetsToAlbumAsync([asset], existingAlbum, false);
    } else {
      await MediaLibrary.createAlbumAsync(B24_ALBUM_NAME, asset, false);
    }

    return asset;
  } catch (err) {
    console.warn("Failed to save download to shared storage:", err);
    return null;
  }
}

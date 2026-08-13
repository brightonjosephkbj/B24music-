import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system";
import { B24_ALBUM_NAME } from "./libraryFileNaming";

// Moves a downloaded file into public/shared storage under the "B24 Music"
// album, so tracks show up in the Files app and other media apps, and
// survive an app reinstall (the on-disk filename encodes title/artist for
// that recovery scan - see libraryFileNaming.js and localMediaScanner.js).
//
// createAssetAsync only COPIES into MediaLibrary - it doesn't touch the
// original file - so once the copy succeeds we delete the app-private temp
// file ourselves. That leaves exactly one copy on disk, in shared storage,
// instead of silently doubling storage use with a copy nothing ever reads
// again. Callers MUST update their stored localUri to asset.uri on success -
// the original documentDirectory/cacheDirectory path will no longer exist.
//
// Failures here are swallowed and the temp file is left in place - the
// caller's existing localUri still works fine for in-app playback, it just
// won't be visible outside the app or survive a reinstall.
export async function saveDownloadToSharedStorage(localUri) {
  try {
    const permission = await MediaLibrary.requestPermissionsAsync();
    console.log("[mediaLibrarySave] permission result:", JSON.stringify(permission));
    if (permission.status !== "granted") {
      console.warn(`[mediaLibrarySave] not saving to shared storage - permission status was "${permission.status}", accessPrivileges: ${permission.accessPrivileges}`);
      return null;
    }

    const asset = await MediaLibrary.createAssetAsync(localUri);

    const existingAlbum = await MediaLibrary.getAlbumAsync(B24_ALBUM_NAME);
    if (existingAlbum) {
      await MediaLibrary.addAssetsToAlbumAsync([asset], existingAlbum, false);
    } else {
      await MediaLibrary.createAlbumAsync(B24_ALBUM_NAME, asset, false);
    }

    // Asset copy confirmed in shared storage - safe to drop the app-private
    // duplicate now. idempotent:true means a missing/already-gone file is
    // not an error.
    await FileSystem.deleteAsync(localUri, { idempotent: true });

    return asset;
  } catch (err) {
    console.warn("Failed to save download to shared storage:", err);
    return null;
  }
}

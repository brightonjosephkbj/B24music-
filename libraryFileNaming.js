// Metadata for library downloads is encoded directly in the filename saved
// to public storage via MediaLibrary. Our own downloads DB (libraryStorage.js,
// AsyncStorage) is wiped on uninstall - same as the file itself if it lived
// in the app-private sandbox. Baking title/artist into the filename means a
// reinstalled app can rebuild correct metadata just by re-scanning the
// "B24 Music" album - no ID3 reads, no lost database, no bridge-call lag
// (see localMediaScanner.js for why ID3 reading was already rejected once).

// Human-readable "Artist - Title.mp3" naming, so files look clean in the
// Files app / other music players, not just to our own scanner. The old
// "Title__Artist__id" scheme baked in a random id for guaranteed
// uniqueness; we drop that from the visible name now - Android's
// MediaStore auto-renames on a display-name collision (appends " (1)",
// " (2)", etc.) so uniqueness is still handled, just at the OS level
// instead of in the filename itself.
const LEGACY_DELIM = "__";
const DISPLAY_DELIM = " - ";

function sanitizePart(str) {
  return (
    (str || "")
      .replace(/[\/\\:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60) || "Unknown"
  );
}

export function buildLibraryFilename(title, artist, uniqueId, ext = "mp3") {
  const safeTitle = sanitizePart(title || "Untitled");
  const safeArtist = sanitizePart(artist || "Unknown Artist");
  return `${safeArtist}${DISPLAY_DELIM}${safeTitle}.${ext}`;
}

// Handles both the new "Artist - Title.ext" format and the old
// "Title__Artist__id.ext" format, so files downloaded before this change
// still parse correctly on a rescan instead of showing as "Unknown".
export function parseLibraryFilename(filename) {
  const base = (filename || "").replace(/\.[^/.]+$/, "");

  if (base.includes(LEGACY_DELIM)) {
    const parts = base.split(LEGACY_DELIM);
    if (parts.length >= 2) {
      return { title: parts[0] || "Untitled", artist: parts[1] || "Unknown Artist" };
    }
  }

  const sepIndex = base.indexOf(DISPLAY_DELIM);
  if (sepIndex !== -1) {
    return {
      artist: base.slice(0, sepIndex) || "Unknown Artist",
      title: base.slice(sepIndex + DISPLAY_DELIM.length) || "Untitled",
    };
  }

  return { title: base || "Untitled", artist: "Unknown Artist" };
}

export const B24_ALBUM_NAME = "B24 Music";

// Metadata for library downloads is encoded directly in the filename saved
// to public storage via MediaLibrary. Our own downloads DB (libraryStorage.js,
// AsyncStorage) is wiped on uninstall - same as the file itself if it lived
// in the app-private sandbox. Baking title/artist into the filename means a
// reinstalled app can rebuild correct metadata just by re-scanning the
// "B24 Music" album - no ID3 reads, no lost database, no bridge-call lag
// (see localMediaScanner.js for why ID3 reading was already rejected once).

const DELIM = "__";

function sanitizePart(str) {
  return (
    (str || "")
      .replace(/[\/\\:*?"<>|]/g, "")
      .replace(/__+/g, "_")
      .trim()
      .slice(0, 60) || "Unknown"
  );
}

export function buildLibraryFilename(title, artist, uniqueId, ext = "mp3") {
  const safeTitle = sanitizePart(title || "Untitled");
  const safeArtist = sanitizePart(artist || "Unknown Artist");
  const safeId = (uniqueId || Date.now().toString(36))
    .toString()
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-8);
  return `${safeTitle}${DELIM}${safeArtist}${DELIM}${safeId}.${ext}`;
}

export function parseLibraryFilename(filename) {
  const base = (filename || "").replace(/\.[^/.]+$/, "");
  const parts = base.split(DELIM);
  if (parts.length >= 2) {
    return { title: parts[0] || "Untitled", artist: parts[1] || "Unknown Artist" };
  }
  return { title: base || "Untitled", artist: "Unknown Artist" };
}

export const B24_ALBUM_NAME = "B24 Music";

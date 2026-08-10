import AsyncStorage from "@react-native-async-storage/async-storage";

// ---------------------------------------------------------------------------
// Local, on-device listening history - logs what's actually been played so
// the AI recommendation feature can build a taste profile from it later.
// Same on-device-only pattern as libraryStorage.js, no backend involved.
// A "play" only counts after MIN_PLAY_SECONDS of listening (set in
// usePlaybackEngine.js), so skips/accidental taps don't pollute the data.
// ---------------------------------------------------------------------------

const HISTORY_KEY = "b24music:listeningHistory";
const MAX_HISTORY_ENTRIES = 500;

async function getJSON(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

async function setJSON(key, value) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
  return value;
}

export const getListeningHistory = () => getJSON(HISTORY_KEY, []);

// entry carries everything needed to replay + display the track later
// (artwork, provider, type, uri fields) - not just label fields. Repeated
// plays of the same track (matched on id+provider) collapse into one
// entry with a rising playCount, instead of piling up stale duplicates -
// keeps the list clean while still preserving replay frequency, which the
// taste profile below depends on.
export async function logPlay(track) {
  if (!track?.id) return;
  const history = await getListeningHistory();
  const trackId = String(track.id);
  const provider = track.provider || null;

  const existing = history.find((h) => h.id === trackId && h.provider === provider);
  const withoutExisting = history.filter(
    (h) => !(h.id === trackId && h.provider === provider)
  );

  const entry = {
    id: trackId,
    provider,
    title: track.title || "Unknown title",
    artist: track.artist || "Unknown artist",
    artwork: track.artwork || null,
    type: track.type || "audio",
    localUri: track.localUri || null,
    stream_url: track.stream_url || null,
    download_url: track.download_url || null,
    source: track.source || null,
    playCount: (existing?.playCount || 0) + 1,
    playedAt: Date.now(),
  };
  const next = [entry, ...withoutExisting].slice(0, MAX_HISTORY_ENTRIES);
  await setJSON(HISTORY_KEY, next);
  console.log("[listeningHistory] logged:", entry.title, "-", entry.artist, `(x${entry.playCount})`);
  return next;
}

// Remove a single entry (e.g. from a long-press "Remove" action).
export async function removeHistoryEntry(id, provider) {
  const history = await getListeningHistory();
  const next = history.filter((h) => !(h.id === id && h.provider === (provider || null)));
  await setJSON(HISTORY_KEY, next);
  return next;
}

export async function clearListeningHistory() {
  return setJSON(HISTORY_KEY, []);
}

// Aggregates raw history into what the AI playlist generator needs:
// top artists weighted by actual play count (not just track variety),
// plus a short list of recent tracks for extra context. Returns null
// when there's nothing to work with yet, so callers can show a clear
// "play a few tracks first" message instead of generating off nothing.
export async function buildTasteProfile() {
  const history = await getListeningHistory();
  if (history.length === 0) return null;

  const artistCounts = {};
  let totalPlays = 0;
  for (const entry of history) {
    const weight = entry.playCount || 1;
    artistCounts[entry.artist] = (artistCounts[entry.artist] || 0) + weight;
    totalPlays += weight;
  }

  const topArtists = Object.entries(artistCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([artist, count]) => ({ artist, count }));

  const recentTracks = history.slice(0, 15).map((e) => ({
    title: e.title,
    artist: e.artist,
  }));

  return { topArtists, recentTracks, totalPlays };
}

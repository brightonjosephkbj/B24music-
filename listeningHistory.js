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

// entry carries everything playTrack()/AppShell need to replay + display the
// track later (artwork, provider, type, and whichever uri field it had) -
// not just label fields. Pulled straight off the track object already used
// everywhere else, so no new shape to maintain, just a fuller slice of it.
export async function logPlay(track) {
  if (!track?.id) return;
  const history = await getListeningHistory();
  // Replaying a re-played track shouldn't leave a stale duplicate sitting
  // lower in the list - drop any earlier entry for the same track first.
  const withoutDupes = history.filter(
    (h) => !(h.id === String(track.id) && h.provider === (track.provider || null))
  );
  const entry = {
    id: String(track.id),
    provider: track.provider || null,
    title: track.title || "Unknown title",
    artist: track.artist || "Unknown artist",
    artwork: track.artwork || null,
    type: track.type || "audio",
    localUri: track.localUri || null,
    stream_url: track.stream_url || null,
    download_url: track.download_url || null,
    source: track.source || null,
    playedAt: Date.now(),
  };
  const next = [entry, ...withoutDupes].slice(0, MAX_HISTORY_ENTRIES);
  await setJSON(HISTORY_KEY, next);
  console.log("[listeningHistory] logged:", entry.title, "-", entry.artist);
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

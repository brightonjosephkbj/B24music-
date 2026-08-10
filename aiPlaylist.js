import { authedHeaders, API_BASE, uploadBase64Image } from "./apiClient";
import { buildTasteProfile } from "./listeningHistory";
import { createPlaylist, addTrackToPlaylist } from "./libraryStorage";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEYS_DOWNLOADS = "b24music:downloads";

async function getDownloadsRaw() {
  const raw = await AsyncStorage.getItem(KEYS_DOWNLOADS);
  return raw ? JSON.parse(raw) : [];
}
async function saveDownloadsRaw(list) {
  await AsyncStorage.setItem(KEYS_DOWNLOADS, JSON.stringify(list));
}

// Same composite key SearchScreen.js uses everywhere - keeping it
// identical means an AI-added track and a manually-searched-and-saved
// version of the same track are recognized as the same track, not dupes.
function trackKey(t) {
  return `${t.provider}-${t.id}`;
}

// Resolves one AI-suggested search query to the single best real,
// playable track via the same endpoint SearchScreen.js uses.
async function resolveQuery(query) {
  const params = new URLSearchParams({ q: query });
  const res = await fetch(
    `${API_BASE}/api/apicache/api/music/search?${params.toString()}`,
    { headers: await authedHeaders() }
  );
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const cats = data?.categories || {};
  const all = Object.values(cats).flat();
  return all[0] || null;
}

// Generates a playlist from on-device listening history + Groq, resolves
// each suggestion to a real track, and saves it exactly like a normal
// playlist - just streamed (download_url) instead of fully downloaded to
// disk, so it doesn't eat storage/bandwidth automatically in the background.
export async function generateAIPlaylist() {
  const tasteProfile = await buildTasteProfile();
  if (!tasteProfile) {
    throw new Error("Not enough listening history yet - play a few tracks first.");
  }

  const res = await fetch(`${API_BASE}/api/apicache/api/ai/playlist`, {
    method: "POST",
    headers: await authedHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ taste_profile: tasteProfile }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "AI playlist generation failed");
  }

  const { playlist_name, queries, art_base64 } = data;

  const resolved = [];
  const seenKeys = new Set();
  for (const { query } of queries) {
    const track = await resolveQuery(query);
    if (!track?.id || !track?.provider) continue;
    const key = trackKey(track);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    resolved.push({ track, key });
  }

  if (resolved.length === 0) {
    throw new Error("Couldn't find matching tracks for your taste profile.");
  }

  let artworkUrl = null;
  if (art_base64) {
    try {
      artworkUrl = await uploadBase64Image(art_base64, "playlist_art");
    } catch (err) {
      console.warn("Playlist art upload failed, continuing without art:", err.message);
    }
  }

  const playlist = await createPlaylist(playlist_name || "Made for you", artworkUrl);
  const existing = await getDownloadsRaw();
  const existingKeys = new Set(existing.map((d) => d.id));
  const newEntries = [];

  for (const { track, key } of resolved) {
    if (!existingKeys.has(key)) {
      newEntries.push({
        id: key,
        type: "audio",
        title: track.title,
        artist: track.artist,
        artwork: track.artwork,
        download_url: track.download_url, // streamed, no localUri
        duration: track.duration || 0,
        source: track.provider,
        addedAt: Date.now(),
      });
    }
    await addTrackToPlaylist(playlist.id, key);
  }

  if (newEntries.length > 0) {
    await saveDownloadsRaw([...existing, ...newEntries]);
  }

  return playlist;
}

import { authedHeaders, API_BASE, uploadBase64Image } from "./apiClient";
import { buildTasteProfile } from "./listeningHistory";
import { createPlaylist, addTrackToPlaylist, getDownloads, saveDownloads } from "./libraryStorage";

// NOTE: previously had its own getDownloadsRaw/saveDownloadsRaw pair
// against the same "b24music:downloads" AsyncStorage key libraryStorage.js
// uses - two independent unsynchronized read-modify-write cycles on the
// same key raced each other. A manual download finishing around the same
// time as this running (background auto-gen or the "Generate AI Playlist"
// button) could silently clobber the other's entry - the file would exist
// on disk but vanish from the downloads list with no error. Now routed
// through libraryStorage.js's own functions so there's one path, not two.

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
// Shared by generateAIPlaylist() (taste-profile based) and
// generateChatPlaylist() in aiChat.js (free-text request based) - both
// backend endpoints return the same {playlist_name, queries, art_base64}
// shape, so resolving queries to real tracks and saving them only needs
// to live in one place.
export async function resolvePlaylistFromAIData(data) {
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
    throw new Error("Couldn't find matching tracks for that request.");
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
  const existing = await getDownloads();
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
    await saveDownloads([...existing, ...newEntries]);
  }

  return playlist;
}

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

  return resolvePlaylistFromAIData(data);
}

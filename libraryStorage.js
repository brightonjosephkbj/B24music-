import AsyncStorage from "@react-native-async-storage/async-storage";

// ---------------------------------------------------------------------------
// Local, on-device library storage - folders, playlists, and downloads.
// No backend accounts exist yet, so all of this lives in AsyncStorage and is
// per-device only. If accounts ever get built, this is the layer to swap for
// real API calls without touching LibraryScreen's UI logic.
// ---------------------------------------------------------------------------

const KEYS = {
  FOLDERS: "b24music:folders",
  PLAYLISTS: "b24music:playlists",
  DOWNLOADS: "b24music:downloads",
};

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

// ---- Downloads ----
// A "download" entry: { id, type: "audio"|"video", title, artist, artwork,
// localUri, duration, addedAt }. Populated whenever a real download from
// /api/music/download or /api/fetch/download finishes - that hookup happens
// wherever the download button lives, not here.
export const getDownloads = () => getJSON(KEYS.DOWNLOADS, []);
export const saveDownloads = (list) => setJSON(KEYS.DOWNLOADS, list);

export async function removeDownload(id) {
  const list = await getDownloads();
  return saveDownloads(list.filter((d) => d.id !== id));
}

export async function updateDownloadInfo(id, patch) {
  const list = await getDownloads();
  const next = list.map((d) => (d.id === id ? { ...d, ...patch } : d));
  return saveDownloads(next);
}

export async function isDownloaded(id) {
  const list = await getDownloads();
  return list.some((d) => d.id === id);
}

export async function addDownload(entry) {
  const list = await getDownloads();
  if (list.some((d) => d.id === entry.id)) return list;
  const next = [...list, entry];
  await saveDownloads(next);
  return next;
}

// ---- Folders ----
// A folder: { id, name, itemIds: [] } - itemIds reference download ids or
// playlist ids, since folders can hold a freeform mix of anything.
export const getFolders = () => getJSON(KEYS.FOLDERS, []);
export const saveFolders = (list) => setJSON(KEYS.FOLDERS, list);

export async function createFolder(name) {
  const list = await getFolders();
  const folder = { id: `folder_${Date.now()}`, name, itemIds: [] };
  await saveFolders([...list, folder]);
  return folder;
}

export async function deleteFolder(id) {
  const list = await getFolders();
  return saveFolders(list.filter((f) => f.id !== id));
}

export async function addItemToFolder(folderId, itemId) {
  const list = await getFolders();
  const next = list.map((f) =>
    f.id === folderId && !f.itemIds.includes(itemId)
      ? { ...f, itemIds: [...f.itemIds, itemId] }
      : f
  );
  return saveFolders(next);
}

// ---- Playlists ----
// A playlist: { id, name, trackIds: [] } - trackIds reference download ids.
export const getPlaylists = () => getJSON(KEYS.PLAYLISTS, []);
export const savePlaylists = (list) => setJSON(KEYS.PLAYLISTS, list);

export async function createPlaylist(name) {
  const list = await getPlaylists();
  const playlist = { id: `playlist_${Date.now()}`, name, trackIds: [] };
  await savePlaylists([...list, playlist]);
  return playlist;
}

export async function deletePlaylist(id) {
  const list = await getPlaylists();
  return savePlaylists(list.filter((p) => p.id !== id));
}

export async function addTrackToPlaylist(playlistId, trackId) {
  const list = await getPlaylists();
  const next = list.map((p) =>
    p.id === playlistId && !p.trackIds.includes(trackId)
      ? { ...p, trackIds: [...p.trackIds, trackId] }
      : p
  );
  return savePlaylists(next);
}

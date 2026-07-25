import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  TextInput,
  Modal,
  Share,
  RefreshControl,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  getDownloads,
  removeDownload,
  updateDownloadInfo,
  getFolders,
  createFolder,
  deleteFolder,
  addItemToFolder,
  getPlaylists,
  createPlaylist,
  addTrackToPlaylist,
} from "./libraryStorage";
import ContextMenuCard from "./ContextMenuCard";
import { scanDeviceMedia } from "./localMediaScanner";

const GRADIENT_COLORS = ["#FF6B6B", "#FFA751", "#4ECDC4"];
const GLASS_BG = "rgba(255,255,255,0.14)";
const GLASS_BORDER = "rgba(255,255,255,0.25)";

// Order per your instruction: Videos, Folders, Playlists, Artists, Downloads.
const TABS = ["Videos", "All Songs", "Folders", "Playlists", "Artists", "Downloads"];

function formatDuration(sec) {
  if (!sec && sec !== 0) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// onTrackPress(item) - plays a track/video, wire to your player.
export default function LibraryScreen({ onTrackPress, onSearchPress }) {
  const [activeTab, setActiveTab] = useState("Downloads");
  const [downloads, setDownloads] = useState([]);
  const [deviceAudio, setDeviceAudio] = useState([]);
  const [deviceVideo, setDeviceVideo] = useState([]);
  const [scanDenied, setScanDenied] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [folders, setFolders] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  // Long-press context menu state
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuItem, setMenuItem] = useState(null);

  // Create-folder / create-playlist prompt modal
  const [promptVisible, setPromptVisible] = useState(false);
  const [promptMode, setPromptMode] = useState(null); // "folder" | "playlist"
  const [promptValue, setPromptValue] = useState("");

  // Add-to-playlist picker
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerTarget, setPickerTarget] = useState(null); // the item being added

  const loadAll = useCallback(async () => {
    const [d, f, p] = await Promise.all([getDownloads(), getFolders(), getPlaylists()]);
    setDownloads(d);
    setFolders(f);
    setPlaylists(p);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const runScan = useCallback(async () => {
    setScanning(true);
    const result = await scanDeviceMedia();
    setScanning(false);
    if (!result.granted) {
      setScanDenied(true);
      return;
    }
    setScanDenied(false);
    setDeviceAudio(result.audio);
    setDeviceVideo(result.video);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const openMenu = (evt, item) => {
    const { pageX, pageY } = evt.nativeEvent;
    setMenuAnchor({ x: pageX - 110, y: pageY + 8 });
    setMenuItem(item);
    setMenuVisible(true);
  };

  const menuActions = menuItem
    ? [
        {
          key: "share",
          label: "Share",
          onPress: () => Share.share({ message: menuItem.title, url: menuItem.localUri || "" }),
        },
        {
          key: "playNext",
          label: "Play Next",
          onPress: () => onTrackPress && onTrackPress(menuItem, { playNext: true }),
        },
        {
          key: "addToPlaylist",
          label: "Add to Playlist",
          onPress: () => {
            setPickerTarget(menuItem);
            setPickerVisible(true);
          },
        },
        {
          key: "editInfo",
          label: "Edit Info",
          onPress: () => {
            setPromptMode("editInfo");
            setPromptValue(menuItem.title);
            setPromptVisible(true);
          },
        },
        {
          key: "delete",
          label: "Delete",
          destructive: true,
          onPress: async () => {
            await removeDownload(menuItem.id);
            loadAll();
          },
        },
      ]
    : [];

  const submitPrompt = async () => {
    const value = promptValue.trim();
    if (!value) return setPromptVisible(false);

    if (promptMode === "folder") {
      await createFolder(value);
    } else if (promptMode === "playlist") {
      await createPlaylist(value);
    } else if (promptMode === "editInfo" && menuItem) {
      await updateDownloadInfo(menuItem.id, { title: value });
    }
    setPromptVisible(false);
    setPromptValue("");
    loadAll();
  };

  const appVideos = downloads.filter((d) => d.type === "video");
  const appAudio = downloads.filter((d) => d.type === "audio");
  const videos = [...appVideos, ...deviceVideo];
  const allSongs = [...appAudio, ...deviceAudio];
  const artistGroups = [...allSongs, ...videos].reduce((acc, d) => {
    const key = d.artist || "Unknown Artist";
    acc[key] = acc[key] || [];
    acc[key].push(d);
    return acc;
  }, {});

  const renderTrackRow = (item) => (
    <TouchableOpacity
      key={item.id}
      style={styles.row}
      onPress={() => onTrackPress && onTrackPress(item)}
      onLongPress={(evt) => openMenu(evt, item)}
      delayLongPress={300}
    >
      <Image source={item.artwork ? { uri: item.artwork } : undefined} style={styles.rowArt} />
      <View style={styles.rowTextWrap}>
        <Text numberOfLines={1} style={styles.rowTitle}>{item.title}</Text>
        <Text numberOfLines={1} style={styles.rowArtist}>{item.artist}</Text>
      </View>
      <Text style={styles.rowDuration}>{formatDuration(item.duration)}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.root}>
      <LinearGradient colors={GRADIENT_COLORS} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />

      <View style={styles.header}>
        <Text style={styles.title}>Your library</Text>
        <TouchableOpacity style={styles.iconButton} onPress={onSearchPress}>
          <Text style={styles.iconGlyph}>Search</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabRow}>
        {TABS.map((tab) => {
          const active = tab === activeTab;
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      >
        {/* ---------- Videos ---------- */}
        {activeTab === "Videos" && (
          <>
            <TouchableOpacity style={styles.createTile} onPress={runScan} disabled={scanning}>
              <Text style={styles.createTileText}>
                {scanning ? "Scanning..." : "Scan phone storage"}
              </Text>
            </TouchableOpacity>
            {scanDenied && (
              <Text style={styles.emptyText}>
                Storage permission was denied - enable it in your phone's app settings to see local videos here.
              </Text>
            )}
            {videos.length === 0 ? (
              <Text style={styles.emptyText}>No videos yet - download some, or scan your phone storage above.</Text>
            ) : (
              videos.map(renderTrackRow)
            )}
          </>
        )}

        {/* ---------- All Songs (app downloads + scanned local mp3s) ---------- */}
        {activeTab === "All Songs" && (
          <>
            <TouchableOpacity style={styles.createTile} onPress={runScan} disabled={scanning}>
              <Text style={styles.createTileText}>
                {scanning ? "Scanning..." : "Scan phone storage"}
              </Text>
            </TouchableOpacity>
            {scanDenied && (
              <Text style={styles.emptyText}>
                Storage permission was denied - enable it in your phone's app settings to see local songs here.
              </Text>
            )}
            {allSongs.length === 0 ? (
              <Text style={styles.emptyText}>No songs yet - download some, or scan your phone storage above.</Text>
            ) : (
              allSongs.map(renderTrackRow)
            )}
          </>
        )}

        {/* ---------- Folders ---------- */}
        {activeTab === "Folders" && (
          <>
            <TouchableOpacity
              style={styles.createTile}
              onPress={() => {
                setPromptMode("folder");
                setPromptValue("");
                setPromptVisible(true);
              }}
            >
              <Text style={styles.createTileText}>+ New Folder</Text>
            </TouchableOpacity>
            {folders.length === 0 ? (
              <Text style={styles.emptyText}>No folders yet — create one to organize anything: songs, videos, or playlists together.</Text>
            ) : (
              folders.map((f) => (
                <View key={f.id} style={styles.folderRow}>
                  <Text style={styles.folderName}>{f.name}</Text>
                  <Text style={styles.folderCount}>{f.itemIds.length} items</Text>
                  <TouchableOpacity onPress={async () => { await deleteFolder(f.id); loadAll(); }}>
                    <Text style={styles.folderDelete}>Delete</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </>
        )}

        {/* ---------- Playlists ---------- */}
        {activeTab === "Playlists" && (
          <>
            <TouchableOpacity
              style={styles.createTile}
              onPress={() => {
                setPromptMode("playlist");
                setPromptValue("");
                setPromptVisible(true);
              }}
            >
              <Text style={styles.createTileText}>+ New Playlist</Text>
            </TouchableOpacity>
            {playlists.length === 0 ? (
              <Text style={styles.emptyText}>No playlists yet.</Text>
            ) : (
              playlists.map((p) => (
                <View key={p.id} style={styles.folderRow}>
                  <Text style={styles.folderName}>{p.name}</Text>
                  <Text style={styles.folderCount}>{p.trackIds.length} tracks</Text>
                </View>
              ))
            )}
          </>
        )}

        {/* ---------- Artists ---------- */}
        {activeTab === "Artists" && (
          Object.keys(artistGroups).length === 0 ? (
            <Text style={styles.emptyText}>No artists yet — download some tracks first.</Text>
          ) : (
            Object.entries(artistGroups).map(([artist, tracks]) => (
              <View key={artist} style={styles.folderRow}>
                <Text style={styles.folderName}>{artist}</Text>
                <Text style={styles.folderCount}>{tracks.length} tracks</Text>
              </View>
            ))
          )
        )}

        {/* ---------- Downloads (everything, audio + video) ---------- */}
        {activeTab === "Downloads" && (
          downloads.length === 0 ? (
            <Text style={styles.emptyText}>Nothing downloaded yet.</Text>
          ) : (
            downloads.map(renderTrackRow)
          )
        )}
      </ScrollView>

      {/* ---------- Long-press context menu ---------- */}
      <ContextMenuCard
        visible={menuVisible}
        anchor={menuAnchor}
        actions={menuActions}
        onClose={() => setMenuVisible(false)}
      />

      {/* ---------- Create / rename prompt ---------- */}
      <Modal visible={promptVisible} transparent animationType="fade" onRequestClose={() => setPromptVisible(false)}>
        <View style={styles.promptBackdrop}>
          <View style={styles.promptCard}>
            <Text style={styles.promptTitle}>
              {promptMode === "folder" ? "New Folder" : promptMode === "playlist" ? "New Playlist" : "Edit Title"}
            </Text>
            <TextInput
              value={promptValue}
              onChangeText={setPromptValue}
              placeholder="Name"
              placeholderTextColor="rgba(255,255,255,0.4)"
              style={styles.promptInput}
              autoFocus
            />
            <View style={styles.promptButtons}>
              <TouchableOpacity onPress={() => setPromptVisible(false)} style={styles.promptButton}>
                <Text style={styles.promptButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitPrompt} style={[styles.promptButton, styles.promptButtonPrimary]}>
                <Text style={styles.promptButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------- Add-to-playlist picker ---------- */}
      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={() => setPickerVisible(false)}>
        <TouchableOpacity style={styles.promptBackdrop} activeOpacity={1} onPress={() => setPickerVisible(false)}>
          <View style={styles.promptCard}>
            <Text style={styles.promptTitle}>Add to Playlist</Text>
            {playlists.length === 0 ? (
              <Text style={styles.emptyText}>No playlists yet — create one first.</Text>
            ) : (
              playlists.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.pickerRow}
                  onPress={async () => {
                    if (pickerTarget) await addTrackToPlaylist(p.id, pickerTarget.id);
                    setPickerVisible(false);
                    loadAll();
                  }}
                >
                  <Text style={styles.pickerRowText}>{p.name}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14,
  },
  title: { color: "#fff", fontSize: 22, fontWeight: "700" },
  iconButton: {
    paddingHorizontal: 14, height: 40, borderRadius: 20, backgroundColor: GLASS_BG,
    borderWidth: 1, borderColor: GLASS_BORDER, justifyContent: "center", alignItems: "center",
  },
  iconGlyph: { color: "#fff", fontSize: 13, fontWeight: "600" },

  tabRow: { paddingLeft: 20, marginBottom: 14, flexGrow: 0 },
  tab: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: GLASS_BG,
    borderWidth: 1, borderColor: GLASS_BORDER, marginRight: 10,
  },
  tabActive: { backgroundColor: "rgba(255,255,255,0.9)" },
  tabText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  tabTextActive: { color: "#FF6B6B" },

  listContent: { paddingHorizontal: 20, paddingBottom: 150 },

  row: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  rowArt: { width: 48, height: 48, borderRadius: 8, backgroundColor: GLASS_BG, marginRight: 12 },
  rowTextWrap: { flex: 1, marginRight: 10 },
  rowTitle: { color: "#fff", fontWeight: "600", fontSize: 14 },
  rowArtist: { color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 2 },
  rowDuration: { color: "rgba(255,255,255,0.6)", fontSize: 12 },

  createTile: {
    backgroundColor: GLASS_BG, borderWidth: 1, borderColor: GLASS_BORDER, borderRadius: 14,
    paddingVertical: 14, alignItems: "center", marginBottom: 16,
  },
  createTileText: { color: "#fff", fontWeight: "700" },

  folderRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: GLASS_BG, borderWidth: 1, borderColor: GLASS_BORDER, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 16, marginBottom: 10,
  },
  folderName: { color: "#fff", fontWeight: "600", fontSize: 14, flex: 1 },
  folderCount: { color: "rgba(255,255,255,0.6)", fontSize: 12, marginRight: 12 },
  folderDelete: { color: "#FF6B6B", fontSize: 12, fontWeight: "600" },

  emptyText: { color: "rgba(255,255,255,0.6)", textAlign: "center", marginTop: 30, lineHeight: 20 },

  promptBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  promptCard: {
    width: 280, backgroundColor: "rgba(30,30,34,0.98)", borderRadius: 18, borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)", padding: 20,
  },
  promptTitle: { color: "#fff", fontSize: 16, fontWeight: "700", marginBottom: 14 },
  promptInput: {
    borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, color: "#fff", marginBottom: 16,
  },
  promptButtons: { flexDirection: "row", justifyContent: "flex-end", gap: 12 },
  promptButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  promptButtonPrimary: { backgroundColor: "#FF6B6B" },
  promptButtonText: { color: "#fff", fontWeight: "600" },

  pickerRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.1)" },
  pickerRowText: { color: "#fff", fontSize: 15 },
});

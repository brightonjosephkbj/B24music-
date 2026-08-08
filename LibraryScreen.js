import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  TextInput,
  Modal,
  Share,
  RefreshControl,
  Alert,
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
  updatePlaylist,
  deletePlaylist,
} from "./libraryStorage";
import ContextMenuCard from "./ContextMenuCard";
import ImageViewer from "./ImageViewer";
import { scanDeviceMedia } from "./localMediaScanner";
import { useDownloads } from "./DownloadsContext";

const GRADIENT_COLORS = ["#121212", "#181818", "#121212"];
const GLASS_BG = "rgba(255,255,255,0.08)";
const GLASS_BORDER = "rgba(255,255,255,0.15)";

const TABS = ["Videos", "All Songs", "Folders", "Playlists", "Artists", "Downloads"];

function formatDuration(sec) {
  if (!sec && sec !== 0) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

let deviceMediaCache = null;

export default function LibraryScreen({ onTrackPress, onSearchPress }) {
  const { activeDownloads, pauseDownload, resumeDownload, cancelDownload } = useDownloads();
  const [activeTab, setActiveTab] = useState("Playlists");
  const [downloads, setDownloads] = useState([]);
  const [deviceAudio, setDeviceAudio] = useState(deviceMediaCache?.audio || []);
  const [deviceVideo, setDeviceVideo] = useState(deviceMediaCache?.video || []);
  const [scanDenied, setScanDenied] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanErrorMsg, setScanErrorMsg] = useState(null);
  const [lastScanCounts, setLastScanCounts] = useState(null);
  const [folders, setFolders] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  // Playlist tab extras
  const [playlistSearch, setPlaylistSearch] = useState("");
  const [editPlaylistVisible, setEditPlaylistVisible] = useState(false);
  const [editPlaylistTarget, setEditPlaylistTarget] = useState(null);
  const [editPlaylistName, setEditPlaylistName] = useState("");
  const [editPlaylistArt, setEditPlaylistArt] = useState("");

  const [selectedFolder, setSelectedFolder] = useState(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [selectedArtist, setSelectedArtist] = useState(null);

  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuItem, setMenuItem] = useState(null);

  const [promptVisible, setPromptVisible] = useState(false);
  const [promptMode, setPromptMode] = useState(null);
  const [promptValue, setPromptValue] = useState("");

  // Playlist & Folder Picker states
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerTarget, setPickerTarget] = useState(null);
  const [folderPickerVisible, setFolderPickerVisible] = useState(false);
  const [folderPickerTarget, setFolderPickerTarget] = useState(null);

  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [imageViewerItems, setImageViewerItems] = useState([]);
  const [imageViewerIndex, setImageViewerIndex] = useState(0);

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
    setScanErrorMsg(null);
    try {
      const result = await scanDeviceMedia();
      if (!result.granted) {
        setScanDenied(true);
        setScanErrorMsg(result.error || "Permission not granted");
        return;
      }
      setScanDenied(false);
      setDeviceAudio(result.audio);
      setDeviceVideo(result.video);
      setLastScanCounts({ audio: result.audio.length, video: result.video.length });
      deviceMediaCache = { audio: result.audio, video: result.video };
      if (result.error) setScanErrorMsg(result.error);
    } catch (err) {
      console.error("[runScan] unexpected error:", err);
      setScanErrorMsg(err.message || "Unknown error during scan");
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    if (deviceMediaCache) return;
    runScan();
  }, [runScan]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const openMenu = useCallback((evt, item) => {
    const { pageX, pageY } = evt.nativeEvent;
    setMenuAnchor({ x: pageX - 110, y: pageY + 8 });
    setMenuItem(item);
    setMenuVisible(true);
  }, []);

  const menuActions = useMemo(() => {
    if (!menuItem) return [];
    return [
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
        key: "addToFolder",
        label: "Add to Folder",
        onPress: () => {
          setFolderPickerTarget(menuItem);
          setFolderPickerVisible(true);
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
          const isDownload = downloads.some((d) => d.id === menuItem.id);
          if (isDownload) {
            await removeDownload(menuItem.id);
            loadAll();
          } else {
            const filterOut = (prev) => prev.filter((d) => d.id !== menuItem.id);
            setDeviceAudio(filterOut);
            setDeviceVideo(filterOut);
            if (deviceMediaCache) {
              deviceMediaCache = {
                audio: deviceMediaCache.audio.filter((d) => d.id !== menuItem.id),
                video: deviceMediaCache.video.filter((d) => d.id !== menuItem.id),
              };
            }
          }
        },
      },
    ];
  }, [menuItem, downloads, loadAll, onTrackPress]);

  const submitPrompt = async () => {
    const value = promptValue.trim();
    if (!value) return setPromptVisible(false);

    if (promptMode === "folder") {
      await createFolder(value);
    } else if (promptMode === "playlist") {
      await createPlaylist(value);
    } else if (promptMode === "editInfo" && menuItem) {
      const isDownload = downloads.some((d) => d.id === menuItem.id);
      if (isDownload) {
        await updateDownloadInfo(menuItem.id, { title: value });
      } else {
        const updateTitle = (list) =>
          list.map((item) => (item.id === menuItem.id ? { ...item, title: value } : item));
        setDeviceAudio(updateTitle);
        setDeviceVideo(updateTitle);
        if (deviceMediaCache) {
          deviceMediaCache = {
            audio: updateTitle(deviceMediaCache.audio),
            video: updateTitle(deviceMediaCache.video),
          };
        }
      }
    }
    setPromptVisible(false);
    setPromptValue("");
    loadAll();
  };

  const appVideos = useMemo(() => downloads.filter((d) => d.type === "video"), [downloads]);
  const appAudio = useMemo(() => downloads.filter((d) => d.type === "audio"), [downloads]);
  const videos = useMemo(() => [...appVideos, ...deviceVideo], [appVideos, deviceVideo]);
  const allSongs = useMemo(() => [...appAudio, ...deviceAudio], [appAudio, deviceAudio]);

  const allMedia = useMemo(() => {
    const map = new Map();
    [...downloads, ...deviceAudio, ...deviceVideo].forEach((item) => {
      if (item && item.id) map.set(item.id, item);
    });
    return Array.from(map.values());
  }, [downloads, deviceAudio, deviceVideo]);

  const artistGroups = useMemo(() => {
    return [...allSongs, ...videos].reduce((acc, d) => {
      const key = d.artist || "Unknown Artist";
      acc[key] = acc[key] || [];
      acc[key].push(d);
      return acc;
    }, {});
  }, [allSongs, videos]);
  const artistEntries = useMemo(() => Object.entries(artistGroups), [artistGroups]);

  const getPlaylistArt = useCallback((playlist) => {
    if (playlist.art) return { uri: playlist.art };
    const idSet = new Set(playlist.trackIds || []);
    const firstTrack = allMedia.find((d) => idSet.has(d.id) && d.artwork);
    return firstTrack ? { uri: firstTrack.artwork } : null;
  }, [allMedia]);

  const filteredPlaylists = useMemo(() => {
    if (!playlistSearch.trim()) return playlists;
    const q = playlistSearch.toLowerCase();
    return playlists.filter((p) => p.name.toLowerCase().includes(q));
  }, [playlists, playlistSearch]);

  const playAllPlaylist = useCallback((playlist) => {
    const idSet = new Set(playlist.trackIds || []);
    const tracks = allMedia.filter((d) => idSet.has(d.id));
    if (tracks.length > 0 && onTrackPress) onTrackPress(tracks[0], tracks);
  }, [allMedia, onTrackPress]);

  const shufflePlaylist = useCallback((playlist) => {
    const idSet = new Set(playlist.trackIds || []);
    const tracks = allMedia.filter((d) => idSet.has(d.id));
    if (tracks.length > 0 && onTrackPress) {
      const shuffled = [...tracks].sort(() => Math.random() - 0.5);
      onTrackPress(shuffled[0], shuffled);
    }
  }, [allMedia, onTrackPress]);

  const folderItems = useMemo(() => {
    if (!selectedFolder) return [];
    const idSet = new Set(selectedFolder.itemIds || []);
    return allMedia.filter((d) => idSet.has(d.id));
  }, [selectedFolder, allMedia]);

  const playlistItems = useMemo(() => {
    if (!selectedPlaylist) return [];
    const idSet = new Set(selectedPlaylist.trackIds || []);
    return allMedia.filter((d) => idSet.has(d.id));
  }, [selectedPlaylist, allMedia]);

  const artistTracks = useMemo(() => {
    if (!selectedArtist) return [];
    return artistGroups[selectedArtist] || [];
  }, [selectedArtist, artistGroups]);

  useEffect(() => {
    if (selectedFolder) {
      const fresh = folders.find((f) => f.id === selectedFolder.id);
      if (fresh && fresh !== selectedFolder) setSelectedFolder(fresh);
      if (!fresh) setSelectedFolder(null);
    }
  }, [folders, selectedFolder]);

  useEffect(() => {
    if (selectedPlaylist) {
      const fresh = playlists.find((p) => p.id === selectedPlaylist.id);
      if (fresh && fresh !== selectedPlaylist) setSelectedPlaylist(fresh);
      if (!fresh) setSelectedPlaylist(null);
    }
  }, [playlists, selectedPlaylist]);

  const closeDetail = () => {
    setSelectedFolder(null);
    setSelectedPlaylist(null);
    setSelectedArtist(null);
  };

  const openImage = useCallback((item) => {
    const savedImages = allMedia.filter((d) => d.type === "image");
    const idx = savedImages.findIndex((d) => d.id === item.id);
    const targetImages = savedImages.length > 0 ? savedImages : [item];
    const targetIndex = idx >= 0 ? idx : 0;

    setImageViewerItems(
      targetImages.map((d) => ({
        id: d.id,
        title: d.title || "Image",
        artist: d.artist || "",
        image: d.localUri || d.uri,
        thumbnail: d.artwork || d.localUri || d.uri,
        download_url: d.localUri || d.uri,
        source: d.source,
      }))
    );
    setImageViewerIndex(targetIndex);
    setImageViewerVisible(true);
  }, [allMedia]);

  const renderTrackRow = useCallback(
    ({ item }) => (
      <TouchableOpacity
        style={styles.row}
        onPress={() => {
          if (item.type === "image") return openImage(item);
          if (!onTrackPress) return;
          const sourceQueue =
            selectedFolder ? folderItems :
            selectedPlaylist ? playlistItems :
            selectedArtist ? artistTracks :
            activeTab === "Videos" ? videos :
            activeTab === "All Songs" ? allSongs :
            downloads;
          onTrackPress(item, sourceQueue);
        }}
        onLongPress={(evt) => openMenu(evt, item)}
        delayLongPress={300}
      >
        <Image source={item.artwork ? { uri: item.artwork } : undefined} style={styles.rowArt} />
        <View style={styles.rowTextWrap}>
          <Text numberOfLines={1} style={styles.rowTitle}>{item.title}</Text>
          {!!item.artist && <Text numberOfLines={1} style={styles.rowArtist}>{item.artist}</Text>}
        </View>
        {item.type === "image" ? (
          <Text style={styles.rowDuration}>Image</Text>
        ) : (
          <Text style={styles.rowDuration}>{formatDuration(item.duration)}</Text>
        )}
      </TouchableOpacity>
    ),
    [downloads, onTrackPress, activeTab, videos, allSongs, selectedFolder, selectedPlaylist, selectedArtist, folderItems, playlistItems, artistTracks, openImage, openMenu]
  );

  const keyExtractor = useCallback((item) => item.id, []);

  const renderPlaylistDetailHeader = () => {
    if (!selectedPlaylist) return null;
    const art = getPlaylistArt(selectedPlaylist);

    return (
      <View style={styles.spotifyHeaderContainer}>
        {/* Cover Art */}
        <View style={styles.spotifyCoverArtWrap}>
          {art ? (
            <Image source={art} style={styles.spotifyCoverArt} />
          ) : (
            <View style={[styles.spotifyCoverArt, styles.spotifyArtPlaceholder]}>
              <Text style={{ fontSize: 60 }}>🎵</Text>
            </View>
          )}
        </View>

        {/* Playlist Title & Meta */}
        <Text style={styles.spotifyTitle}>{selectedPlaylist.name}</Text>
        <View style={styles.spotifySourceRow}>
          <View style={styles.spotifyDot} />
          <Text style={styles.spotifySourceText}>Made for you</Text>
        </View>
        <Text style={styles.spotifyMeta}>{playlistItems.length} tracks</Text>

        {/* Actions Row */}
        <View style={styles.spotifyActionBar}>
          {/* Left Controls: Edit, Share, Options */}
          <View style={styles.spotifyLeftActions}>
            <TouchableOpacity
              style={styles.spotifyIconBtn}
              onPress={() => {
                setEditPlaylistTarget(selectedPlaylist);
                setEditPlaylistName(selectedPlaylist.name);
                setEditPlaylistArt(selectedPlaylist.art || "");
                setEditPlaylistVisible(true);
              }}
            >
              <Text style={styles.spotifyIconTxt}>✏️</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.spotifyIconBtn}
              onPress={() => {
                Share.share({
                  message: `Check out my playlist: ${selectedPlaylist.name}`,
                });
              }}
            >
              <Text style={styles.spotifyIconTxt}>📤</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.spotifyIconBtn}
              onPress={() => {
                Alert.alert(selectedPlaylist.name, "Choose an option", [
                  {
                    text: "Edit Playlist",
                    onPress: () => {
                      setEditPlaylistTarget(selectedPlaylist);
                      setEditPlaylistName(selectedPlaylist.name);
                      setEditPlaylistArt(selectedPlaylist.art || "");
                      setEditPlaylistVisible(true);
                    },
                  },
                  {
                    text: "Delete Playlist",
                    style: "destructive",
                    onPress: async () => {
                      await deletePlaylist(selectedPlaylist.id);
                      closeDetail();
                      loadAll();
                    },
                  },
                  { text: "Cancel", style: "cancel" },
                ]);
              }}
            >
              <Text style={styles.spotifyIconTxt}>⋮</Text>
            </TouchableOpacity>
          </View>

          {/* Right Controls: Shuffle & Primary Play CTA */}
          <View style={styles.spotifyRightActions}>
            <TouchableOpacity
              style={styles.spotifyIconBtn}
              onPress={() => shufflePlaylist(selectedPlaylist)}
            >
              <Text style={[styles.spotifyIconTxt, { color: "#1ED760" }]}>🔀</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.spotifyPlayBtn}
              onPress={() => playAllPlaylist(selectedPlaylist)}
              activeOpacity={0.8}
            >
              <Text style={styles.spotifyPlayIcon}>▶</Text>
              <Text style={styles.spotifyPlayText}>PLAY</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const scanHeader = (deniedMsg) => (
    <>
      <TouchableOpacity style={styles.createTile} onPress={runScan} disabled={scanning}>
        <Text style={styles.createTileText}>
          {scanning ? "Scanning..." : "Rescan phone storage (find new files)"}
        </Text>
      </TouchableOpacity>
      {scanDenied && <Text style={styles.emptyText}>{deniedMsg}</Text>}
      {!!scanErrorMsg && <Text style={[styles.emptyText, { color: "#FF6B6B" }]}>{scanErrorMsg}</Text>}
      {!!lastScanCounts && !scanErrorMsg && (
        <Text style={styles.emptyText}>
          Last scan found {lastScanCounts.audio} audio and {lastScanCounts.video} video files on device.
        </Text>
      )}
    </>
  );

  const detailMode = !!(selectedFolder || selectedPlaylist || selectedArtist);
  let detailData = [];
  let detailTitle = "";
  let detailEmptyText = "";
  if (selectedFolder) {
    detailData = folderItems;
    detailTitle = selectedFolder.name;
    detailEmptyText = "This folder is empty.";
  } else if (selectedPlaylist) {
    detailData = playlistItems;
    detailTitle = selectedPlaylist.name;
    detailEmptyText = "This playlist is empty.";
  } else if (selectedArtist) {
    detailData = artistTracks;
    detailTitle = selectedArtist;
    detailEmptyText = "No tracks for this artist.";
  }

  let listData = [];
  let listEmptyText = "";
  let listHeader = null;

  if (activeTab === "Videos") {
    listData = videos;
    listEmptyText = "No videos yet - download some, or scan your phone storage above.";
    listHeader = scanHeader("Storage permission was denied - enable it in your phone's app settings to see local videos here.");
  } else if (activeTab === "All Songs") {
    listData = allSongs;
    listEmptyText = "No songs yet - download some, or scan your phone storage above.";
    listHeader = scanHeader("Storage permission was denied - enable it in your phone's app settings to see local songs here.");
  } else if (activeTab === "Downloads") {
    listData = downloads;
    listEmptyText = "Nothing downloaded yet.";
    const activeList = Array.from(activeDownloads.values());
    if (activeList.length > 0) {
      listHeader = (
        <View style={{ marginBottom: 16 }}>
          {activeList.map((d) => (
            <View key={d.key} style={styles.activeDownloadRow}>
              <Text numberOfLines={1} style={styles.activeDownloadTitle}>{d.title}</Text>
              <View style={styles.activeDownloadTrack}>
                <View style={[styles.activeDownloadFill, { width: `${Math.round(d.progress * 100)}%` }]} />
              </View>
              <View style={styles.activeDownloadFooter}>
                <Text style={styles.activeDownloadPct}>
                  {d.status === "paused" ? "Paused - " : ""}{Math.round(d.progress * 100)}%
                </Text>
                <View style={styles.activeDownloadActions}>
                  {d.status === "paused" ? (
                    <TouchableOpacity onPress={() => resumeDownload(d.key)} style={styles.activeDownloadBtn}>
                      <Text style={styles.activeDownloadBtnText}>Resume</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity onPress={() => pauseDownload(d.key)} style={styles.activeDownloadBtn}>
                      <Text style={styles.activeDownloadBtnText}>Pause</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => cancelDownload(d.key)} style={styles.activeDownloadBtn}>
                    <Text style={[styles.activeDownloadBtnText, { color: "#FF6B6B" }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </View>
      );
    }
  }

  return (
    <View style={styles.root}>
      <LinearGradient colors={GRADIENT_COLORS} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />

      <View style={styles.header}>
        {detailMode ? (
          <TouchableOpacity onPress={closeDetail} style={styles.backButtonRow} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.backGlyph}>‹</Text>
            <Text style={styles.title} numberOfLines={1}>{detailTitle}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.title}>Your library</Text>
        )}
        <View style={styles.headerActions}>
          {!selectedPlaylist && (
            <TouchableOpacity style={styles.iconButton} onPress={onSearchPress}>
              <Text style={styles.iconGlyph}>Search</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {!detailMode && (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabRow}
          data={TABS}
          keyExtractor={(t) => t}
          renderItem={({ item: tab }) => {
            const active = tab === activeTab;
            return (
              <TouchableOpacity
                onPress={() => setActiveTab(tab)}
                style={[styles.tab, active && styles.tabActive]}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab}</Text>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {detailMode ? (
        <FlatList
          data={detailData}
          keyExtractor={keyExtractor}
          renderItem={renderTrackRow}
          ListHeaderComponent={selectedPlaylist ? renderPlaylistDetailHeader : null}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>{detailEmptyText}</Text>}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews
        />
      ) : (
        <>
          {(activeTab === "Videos" || activeTab === "All Songs" || activeTab === "Downloads") && (
            <FlatList
              data={listData}
              keyExtractor={keyExtractor}
              renderItem={renderTrackRow}
              contentContainerStyle={styles.listContent}
              ListHeaderComponent={listHeader}
              ListEmptyComponent={<Text style={styles.emptyText}>{listEmptyText}</Text>}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
              initialNumToRender={12}
              maxToRenderPerBatch={12}
              windowSize={7}
              removeClippedSubviews
            />
          )}

          {activeTab === "Folders" && (
            <FlatList
              data={folders}
              keyExtractor={(f) => f.id}
              contentContainerStyle={styles.listContent}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
              ListHeaderComponent={
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
              }
              ListEmptyComponent={
                <Text style={styles.emptyText}>No folders yet — create one to organize anything: songs, videos, or playlists together.</Text>
              }
              renderItem={({ item: f }) => (
                <TouchableOpacity style={styles.folderRow} onPress={() => setSelectedFolder(f)}>
                  <Text style={styles.folderName}>{f.name}</Text>
                  <Text style={styles.folderCount}>{f.itemIds.length} items</Text>
                  <TouchableOpacity onPress={async () => { await deleteFolder(f.id); loadAll(); }}>
                    <Text style={styles.folderDelete}>Delete</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
            />
          )}

          {activeTab === "Playlists" && (
            <FlatList
              key="playlist-grid-2col"
              data={filteredPlaylists}
              keyExtractor={(p) => p.id}
              numColumns={2}
              columnWrapperStyle={styles.tileColumnWrapper}
              contentContainerStyle={styles.listContent}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
              ListHeaderComponent={
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

                  <View style={styles.playlistSearchBar}>
                    <Text style={styles.playlistSearchIcon}>🔍</Text>
                    <TextInput
                      style={styles.playlistSearchInput}
                      placeholder="Search playlists..."
                      placeholderTextColor="rgba(255,255,255,0.4)"
                      value={playlistSearch}
                      onChangeText={setPlaylistSearch}
                    />
                  </View>
                </>
              }
              ListEmptyComponent={<Text style={styles.emptyText}>No playlists found.</Text>}
              renderItem={({ item: p }) => {
                const art = getPlaylistArt(p);
                return (
                  <TouchableOpacity style={styles.playlistTile} onPress={() => setSelectedPlaylist(p)}>
                    <View style={styles.playlistTileCoverWrap}>
                      {art ? (
                        <Image source={art} style={styles.playlistTileArt} />
                      ) : (
                        <View style={[styles.playlistTileArt, styles.spotifyArtPlaceholder]}>
                          <Text style={{ fontSize: 32 }}>🎵</Text>
                        </View>
                      )}
                    </View>
                    <Text numberOfLines={1} style={styles.playlistTileTitle}>{p.name}</Text>
                    <Text numberOfLines={1} style={styles.playlistTileSub}>
                      {p.trackIds ? p.trackIds.length : 0} tracks
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {activeTab === "Artists" && (
            <FlatList
              data={artistEntries}
              keyExtractor={([artist]) => artist}
              contentContainerStyle={styles.listContent}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
              ListEmptyComponent={<Text style={styles.emptyText}>No artists yet — download some tracks first.</Text>}
              initialNumToRender={12}
              maxToRenderPerBatch={12}
              windowSize={7}
              removeClippedSubviews
              renderItem={({ item: [artist, tracks] }) => (
                <TouchableOpacity style={styles.folderRow} onPress={() => setSelectedArtist(artist)}>
                  <Text style={styles.folderName}>{artist}</Text>
                  <Text style={styles.folderCount}>{tracks.length} tracks</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </>
      )}

      <ContextMenuCard
        visible={menuVisible}
        anchor={menuAnchor}
        actions={menuActions}
        onClose={() => setMenuVisible(false)}
      />

      {/* Prompt Modal */}
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

      {/* Add to Playlist Picker */}
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

      {/* Add to Folder Picker */}
      <Modal visible={folderPickerVisible} transparent animationType="fade" onRequestClose={() => setFolderPickerVisible(false)}>
        <TouchableOpacity style={styles.promptBackdrop} activeOpacity={1} onPress={() => setFolderPickerVisible(false)}>
          <View style={styles.promptCard}>
            <Text style={styles.promptTitle}>Add to Folder</Text>
            {folders.length === 0 ? (
              <Text style={styles.emptyText}>No folders yet — create one first.</Text>
            ) : (
              folders.map((f) => (
                <TouchableOpacity
                  key={f.id}
                  style={styles.pickerRow}
                  onPress={async () => {
                    if (folderPickerTarget) await addItemToFolder(f.id, folderPickerTarget.id);
                    setFolderPickerVisible(false);
                    loadAll();
                  }}
                >
                  <Text style={styles.pickerRowText}>{f.name}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Edit Playlist Modal */}
      <Modal visible={editPlaylistVisible} transparent animationType="fade" onRequestClose={() => setEditPlaylistVisible(false)}>
        <View style={styles.promptBackdrop}>
          <View style={styles.promptCard}>
            <Text style={styles.promptTitle}>Edit Playlist</Text>
            <Text style={styles.editPlaylistLabel}>Playlist Name</Text>
            <TextInput
              value={editPlaylistName}
              onChangeText={setEditPlaylistName}
              placeholder="Name"
              placeholderTextColor="rgba(255,255,255,0.4)"
              style={styles.promptInput}
            />
            <Text style={styles.editPlaylistLabel}>Cover Image URL (Optional)</Text>
            <TextInput
              value={editPlaylistArt}
              onChangeText={setEditPlaylistArt}
              placeholder="https://..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              style={styles.promptInput}
            />
            <View style={styles.promptButtons}>
              <TouchableOpacity onPress={() => setEditPlaylistVisible(false)} style={styles.promptButton}>
                <Text style={styles.promptButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  if (editPlaylistTarget) {
                    await updatePlaylist(editPlaylistTarget.id, {
                      name: editPlaylistName.trim() || editPlaylistTarget.name,
                      art: editPlaylistArt.trim() || null,
                    });
                    loadAll();
                  }
                  setEditPlaylistVisible(false);
                }}
                style={[styles.promptButton, styles.promptButtonPrimary]}
              >
                <Text style={styles.promptButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ImageViewer
        visible={imageViewerVisible}
        images={imageViewerItems}
        initialIndex={imageViewerIndex}
        onClose={() => setImageViewerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#121212" },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14,
  },
  title: { color: "#fff", fontSize: 22, fontWeight: "700" },
  backButtonRow: { flexDirection: "row", alignItems: "center", flex: 1, marginRight: 12, gap: 6 },
  backGlyph: { color: "#fff", fontSize: 28, fontWeight: "700" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
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
  tabActive: { backgroundColor: "#FFFFFF" },
  tabText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  tabTextActive: { color: "#000000" },

  listContent: { paddingHorizontal: 20, paddingBottom: 150 },

  row: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  rowArt: { width: 48, height: 48, borderRadius: 4, backgroundColor: GLASS_BG, marginRight: 12 },
  rowTextWrap: { flex: 1, marginRight: 10 },
  rowTitle: { color: "#fff", fontWeight: "600", fontSize: 14 },
  rowArtist: { color: "#B3B3B3", fontSize: 12, marginTop: 2 },
  rowDuration: { color: "#B3B3B3", fontSize: 12 },

  createTile: {
    backgroundColor: GLASS_BG, borderWidth: 1, borderColor: GLASS_BORDER, borderRadius: 14,
    paddingVertical: 14, alignItems: "center", marginBottom: 16, width: "100%",
  },
  createTileText: { color: "#fff", fontWeight: "700" },

  folderRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: GLASS_BG, borderWidth: 1, borderColor: GLASS_BORDER, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14, marginBottom: 10,
  },
  folderName: { color: "#fff", fontWeight: "600", fontSize: 14, flex: 1 },
  folderCount: { color: "#B3B3B3", fontSize: 12, marginRight: 12 },
  folderDelete: { color: "#FF6B6B", fontSize: 12, fontWeight: "600" },

  /* Playlist Grid Tiles Layout */
  tileColumnWrapper: {
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },
  playlistTile: {
    flex: 1,
    maxWidth: "48%",
  },
  playlistTileCoverWrap: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    marginBottom: 8,
  },
  playlistTileArt: {
    width: "100%",
    height: "100%",
    borderRadius: 14,
  },
  playlistTileTitle: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
    marginBottom: 2,
  },
  playlistTileSub: {
    color: "#B3B3B3",
    fontSize: 12,
  },

  emptyText: { color: "#B3B3B3", textAlign: "center", marginTop: 30, lineHeight: 20 },

  /* Spotify Playlist Hero View */
  spotifyHeaderContainer: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 20,
  },
  spotifyCoverArtWrap: {
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  spotifyCoverArt: {
    width: 200,
    height: 200,
    borderRadius: 12,
    backgroundColor: GLASS_BG,
  },
  spotifyArtPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  spotifyTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  spotifySourceRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  spotifyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#1ED760",
    marginRight: 6,
  },
  spotifySourceText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#B3B3B3",
  },
  spotifyMeta: {
    fontSize: 12,
    color: "#B3B3B3",
    marginTop: 4,
  },

  /* Action Controls Bar */
  spotifyActionBar: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 22,
    paddingHorizontal: 4,
  },
  spotifyLeftActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  spotifyRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  spotifyIconBtn: {
    padding: 6,
  },
  spotifyIconTxt: {
    color: "#FFFFFF",
    fontSize: 20,
  },

  /* Primary Action Play Button (Follow-style slot) */
  spotifyPlayBtn: {
    flexDirection: "row",
    height: 44,
    paddingHorizontal: 22,
    borderRadius: 22,
    backgroundColor: "#1ED760",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  spotifyPlayIcon: {
    color: "#000000",
    fontSize: 14,
    fontWeight: "bold",
  },
  spotifyPlayText: {
    color: "#000000",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  /* Playlist Search Bar */
  playlistSearchBar: {
    flexDirection: "row", alignItems: "center", backgroundColor: GLASS_BG,
    borderWidth: 1, borderColor: GLASS_BORDER, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14, width: "100%",
  },
  playlistSearchIcon: { fontSize: 14, marginRight: 8 },
  playlistSearchInput: { flex: 1, color: "#fff", fontSize: 14 },

  /* Active Downloads */
  activeDownloadRow: {
    backgroundColor: GLASS_BG, borderWidth: 1, borderColor: GLASS_BORDER, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8,
  },
  activeDownloadTitle: { color: "#fff", fontSize: 13, fontWeight: "600", marginBottom: 6 },
  activeDownloadTrack: { height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)" },
  activeDownloadFill: { height: 4, borderRadius: 2, backgroundColor: "#1ED760" },
  activeDownloadPct: { color: "#B3B3B3", fontSize: 10 },
  activeDownloadFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  activeDownloadActions: { flexDirection: "row", gap: 10 },
  activeDownloadBtn: { paddingVertical: 2, paddingHorizontal: 4 },
  activeDownloadBtnText: { color: "#fff", fontSize: 11, fontWeight: "700" },

  /* Modals */
  promptBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center" },
  promptCard: {
    width: 280, backgroundColor: "#181818", borderRadius: 18, borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)", padding: 20,
  },
  promptTitle: { color: "#fff", fontSize: 16, fontWeight: "700", marginBottom: 14 },
  editPlaylistLabel: { color: "#B3B3B3", fontSize: 12, fontWeight: "600", marginBottom: 4 },
  promptInput: {
    borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, color: "#fff", marginBottom: 14,
  },
  promptButtons: { flexDirection: "row", justifyContent: "flex-end", gap: 12 },
  promptButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  promptButtonPrimary: { backgroundColor: "#1ED760" },
  promptButtonText: { color: "#fff", fontWeight: "600" },

  pickerRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.1)" },
  pickerRowText: { color: "#fff", fontSize: 15 },
});

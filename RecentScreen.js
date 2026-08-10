import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  getListeningHistory,
  clearListeningHistory,
  removeHistoryEntry,
} from "./listeningHistory";
import ContextMenuCard from "./ContextMenuCard";

// ---------------------------------------------------------------------------
// Palette: Onyx (#020202) as the base + Candy Blue (#B2D5E5) as the frosted-
// glass tint/accent, per the reference screenshot. Rows are Candy-Blue-tinted
// glass panels floating on the Onyx background - same construction as the
// white-tinted glass used elsewhere (LibraryScreen), just re-tinted.
// ---------------------------------------------------------------------------
const ONYX = "#020202";
const CANDY_BLUE = "#B2D5E5";
const GLASS_BG = "rgba(178,213,229,0.10)";   // Candy Blue @ low opacity, on Onyx
const GLASS_BORDER = "rgba(178,213,229,0.28)";
const GLASS_BG_STRONG = "rgba(178,213,229,0.16)";

function formatSection(playedAt) {
  const now = new Date();
  const d = new Date(playedAt);
  const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameDay(d, now)) return "Today";
  if (isSameDay(d, yesterday)) return "Yesterday";
  return "Earlier";
}

function groupBySection(history) {
  const order = ["Today", "Yesterday", "Earlier"];
  const buckets = { Today: [], Yesterday: [], Earlier: [] };
  history.forEach((entry) => buckets[formatSection(entry.playedAt)].push(entry));
  return order
    .filter((key) => buckets[key].length)
    .map((key) => ({ title: key, data: buckets[key] }));
}

export default function RecentScreen({ onBack, onTrackPress }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuItem, setMenuItem] = useState(null);

  const load = useCallback(async () => {
    const data = await getListeningHistory();
    setHistory(data);
    setLoading(false);
  }, []);

  // Screen is mounted fresh each time App.js switches to it (no react-
  // navigation in this app - same pattern LibraryScreen/SearchScreen use),
  // so a plain mount-time load is enough to always show up-to-date history.
  useEffect(() => {
    load();
  }, [load]);

  const handlePlay = (entry) => {
    // Rebuild a minimal playable track from the stored entry - same shape
    // playTrack()/usePlaybackEngine expect elsewhere in the app.
    const track = {
      id: entry.id,
      provider: entry.provider,
      title: entry.title,
      artist: entry.artist,
      artwork: entry.artwork,
      type: entry.type,
      localUri: entry.localUri,
      stream_url: entry.stream_url,
      download_url: entry.download_url,
    };
    const queue = history.map((h) => ({
      id: h.id,
      provider: h.provider,
      title: h.title,
      artist: h.artist,
      artwork: h.artwork,
      type: h.type,
      localUri: h.localUri,
      stream_url: h.stream_url,
      download_url: h.download_url,
    }));
    onTrackPress && onTrackPress(track, queue);
  };

  const openMenu = (evt, entry) => {
    const { pageX, pageY } = evt.nativeEvent;
    setMenuAnchor({ x: pageX - 110, y: pageY + 8 });
    setMenuItem(entry);
    setMenuVisible(true);
  };

  const menuActions = menuItem
    ? [
        {
          key: "remove",
          label: "Remove from Recent",
          destructive: true,
          onPress: async () => {
            const next = await removeHistoryEntry(menuItem.id, menuItem.provider);
            setHistory(next);
          },
        },
      ]
    : [];

  const confirmClearAll = () => {
    Alert.alert(
      "Clear listening history?",
      "This removes your entire Recently Played list. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await clearListeningHistory();
            setHistory([]);
          },
        },
      ]
    );
  };

  const sections = groupBySection(history);
  const flatData = sections.flatMap((s) => [{ type: "header", title: s.title, key: `h-${s.title}` }, ...s.data.map((d) => ({ type: "row", entry: d, key: `${d.provider}-${d.id}-${d.playedAt}` }))]);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[ONYX, "#0a0e10", ONYX]}
        style={StyleSheet.absoluteFill}
      />

      {/* ---------- Header ---------- */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Ionicons name="chevron-back" size={22} color={CANDY_BLUE} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Recently Played</Text>
        {history.length > 0 ? (
          <TouchableOpacity style={styles.clearButton} onPress={confirmClearAll}>
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.clearButtonSpacer} />
        )}
      </View>

      {!loading && history.length === 0 && (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconGlass}>
            <Ionicons name="time-outline" size={32} color={CANDY_BLUE} />
          </View>
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptySubtitle}>
            Tracks you listen to for a little while will show up here.
          </Text>
        </View>
      )}

      <FlatList
        data={flatData}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          if (item.type === "header") {
            return <Text style={styles.sectionTitle}>{item.title}</Text>;
          }
          const entry = item.entry;
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => handlePlay(entry)}
              onLongPress={(evt) => openMenu(evt, entry)}
              activeOpacity={0.8}
            >
              <Image
                source={entry.artwork ? { uri: entry.artwork } : undefined}
                style={styles.rowArt}
              />
              <View style={styles.rowInfo}>
                <Text numberOfLines={1} style={styles.rowTitle}>{entry.title}</Text>
                <Text numberOfLines={1} style={styles.rowArtist}>{entry.artist}</Text>
              </View>
              {entry.type === "video" && (
                <Ionicons name="videocam" size={16} color={CANDY_BLUE} style={{ marginRight: 8 }} />
              )}
              <TouchableOpacity
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                onPress={(evt) => openMenu(evt, entry)}
              >
                <Ionicons name="ellipsis-vertical" size={18} color="rgba(178,213,229,0.7)" />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
      />

      <ContextMenuCard
        visible={menuVisible}
        anchor={menuAnchor}
        actions={menuActions}
        onClose={() => setMenuVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ONYX },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 54,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
  },
  clearButtonText: { color: CANDY_BLUE, fontSize: 13, fontWeight: "600" },
  clearButtonSpacer: { width: 38 },

  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  sectionTitle: {
    color: CANDY_BLUE,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 18,
    marginBottom: 8,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 16,
    padding: 10,
    marginBottom: 8,
  },
  rowArt: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: "rgba(178,213,229,0.15)",
    marginRight: 12,
  },
  rowInfo: { flex: 1, marginRight: 8 },
  rowTitle: { color: "#fff", fontSize: 14, fontWeight: "600" },
  rowArtist: { color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 },

  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    marginTop: -60,
  },
  emptyIconGlass: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: GLASS_BG_STRONG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: { color: "#fff", fontSize: 16, fontWeight: "700", marginBottom: 6 },
  emptySubtitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
});

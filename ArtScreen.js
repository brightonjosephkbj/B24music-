import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import {
  fetchArticRandomPage,
  searchArtic,
  searchMet,
  searchCommons,
  searchAllSources,
} from "./artApi";
import ImageViewer from "./ImageViewer";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const ACCENT = "#F7B2C4"; // Art tile accent from the Glass Drawer
const GRID_GAP = 4;
const COLUMNS = 3;
const TILE_SIZE = (SCREEN_WIDTH - GRID_GAP * (COLUMNS + 1)) / COLUMNS;

const GLASS_BG = "rgba(255,255,255,0.14)";
const GLASS_BORDER = "rgba(255,255,255,0.25)";

const SOURCE_CHIPS = [
  { key: "all", label: "All" },
  { key: "artic", label: "Art Institute" },
  { key: "met", label: "The Met" },
  { key: "commons", label: "Commons" },
];

// onBack lets the drawer/nav return to Home, matching NewsScreen's pattern.
export default function ArtScreen({ onBack }) {
  const [query, setQuery] = useState("");
  const [activeSource, setActiveSource] = useState("all");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [searchMode, setSearchMode] = useState(false); // true once a search has been submitted

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const seenIds = useRef(new Set());

  const dedupeAppend = (existing, incoming) => {
    const fresh = incoming.filter((item) => !seenIds.current.has(item.id));
    fresh.forEach((item) => seenIds.current.add(item.id));
    return [...existing, ...fresh];
  };

  // Default landing content: random Art Institute batch, refreshed with a
  // new random page every time you scroll near the bottom.
  const loadRandomBatch = useCallback(async (isInitial) => {
    try {
      if (isInitial) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      const batch = await fetchArticRandomPage(24);
      setItems((prev) => (isInitial ? (seenIds.current = new Set(batch.map((b) => b.id)), batch) : dedupeAppend(prev, batch)));
    } catch (err) {
      setError(err.message || "Couldn't load artworks");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    loadRandomBatch(true);
  }, [loadRandomBatch]);

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    try {
      setLoading(true);
      setError(null);
      setSearchMode(true);
      let results;
      if (activeSource === "all") results = await searchAllSources(q, 24);
      else if (activeSource === "artic") results = await searchArtic(q, 24);
      else if (activeSource === "met") results = await searchMet(q, 24);
      else results = await searchCommons(q, 24);
      seenIds.current = new Set(results.map((r) => r.id));
      setItems(results);
    } catch (err) {
      setError(err.message || "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const clearSearch = () => {
    setQuery("");
    setSearchMode(false);
    loadRandomBatch(true);
  };

  const onEndReached = () => {
    // Search results are a fixed batch - these three endpoints don't
    // support offset/paging, so infinite scroll only applies to the
    // random default feed where a fresh page is always available.
    if (!searchMode && !loadingMore && !loading) {
      loadRandomBatch(false);
    }
  };

  const displayedItems = activeSource === "all" ? items : items.filter((i) => i.source === activeSource);

  const openViewer = (index) => {
    setViewerIndex(index);
    setViewerVisible(true);
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Art</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search paintings, artists, eras..."
          placeholderTextColor="rgba(255,255,255,0.4)"
          style={styles.searchInput}
          onSubmitEditing={runSearch}
          returnKeyType="search"
        />
        {searchMode && (
          <TouchableOpacity onPress={clearSearch} style={styles.clearButton}>
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        data={SOURCE_CHIPS}
        keyExtractor={(c) => c.key}
        renderItem={({ item: chip }) => {
          const active = chip.key === activeSource;
          return (
            <TouchableOpacity
              onPress={() => setActiveSource(chip.key)}
              style={[styles.chip, active && { backgroundColor: ACCENT, borderColor: ACCENT }]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{chip.label}</Text>
            </TouchableOpacity>
          );
        }}
      />

      {loading && <ActivityIndicator color="#fff" style={{ marginTop: 30 }} />}

      {!loading && error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => loadRandomBatch(true)} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && !error && (
        <FlatList
          data={displayedItems}
          keyExtractor={(item) => item.id}
          numColumns={COLUMNS}
          contentContainerStyle={styles.grid}
          onEndReachedThreshold={0.6}
          onEndReached={onEndReached}
          ListFooterComponent={loadingMore ? <ActivityIndicator color="#fff" style={{ marginVertical: 16 }} /> : null}
          renderItem={({ item, index }) => (
            <TouchableOpacity style={styles.tile} onPress={() => openViewer(index)}>
              <Image source={{ uri: item.thumbnail }} style={styles.tileImage} />
            </TouchableOpacity>
          )}
        />
      )}

      <ImageViewer
        visible={viewerVisible}
        images={displayedItems}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 12,
  },
  backButton: { width: 60 },
  backText: { color: "#fff", fontWeight: "600" },
  title: { color: "#fff", fontSize: 20, fontWeight: "700" },

  searchRow: { flexDirection: "row", paddingHorizontal: 20, marginBottom: 12, gap: 8 },
  searchInput: {
    flex: 1, borderWidth: 1, borderColor: GLASS_BORDER, backgroundColor: GLASS_BG,
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: "#fff",
  },
  clearButton: { justifyContent: "center", paddingHorizontal: 12 },
  clearButtonText: { color: ACCENT, fontWeight: "600" },

  chipRow: { paddingLeft: 20, marginBottom: 10, flexGrow: 0 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, backgroundColor: GLASS_BG,
    borderWidth: 1, borderColor: GLASS_BORDER, marginRight: 8,
  },
  chipText: { color: "#fff", fontWeight: "600", fontSize: 12 },
  chipTextActive: { color: "#2b1420" },

  grid: { paddingHorizontal: GRID_GAP, paddingBottom: 150 },
  tile: { width: TILE_SIZE, height: TILE_SIZE, margin: GRID_GAP / 2 },
  tileImage: { width: "100%", height: "100%", backgroundColor: GLASS_BG },

  errorBox: { alignItems: "center", marginTop: 30 },
  errorText: { color: "#fff", marginBottom: 10 },
  retryButton: { backgroundColor: GLASS_BG, borderWidth: 1, borderColor: GLASS_BORDER, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 },
  retryText: { color: "#fff", fontWeight: "700" },
});

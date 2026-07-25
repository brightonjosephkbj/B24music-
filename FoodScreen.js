import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
  ScrollView,
  RefreshControl,
  Modal,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { CameraView, useCameraPermissions } from "expo-camera";
import { searchFood, fetchRandomFoodCards, getByBarcode, nutriscoreColor } from "./foodApi";

const ACCENT = "#FF6B6B"; // Food tile accent from the Glass Drawer
const GLASS_BG = "rgba(255,255,255,0.14)";
const GLASS_BORDER = "rgba(255,255,255,0.25)";

// Open Food Facts (and this app's proxy of it) isn't always consistent about
// field naming across endpoints, so these helpers check a couple of the
// common variants rather than assuming one exact shape.
function productName(p) {
  return p.product_name || p.name || "Unknown product";
}
function productBrand(p) {
  return p.brands || p.brand || "";
}
function productImage(p) {
  return p.image_url || p.image_front_url || p.image || null;
}
function productGrade(p) {
  return p.nutriscore_grade || p.nutriscore || p.grade || null;
}
function productNutriments(p) {
  return p.nutriments || p.nutrition || {};
}
function nutrientValue(nut, keys) {
  for (const k of keys) {
    if (nut[k] !== undefined && nut[k] !== null) return nut[k];
  }
  return null;
}

// onBack matches News/Art/Weather/Trivia's drawer pattern.
export default function FoodScreen({ onBack }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const scanLockRef = useRef(false);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState(null); // null = browsing, array once searched
  const [searchError, setSearchError] = useState(null);

  const [randomCards, setRandomCards] = useState([]);
  const [randomLoading, setRandomLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Selected product drives "detail mode" - when set, the tile grid is
  // replaced entirely by one well-organized card (per spec: scanning or
  // tapping a tile makes the tiles disappear in favor of a single card).
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  const loadRandomBatch = useCallback(async () => {
    setRandomLoading(true);
    try {
      const cards = await fetchRandomFoodCards(6);
      setRandomCards(cards);
    } finally {
      setRandomLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRandomBatch();
  }, [loadRandomBatch]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRandomBatch();
    setRefreshing(false);
  };

  const runSearch = async () => {
    const q = query.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    try {
      setSearching(true);
      setSearchError(null);
      const results = await searchFood(q, 12);
      setSearchResults(results);
    } catch (err) {
      setSearchError(err.message || "Search failed");
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setQuery("");
    setSearchResults(null);
    setSearchError(null);
  };

  const openScanner = async () => {
    if (!permission || !permission.granted) {
      const res = await requestPermission();
      if (!res.granted) return;
    }
    scanLockRef.current = false;
    setScanning(true);
  };

  const closeScanner = () => setScanning(false);

  // Guarded with scanLockRef so a single barcode in frame doesn't fire
  // this handler repeatedly per frame before the camera modal closes.
  const handleBarcodeScanned = async ({ data }) => {
    if (scanLockRef.current) return;
    scanLockRef.current = true;
    setScanning(false);
    setSelected(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const product = await getByBarcode(data);
      if (!product) {
        setDetailError(`No product found for barcode ${data}`);
      } else {
        setSelected(product);
      }
    } catch (err) {
      setDetailError(err.message || "Barcode lookup failed");
    } finally {
      setDetailLoading(false);
    }
  };

  const openDetail = (product) => {
    setDetailError(null);
    setSelected(product);
  };

  const closeDetail = () => {
    setSelected(null);
    setDetailError(null);
  };

  // ---- Detail mode: tiles gone, one organized card ----
  if (selected || detailLoading || detailError) {
    const nut = selected ? productNutriments(selected) : {};
    const grade = selected ? productGrade(selected) : null;
    const rows = [
      { label: "Energy", value: nutrientValue(nut, ["energy-kcal_100g", "energy-kcal", "energy_100g"]), unit: "kcal / 100g" },
      { label: "Fat", value: nutrientValue(nut, ["fat_100g", "fat"]), unit: "g / 100g" },
      { label: "Saturated Fat", value: nutrientValue(nut, ["saturated-fat_100g", "saturated_fat_100g"]), unit: "g / 100g" },
      { label: "Carbohydrates", value: nutrientValue(nut, ["carbohydrates_100g", "carbohydrates"]), unit: "g / 100g" },
      { label: "Sugars", value: nutrientValue(nut, ["sugars_100g", "sugars"]), unit: "g / 100g" },
      { label: "Fiber", value: nutrientValue(nut, ["fiber_100g", "fiber"]), unit: "g / 100g" },
      { label: "Protein", value: nutrientValue(nut, ["proteins_100g", "proteins"]), unit: "g / 100g" },
      { label: "Salt", value: nutrientValue(nut, ["salt_100g", "salt"]), unit: "g / 100g" },
    ].filter((r) => r.value !== null && r.value !== undefined);

    return (
      <View style={styles.root}>
        <LinearGradient colors={["#2b1414", "#4a1e1e"]} style={StyleSheet.absoluteFill} />

        <View style={styles.header}>
          <TouchableOpacity onPress={closeDetail} style={styles.backButton}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Food</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.detailScroll}>
          {detailLoading && <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />}
          {!!detailError && <Text style={styles.errorText}>{detailError}</Text>}

          {selected && (
            <View style={styles.detailCard}>
              {!!productImage(selected) ? (
                <Image source={{ uri: productImage(selected) }} style={styles.detailImage} resizeMode="cover" />
              ) : (
                <View style={[styles.detailImage, styles.tileImageFallback]} />
              )}

              <View style={styles.detailHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailName}>{productName(selected)}</Text>
                  {!!productBrand(selected) && <Text style={styles.detailBrand}>{productBrand(selected)}</Text>}
                </View>
                {!!grade && (
                  <View style={[styles.gradeBadge, { backgroundColor: nutriscoreColor(grade) }]}>
                    <Text style={styles.gradeBadgeText}>{String(grade).toUpperCase()}</Text>
                  </View>
                )}
              </View>

              <Text style={styles.sectionLabel}>Nutrition (per 100g)</Text>
              <View style={styles.nutrientGrid}>
                {rows.length === 0 && <Text style={styles.mutedText}>No nutrition data available.</Text>}
                {rows.map((r) => (
                  <View key={r.label} style={styles.nutrientCell}>
                    <Text style={styles.nutrientValue}>{r.value}</Text>
                    <Text style={styles.nutrientUnit}>{r.unit}</Text>
                    <Text style={styles.nutrientLabel}>{r.label}</Text>
                  </View>
                ))}
              </View>

              {!!selected.ingredients_text && (
                <>
                  <Text style={styles.sectionLabel}>Ingredients</Text>
                  <Text style={styles.ingredientsText}>{selected.ingredients_text}</Text>
                </>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  // ---- Browse mode: search bar + scan button + grid of cards ----
  const displayList = searchResults !== null ? searchResults : randomCards;

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#2b1414", "#4a1e1e"]} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Food</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Type a food..."
          placeholderTextColor="rgba(255,255,255,0.55)"
          style={styles.searchInput}
          onSubmitEditing={runSearch}
          returnKeyType="search"
        />
        {searchResults !== null ? (
          <TouchableOpacity onPress={clearSearch} style={styles.actionButton}>
            <Text style={styles.actionButtonText}>Clear</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={runSearch} style={styles.actionButton}>
            <Text style={styles.actionButtonText}>{searching ? "..." : "Go"}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={openScanner} style={styles.scanButton}>
          <Text style={styles.actionButtonText}>Scan</Text>
        </TouchableOpacity>
      </View>

      {!!searchError && <Text style={styles.errorText}>{searchError}</Text>}

      <FlatList
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        data={displayList}
        numColumns={2}
        columnWrapperStyle={styles.row}
        keyExtractor={(item, i) => `${productName(item)}-${i}`}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.tile} onPress={() => openDetail(item)}>
            {!!productImage(item) ? (
              <Image source={{ uri: productImage(item) }} style={styles.tileImage} resizeMode="cover" />
            ) : (
              <View style={[styles.tileImage, styles.tileImageFallback]} />
            )}
            <Text style={styles.tileName} numberOfLines={2}>
              {productName(item)}
            </Text>
            {!!productBrand(item) && (
              <Text style={styles.tileBrand} numberOfLines={1}>
                {productBrand(item)}
              </Text>
            )}
            {!!productGrade(item) && (
              <View style={[styles.tileGrade, { backgroundColor: nutriscoreColor(productGrade(item)) }]}>
                <Text style={styles.tileGradeText}>{String(productGrade(item)).toUpperCase()}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
        ListHeaderComponent={
          <Text style={styles.sectionLabel}>{searchResults !== null ? "Results" : "Discover"}</Text>
        }
        ListEmptyComponent={
          randomLoading || searching ? (
            <ActivityIndicator color="#fff" style={{ marginTop: 30 }} />
          ) : (
            <Text style={styles.mutedText}>No foods found.</Text>
          )
        }
      />

      <Modal visible={scanning} animationType="slide" onRequestClose={closeScanner}>
        <View style={styles.scannerRoot}>
          {permission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128"] }}
              onBarcodeScanned={handleBarcodeScanned}
            />
          ) : (
            <View style={styles.scannerPermissionBox}>
              <Text style={styles.mutedText}>Camera permission is needed to scan barcodes.</Text>
            </View>
          )}
          <View style={styles.scannerFrame} pointerEvents="none" />
          <TouchableOpacity onPress={closeScanner} style={styles.scannerCloseButton}>
            <Text style={styles.backText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backButton: { width: 60 },
  backText: { color: "#fff", fontWeight: "600" },
  title: { color: "#fff", fontSize: 20, fontWeight: "700" },

  searchRow: { flexDirection: "row", paddingHorizontal: 20, marginBottom: 6, gap: 8 },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    backgroundColor: GLASS_BG,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: "#fff",
  },
  actionButton: { justifyContent: "center", paddingHorizontal: 10 },
  actionButtonText: { color: "#fff", fontWeight: "700" },
  scanButton: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: ACCENT,
  },

  errorText: { color: "#fff", fontSize: 12, paddingHorizontal: 20, marginBottom: 8, opacity: 0.85 },
  mutedText: { color: "rgba(255,255,255,0.6)", fontSize: 13, textAlign: "center", marginTop: 10 },

  listContent: { paddingHorizontal: 20, paddingBottom: 150, paddingTop: 8 },
  sectionLabel: { color: "rgba(255,255,255,0.85)", fontWeight: "700", fontSize: 15, marginBottom: 10, marginTop: 6 },
  row: { justifyContent: "space-between" },

  tile: {
    width: "48%",
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 16,
    padding: 10,
    marginBottom: 14,
  },
  tileImage: { width: "100%", height: 90, borderRadius: 10, marginBottom: 8, backgroundColor: "rgba(255,255,255,0.08)" },
  tileImageFallback: { justifyContent: "center", alignItems: "center" },
  tileName: { color: "#fff", fontSize: 13, fontWeight: "700" },
  tileBrand: { color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2 },
  tileGrade: {
    alignSelf: "flex-start",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 6,
  },
  tileGradeText: { color: "#fff", fontSize: 11, fontWeight: "800" },

  // ---- Detail mode ----
  detailScroll: { paddingHorizontal: 20, paddingBottom: 150, paddingTop: 8 },
  detailCard: {
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 20,
    padding: 18,
  },
  detailImage: { width: "100%", height: 180, borderRadius: 14, marginBottom: 14, backgroundColor: "rgba(255,255,255,0.08)" },
  detailHeaderRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 6 },
  detailName: { color: "#fff", fontSize: 19, fontWeight: "800" },
  detailBrand: { color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 2 },
  gradeBadge: { width: 34, height: 34, borderRadius: 17, justifyContent: "center", alignItems: "center" },
  gradeBadgeText: { color: "#fff", fontSize: 15, fontWeight: "800" },

  nutrientGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 8 },
  nutrientCell: {
    width: "31%",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    marginBottom: 10,
  },
  nutrientValue: { color: "#fff", fontSize: 16, fontWeight: "800" },
  nutrientUnit: { color: "rgba(255,255,255,0.6)", fontSize: 9, marginTop: 1 },
  nutrientLabel: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 4, textAlign: "center" },

  ingredientsText: { color: "rgba(255,255,255,0.85)", fontSize: 13, lineHeight: 19 },

  // ---- Scanner modal ----
  scannerRoot: { flex: 1, backgroundColor: "#000" },
  scannerPermissionBox: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 40 },
  scannerFrame: {
    position: "absolute",
    top: "35%",
    left: "12%",
    right: "12%",
    height: "20%",
    borderWidth: 2,
    borderColor: ACCENT,
    borderRadius: 16,
  },
  scannerCloseButton: {
    position: "absolute",
    top: 56,
    left: 20,
    backgroundColor: "rgba(20,20,25,0.7)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
});

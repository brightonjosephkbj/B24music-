import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import {
  pickRandomCities,
  geocodeSearch,
  fetchCurrentWeather,
  conditionTheme,
} from "./weatherApi";

const GLASS_BG = "rgba(255,255,255,0.16)";
const GLASS_BORDER = "rgba(255,255,255,0.3)";

// onBack matches NewsScreen/ArtScreen's drawer pattern.
export default function WeatherScreen({ onBack }) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState(null); // { place, weather }
  const [searchError, setSearchError] = useState(null);

  const [myLocation, setMyLocation] = useState(null); // { place, weather }
  const [locationError, setLocationError] = useState(null);
  const [locationLoading, setLocationLoading] = useState(true);

  const [randomCards, setRandomCards] = useState([]); // [{ place, weather }]
  const [randomLoading, setRandomLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ---- Your own location, drives the default background ----
  const loadMyLocation = useCallback(async () => {
    try {
      setLocationLoading(true);
      setLocationError(null);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationError("Location permission denied");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const weather = await fetchCurrentWeather(pos.coords.latitude, pos.coords.longitude);
      setMyLocation({
        place: { name: "Your Location", country: "", latitude: pos.coords.latitude, longitude: pos.coords.longitude },
        weather,
      });
    } catch (err) {
      setLocationError(err.message || "Couldn't get your location");
    } finally {
      setLocationLoading(false);
    }
  }, []);

  // ---- Random city batch ----
  const loadRandomBatch = useCallback(async () => {
    setRandomLoading(true);
    const cities = pickRandomCities(6);
    const results = await Promise.allSettled(
      cities.map(async (place) => ({
        place,
        weather: await fetchCurrentWeather(place.latitude, place.longitude),
      }))
    );
    setRandomCards(results.filter((r) => r.status === "fulfilled").map((r) => r.value));
    setRandomLoading(false);
  }, []);

  useEffect(() => {
    loadMyLocation();
    loadRandomBatch();
  }, [loadMyLocation, loadRandomBatch]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadMyLocation(), loadRandomBatch()]);
    setRefreshing(false);
  };

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    try {
      setSearching(true);
      setSearchError(null);
      const results = await geocodeSearch(q);
      const place = results[0];
      if (!place) {
        setSearchError("No place found with that name");
        setSearchResult(null);
        return;
      }
      const weather = await fetchCurrentWeather(place.latitude, place.longitude);
      setSearchResult({ place, weather });
    } catch (err) {
      setSearchError(err.message || "Search failed");
      setSearchResult(null);
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setQuery("");
    setSearchResult(null);
    setSearchError(null);
  };

  // Background always follows whichever city is "focused": the searched
  // place while a search is active, otherwise your own location.
  const focused = searchResult || myLocation;
  const theme = focused ? conditionTheme(focused.weather.weather_code) : conditionTheme(null);

  const renderCard = ({ item, pinned }) => (
    <View style={[styles.card, pinned && styles.cardPinned]}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.cardPlace}>{item.place.name}</Text>
          {!!item.place.country && <Text style={styles.cardCountry}>{item.place.country}</Text>}
        </View>
        <Text style={styles.cardGlyph}>{conditionTheme(item.weather.weather_code).glyph}</Text>
      </View>
      <Text style={styles.cardTemp}>{Math.round(item.weather.temperature_c)}\u00b0C</Text>
      <Text style={styles.cardCondition}>{item.weather.condition}</Text>
      <View style={styles.cardMetaRow}>
        <Text style={styles.cardMetaText}>Feels {Math.round(item.weather.feels_like_c)}\u00b0</Text>
        <Text style={styles.cardMetaText}>{item.weather.humidity_pct}% humidity</Text>
        <Text style={styles.cardMetaText}>{Math.round(item.weather.wind_speed_kmh)} km/h</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <LinearGradient colors={theme.colors} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />

      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Weather</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search a place..."
          placeholderTextColor="rgba(255,255,255,0.55)"
          style={styles.searchInput}
          onSubmitEditing={runSearch}
          returnKeyType="search"
        />
        {searchResult ? (
          <TouchableOpacity onPress={clearSearch} style={styles.clearButton}>
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={runSearch} style={styles.clearButton}>
            <Text style={styles.clearButtonText}>{searching ? "..." : "Go"}</Text>
          </TouchableOpacity>
        )}
      </View>

      {!!searchError && <Text style={styles.errorText}>{searchError}</Text>}

      <FlatList
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        data={randomCards}
        keyExtractor={(item, i) => `${item.place.name}-${i}`}
        renderItem={({ item }) => renderCard({ item, pinned: false })}
        ListHeaderComponent={
          <View>
            {searchResult && renderCard({ item: searchResult, pinned: true })}

            {locationLoading ? (
              <ActivityIndicator color="#fff" style={{ marginVertical: 16 }} />
            ) : locationError ? (
              <Text style={styles.errorText}>{locationError} - showing a general background instead.</Text>
            ) : (
              myLocation && renderCard({ item: myLocation, pinned: true })
            )}

            <Text style={styles.sectionLabel}>Around the world</Text>
          </View>
        }
        ListFooterComponent={randomLoading ? <ActivityIndicator color="#fff" style={{ marginVertical: 16 }} /> : null}
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

  searchRow: { flexDirection: "row", paddingHorizontal: 20, marginBottom: 6, gap: 8 },
  searchInput: {
    flex: 1, borderWidth: 1, borderColor: GLASS_BORDER, backgroundColor: GLASS_BG,
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: "#fff",
  },
  clearButton: { justifyContent: "center", paddingHorizontal: 14 },
  clearButtonText: { color: "#fff", fontWeight: "700" },

  errorText: { color: "#fff", fontSize: 12, paddingHorizontal: 20, marginBottom: 8, opacity: 0.85 },

  listContent: { paddingHorizontal: 20, paddingBottom: 150, paddingTop: 8 },
  sectionLabel: { color: "rgba(255,255,255,0.85)", fontWeight: "700", fontSize: 15, marginBottom: 10, marginTop: 6 },

  card: {
    backgroundColor: GLASS_BG, borderWidth: 1, borderColor: GLASS_BORDER,
    borderRadius: 18, padding: 18, marginBottom: 14,
  },
  cardPinned: { borderColor: "rgba(255,255,255,0.5)", borderWidth: 1.5 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardPlace: { color: "#fff", fontSize: 17, fontWeight: "700" },
  cardCountry: { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 2 },
  cardGlyph: { fontSize: 26 },
  cardTemp: { color: "#fff", fontSize: 34, fontWeight: "800", marginTop: 6 },
  cardCondition: { color: "rgba(255,255,255,0.9)", fontSize: 14, marginTop: 2, marginBottom: 12 },
  cardMetaRow: { flexDirection: "row", justifyContent: "space-between" },
  cardMetaText: { color: "rgba(255,255,255,0.75)", fontSize: 11 },
});

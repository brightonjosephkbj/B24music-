import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Share,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { WebView } from "react-native-webview";

import { gatewayHeaders } from "./apiClient";

const API_BASE = "https://gateway-cah4.onrender.com";
const ACCENT = "#6BCB77"; // News tile accent from the Glass Drawer

const CATEGORIES = ["general", "world", "business", "technology", "sports", "entertainment"];

const GLASS_BG = "rgba(255,255,255,0.14)";
const GLASS_BORDER = "rgba(255,255,255,0.25)";

function timeAgo(iso) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Routes an article URL through DuckDuckGo's link-redirect endpoint -
// same mechanism DDG itself uses to strip tracking params before landing
// on the real page. Opened in an in-app WebView instead of the system browser.
function toDuckDuckGoRedirect(url) {
  return `https://duckduckgo.com/l/?uddg=${encodeURIComponent(url)}`;
}

export default function NewsScreen({ onBack }) {
  const [category, setCategory] = useState("general");
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeUrl, setActiveUrl] = useState(null); // article currently open in WebView
  const [useFallback, setUseFallback] = useState(false); // true once DDG redirect fails to load

  const fetchHeadlines = async (cat) => {
    try {
      setError(null);
      const params = new URLSearchParams({ limit: "20" });
      if (cat && cat !== "general") params.set("category", cat);
      const res = await fetch(`${API_BASE}/api/apicache/api/news/headlines?${params.toString()}`, { headers: gatewayHeaders() });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();
      setArticles(data.articles || []);
    } catch (err) {
      setError(err.message || "Couldn't load headlines");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchHeadlines(category);
  }, [category]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchHeadlines(category);
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#1a1a1a", "#0d2b1f"]} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>News</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {CATEGORIES.map((cat) => {
          const active = cat === category;
          return (
            <TouchableOpacity
              key={cat}
              onPress={() => setCategory(cat)}
              style={[styles.chip, active && { backgroundColor: ACCENT, borderColor: ACCENT }]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      >
        {loading && <ActivityIndicator color="#fff" style={{ marginTop: 30 }} />}

        {!loading && error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => fetchHeadlines(category)} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !error && articles.length === 0 && (
          <Text style={styles.emptyText}>No headlines right now — try another category.</Text>
        )}

        {!loading &&
          !error &&
          articles.map((a, i) => {
            const openArticle = () => {
              if (a.url) {
                setUseFallback(false);
                setActiveUrl(a.url);
              }
            };
            return (
              <View key={`${a.url}-${i}`} style={styles.post}>
                {/* Source row */}
                <View style={styles.postSourceRow}>
                  <View style={styles.postAvatar}>
                    <Text style={styles.postAvatarText}>
                      {(a.source || "?").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.postSourceName} numberOfLines={1}>{a.source}</Text>
                </View>

                {/* Full-width image, tap to open article */}
                <TouchableOpacity activeOpacity={0.9} onPress={openArticle}>
                  {a.image ? (
                    <Image source={{ uri: a.image }} style={styles.postImage} />
                  ) : (
                    <View style={[styles.postImage, styles.postImageFallback]}>
                      <Text style={styles.cardImageFallbackText}>{a.source || "News"}</Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* Caption */}
                <TouchableOpacity onPress={openArticle}>
                  <Text numberOfLines={2} style={styles.postCaption}>{a.title}</Text>
                </TouchableOpacity>

                {/* Meta row: time + provider, then like/share */}
                <View style={styles.postMetaRow}>
                  <Text style={styles.postMetaText}>
                    {timeAgo(a.published_at)} · {a.provider || "web"}
                  </Text>
                  <View style={styles.postActions}>
                    <Text style={styles.postActionIcon}>♡</Text>
                    <TouchableOpacity
                      onPress={() => a.url && Share.share({ message: a.title, url: a.url })}
                    >
                      <Text style={styles.postActionIcon}>⇪</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })}
      </ScrollView>

      {/* In-app article viewer, routed through DuckDuckGo's redirect */}
      <Modal visible={!!activeUrl} animationType="slide" onRequestClose={() => setActiveUrl(null)}>
        <View style={styles.webviewRoot}>
          <View style={styles.webviewHeader}>
            <TouchableOpacity
              onPress={() => {
                setActiveUrl(null);
                setUseFallback(false);
              }}
              style={styles.backButton}
            >
              <Text style={styles.backText}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.webviewBadge}>{useFallback ? "Direct" : "via DuckDuckGo"}</Text>
          </View>
          {activeUrl && (
            <WebView
              source={{ uri: useFallback ? activeUrl : toDuckDuckGoRedirect(activeUrl) }}
              startInLoadingState
              renderLoading={() => <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />}
              onError={() => setUseFallback(true)}
              onHttpError={() => setUseFallback(true)}
            />
          )}
        </View>
      </Modal>
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

  chipRow: { paddingLeft: 20, marginBottom: 14, flexGrow: 0 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: GLASS_BG,
    borderWidth: 1, borderColor: GLASS_BORDER, marginRight: 10,
  },
  chipText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  chipTextActive: { color: "#0d2b1f" },

  list: { paddingHorizontal: 20, paddingBottom: 150 },

  post: { marginBottom: 6, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.1)", paddingBottom: 4, marginHorizontal: -20 },
  postSourceRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 10 },
  postAvatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: GLASS_BG,
    justifyContent: "center", alignItems: "center", marginRight: 10,
  },
  postAvatarText: { color: ACCENT, fontWeight: "700", fontSize: 12 },
  postSourceName: { color: "#fff", fontWeight: "600", fontSize: 14, flexShrink: 1 },
  postImage: { width: "100%", height: 210 },
  postImageFallback: { justifyContent: "center", alignItems: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  cardImageFallbackText: { color: "rgba(255,255,255,0.6)", fontSize: 13, textAlign: "center" },
  postCaption: { color: "#fff", fontSize: 15, lineHeight: 20, paddingHorizontal: 20, paddingTop: 12 },
  postMetaRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 12,
  },
  postMetaText: { color: "rgba(255,255,255,0.5)", fontSize: 12 },
  postActions: { flexDirection: "row", gap: 18 },
  postActionIcon: { color: "rgba(255,255,255,0.7)", fontSize: 18 },

  errorBox: { alignItems: "center", marginTop: 30 },
  errorText: { color: "#fff", marginBottom: 10 },
  retryButton: { backgroundColor: GLASS_BG, borderWidth: 1, borderColor: GLASS_BORDER, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 },
  retryText: { color: "#fff", fontWeight: "700" },
  emptyText: { color: "rgba(255,255,255,0.6)", textAlign: "center", marginTop: 30 },

  webviewRoot: { flex: 1, backgroundColor: "#000" },
  webviewHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 12, backgroundColor: "#0d2b1f",
  },
  webviewBadge: { color: ACCENT, fontSize: 12, fontWeight: "600" },
});

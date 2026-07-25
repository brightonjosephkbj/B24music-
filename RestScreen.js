import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const GLASS_BG = "rgba(255,255,255,0.14)";
const GLASS_BORDER = "rgba(255,255,255,0.25)";

// The 5 backend routes "The Rest" bundles (per HomeScreen's comment):
// space.py, wiki.py, commons.py, met.py, flights.py - all registered in
// app.py but none wired to a screen yet. Each gets its own accent so the
// sub-menu doesn't feel flat.
const CATEGORIES = [
  { key: "space", label: "Space", accent: "#5B8DEF", blurb: "NASA imagery, APOD, launches" },
  { key: "wiki", label: "Wikipedia", accent: "#8E8E93", blurb: "Search and article summaries" },
  { key: "commons", label: "Commons", accent: "#F7B2C4", blurb: "Wikimedia Commons media search" },
  { key: "met", label: "The Met", accent: "#D4AF37", blurb: "Metropolitan Museum art search" },
  { key: "flights", label: "Flights", accent: "#4ECDC4", blurb: "Live flight tracking" },
];

// onBack matches the other drawer screens (News/Art/Weather/Trivia/Jokes/Food).
export default function RestScreen({ onBack }) {
  const [activeCategory, setActiveCategory] = useState(null); // null = menu, else CATEGORIES[i].key

  const category = CATEGORIES.find((c) => c.key === activeCategory);

  // ---- Category detail (placeholder until its backend route is confirmed) ----
  if (category) {
    return (
      <View style={styles.root}>
        <LinearGradient colors={["#14171f", "#232838"]} style={StyleSheet.absoluteFill} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setActiveCategory(null)} style={styles.backButton}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{category.label}</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.content}>
          <View style={[styles.placeholderCard, { borderColor: category.accent }]}>
            <Text style={styles.placeholderTitle}>Not wired up yet</Text>
            <Text style={styles.placeholderBody}>
              This screen needs its backend route's response shape confirmed before it can
              fetch real data - same reason FoodScreen guesses at field names defensively.
              Share {category.key}.py and this gets built for real.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  // ---- Sub-menu: the 5 categories bundled under "The Rest" ----
  return (
    <View style={styles.root}>
      <LinearGradient colors={["#14171f", "#232838"]} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>The Rest</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c.key}
            style={[styles.row, { borderLeftColor: c.accent }]}
            onPress={() => setActiveCategory(c.key)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{c.label}</Text>
              <Text style={styles.rowBlurb}>{c.blurb}</Text>
            </View>
            <Text style={styles.rowChevron}>{"\u203a"}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
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

  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 150 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderLeftWidth: 3,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  rowLabel: { color: "#fff", fontSize: 16, fontWeight: "700" },
  rowBlurb: { color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 3 },
  rowChevron: { color: "rgba(255,255,255,0.5)", fontSize: 20, marginLeft: 8 },

  placeholderCard: {
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
  },
  placeholderTitle: { color: "#fff", fontSize: 16, fontWeight: "700", marginBottom: 8 },
  placeholderBody: { color: "rgba(255,255,255,0.75)", fontSize: 13, lineHeight: 19 },
});

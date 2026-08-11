import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH - 40;
const CARD_SPACING = 16;
const CARD_HEIGHT = 420;

export const CATEGORY_PALETTES = {
  trending: { colors: ["#DFF7FF", "#7FCDFF"], textColor: "#0b2b3a" },
  new: { colors: ["#E7D8FF", "#B8C0FF"], textColor: "#241b42" },
  topSongs: { colors: ["#DFF7FF", "#FFD3B6"], textColor: "#3a2a1b" },
};

function CategoryCard({ label, palette, tracks, onTrackPress }) {
  return (
    <View style={[styles.card, { width: CARD_WIDTH, marginRight: CARD_SPACING }]}>
      <LinearGradient
        colors={palette.colors}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <Text style={[styles.cardLabel, { color: palette.textColor }]}>{label}</Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.trackList}>
        {tracks.length === 0 ? (
          <Text style={[styles.emptyText, { color: palette.textColor }]}>Nothing here yet.</Text>
        ) : (
          tracks.map((track) => (
            <TouchableOpacity
              key={`${track.provider}-${track.id}`}
              style={styles.glassRow}
              onPress={() => onTrackPress && onTrackPress(track, tracks)}
              activeOpacity={0.85}
            >
              <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
              <Image source={track.artwork ? { uri: track.artwork } : undefined} style={styles.rowArt} />
              <View style={styles.rowTextWrap}>
                <Text numberOfLines={1} style={[styles.rowTitle, { color: palette.textColor }]}>
                  {track.title}
                </Text>
                <Text numberOfLines={1} style={[styles.rowArtist, { color: palette.textColor }]}>
                  {track.artist}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

export default function HomeCategorySwiper({ categories, onTrackPress }) {
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = (e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / (CARD_WIDTH + CARD_SPACING));
    if (idx !== activeIndex && idx >= 0 && idx < categories.length) setActiveIndex(idx);
  };

  return (
    <View>
      <ScrollView
        horizontal
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + CARD_SPACING}
        snapToAlignment="start"
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingRight: 20 }}
      >
        {categories.map((cat) => (
          <CategoryCard
            key={cat.key}
            label={cat.label}
            palette={CATEGORY_PALETTES[cat.key] || CATEGORY_PALETTES.trending}
            tracks={cat.tracks}
            onTrackPress={onTrackPress}
          />
        ))}
      </ScrollView>

      <View style={styles.dotsRow}>
        {categories.map((cat, i) => (
          <View key={cat.key} style={[styles.dot, i === activeIndex && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: CARD_HEIGHT,
    borderRadius: 26,
    overflow: "hidden",
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  cardLabel: { fontSize: 18, fontWeight: "800", marginBottom: 12 },
  trackList: { paddingBottom: 8 },
  emptyText: { fontSize: 13, opacity: 0.7, marginTop: 20, textAlign: "center" },

  glassRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    padding: 8,
    marginBottom: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
  },
  rowArt: { width: 44, height: 44, borderRadius: 8, marginRight: 10, backgroundColor: "rgba(255,255,255,0.3)" },
  rowTextWrap: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: "700" },
  rowArtist: { fontSize: 12, marginTop: 2, opacity: 0.8 },

  dotsRow: { flexDirection: "row", justifyContent: "center", marginTop: 12, gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.4)" },
  dotActive: { backgroundColor: "#fff", width: 18 },
});

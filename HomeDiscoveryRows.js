import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getPlaylists, getDownloads } from "./libraryStorage";
import { getListeningHistory } from "./listeningHistory";
import { API_BASE, gatewayHeaders } from "./apiClient";

// ---------------------------------------------------------------------------
// Five self-contained horizontal discovery rows for Home. Each loads its own
// data and renders nothing (returns null) if it has nothing worth showing -
// no empty-state clutter on a screen people scroll through quickly.
// ---------------------------------------------------------------------------
const CANDY_BLUE = "#B2D5E5";
const GLASS_BG = "rgba(178,213,229,0.10)";
const GLASS_BORDER = "rgba(178,213,229,0.28)";

const styles = StyleSheet.create({
  section: { marginTop: 22 },
  sectionTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  row: { paddingHorizontal: 20, paddingRight: 8 },
  card: {
    width: 128,
    marginRight: 12,
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 14,
    padding: 8,
  },
  art: {
    width: "100%",
    height: 96,
    borderRadius: 10,
    backgroundColor: "rgba(178,213,229,0.15)",
    marginBottom: 8,
  },
  artFallback: { alignItems: "center", justifyContent: "center" },
  cardTitle: { color: "#fff", fontSize: 13, fontWeight: "600" },
  cardSubtitle: { color: "rgba(255,255,255,0.55)", fontSize: 11, marginTop: 2 },
});

function Card({ art, fallbackIcon, title, subtitle, onPress }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {art ? (
        <Image source={{ uri: art }} style={styles.art} />
      ) : (
        <View style={[styles.art, styles.artFallback]}>
          <Ionicons name={fallbackIcon || "musical-notes"} size={22} color={CANDY_BLUE} />
        </View>
      )}
      <Text numberOfLines={1} style={styles.cardTitle}>{title}</Text>
      {!!subtitle && (
        <Text numberOfLines={1} style={styles.cardSubtitle}>{subtitle}</Text>
      )}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Your Playlists - purely on-device, no network. Tapping a playlist plays
// its tracks straight away (resolved against downloads by id) rather than
// just switching tabs, matching the "tap a row to play" pattern everywhere
// else in the app.
// ---------------------------------------------------------------------------
export function PlaylistsRow({ onTrackPress }) {
  const [playlists, setPlaylists] = useState([]);
  const [downloads, setDownloads] = useState([]);

  useEffect(() => {
    Promise.all([getPlaylists(), getDownloads()]).then(([p, d]) => {
      setPlaylists(p.filter((pl) => pl.trackIds && pl.trackIds.length > 0));
      setDownloads(d);
    });
  }, []);

  if (playlists.length === 0) return null;

  const handlePlay = (playlist) => {
    const byId = new Map(downloads.map((d) => [d.id, d]));
    const queue = playlist.trackIds.map((id) => byId.get(id)).filter(Boolean);
    if (queue.length > 0) onTrackPress && onTrackPress(queue[0], queue);
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Your Playlists</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {playlists.map((p) => (
          <Card
            key={p.id}
            art={p.art}
            fallbackIcon="albums"
            title={p.name}
            subtitle={`${p.trackIds.length} track${p.trackIds.length === 1 ? "" : "s"}`}
            onPress={() => handlePlay(p)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Because You Played [artist] - reuses the same lastfm/similar endpoint
// PlayerCard's Related panel already calls. No artwork comes back from that
// endpoint, so cards use a fallback icon; tapping resolves a playable match
// via a quick search, same as PlayerCard.playRelated().
// ---------------------------------------------------------------------------
export function SimilarRow({ onTrackPress }) {
  const [seedArtist, setSeedArtist] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const history = await getListeningHistory();
      const last = history[0];
      if (!last?.artist || !last?.title) {
        setLoading(false);
        return;
      }
      setSeedArtist(last.artist);
      const params = new URLSearchParams({ track: last.title, artist: last.artist });
      try {
        const res = await fetch(`${API_BASE}/api/apicache/api/music/lastfm/similar?${params.toString()}`, {
          headers: gatewayHeaders(),
        });
        const data = await res.json();
        if (!cancelled) setSimilar((data.similar || []).slice(0, 10));
      } catch {
        // silent - this row just won't render if it fails
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading || similar.length === 0) return null;

  const handlePlay = async (item) => {
    try {
      const params = new URLSearchParams({ q: `${item.artist} ${item.title}`, limit: "1" });
      const res = await fetch(`${API_BASE}/api/apicache/api/music/search?${params.toString()}`, {
        headers: gatewayHeaders(),
      });
      const data = await res.json();
      const found = data.tracks && data.tracks[0];
      if (found) onTrackPress && onTrackPress(found);
    } catch {
      // related tracks are a nice-to-have, not critical path
    }
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Because you played {seedArtist}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {similar.map((item, i) => (
          <Card
            key={`${item.artist}-${item.title}-${i}`}
            fallbackIcon="musical-notes"
            title={item.title}
            subtitle={item.artist}
            onPress={() => handlePlay(item)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Recently Added - what's new in your downloaded library, sorted by
// addedAt. Different axis than "Recently Played".
// ---------------------------------------------------------------------------
export function RecentlyAddedRow({ onTrackPress }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    getDownloads().then((d) => {
      const sorted = [...d].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
      setItems(sorted.slice(0, 10));
    });
  }, []);

  if (items.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Recently Added</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {items.map((track) => (
          <Card
            key={track.id}
            art={track.artwork}
            fallbackIcon={track.type === "video" ? "videocam" : "musical-notes"}
            title={track.title}
            subtitle={track.artist}
            onPress={() => onTrackPress && onTrackPress(track, items)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Your Artists - grouped from downloads, same grouping LibraryScreen's
// Artists tab uses. Only artists where at least one track has artwork are
// shown (no artist-image lookup exists on the backend yet - see planning
// notes). Tapping plays that artist's tracks as a queue.
// ---------------------------------------------------------------------------
export function ArtistsRow({ onTrackPress }) {
  const [artists, setArtists] = useState([]);

  useEffect(() => {
    getDownloads().then((d) => {
      const groups = d.reduce((acc, track) => {
        const key = track.artist || "Unknown Artist";
        acc[key] = acc[key] || [];
        acc[key].push(track);
        return acc;
      }, {});
      const withArt = Object.entries(groups)
        .map(([artist, tracks]) => ({
          artist,
          tracks,
          art: (tracks.find((t) => t.artwork) || {}).artwork || null,
        }))
        .filter((a) => a.art);
      setArtists(withArt.slice(0, 10));
    });
  }, []);

  if (artists.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Your Artists</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {artists.map((a) => (
          <Card
            key={a.artist}
            art={a.art}
            title={a.artist}
            subtitle={`${a.tracks.length} track${a.tracks.length === 1 ? "" : "s"}`}
            onPress={() => onTrackPress && onTrackPress(a.tracks[0], a.tracks)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Explore Podcasts - there's no dedicated podcast-trending endpoint yet, so
// this seeds a background search with a rotating topic and shows whatever
// comes back in the "podcast" category. A sampler, not real personalization
// - upgrade to a real trending endpoint is a backlog item.
// ---------------------------------------------------------------------------
const PODCAST_SEEDS = ["news", "comedy", "true crime", "technology", "sports"];

export function PodcastsRow({ onTrackPress }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const seed = PODCAST_SEEDS[Math.floor(Math.random() * PODCAST_SEEDS.length)];
    const params = new URLSearchParams({ q: seed });
    fetch(`${API_BASE}/api/apicache/api/music/search?${params.toString()}`, { headers: gatewayHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const podcasts = (data.categories && data.categories.podcast) || [];
        setItems(podcasts.slice(0, 10));
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  if (loading || items.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Explore Podcasts</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {items.map((track, i) => (
          <Card
            key={`${track.id || i}`}
            art={track.artwork}
            fallbackIcon="mic"
            title={track.title}
            subtitle={track.artist}
            onPress={() => onTrackPress && onTrackPress(track, items)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

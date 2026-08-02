import "react-native-gesture-handler"; // must be the very first import, before anything else

import React, { useState, useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import AppShell from "./AppShell";
import HomeScreen from "./HomeScreen";
import LibraryScreen from "./LibraryScreen";
import NewsScreen from "./NewsScreen";
import RestScreen from "./RestScreen";
import usePlaybackEngine from "./usePlaybackEngine";
import PlayerCard from "./PlayerCard";
import PasteUrlScreen from "./PasteUrlScreen";
import SearchScreen from "./SearchScreen";
import ArtScreen from "./ArtScreen";
import WeatherScreen from "./WeatherScreen";
import TriviaScreen from "./TriviaScreen";
import JokesScreen from "./JokesScreen";
import FoodScreen from "./FoodScreen";
import FullscreenVideoPlayer from "./FullscreenVideoPlayer";
import SettingsScreen from "./SettingsScreen";
import UpdatePrompt from "./UpdatePrompt";
import { checkForUpdate } from "./otaClient";

export default function App() {
  const [activeNav, setActiveNav] = useState("home");
  const [activeDrawerScreen, setActiveDrawerScreen] = useState(null); // e.g. "news"
  const [nowPlaying, setNowPlaying] = useState(null); // track object
  const [updateInfo, setUpdateInfo] = useState(null); // set once if /api/ota/check finds a newer version

  // Silent launch-time check against the custom OTA backend (ota.py) - not
  // expo-updates, since this app ships whole-APK replacements with its own
  // changelog/mandatory flag rather than JS-bundle-only patches. A failed
  // check (offline, backend down) is swallowed - it should never block
  // someone from using the app.
  useEffect(() => {
    checkForUpdate()
      .then((result) => {
        if (result.update_available) setUpdateInfo(result);
      })
      .catch(() => {});
  }, []);
  const [playerExpanded, setPlayerExpanded] = useState(false); // State A vs State B

  // The queue nowPlaying was picked from, plus its index in that queue.
  // Whatever screen starts playback (Home's trending row, Library, a search
  // result list, etc.) hands over the list it was showing so prev/next in
  // the mini nav and the expanded PlayerCard have something real to skip
  // through - not just the single track that happened to be tapped.
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);

  // Single playback engine instance, lifted here so both the mini
  // disc/video-box (in AppShell) and the expanded Player/full-screen video
  // share the exact same live player - never two separate instances of the
  // same track fighting each other.
  const engine = usePlaybackEngine(nowPlaying);

  const goToDrawerScreen = (key) => setActiveDrawerScreen(key);
  const backFromDrawerScreen = () => setActiveDrawerScreen(null);

  // sourceQueue is optional - pass the list a track was tapped from (e.g.
  // Home's displayedTracks) so prev/next can walk it. Omit it (e.g. a
  // related-track pick inside the expanded player) and it starts a fresh
  // single-track queue of just that one track.
  const playTrack = (track, sourceQueue) => {
    if (!track) return;
    const nextQueue = sourceQueue && sourceQueue.length ? sourceQueue : [track];
    const idx = nextQueue.findIndex(
      (t) => t.provider === track.provider && t.id === track.id
    );
    setQueue(nextQueue);
    setQueueIndex(idx === -1 ? 0 : idx);
    setNowPlaying(track);
    // Video tracks jump straight to full-screen per spec; audio tracks stay
    // collapsed to the mini disc until the user taps it.
    if (track?.type === "video") {
      setPlayerExpanded(true);
    }
  };

  // Play whatever's at a given queue index without touching the queue
  // itself - used by prev/next so they don't reset queue context every time.
  const playAtIndex = (idx) => {
    const track = queue[idx];
    if (!track) return;
    setQueueIndex(idx);
    setNowPlaying(track);
    if (track?.type === "video") {
      setPlayerExpanded(true);
    }
  };

  // Wrap around at both ends, like most music players. No-op if there's
  // no queue yet (nothing has been played).
  const nextTrack = () => {
    if (!queue.length) return;
    playAtIndex((queueIndex + 1) % queue.length);
  };
  const prevTrack = () => {
    if (!queue.length) return;
    playAtIndex((queueIndex - 1 + queue.length) % queue.length);
  };

  const expandPlayer = () => setPlayerExpanded(true);
  const collapsePlayer = () => setPlayerExpanded(false);

  let content;
  if (activeDrawerScreen === "news") {
    content = <NewsScreen onBack={backFromDrawerScreen} />;
  } else if (activeDrawerScreen === "rest") {
    content = <RestScreen onBack={backFromDrawerScreen} />;
  } else if (activeDrawerScreen === "art") {
    content = <ArtScreen onBack={backFromDrawerScreen} />;
  } else if (activeDrawerScreen === "weather") {
    content = <WeatherScreen onBack={backFromDrawerScreen} />;
  } else if (activeDrawerScreen === "trivia") {
    content = <TriviaScreen onBack={backFromDrawerScreen} />;
  } else if (activeDrawerScreen === "jokes") {
    content = <JokesScreen onBack={backFromDrawerScreen} />;
  } else if (activeDrawerScreen === "food") {
    content = <FoodScreen onBack={backFromDrawerScreen} />;
  } else if (activeDrawerScreen === "pasteUrl") {
    content = <PasteUrlScreen onTrackPress={playTrack} onBack={backFromDrawerScreen} />;
  } else if (activeNav === "home") {
    content = (
      <HomeScreen
        onTrackPress={playTrack}
        onDrawerTilePress={goToDrawerScreen}
        onSearchPress={() => setActiveNav("search")}
        onPasteLinkPress={() => goToDrawerScreen("pasteUrl")}
        onSettingsPress={() => setActiveNav("settings")}
        nowPlaying={nowPlaying}
      />
    );
  } else if (activeNav === "library") {
    content = <LibraryScreen onTrackPress={playTrack} onSearchPress={() => setActiveNav("search")} />;
  } else if (activeNav === "search") {
    content = <SearchScreen onTrackPress={playTrack} />;
  } else if (activeNav === "settings") {
    content = <SettingsScreen />;
  }

  const isVideo = nowPlaying?.type === "video";

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppShell
        activeNav={activeNav}
        onNavPress={setActiveNav}
        nowPlaying={nowPlaying}
        engine={engine}
        playerExpanded={playerExpanded}
        onExpandPress={expandPlayer}
        onCollapsePress={collapsePlayer}
        onSkipNext={nextTrack}
        onSkipPrev={prevTrack}
      >
        {content}
      </AppShell>

      {playerExpanded && nowPlaying && !isVideo && (
        <PlayerCard
          track={nowPlaying}
          engine={engine}
          onCollapse={collapsePlayer}
          onNext={nextTrack}
          onPrev={prevTrack}
          onPlayTrack={playTrack}
        />
      )}
      {playerExpanded && nowPlaying && isVideo && (
        <FullscreenVideoPlayer
            track={nowPlaying}
            engine={engine}
            onClose={collapsePlayer}
            onNext={nextTrack}
            onPrev={prevTrack}
          />
      )}

      {updateInfo && (
        <UpdatePrompt
          update={updateInfo}
          onDismiss={() => setUpdateInfo(null)}
        />
      )}

      <StatusBar style="light" />
    </GestureHandlerRootView>
  );
}

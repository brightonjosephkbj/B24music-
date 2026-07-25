import "react-native-gesture-handler"; // must be the very first import, before anything else

import React, { useState } from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import AppShell from "./AppShell";
import HomeScreen from "./HomeScreen";
import LibraryScreen from "./LibraryScreen";
import NewsScreen from "./NewsScreen";

// Placeholder screens for tabs we haven't built yet, so nav doesn't break.
function SearchScreen() {
  return null;
}
function SettingsScreen() {
  return null;
}

export default function App() {
  const [activeNav, setActiveNav] = useState("home");
  const [activeDrawerScreen, setActiveDrawerScreen] = useState(null); // e.g. "news"
  const [nowPlaying, setNowPlaying] = useState(null); // track object once Player exists

  const goToDrawerScreen = (key) => setActiveDrawerScreen(key);
  const backFromDrawerScreen = () => setActiveDrawerScreen(null);

  const playTrack = (track) => {
    setNowPlaying(track);
    // Player expansion (State A -> State B) wires in here once built.
  };

  let content;
  if (activeDrawerScreen === "news") {
    content = <NewsScreen onBack={backFromDrawerScreen} />;
  } else if (activeNav === "home") {
    content = (
      <HomeScreen
        onTrackPress={playTrack}
        onDrawerTilePress={goToDrawerScreen}
        onSearchPress={() => setActiveNav("search")}
        nowPlaying={nowPlaying}
      />
    );
  } else if (activeNav === "library") {
    content = <LibraryScreen onTrackPress={playTrack} onSearchPress={() => setActiveNav("search")} />;
  } else if (activeNav === "search") {
    content = <SearchScreen />;
  } else if (activeNav === "settings") {
    content = <SettingsScreen />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppShell
        activeNav={activeNav}
        onNavPress={setActiveNav}
        nowPlaying={nowPlaying}
        onDiscPress={() => {
          /* expand Player - State A -> State B, wires in once Player exists */
        }}
      >
        {content}
      </AppShell>
      <StatusBar style="light" />
    </GestureHandlerRootView>
  );
}

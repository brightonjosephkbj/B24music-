import { requestWidgetUpdate } from "react-native-android-widget";
import React from "react";
import { NowPlayingWidget } from "./NowPlayingWidget";

// Call this whenever nowPlaying or playback state changes (App.js) so the
// home screen widget reflects the current track and play/pause/progress.
// Safe to call even if the widget isn't currently placed on any home
// screen - requestWidgetUpdate() is a no-op in that case.
export async function updateNowPlayingWidget(track, playback = {}) {
  const { isPlaying = false, position = 0, duration = 0 } = playback;
  const progress = duration > 0 ? position / duration : 0;

  try {
    await requestWidgetUpdate({
      widgetName: "NowPlaying",
      renderWidget: () => (
        <NowPlayingWidget
          title={track?.title}
          artist={track?.artist}
          artwork={track?.artwork}
          isPlaying={isPlaying}
          position={position}
          duration={duration}
          progress={progress}
        />
      ),
    });
  } catch (err) {
    console.warn("Failed to update Now Playing widget:", err);
  }
}

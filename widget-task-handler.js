import React from "react";
import { NowPlayingWidget } from "./NowPlayingWidget";
import {
  togglePlayback,
  nextTrack,
  prevTrack,
  getPlaybackState,
} from "./playbackBridge";

// Called by the native widget host on install/update/resize/click events.
// Runs in the same JS engine as the app when the app process is alive
// (Android reuses it); if the process was killed, this boots a fresh
// headless JS context first, in which case playbackBridge's registered
// controls won't exist yet and the tap is effectively swallowed - the next
// tap after the app has had a moment to mount will work correctly.
function renderFromState(renderWidget) {
  const { track, isPlaying, position, duration } = getPlaybackState();
  const progress = duration > 0 ? position / duration : 0;
  renderWidget(
    <NowPlayingWidget
      title={track?.title}
      artist={track?.artist}
      artwork={track?.artwork}
      isPlaying={isPlaying}
      position={position}
      duration={duration}
      progress={progress}
    />
  );
}

export async function widgetTaskHandler(props) {
  switch (props.widgetAction) {
    case "WIDGET_ADDED":
    case "WIDGET_UPDATE":
    case "WIDGET_RESIZED":
      renderFromState(props.renderWidget);
      break;

    case "WIDGET_CLICK": {
      const action = props.clickAction;
      if (action === "TOGGLE_PLAY") togglePlayback();
      else if (action === "NEXT_TRACK") nextTrack();
      else if (action === "PREV_TRACK") prevTrack();
      // Re-render immediately with best-known state. If toggle/next/prev
      // triggered an async track load, App.js's own widget-update effect
      // will push the settled state moments later anyway.
      renderFromState(props.renderWidget);
      break;
    }

    case "WIDGET_DELETED":
      break;

    default:
      break;
  }
}

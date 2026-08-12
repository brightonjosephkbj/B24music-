import { MediaControl, PlaybackState, Command } from "expo-media-control";

// Lets the Android widget's headless click handler reach into the live
// playback engine, which otherwise only exists inside App.js's React tree.
// App.js registers real functions here on every render (see the useEffect
// there); widget-task-handler.js calls whatever's currently registered.
// If nothing's registered yet (app just cold-started from the widget tap
// itself, engine not mounted yet), calls are safely no-ops.

let controls = {
  toggle: () => {},
  next: () => {},
  prev: () => {},
  getState: () => ({ isPlaying: false, track: null, position: 0, duration: 0 }),
};

export function registerPlaybackControls(next) {
  controls = { ...controls, ...next };
  syncMediaControls();
}

export function togglePlayback() {
  controls.toggle();
}
export function nextTrack() {
  controls.next();
}
export function prevTrack() {
  controls.prev();
}
export function getPlaybackState() {
  return controls.getState();
}


// ---------------------------------------------------------------------------
// Lock screen / notification media controls (expo-media-control). Same idea
// as the widget bridge above: registers once, then every registerPlaybackControls()
// call (already happening every App.js render) pushes fresh state to the
// system media session - but only when something actually changed, since
// expo-media-control's own docs warn that calling updatePlaybackState too
// often fights its native progress animation.
// ---------------------------------------------------------------------------
let mediaControlsReady = false;
let lastTrackKey = null;
let lastIsPlaying = null;

function syncMediaControls() {
  if (!mediaControlsReady) return;
  const state = controls.getState();
  const track = state.track;
  const trackKey = track ? `${track.provider || ""}-${track.id}` : null;

  if (trackKey !== lastTrackKey) {
    lastTrackKey = trackKey;
    if (track) {
      MediaControl.updateMetadata({
        title: track.title || "Unknown title",
        artist: track.artist || "Unknown artist",
        artwork: track.artwork ? { uri: track.artwork } : undefined,
        duration: state.duration || 0,
      });
    }
  }

  if (state.isPlaying !== lastIsPlaying) {
    lastIsPlaying = state.isPlaying;
    MediaControl.updatePlaybackState(
      state.isPlaying ? PlaybackState.PLAYING : PlaybackState.PAUSED,
      state.position || 0
    );
  }
}

// Call once, on app mount (e.g. inside App.js's existing useEffect that
// already calls registerPlaybackControls). Safe to call more than once.
export async function initMediaControls() {
  if (mediaControlsReady) return;
  try {
    await MediaControl.enableMediaControls({
      capabilities: [Command.PLAY, Command.PAUSE, Command.NEXT_TRACK, Command.PREVIOUS_TRACK],
      compactCapabilities: [Command.PREVIOUS_TRACK, Command.PLAY, Command.NEXT_TRACK],
    });

    MediaControl.addListener((event) => {
      switch (event.command) {
        case Command.PLAY:
        case Command.PAUSE:
          togglePlayback();
          break;
        case Command.NEXT_TRACK:
          nextTrack();
          break;
        case Command.PREVIOUS_TRACK:
          prevTrack();
          break;
      }
    });

    mediaControlsReady = true;
  } catch (err) {
    console.warn("Failed to enable media controls:", err);
  }
}

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

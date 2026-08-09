// Thin bridge between the RNTP headless playback service (which runs even
// when the app is backgrounded/killed - see TrackPlayerService.js) and
// App.js's own queue logic (shuffle, wraparound, sourceQueue - all handled
// in JS state, not inside TrackPlayer's own queue). RNTP only ever holds
// ONE track at a time (see usePlaybackEngine.js), so TrackPlayer.skipToNext()
// would be a no-op - remote next/prev instead reach back into App.js's
// nextTrack()/prevTrack() through this module-level bridge.
let nextHandler = () => {};
let prevHandler = () => {};

export function setSkipHandlers(onNext, onPrev) {
  nextHandler = onNext || (() => {});
  prevHandler = onPrev || (() => {});
}

export function triggerRemoteNext() {
  nextHandler();
}

export function triggerRemotePrevious() {
  prevHandler();
}

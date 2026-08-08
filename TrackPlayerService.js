import TrackPlayer, { Event } from '@rntp/player';

// Runs as a headless task on Android (registered in index.js) so remote
// commands (lock screen, notification, headset buttons) work even when the
// app is backgrounded or killed. Kept deliberately dumb - just forwards
// each remote event straight into TrackPlayer's own queue methods, since
// TrackPlayer (not React state) is the source of truth for the active
// queue once a track starts playing. See usePlaybackEngine.js for how
// React state stays in sync via PlaybackActiveTrackChanged.
module.exports = async function () {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => {
    TrackPlayer.seekTo(position);
  });
};

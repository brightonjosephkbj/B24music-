import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from "expo-audio";
import { useVideoPlayer } from "expo-video";
import { useEvent } from "expo";
import { logPlay } from "./listeningHistory";

// ---------------------------------------------------------------------------
// Unified playback engine for both mp3 (expo-audio) and mp4 (expo-video).
//
// track shape expected: { type: "audio" | "video", localUri?, stream_url?,
// download_url? }. Source priority: a local downloaded file always wins over
// a remote stream URL, so playback keeps working offline once downloaded.
//
// IMPORTANT ARCHITECTURE NOTE: both useAudioPlayer(source) and
// useVideoPlayer(source, setup) only read their `source` argument on the
// very first render that creates the player - changing it on a later
// render does NOT reload the player. Since this hook is a single top-level
// instance shared across the whole app (App.js calls it once, tracks
// change over time), both players are created once with a null source,
// and every subsequent track change explicitly calls .replace()/
// videoPlayer.replace() - the documented, reliable way to swap what an
// already-created player is pointed at.
// ---------------------------------------------------------------------------

function resolveUri(track) {
  if (!track) return null;
  return track.localUri || track.stream_url || track.download_url || null;
}

const MIN_PLAY_SECONDS = 30;

// Configures the audio session once, app-wide, so playback survives the
// screen locking or the app backgrounding. Without this, expo-audio stops
// the moment the app loses focus - this was previously never called at all.
let audioModeConfigured = false;
async function ensureAudioMode() {
  if (audioModeConfigured) return;
  audioModeConfigured = true;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
      interruptionModeAndroid: "doNotMix",
    });
  } catch (err) {
    console.warn("Failed to configure background audio mode:", err);
  }
}

export default function usePlaybackEngine(track) {
  useEffect(() => {
    ensureAudioMode();
  }, []);

  const isVideo = track?.type === "video";
  const uri = resolveUri(track);

  // ---- Audio branch (expo-audio) - created once, idle, no initial source ----
  const audioPlayer = useAudioPlayer(null);
  const audioStatus = useAudioPlayerStatus(audioPlayer);

  // ---- Video branch (expo-video) - same idea, created once ----
  const videoPlayer = useVideoPlayer(null, (player) => {
    player.loop = false;
  });
  const playingEvent = useEvent(videoPlayer, "playingChange", {
    isPlaying: videoPlayer?.playing ?? false,
  });

  // Swap the active player's source whenever the resolved uri actually
  // changes - this is the real fix, replacing the old (broken) assumption
  // that passing a different `source` prop would reload automatically.
  const lastLoadedUri = useRef(null);
  const prevIsVideo = useRef(isVideo);

  useEffect(() => {
    // If the track TYPE switched (audio -> video or vice versa), stop
    // whichever player was previously active so it doesn't keep playing
    // silently in the background.
    if (prevIsVideo.current !== isVideo) {
      if (prevIsVideo.current) videoPlayer?.pause();
      else audioPlayer?.pause();
      prevIsVideo.current = isVideo;
    }

    if (uri === lastLoadedUri.current) return;
    lastLoadedUri.current = uri;

    if (!uri) return;

    if (isVideo) {
      videoPlayer?.replace({ uri });
    } else {
      audioPlayer?.replace({ uri });
    }
  }, [uri, isVideo, videoPlayer, audioPlayer]);

  // Log a "play" to on-device history once someone's actually stuck with
  // a track for a bit - not on every tap-and-skip, so the AI recommendation
  // feature (built next) works from real listening, not noise.
  useEffect(() => {
    if (!track?.id) return;
    const timer = setTimeout(() => {
      logPlay(track);
    }, MIN_PLAY_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [track?.id]);

  // expo-video doesn't push continuous position updates by default, so we
  // poll currentTime on an interval while a video track is active.
  const [videoPosition, setVideoPosition] = useState(0);
  useEffect(() => {
    if (!isVideo || !videoPlayer) return;
    const interval = setInterval(() => {
      setVideoPosition(videoPlayer.currentTime || 0);
    }, 250);
    return () => clearInterval(interval);
  }, [isVideo, videoPlayer]);

  // Update lock screen metadata whenever the track itself changes - not just
  // when play() is called. Auto-advance and skip swap the player's source
  // via .replace() while playback continues uninterrupted, so play() never
  // fires again for the new track - without this effect the lock screen
  // notification would keep showing whatever track first started playback,
  // frozen, while the audio underneath had long since moved on.
  useEffect(() => {
    if (isVideo || !audioPlayer || !track) return;
    try {
      audioPlayer.setActiveForLockScreen(true, {
        title: track.title || "Unknown title",
        artist: track.artist || "Unknown artist",
        artworkUrl: track.artwork || undefined,
      });
    } catch (err) {
      console.warn("Failed to set lock screen metadata:", err);
    }
  }, [isVideo, audioPlayer, track?.id, track?.provider]);

  const play = useCallback(() => {
    if (isVideo) {
      videoPlayer?.play();
    } else {
      audioPlayer?.play();
    }
  }, [isVideo, videoPlayer, audioPlayer]);

  const pause = useCallback(() => {
    if (isVideo) videoPlayer?.pause();
    else audioPlayer?.pause();
  }, [isVideo, videoPlayer, audioPlayer]);

  const isPlaying = isVideo ? !!playingEvent?.isPlaying : !!audioStatus?.playing;

  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, play, pause]);

  const seekTo = useCallback(
    (seconds) => {
      if (isVideo) {
        if (videoPlayer) videoPlayer.currentTime = seconds;
      } else {
        audioPlayer?.seekTo(seconds);
      }
    },
    [isVideo, videoPlayer, audioPlayer]
  );

  // Playback rate: expo-video exposes a settable .playbackRate property;

  // expo-audio's AudioPlayer exposes setPlaybackRate(rate, pitchCorrection).

  // Wrapped defensively since exact method shape has shifted across SDKs.

  const setRate = useCallback(

    (rate) => {

      try {

        if (isVideo) {

          if (videoPlayer) videoPlayer.playbackRate = rate;

        } else if (audioPlayer) {

          if (typeof audioPlayer.setPlaybackRate === "function") {

            audioPlayer.setPlaybackRate(rate, "medium");

          } else {

            audioPlayer.playbackRate = rate;

          }

        }

      } catch (err) {

        console.warn("Failed to set playback rate:", err);

      }

  },

  [isVideo, videoPlayer, audioPlayer]

  );


  return {
    isVideo,
    isPlaying,
    // True for the single status update where expo-audio reports the
    // current track just reached its end. Video finish detection isn't
    // wired up yet - only audio tracks report this for now.
    didJustFinish: !isVideo && !!audioStatus?.didJustFinish,
    position: isVideo ? videoPosition : audioStatus?.currentTime || 0,
    duration: isVideo ? videoPlayer?.duration || 0 : audioStatus?.duration || 0,
    isBuffering: isVideo
      ? videoPlayer?.status === "loading"
      : !!audioStatus?.isBuffering,
    play,
    pause,
    toggle,
    seekTo,

    setRate,
    videoPlayer: isVideo ? videoPlayer : null,
    audioPlayer: !isVideo ? audioPlayer : null,
  };
}

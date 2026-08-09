import { useCallback, useEffect, useRef, useState } from "react";
import { setAudioModeAsync } from "expo-audio";
import { useVideoPlayer } from "expo-video";
import { useEvent } from "expo";
import TrackPlayer, {
  Capability,
  Event,
  State,
  usePlaybackState,
  useProgress,
  useTrackPlayerEvents,
} from "@rntp/player";

// ---------------------------------------------------------------------------
// Unified playback engine for both mp3 (RNTP) and mp4 (expo-video).
//
// track shape expected: { type: "audio" | "video", localUri?, stream_url?,
// download_url? }. Source priority: a local downloaded file always wins over
// a remote stream URL, so playback keeps working offline once downloaded.
//
// AUDIO now goes through react-native-track-player instead of expo-audio,
// because expo-audio's lock screen integration has no next/previous track
// support (Android/iOS both) as of this writing - RNTP's notification does.
// RNTP is kept to a single-track queue (reset + add on every track change),
// mirroring how videoPlayer.replace() swaps sources below. App.js's own
// queue/shuffle/wraparound state stays the single source of truth; remote
// next/prev from the notification reach it via playbackServiceBridge.js
// rather than TrackPlayer's own (unused) multi-track queue methods.
//
// video keeps using expo-video exactly as before - only the audio branch
// changed here.
// ---------------------------------------------------------------------------

function resolveUri(track) {
  if (!track) return null;
  return track.localUri || track.stream_url || track.download_url || null;
}

// Configures the shared AVAudioSession/audio focus once, app-wide, so
// playback survives the screen locking or the app backgrounding. Kept from
// the expo-audio setup since expo-video's background audio still rides on
// the same underlying session.
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

// One-time RNTP setup + notification capabilities. compactCapabilities is
// what actually renders on the lock-screen/collapsed notification, so
// SkipToNext/SkipToPrevious must be in there, not just capabilities.
let rntpConfigured = false;
async function ensureRNTPSetup() {
  if (rntpConfigured) return;
  rntpConfigured = true;
  try {
    await TrackPlayer.setupPlayer();
    await TrackPlayer.updateOptions({
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
        Capability.Stop,
      ],
      compactCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
      ],
      notificationCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
      ],
    });
  } catch (err) {
    console.warn("Failed to set up TrackPlayer:", err);
  }
}

export default function usePlaybackEngine(track) {
  useEffect(() => {
    ensureAudioMode();
    ensureRNTPSetup();
  }, []);

  const isVideo = track?.type === "video";
  const uri = resolveUri(track);

  // ---- Audio branch (RNTP) ----
  const playbackState = usePlaybackState();
  const progress = useProgress(250);
  const [audioDidJustFinish, setAudioDidJustFinish] = useState(false);

  useTrackPlayerEvents([Event.PlaybackQueueEnded], (event) => {
    if (!isVideo) setAudioDidJustFinish(true);
  });

  // ---- Video branch (expo-video) - unchanged ----
  const videoPlayer = useVideoPlayer(null, (player) => {
    player.loop = false;
  });
  const playingEvent = useEvent(videoPlayer, "playingChange", {
    isPlaying: videoPlayer?.playing ?? false,
  });

  // Swap the active source whenever the resolved uri actually changes.
  const lastLoadedUri = useRef(null);
  const prevIsVideo = useRef(isVideo);

  useEffect(() => {
    // If the track TYPE switched (audio -> video or vice versa), stop
    // whichever player was previously active so it doesn't keep playing
    // silently in the background.
    if (prevIsVideo.current !== isVideo) {
      if (prevIsVideo.current) videoPlayer?.pause();
      else TrackPlayer.pause().catch(() => {});
      prevIsVideo.current = isVideo;
    }

    if (uri === lastLoadedUri.current) return;
    lastLoadedUri.current = uri;
    setAudioDidJustFinish(false);

    if (!uri) return;

    if (isVideo) {
      videoPlayer?.replace({ uri });
    } else {
      (async () => {
        try {
          await TrackPlayer.reset();
          await TrackPlayer.add({
            id: track?.id != null ? String(track.id) : uri,
            url: uri,
            title: track?.title || "Unknown title",
            artist: track?.artist || "Unknown artist",
            artwork: track?.artwork || undefined,
          });
        } catch (err) {
          console.warn("Failed to load track into TrackPlayer:", err);
        }
      })();
    }
  }, [uri, isVideo, videoPlayer, track]);

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

  const play = useCallback(() => {
    if (isVideo) {
      videoPlayer?.play();
    } else {
      TrackPlayer.play().catch((err) =>
        console.warn("Failed to play track:", err)
      );
    }
  }, [isVideo, videoPlayer]);

  const pause = useCallback(() => {
    if (isVideo) videoPlayer?.pause();
    else TrackPlayer.pause().catch(() => {});
  }, [isVideo, videoPlayer]);

  const isPlaying = isVideo
    ? !!playingEvent?.isPlaying
    : playbackState?.state === State.Playing;

  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, play, pause]);

  const seekTo = useCallback(
    (seconds) => {
      if (isVideo) {
        if (videoPlayer) videoPlayer.currentTime = seconds;
      } else {
        TrackPlayer.seekTo(seconds).catch(() => {});
      }
    },
    [isVideo, videoPlayer]
  );

  // Playback rate: expo-video exposes a settable .playbackRate property;
  // RNTP exposes TrackPlayer.setRate(rate).
  const setRate = useCallback(
    (rate) => {
      try {
        if (isVideo) {
          if (videoPlayer) videoPlayer.playbackRate = rate;
        } else {
          TrackPlayer.setRate(rate).catch(() => {});
        }
      } catch (err) {
        console.warn("Failed to set playback rate:", err);
      }
    },
    [isVideo, videoPlayer]
  );

  return {
    isVideo,
    isPlaying,
    // True for the single event where RNTP reports the queue (i.e. the
    // one loaded track) just ended. Video finish detection isn't wired up
    // yet - only audio tracks report this for now.
    didJustFinish: !isVideo && audioDidJustFinish,
    position: isVideo ? videoPosition : progress?.position || 0,
    duration: isVideo ? videoPlayer?.duration || 0 : progress?.duration || 0,
    isBuffering: isVideo
      ? videoPlayer?.status === "loading"
      : playbackState?.state === State.Buffering ||
        playbackState?.state === State.Loading,
    play,
    pause,
    toggle,
    seekTo,
    setRate,
    videoPlayer: isVideo ? videoPlayer : null,
  };
}

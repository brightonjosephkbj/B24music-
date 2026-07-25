import { useCallback, useEffect, useState } from "react";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useVideoPlayer } from "expo-video";
import { useEvent } from "expo";

// ---------------------------------------------------------------------------
// Unified playback engine for both mp3 (expo-audio) and mp4 (expo-video).
//
// expo-av is deprecated/removed as of recent Expo SDKs, so audio and video
// now live behind two separate libraries with two separate APIs. This hook
// hides that split: give it a track object, and it always returns the same
// { isPlaying, position, duration, play, pause, toggle, seekTo } shape,
// regardless of whether the track is audio or video under the hood.
//
// track shape expected: { type: "audio" | "video", localUri?, stream_url?,
// download_url? }. Source priority: a local downloaded file always wins over
// a remote stream URL, so playback keeps working offline once downloaded.
//
// IMPORTANT: this hook always calls both useAudioPlayer and useVideoPlayer,
// passing null to whichever one isn't active. That's required by the Rules
// of Hooks (hooks can't be called conditionally) - passing null to expo-audio
// / expo-video is the documented way to keep a player "idle" without loading
// any media.
// ---------------------------------------------------------------------------

function resolveUri(track) {
  if (!track) return null;
  return track.localUri || track.stream_url || track.download_url || null;
}

export default function usePlaybackEngine(track) {
  const isVideo = track?.type === "video";
  const uri = resolveUri(track);

  // ---- Audio branch (expo-audio) ----
  const audioSource = !isVideo && uri ? { uri } : null;
  const audioPlayer = useAudioPlayer(audioSource);
  const audioStatus = useAudioPlayerStatus(audioPlayer);

  // ---- Video branch (expo-video) ----
  const videoSource = isVideo && uri ? { uri } : null;
  const videoPlayer = useVideoPlayer(videoSource, (player) => {
    player.loop = false;
  });
  // useEvent subscribes to the player's native event stream - this is how
  // expo-video reports play/pause state changes, since VideoPlayer itself
  // is not a React state object.
  const playingEvent = useEvent(videoPlayer, "playingChange", {
    isPlaying: videoPlayer?.playing ?? false,
  });

  // expo-video doesn't push continuous position updates by default, so we
  // poll currentTime on an interval while a video track is active. 250ms is
  // frequent enough for a smooth-looking progress bar without hammering
  // the native bridge.
  const [videoPosition, setVideoPosition] = useState(0);
  useEffect(() => {
    if (!isVideo || !videoPlayer) return;
    const interval = setInterval(() => {
      setVideoPosition(videoPlayer.currentTime || 0);
    }, 250);
    return () => clearInterval(interval);
  }, [isVideo, videoPlayer]);

  const play = useCallback(() => {
    if (isVideo) videoPlayer?.play();
    else audioPlayer?.play();
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

  return {
    isVideo,
    isPlaying,
    position: isVideo ? videoPosition : audioStatus?.currentTime || 0,
    duration: isVideo ? videoPlayer?.duration || 0 : audioStatus?.duration || 0,
    isBuffering: isVideo
      ? videoPlayer?.status === "loading"
      : !!audioStatus?.isBuffering,
    play,
    pause,
    toggle,
    seekTo,
    // Exposed so the video full-screen player can attach a <VideoView player={videoPlayer} />
    // and so a future EQ screen can reach into the raw audio player if expo-audio
    // exposes any processing hooks worth wiring up later.
    videoPlayer: isVideo ? videoPlayer : null,
    audioPlayer: !isVideo ? audioPlayer : null,
  };
}

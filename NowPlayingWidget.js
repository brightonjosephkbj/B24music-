import React from "react";
import { FlexWidget, TextWidget, ImageWidget } from "react-native-android-widget";

const VANILLA = "#F1FEC8";
const MUTED = "#C9C6D6";
const COSMIC_LIGHT = "rgba(255,255,255,0.15)";

// Rendered natively by react-native-android-widget - NOT a normal React
// component tree, just JSX describing RemoteViews. Keep this simple: no
// hooks, no context, no state - it only ever receives fresh props each time
// updateWidget() is called from the app (see nowPlayingWidget.js).
//
// The frosted-glass look comes from a pre-baked static image
// (assets/widget-background.png) rather than a real dynamic blur -
// RemoteViews has no native blur/backdrop-filter primitive, so this is the
// practical way to get the look. Everything else renders as a normal
// FlexWidget stack on top of it via position: "absolute" layering.
//
// progress is 0-1. isPlaying controls which glyph shows in the center
// button. clickAction values below are read by widget-task-handler.js's
// WIDGET_CLICK case to route each button to the right app action.
export function NowPlayingWidget({
  title,
  artist,
  artwork,
  position = 0,
  duration = 0,
  progress = 0,
  isPlaying = false,
}) {
  const hasTrack = !!title;

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: "match_parent",
        width: "match_parent",
      }}
    >
      {/* Frosted background image fills the widget */}
      <ImageWidget
        image={require("./assets/widget-background.png")}
        imageWidth={512}
        imageHeight={256}
        style={{
          width: "match_parent",
          height: "match_parent",
          position: "absolute",
        }}
      />

      {/* Content layered on top */}
      <FlexWidget
        style={{
          width: "match_parent",
          height: "match_parent",
          padding: 14,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <ImageWidget
          image={artwork || undefined}
          imageWidth={70}
          imageHeight={70}
          radius={12}
        />

        <FlexWidget
          style={{
            flexDirection: "column",
            marginLeft: 12,
            flexGrow: 1,
            flexShrink: 1,
          }}
        >
          <TextWidget
            text={hasTrack ? title : "Not playing"}
            style={{
              fontSize: 15,
              fontWeight: "700",
              color: VANILLA,
            }}
            maxLines={1}
            clickAction="OPEN_APP"
          />
          <TextWidget
            text={hasTrack ? artist || "" : "Open B24music"}
            style={{
              fontSize: 12,
              color: MUTED,
              marginTop: 2,
            }}
            maxLines={1}
            clickAction="OPEN_APP"
          />

          {/* Progress bar */}
          <FlexWidget
            style={{
              height: 3,
              width: "match_parent",
              backgroundColor: COSMIC_LIGHT,
              borderRadius: 2,
              marginTop: 8,
            }}
          >
            <FlexWidget
              style={{
                height: 3,
                width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`,
                backgroundColor: VANILLA,
                borderRadius: 2,
              }}
            />
          </FlexWidget>

          {/* Controls */}
          <FlexWidget
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: 8,
            }}
          >
            <TextWidget
              text="⏮"
              clickAction="PREV_TRACK"
              style={{ fontSize: 16, color: "#ffffff", marginRight: 20 }}
            />
            <TextWidget
              text={isPlaying ? "⏸" : "▶"}
              clickAction="TOGGLE_PLAY"
              style={{ fontSize: 18, color: VANILLA, fontWeight: "700", marginRight: 20 }}
            />
            <TextWidget
              text="⏭"
              clickAction="NEXT_TRACK"
              style={{ fontSize: 16, color: "#ffffff" }}
            />
          </FlexWidget>
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}

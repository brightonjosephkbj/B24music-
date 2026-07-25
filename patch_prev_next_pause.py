import pathlib, sys

def patch(path, replacements):
    p = pathlib.Path(path)
    text = p.read_text()
    for old, new in replacements:
        if old not in text:
            print(f"SKIP (not found, check for drift): {path} -> {old[:50]!r}...")
            continue
        text = text.replace(old, new, 1)
    p.write_text(text)
    print(f"Patched {path}")

# ---------------------------------------------------------------- App.js ----
patch("App.js", [
    (
'''  const [activeNav, setActiveNav] = useState("home");
  const [activeDrawerScreen, setActiveDrawerScreen] = useState(null); // e.g. "news"
  const [nowPlaying, setNowPlaying] = useState(null); // track object
  const [playerExpanded, setPlayerExpanded] = useState(false); // State A vs State B

  // Single playback engine instance, lifted here so both the mini
  // disc/video-box (in AppShell) and the expanded Player/full-screen video
  // share the exact same live player - never two separate instances of the
  // same track fighting each other.
  const engine = usePlaybackEngine(nowPlaying);

  const goToDrawerScreen = (key) => setActiveDrawerScreen(key);
  const backFromDrawerScreen = () => setActiveDrawerScreen(null);

  const playTrack = (track) => {
    setNowPlaying(track);
    // Video tracks jump straight to full-screen per spec; audio tracks stay
    // collapsed to the mini disc until the user taps it.
    if (track?.type === "video") {
      setPlayerExpanded(true);
    }
  };''',
'''  const [activeNav, setActiveNav] = useState("home");
  const [activeDrawerScreen, setActiveDrawerScreen] = useState(null); // e.g. "news"
  const [nowPlaying, setNowPlaying] = useState(null); // track object
  const [playerExpanded, setPlayerExpanded] = useState(false); // State A vs State B

  // The queue nowPlaying was picked from, plus its index in that queue.
  // Whatever screen starts playback (Home's trending row, Library, a search
  // result list, etc.) hands over the list it was showing so prev/next in
  // the mini nav and the expanded PlayerCard have something real to skip
  // through - not just the single track that happened to be tapped.
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);

  // Single playback engine instance, lifted here so both the mini
  // disc/video-box (in AppShell) and the expanded Player/full-screen video
  // share the exact same live player - never two separate instances of the
  // same track fighting each other.
  const engine = usePlaybackEngine(nowPlaying);

  const goToDrawerScreen = (key) => setActiveDrawerScreen(key);
  const backFromDrawerScreen = () => setActiveDrawerScreen(null);

  // sourceQueue is optional - pass the list a track was tapped from (e.g.
  // Home's displayedTracks) so prev/next can walk it. Omit it (e.g. a
  // related-track pick inside the expanded player) and it starts a fresh
  // single-track queue of just that one track.
  const playTrack = (track, sourceQueue) => {
    if (!track) return;
    const nextQueue = sourceQueue && sourceQueue.length ? sourceQueue : [track];
    const idx = nextQueue.findIndex(
      (t) => t.provider === track.provider && t.id === track.id
    );
    setQueue(nextQueue);
    setQueueIndex(idx === -1 ? 0 : idx);
    setNowPlaying(track);
    // Video tracks jump straight to full-screen per spec; audio tracks stay
    // collapsed to the mini disc until the user taps it.
    if (track?.type === "video") {
      setPlayerExpanded(true);
    }
  };

  // Play whatever's at a given queue index without touching the queue
  // itself - used by prev/next so they don't reset queue context every time.
  const playAtIndex = (idx) => {
    const track = queue[idx];
    if (!track) return;
    setQueueIndex(idx);
    setNowPlaying(track);
    if (track?.type === "video") {
      setPlayerExpanded(true);
    }
  };

  // Wrap around at both ends, like most music players. No-op if there's
  // no queue yet (nothing has been played).
  const nextTrack = () => {
    if (!queue.length) return;
    playAtIndex((queueIndex + 1) % queue.length);
  };
  const prevTrack = () => {
    if (!queue.length) return;
    playAtIndex((queueIndex - 1 + queue.length) % queue.length);
  };'''
    ),
    (
'''      <AppShell
        activeNav={activeNav}
        onNavPress={setActiveNav}
        nowPlaying={nowPlaying}
        engine={engine}
        playerExpanded={playerExpanded}
        onExpandPress={expandPlayer}
        onCollapsePress={collapsePlayer}
      >
        {content}
      </AppShell>

      {playerExpanded && nowPlaying && !isVideo && (
        <PlayerCard
          track={nowPlaying}
          engine={engine}
          onCollapse={collapsePlayer}
          onNext={playTrack}
          onPrev={() => {}}
        />
      )}''',
'''      <AppShell
        activeNav={activeNav}
        onNavPress={setActiveNav}
        nowPlaying={nowPlaying}
        engine={engine}
        playerExpanded={playerExpanded}
        onExpandPress={expandPlayer}
        onCollapsePress={collapsePlayer}
        onSkipNext={nextTrack}
        onSkipPrev={prevTrack}
      >
        {content}
      </AppShell>

      {playerExpanded && nowPlaying && !isVideo && (
        <PlayerCard
          track={nowPlaying}
          engine={engine}
          onCollapse={collapsePlayer}
          onNext={nextTrack}
          onPrev={prevTrack}
          onPlayTrack={playTrack}
        />
      )}'''
    ),
])

# --------------------------------------------------------------- Home.js ----
patch("HomeScreen.js", [
    (
'                onPress={() => onTrackPress && onTrackPress(track)}',
'                onPress={() => onTrackPress && onTrackPress(track, displayedTracks)}'
    ),
])

# ------------------------------------------------------------ PlayerCard ----
patch("PlayerCard.js", [
    (
'''// onNext / onPrev / onShuffleToggle: wire to your queue logic once it exists;
// left as no-ops here since queue management isn't built yet.
export default function PlayerCard({ track, engine, onCollapse, onNext, onPrev, onShuffleToggle }) {''',
'''// onNext / onPrev: skip within the real queue lifted up in App.js.
// onPlayTrack: play a specific track (e.g. a tapped related-track result),
// separate from onNext so skip and "play this" no longer fight over one prop.
export default function PlayerCard({ track, engine, onCollapse, onNext, onPrev, onPlayTrack, onShuffleToggle }) {'''
    ),
    (
'      if (found && onNext) onNext(found); // reuse onNext as "play this track" callback',
'      if (found && onPlayTrack) onPlayTrack(found);'
    ),
])

# -------------------------------------------------------------- AppShell ----
patch("AppShell.js", [
    (
'''export default function AppShell({
  children,
  activeNav,
  onNavPress,
  nowPlaying,      // track object, or null
  engine,          // result of usePlaybackEngine(nowPlaying), or null
  playerExpanded,  // true once the user has tapped into State B
  onExpandPress,   // tap the disc/video box -> expand
  onCollapsePress, // tap the shrunken nav pill -> collapse back to State A
}) {''',
'''export default function AppShell({
  children,
  activeNav,
  onNavPress,
  nowPlaying,      // track object, or null
  engine,          // result of usePlaybackEngine(nowPlaying), or null
  playerExpanded,  // true once the user has tapped into State B
  onExpandPress,   // tap the disc/video box -> expand
  onCollapsePress, // tap the shrunken nav pill -> collapse back to State A
  onSkipNext,      // skip to the next track in the queue
  onSkipPrev,      // skip to the previous track in the queue
}) {'''
    ),
    (
'''        ) : (
          <>
            <View style={styles.navPill}>
              {NAV_ITEMS.map((item) => {
                const active = item.key === activeNav;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.navItem, active && styles.navItemActive]}
                    onPress={() => onNavPress && onNavPress(item.key)}
                  >
                    <Text style={[styles.navItemText, active && styles.navItemTextActive]}>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {nowPlaying && !isVideo && (
              <TouchableOpacity onPress={onExpandPress} style={styles.discWrap}>
                <Animated.View style={[styles.disc, { transform: [{ rotate: spinDeg }] }]}>
                  <Image
                    source={nowPlaying.artwork ? { uri: nowPlaying.artwork } : undefined}
                    style={styles.discArt}
                  />
                  <View style={styles.discHole} />
                </Animated.View>
              </TouchableOpacity>
            )}

            {nowPlaying && isVideo && (
              <TouchableOpacity onPress={onExpandPress} style={styles.videoBoxWrap}>
                {engine?.videoPlayer ? (
                  <VideoView
                    player={engine.videoPlayer}
                    style={styles.videoBox}
                    contentFit="cover"
                    nativeControls={false}
                  />
                ) : (
                  <View style={[styles.videoBox, styles.videoBoxFallback]} />
                )}
              </TouchableOpacity>
            )}
          </>
        )}''',
'''        ) : (
          <>
            <View style={[styles.navPill, nowPlaying && styles.navPillCompact]}>
              {NAV_ITEMS.map((item) => {
                const active = item.key === activeNav;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[
                      styles.navItem,
                      nowPlaying && styles.navItemCompact,
                      active && styles.navItemActive,
                    ]}
                    onPress={() => onNavPress && onNavPress(item.key)}
                  >
                    <Text
                      style={[
                        styles.navItemText,
                        nowPlaying && styles.navItemTextCompact,
                        active && styles.navItemTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Compact transport cluster: prev, disc/video (tap to expand), play/pause, next.
                Only rendered once something's loaded - matches the old disc-only behavior
                for "nothing playing", just with real controls now that a queue exists. */}
            {nowPlaying && (
              <View style={styles.playerCluster}>
                <TouchableOpacity
                  onPress={() => onSkipPrev && onSkipPrev()}
                  style={styles.transportMini}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Text style={styles.transportMiniGlyph}>{"\u2039\u2039"}</Text>
                </TouchableOpacity>

                {!isVideo ? (
                  <TouchableOpacity onPress={onExpandPress} style={styles.discWrap}>
                    <Animated.View style={[styles.disc, { transform: [{ rotate: spinDeg }] }]}>
                      <Image
                        source={nowPlaying.artwork ? { uri: nowPlaying.artwork } : undefined}
                        style={styles.discArt}
                      />
                      <View style={styles.discHole} />
                    </Animated.View>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={onExpandPress} style={styles.videoBoxWrap}>
                    {engine?.videoPlayer ? (
                      <VideoView
                        player={engine.videoPlayer}
                        style={styles.videoBox}
                        contentFit="cover"
                        nativeControls={false}
                      />
                    ) : (
                      <View style={[styles.videoBox, styles.videoBoxFallback]} />
                    )}
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  onPress={() => engine?.toggle && engine.toggle()}
                  style={styles.transportMini}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Text style={styles.transportMiniGlyph}>{isPlaying ? "\u275a\u275a" : "\u25b6"}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => onSkipNext && onSkipNext()}
                  style={styles.transportMini}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Text style={styles.transportMiniGlyph}>{"\u203a\u203a"}</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}'''
    ),
    (
'''  navPill: {
    flex: 1, flexDirection: "row", backgroundColor: "rgba(20,20,25,0.55)", borderRadius: 30,
    borderWidth: 1, borderColor: GLASS_BORDER, paddingVertical: 8, paddingHorizontal: 6, justifyContent: "space-around",
  },
  navItem: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  navItemActive: { backgroundColor: ACCENT },
  navItemText: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "600" },
  navItemTextActive: { color: "#fff" },''',
'''  navPill: {
    flex: 1, flexDirection: "row", backgroundColor: "rgba(20,20,25,0.55)", borderRadius: 30,
    borderWidth: 1, borderColor: GLASS_BORDER, paddingVertical: 8, paddingHorizontal: 6, justifyContent: "space-around",
  },
  // Nav pill shares the row with the transport cluster once something's
  // playing, so it needs to give up some breathing room.
  navPillCompact: { paddingHorizontal: 3 },
  navItem: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  navItemCompact: { paddingHorizontal: 7 },
  navItemActive: { backgroundColor: ACCENT },
  navItemText: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "600" },
  navItemTextCompact: { fontSize: 11 },
  navItemTextActive: { color: "#fff" },

  // Compact prev/disc-or-video/play-pause/next cluster, shown to the right
  // of the nav pill whenever a track is loaded.
  playerCluster: {
    flexDirection: "row", alignItems: "center", marginLeft: 8,
    backgroundColor: "rgba(20,20,25,0.55)", borderRadius: 26,
    borderWidth: 1, borderColor: GLASS_BORDER, paddingHorizontal: 4, paddingVertical: 4,
  },
  transportMini: { width: 26, height: 44, justifyContent: "center", alignItems: "center" },
  transportMiniGlyph: { color: "#fff", fontSize: 13, fontWeight: "700" },'''
    ),
    (
'  discWrap: { marginLeft: 12 },\n  disc: {\n    width: 52, height: 52, borderRadius: 26, backgroundColor: "#111",',
'  discWrap: {},\n  disc: {\n    width: 44, height: 44, borderRadius: 22, backgroundColor: "#111",'
    ),
    (
'  discArt: { ...StyleSheet.absoluteFillObject, borderRadius: 26 },',
'  discArt: { ...StyleSheet.absoluteFillObject, borderRadius: 22 },'
    ),
    (
'  videoBoxWrap: { marginLeft: 12 },\n  videoBox: {\n    width: 72, height: 44, borderRadius: 10, backgroundColor: "#111",',
'  videoBoxWrap: {},\n  videoBox: {\n    width: 60, height: 40, borderRadius: 10, backgroundColor: "#111",'
    ),
])

print("Done.")

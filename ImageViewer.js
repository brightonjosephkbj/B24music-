import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Share,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system/legacy";
import { getDownloads, saveDownloads } from "./libraryStorage";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const DISMISS_THRESHOLD = 120;

// One pinch-to-zoom + pan page. Double-tap toggles between 1x and 2.5x.
// Pan is clamped to the zoomed image's actual bounds so it can never be
// dragged fully off-screen. When not zoomed, a vertical drag instead
// drives the swipe-to-dismiss gesture via onDismissDrag/onDismissRelease.
function ZoomableImage({ uri, onSingleTap, onDismissDrag, onDismissRelease, scrollEnabledRef }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const clamp = (value, limit) => Math.min(Math.max(value, -limit), limit);

  const clampToBounds = () => {
    "worklet";
    const maxX = (SCREEN_WIDTH * (scale.value - 1)) / 2;
    const maxY = (SCREEN_HEIGHT * 0.75 * (scale.value - 1)) / 2;
    translateX.value = clamp(translateX.value, Math.max(maxX, 0));
    translateY.value = clamp(translateY.value, Math.max(maxY, 0));
    savedTranslateX.value = translateX.value;
    savedTranslateY.value = translateY.value;
  };

  const resetTransform = () => {
    "worklet";
    scale.value = withSpring(1);
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onStart(() => {
      if (scrollEnabledRef) runOnJS(scrollEnabledRef)(false);
    })
    .onUpdate((e) => {
      scale.value = Math.max(1, savedScale.value * e.scale);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value < 1.05) {
        resetTransform();
        if (scrollEnabledRef) runOnJS(scrollEnabledRef)(true);
      } else {
        clampToBounds();
      }
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => {
      if (savedScale.value > 1 && scrollEnabledRef) runOnJS(scrollEnabledRef)(false);
    })
    .onUpdate((e) => {
      if (savedScale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      } else {
        if (Math.abs(e.translationY) > Math.abs(e.translationX)) {
          translateY.value = e.translationY;
          if (onDismissDrag) runOnJS(onDismissDrag)(e.translationY);
        }
      }
    })
    .onEnd((e) => {
      if (savedScale.value > 1) {
        clampToBounds();
        if (scrollEnabledRef) runOnJS(scrollEnabledRef)(true);
      } else {
        if (Math.abs(translateY.value) > DISMISS_THRESHOLD) {
          if (onDismissRelease) runOnJS(onDismissRelease)(true);
        } else {
          translateY.value = withSpring(0);
          if (onDismissRelease) runOnJS(onDismissRelease)(false);
        }
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (savedScale.value > 1) {
        resetTransform();
        if (scrollEnabledRef) runOnJS(scrollEnabledRef)(true);
      } else {
        scale.value = withSpring(2.5);
        savedScale.value = 2.5;
        if (scrollEnabledRef) runOnJS(scrollEnabledRef)(false);
      }
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      if (onSingleTap) runOnJS(onSingleTap)();
    });

  const tapGesture = Gesture.Exclusive(doubleTap, singleTap);
  const composed = Gesture.Simultaneous(pinch, pan, tapGesture);

  const animatedStyle = useAnimatedStyle(() => {
    const dismissOpacity = savedScale.value > 1 ? 1 : 1 - Math.min(Math.abs(translateY.value) / (SCREEN_HEIGHT * 0.6), 0.6);
    return {
      opacity: withTiming(dismissOpacity, { duration: 50 }),
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    };
  });

  return (
    <View style={styles.page}>
      <GestureDetector gesture={composed}>
        <Animated.View style={[styles.imageWrap, animatedStyle]}>
          {loading && !failed && (
            <ActivityIndicator style={StyleSheet.absoluteFill} color="#fff" />
          )}
          {failed ? (
            <Text style={styles.failedText}>Couldn't load this image</Text>
          ) : (
            <Animated.Image
              source={{ uri }}
              style={styles.image}
              resizeMode="contain"
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setFailed(true);
              }}
            />
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// images: [{ id, title, artist, date, credit, license, thumbnail, image, download_url, source }]
// visible, initialIndex, onClose - standard modal viewer props.
export default function ImageViewer({ visible, images, initialIndex = 0, onClose }) {
  const [index, setIndex] = useState(initialIndex);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  if (!visible || !images || images.length === 0) return null;
  const current = images[index];

  const onScrollEnd = (evt) => {
    const newIndex = Math.round(evt.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setIndex(newIndex);
  };

  const onShare = () => {
    const url = current.download_url || current.image;
    Share.share({ message: current.title || "Artwork", url });
  };

  const onSave = async () => {
    const url = current.download_url || current.image;
    if (!url) return;
    try {
      setSaving(true);
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Storage access is required to save images.");
        return;
      }
      const filename = `b24_${Date.now()}.jpg`;
      const localPath = `${FileSystem.cacheDirectory}${filename}`;
      const { uri: downloadedUri } = await FileSystem.downloadAsync(url, localPath);
      await MediaLibrary.saveToLibraryAsync(downloadedUri);

      // Also register this as a real entry in the app's own Downloads tab,
      // not just the phone gallery - type "image" so LibraryScreen can
      // render it without expecting a duration like audio/video rows do.
      const existing = await getDownloads();
      const alreadySaved = existing.some((d) => d.id === current.id);
      if (!alreadySaved) {
        await saveDownloads([
          ...existing,
          {
            id: current.id,
            type: "image",
            title: current.title || "Artwork",
            artist: current.artist || "",
            artwork: current.thumbnail || current.image,
            localUri: downloadedUri,
            duration: 0,
            source: current.source || "art",
            addedAt: Date.now(),
          },
        ]);
      }

      Alert.alert("Saved", "Image saved to your gallery and added to Downloads.");
    } catch (err) {
      Alert.alert("Save failed", err.message || "Couldn't save this image.");
    } finally {
      setSaving(false);
    }
  };

  const handleDismissRelease = (shouldClose) => {
    if (shouldClose) onClose();
  };

  return (
    <Modal visible={visible} transparent={false} animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <FlatList
          data={images}
          keyExtractor={(item, i) => `${item.id || item.image}-${i}`}
          horizontal
          pagingEnabled
          scrollEnabled={scrollEnabled}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * i, index: i })}
          onMomentumScrollEnd={onScrollEnd}
          renderItem={({ item }) => (
            <ZoomableImage
              uri={item.image}
              onSingleTap={() => setChromeVisible((v) => !v)}
              onDismissDrag={() => {}}
              onDismissRelease={handleDismissRelease}
              scrollEnabledRef={setScrollEnabled}
            />
          )}
        />

        {chromeVisible && (
          <>
            <View style={styles.topBar}>
              <TouchableOpacity onPress={onClose} style={styles.iconButton}>
                <Text style={styles.iconText}>Close</Text>
              </TouchableOpacity>
              <Text style={styles.counter}>{index + 1} / {images.length}</Text>
              <View style={styles.topBarRight}>
                <TouchableOpacity onPress={onSave} style={styles.iconButton} disabled={saving}>
                  <Text style={styles.iconText}>{saving ? "Saving..." : "Save"}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onShare} style={[styles.iconButton, { marginLeft: 8 }]}>
                  <Text style={styles.iconText}>Share</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.bottomBar}>
              {!!current.title && <Text style={styles.title} numberOfLines={2}>{current.title}</Text>}
              {!!current.artist && <Text style={styles.subtitle}>{current.artist}</Text>}
              <View style={styles.metaRow}>
                {!!current.date && <Text style={styles.metaText}>{current.date}</Text>}
                {!!(current.credit || current.license) && (
                  <Text style={styles.metaText} numberOfLines={1}>
                    {current.credit || current.license}
                  </Text>
                )}
              </View>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  page: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, justifyContent: "center", alignItems: "center" },
  imageWrap: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.75, justifyContent: "center", alignItems: "center" },
  image: { width: "100%", height: "100%" },
  failedText: { color: "rgba(255,255,255,0.6)", fontSize: 14 },

  topBar: {
    position: "absolute", top: 50, left: 0, right: 0,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20,
  },
  topBarRight: { flexDirection: "row" },
  iconButton: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.14)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
  },
  iconText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  counter: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "600" },

  bottomBar: {
    position: "absolute", bottom: 40, left: 20, right: 20,
    backgroundColor: "rgba(20,20,20,0.6)", borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
  },
  title: { color: "#fff", fontSize: 16, fontWeight: "700", marginBottom: 4 },
  subtitle: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginBottom: 8 },
  metaRow: { flexDirection: "row", justifyContent: "space-between" },
  metaText: { color: "rgba(255,255,255,0.5)", fontSize: 11, flexShrink: 1 },
});

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
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// One pinch-to-zoom + pan page. Double-tap toggles between 1x and 2.5x.
// Resets to center whenever zoomed back out below a small threshold.
function ZoomableImage({ uri, onSingleTap }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

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
    .onUpdate((e) => {
      scale.value = Math.max(1, savedScale.value * e.scale);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value < 1.05) resetTransform();
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      if (savedScale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (savedScale.value > 1) {
        resetTransform();
      } else {
        scale.value = withSpring(2.5);
        savedScale.value = 2.5;
      }
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      if (onSingleTap) runOnJS(onSingleTap)();
    });

  const tapGesture = Gesture.Exclusive(doubleTap, singleTap);
  const composed = Gesture.Simultaneous(pinch, pan, tapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View style={styles.page}>
      <GestureDetector gesture={composed}>
        <Animated.Image
          source={{ uri }}
          style={[styles.image, animatedStyle]}
          resizeMode="contain"
        />
      </GestureDetector>
    </View>
  );
}

// images: [{ id, title, artist, date, credit, license, image, download_url }]
// visible, initialIndex, onClose - standard modal viewer props.
export default function ImageViewer({ visible, images, initialIndex = 0, onClose }) {
  const [index, setIndex] = useState(initialIndex);
  const [chromeVisible, setChromeVisible] = useState(true);

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

  return (
    <Modal visible={visible} transparent={false} animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <FlatList
          data={images}
          keyExtractor={(item, i) => `${item.id || item.image}-${i}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * i, index: i })}
          onMomentumScrollEnd={onScrollEnd}
          renderItem={({ item }) => (
            <ZoomableImage uri={item.image} onSingleTap={() => setChromeVisible((v) => !v)} />
          )}
        />

        {chromeVisible && (
          <>
            {/* Top bar */}
            <View style={styles.topBar}>
              <TouchableOpacity onPress={onClose} style={styles.iconButton}>
                <Text style={styles.iconText}>Close</Text>
              </TouchableOpacity>
              <Text style={styles.counter}>{index + 1} / {images.length}</Text>
              <TouchableOpacity onPress={onShare} style={styles.iconButton}>
                <Text style={styles.iconText}>Share</Text>
              </TouchableOpacity>
            </View>

            {/* Bottom metadata */}
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
  image: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.75 },

  topBar: {
    position: "absolute", top: 50, left: 0, right: 0,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20,
  },
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

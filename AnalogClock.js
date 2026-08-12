import React, { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";

// Lightweight analog clock, no extra deps (no react-native-svg needed).
// Ticks every second via setInterval - fine for a small header icon.
export default function AnalogClock({ size = 22, color = "#fff" }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const seconds = now.getSeconds();
  const minutes = now.getMinutes();
  const hours = now.getHours() % 12;

  const secondDeg = seconds * 6;
  const minuteDeg = minutes * 6 + seconds * 0.1;
  const hourDeg = hours * 30 + minutes * 0.5;

  const radius = size / 2;
  const hourW = Math.max(1.5, size * 0.07);
  const minW = Math.max(1.2, size * 0.05);

  return (
    <View style={[styles.face, { width: size, height: size, borderRadius: radius, borderColor: color }]}>
      <View style={[styles.handWrap, { width: size, height: size, transform: [{ rotate: `${hourDeg}deg` }] }]}>
        <View style={[styles.hand, { backgroundColor: color, width: hourW, height: radius * 0.5, top: radius - radius * 0.5, left: radius - hourW / 2 }]} />
      </View>
      <View style={[styles.handWrap, { width: size, height: size, transform: [{ rotate: `${minuteDeg}deg` }] }]}>
        <View style={[styles.hand, { backgroundColor: color, width: minW, height: radius * 0.75, top: radius - radius * 0.75, left: radius - minW / 2 }]} />
      </View>
      <View style={[styles.handWrap, { width: size, height: size, transform: [{ rotate: `${secondDeg}deg` }] }]}>
        <View style={[styles.hand, { backgroundColor: "#FF6B6B", width: 1, height: radius * 0.85, top: radius - radius * 0.85, left: radius - 0.5 }]} />
      </View>
      <View style={[styles.centerDot, { backgroundColor: color, top: radius - 1.5, left: radius - 1.5 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  face: { borderWidth: 1.5, justifyContent: "center", alignItems: "center", overflow: "hidden" },
  handWrap: { position: "absolute", top: 0, left: 0 },
  hand: { position: "absolute", borderRadius: 2 },
  centerDot: { position: "absolute", width: 3, height: 3, borderRadius: 1.5 },
});

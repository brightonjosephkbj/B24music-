import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";

// Splits a message on ``` fences into alternating text/code segments.
// Handles an unclosed trailing fence (still-streaming code block) by
// treating everything after the last ``` as code too, so the box renders
// live while tokens are still arriving instead of waiting for the close.
function parseSegments(raw) {
  const parts = raw.split("```");
  const segments = [];
  for (let i = 0; i < parts.length; i++) {
    const isCode = i % 2 === 1;
    if (!parts[i]) continue;
    if (isCode) {
      const firstLineBreak = parts[i].indexOf("\n");
      let lang = "";
      let code = parts[i];
      if (firstLineBreak !== -1) {
        const maybeLang = parts[i].slice(0, firstLineBreak).trim();
        if (maybeLang && !maybeLang.includes(" ")) {
          lang = maybeLang;
          code = parts[i].slice(firstLineBreak + 1);
        }
      }
      segments.push({ type: "code", lang, content: code.replace(/\n$/, "") });
    } else {
      segments.push({ type: "text", content: parts[i] });
    }
  }
  return segments;
}

function CodeBlock({ lang, content }) {
  const [copied, setCopied] = useState(false);

  // expo-clipboard needs native linking - can't ship via OTA until the next
  // full APK build. Share.share() is pure JS (already used elsewhere in the
  // app, e.g. LibraryScreen.js) so this works today over OTA. Swap to
  // A native rebuild is already required for expo-media-control now, so
  // real one-tap copy is available - swapped off the old Share.share() fallback.
  const onCopy = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      // user dismissed the share sheet - not an error worth surfacing
    }
  }, [content]);

  return (
    <View style={styles.codeBlock}>
      <View style={styles.codeHeader}>
        <Text style={styles.codeLang}>{lang || "code"}</Text>
        <TouchableOpacity style={styles.copyButton} onPress={onCopy} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name={copied ? "checkmark" : "copy-outline"} size={14} color={copied ? "#39FF6A" : "rgba(255,255,255,0.7)"} />
          <Text style={[styles.copyText, copied && styles.copyTextDone]}>{copied ? "Copied" : "Copy"}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.codeText}>{content}</Text>
    </View>
  );
}

export default function MessageContent({ text, textStyle }) {
  const segments = parseSegments(text);
  return (
    <View>
      {segments.map((seg, i) =>
        seg.type === "code" ? (
          <CodeBlock key={i} lang={seg.lang} content={seg.content} />
        ) : (
          <Text key={i} style={textStyle}>{seg.content}</Text>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  codeBlock: {
    backgroundColor: "#0A0A0A",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginVertical: 6,
    overflow: "hidden",
  },
  codeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  codeLang: { color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "600" },
  copyButton: { flexDirection: "row", alignItems: "center", gap: 4 },
  copyText: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "600" },
  copyTextDone: { color: "#39FF6A" },
  codeText: {
    color: "#E6E6E6",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 12.5,
    lineHeight: 18,
    padding: 10,
  },
});

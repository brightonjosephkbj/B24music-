import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { streamChatMessage, generateChatPlaylist } from "./aiChat";
import MessageContent from "./MessageContent";

const GLASS_BG = "rgba(255,255,255,0.08)";
const GLASS_BORDER = "rgba(255,255,255,0.15)";
const ACCENT_GREEN = "#39FF6A";

let idCounter = 0;
const nextId = () => `msg_${Date.now()}_${idCounter++}`;

export default function AIChatScreen({ onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("chat"); // "chat" | "playlist"
  const listRef = useRef(null);

  const sendPlaylistRequest = useCallback(async (text) => {
    const statusId = nextId();
    setMessages((prev) => [
      ...prev,
      { id: statusId, role: "thinking", content: "Building your playlist..." },
    ]);

    try {
      const playlist = await generateChatPlaylist(text);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === statusId
            ? {
                id: statusId,
                role: "playlistResult",
                content: `Your playlist "${playlist.name}" has been created!`,
                art: playlist.art || null,
              }
            : m
        )
      );
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== statusId));
      setError(err.message || "Couldn't create that playlist");
    } finally {
      setSending(false);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg = { id: nextId(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setError(null);
    setSending(true);

    if (mode === "playlist") {
      sendPlaylistRequest(text);
      return;
    }

    const thinkingId = nextId();
    const replyId = nextId();
    let thinkingStarted = false;
    let replyStarted = false;

    try {
      await streamChatMessage(
        text,
        {},
        {
          onThinking: (chunk) => {
            if (!thinkingStarted) {
              thinkingStarted = true;
              setMessages((prev) => [
                ...prev,
                { id: thinkingId, role: "thinking", content: "" },
              ]);
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.id === thinkingId ? { ...m, content: m.content + chunk } : m
              )
            );
            requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
          },
          onContent: (chunk) => {
            if (!replyStarted) {
              replyStarted = true;
              setMessages((prev) => [
                ...prev.filter((m) => m.id !== thinkingId), // drop the thinking bubble once the real answer starts
                { id: replyId, role: "assistant", content: "" },
              ]);
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.id === replyId ? { ...m, content: m.content + chunk } : m
              )
            );
            requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
          },
          onError: (msg) => {
            setMessages((prev) => prev.filter((m) => m.id !== thinkingId));
            setError(msg || "Something went wrong");
          },
          onDone: () => {
            setSending(false);
          },
        }
      );
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== thinkingId));
      setError(err.message || "Something went wrong");
      setSending(false);
    }
  }, [input, sending, mode, sendPlaylistRequest]);

  const resetChat = useCallback(async () => {
    setMessages([]);
    setError(null);
    try {
      await sendChatMessage("", { reset: true });
    } catch {
      // reset is best-effort - a fresh empty local thread is fine either way
    }
  }, []);

  const renderItem = ({ item }) => {
    if (item.role === "playlistResult") {
      return (
        <View style={[styles.bubbleRow, styles.bubbleRowAI]}>
          <View style={[styles.bubble, styles.bubblePlaylist]}>
            {item.art ? (
              <Image source={{ uri: item.art }} style={styles.playlistResultArt} />
            ) : (
              <View style={[styles.playlistResultArt, styles.playlistResultArtPlaceholder]}>
                <Ionicons name="musical-notes" size={22} color="rgba(255,255,255,0.4)" />
              </View>
            )}
            <Text style={styles.bubbleText}>{item.content}</Text>
          </View>
        </View>
      );
    }
    if (item.role === "thinking") {
      return (
        <View style={[styles.bubbleRow, styles.bubbleRowAI]}>
          <View style={[styles.bubble, styles.bubbleThinking]}>
            <Text style={styles.thinkingText}>{item.content || "Thinking..."}</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={[styles.bubbleRow, item.role === "user" ? styles.bubbleRowUser : styles.bubbleRowAI]}>
        <View style={[styles.bubble, item.role === "user" ? styles.bubbleUser : styles.bubbleAI]}>
          <MessageContent text={item.content} textStyle={styles.bubbleText} />
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI Chat</Text>
        <TouchableOpacity onPress={resetChat} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="refresh" size={20} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="sparkles" size={28} color={ACCENT_GREEN} />
            <Text style={styles.emptyText}>Ask me anything about your music, or whatever's on your mind.</Text>
          </View>
        }
      />

      {sending && (
        <View style={styles.typingRow}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.typingText}>Thinking...</Text>
        </View>
      )}

      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modePill, mode === "chat" && styles.modePillActive]}
          onPress={() => setMode("chat")}
        >
          <Ionicons name="chatbubble-outline" size={13} color={mode === "chat" ? "#000" : "rgba(255,255,255,0.6)"} />
          <Text style={[styles.modePillText, mode === "chat" && styles.modePillTextActive]}>Chat</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modePill, mode === "playlist" && styles.modePillActive]}
          onPress={() => setMode("playlist")}
        >
          <Ionicons name="musical-notes-outline" size={13} color={mode === "playlist" ? "#000" : "rgba(255,255,255,0.6)"} />
          <Text style={[styles.modePillText, mode === "playlist" && styles.modePillTextActive]}>Playlist</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={mode === "playlist" ? "Describe the playlist you want..." : "Message..."}
          placeholderTextColor="rgba(255,255,255,0.4)"
          multiline
          onSubmitEditing={send}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!input.trim() || sending) && styles.sendButtonDisabled]}
          onPress={send}
          disabled={!input.trim() || sending}
        >
          <Ionicons name="arrow-up" size={18} color="#000" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020202" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14,
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },

  listContent: { paddingHorizontal: 16, paddingBottom: 20, flexGrow: 1 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12, paddingHorizontal: 40 },
  emptyText: { color: "rgba(255,255,255,0.5)", textAlign: "center", fontSize: 13, lineHeight: 19 },

  bubbleRow: { marginBottom: 12, flexDirection: "row" },
  bubbleRowUser: { justifyContent: "flex-end" },
  bubbleRowAI: { justifyContent: "flex-start" },
  bubble: { maxWidth: "80%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser: { backgroundColor: ACCENT_GREEN, borderBottomRightRadius: 4 },
  bubbleAI: { backgroundColor: GLASS_BG, borderWidth: 1, borderColor: GLASS_BORDER, borderBottomLeftRadius: 4 },
  bubbleThinking: { backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderBottomLeftRadius: 4 },
  thinkingText: { color: "rgba(255,255,255,0.45)", fontSize: 13, fontStyle: "italic", lineHeight: 19 },

  bubblePlaylist: { backgroundColor: "rgba(57,255,106,0.08)", borderWidth: 1, borderColor: "rgba(57,255,106,0.3)", borderBottomLeftRadius: 4, flexDirection: "row", alignItems: "center", gap: 10 },
  playlistResultArt: { width: 44, height: 44, borderRadius: 8 },
  playlistResultArtPlaceholder: { backgroundColor: "rgba(255,255,255,0.06)", justifyContent: "center", alignItems: "center" },

  modeRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 8 },
  modePill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  modePillActive: { backgroundColor: "#39FF6A", borderColor: "#39FF6A" },
  modePillText: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "600" },
  modePillTextActive: { color: "#000" },
  bubbleText: { color: "#fff", fontSize: 14, lineHeight: 20 },

  typingRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingBottom: 8 },
  typingText: { color: "rgba(255,255,255,0.5)", fontSize: 12 },

  errorText: { color: "#FF6B6B", fontSize: 12, paddingHorizontal: 20, paddingBottom: 8 },

  inputRow: {
    flexDirection: "row", alignItems: "flex-end", gap: 10,
    paddingHorizontal: 16, paddingBottom: 100, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: GLASS_BORDER,
  },
  input: {
    flex: 1, color: "#fff", fontSize: 14, backgroundColor: GLASS_BG,
    borderWidth: 1, borderColor: GLASS_BORDER, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, maxHeight: 100,
  },
  sendButton: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: ACCENT_GREEN,
    justifyContent: "center", alignItems: "center", marginBottom: 1,
  },
  sendButtonDisabled: { opacity: 0.4 },
});

import React from "react";
import { Modal, View, Text, StyleSheet, TouchableOpacity, Linking, ScrollView } from "react-native";

const ACCENT = "#FF6B6B";

// update: { latest_version, current_version, mandatory, download_url, changelog }
// onDismiss: only called (and only offered) when the update isn't mandatory.
export default function UpdatePrompt({ update, onDismiss }) {
  if (!update) return null;

  const onUpdateNow = () => {
    if (update.download_url) Linking.openURL(update.download_url);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => !update.mandatory && onDismiss?.()}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>
            {update.mandatory ? "Update Required" : "Update Available"}
          </Text>
          <Text style={styles.versionText}>
            Version {update.latest_version} \u2022 you have {update.current_version}
          </Text>

          {!!update.changelog && (
            <ScrollView style={styles.changelogBox}>
              <Text style={styles.changelogText}>{update.changelog}</Text>
            </ScrollView>
          )}

          <TouchableOpacity onPress={onUpdateNow} style={styles.updateButton}>
            <Text style={styles.updateButtonText}>Update Now</Text>
          </TouchableOpacity>

          {!update.mandatory && (
            <TouchableOpacity onPress={onDismiss} style={styles.laterButton}>
              <Text style={styles.laterButtonText}>Later</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" },
  card: {
    width: 300, backgroundColor: "rgba(25,25,28,0.98)", borderRadius: 20,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", padding: 22,
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "800", marginBottom: 6 },
  versionText: { color: "rgba(255,255,255,0.6)", fontSize: 12, marginBottom: 14 },
  changelogBox: { maxHeight: 140, marginBottom: 18 },
  changelogText: { color: "rgba(255,255,255,0.85)", fontSize: 13, lineHeight: 19 },
  updateButton: { backgroundColor: ACCENT, borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  updateButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  laterButton: { paddingVertical: 12, alignItems: "center" },
  laterButtonText: { color: "rgba(255,255,255,0.6)", fontWeight: "600" },
});

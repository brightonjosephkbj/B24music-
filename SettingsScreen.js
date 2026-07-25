import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import appJson from "./app.json";
import { checkForUpdate } from "./settingsApi";

const ACCENT = "#B983FF"; // matches "The Rest" / general-settings tone from the Glass Drawer accents
const GLASS_BG = "rgba(255,255,255,0.14)";
const GLASS_BORDER = "rgba(255,255,255,0.25)";

const CURRENT_VERSION = appJson.expo.version;

export default function SettingsScreen() {
  // status: "idle" | "checking" | "upToDate" | "available" | "error"
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const runCheck = async () => {
    setStatus("checking");
    setError(null);
    try {
      const data = await checkForUpdate(Platform.OS, CURRENT_VERSION);
      setResult(data);
      setStatus(data.update_available ? "available" : "upToDate");
    } catch (err) {
      setError(err.message || "Couldn't reach the update server");
      setStatus("error");
    }
  };

  const openDownload = () => {
    if (result?.download_url) Linking.openURL(result.download_url);
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#1c1730", "#2e2350"]} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>App version</Text>
          <Text style={styles.cardValue}>{CURRENT_VERSION}</Text>
          <Text style={styles.cardSubtle}>{Platform.OS === "ios" ? "iOS" : "Android"}</Text>
        </View>

        <TouchableOpacity
          style={[styles.checkButton, status === "checking" && styles.checkButtonDisabled]}
          onPress={runCheck}
          disabled={status === "checking"}
        >
          {status === "checking" ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.checkButtonText}>Check for Updates</Text>
          )}
        </TouchableOpacity>

        {status === "upToDate" && (
          <View style={styles.statusCard}>
            <Text style={styles.statusGood}>You're up to date.</Text>
            <Text style={styles.cardSubtle}>Latest version: {result.latest_version}</Text>
          </View>
        )}

        {status === "error" && (
          <View style={styles.statusCard}>
            <Text style={styles.statusBad}>{error}</Text>
          </View>
        )}

        {status === "available" && result && (
          <View style={styles.statusCard}>
            <View style={styles.updateHeaderRow}>
              <Text style={styles.statusGood}>New version available</Text>
              {result.mandatory && (
                <View style={styles.mandatoryBadge}>
                  <Text style={styles.mandatoryBadgeText}>Required</Text>
                </View>
              )}
            </View>
            <Text style={styles.cardValue}>{result.latest_version}</Text>
            {!!result.published_at && (
              <Text style={styles.cardSubtle}>Published {result.published_at.slice(0, 10)}</Text>
            )}
            {!!result.changelog && (
              <>
                <Text style={styles.sectionLabel}>What's new</Text>
                <Text style={styles.changelogText}>{result.changelog}</Text>
              </>
            )}
            <TouchableOpacity style={styles.downloadButton} onPress={openDownload}>
              <Text style={styles.checkButtonText}>Download Update</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  header: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { color: "#fff", fontSize: 20, fontWeight: "700" },

  content: { paddingHorizontal: 20, paddingTop: 8 },

  card: {
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
  },
  cardLabel: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "600" },
  cardValue: { color: "#fff", fontSize: 22, fontWeight: "800", marginTop: 4 },
  cardSubtle: { color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 4 },

  checkButton: {
    backgroundColor: ACCENT,
    borderRadius: 20,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  checkButtonDisabled: { opacity: 0.7 },
  checkButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  statusCard: {
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 18,
    padding: 18,
    marginTop: 16,
  },
  updateHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusGood: { color: "#7AC547", fontSize: 15, fontWeight: "700" },
  statusBad: { color: "#FF6B6B", fontSize: 14, fontWeight: "600" },
  mandatoryBadge: {
    backgroundColor: "#E63946",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  mandatoryBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },

  sectionLabel: { color: "rgba(255,255,255,0.85)", fontWeight: "700", fontSize: 13, marginTop: 14, marginBottom: 6 },
  changelogText: { color: "rgba(255,255,255,0.85)", fontSize: 13, lineHeight: 19 },

  downloadButton: {
    backgroundColor: ACCENT,
    borderRadius: 20,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
});

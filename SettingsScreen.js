import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Updates from "expo-updates";
import appJson from "./app.json";

const ACCENT = "#B983FF";
const GLASS_BG = "rgba(255,255,255,0.14)";
const GLASS_BORDER = "rgba(255,255,255,0.25)";

const APP_VERSION = appJson.expo.version;

export default function SettingsScreen() {
  // status: "idle" | "checking" | "upToDate" | "available" | "downloading" | "ready" | "error"
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  // Info about the update currently running on this device, if any -
  // useful to confirm OTA actually took effect after a reload.
  const runningInfo = {
    isEmbedded: Updates.isEmbeddedLaunch,
    updateId: Updates.updateId,
    createdAt: Updates.createdAt,
    runtimeVersion: Updates.runtimeVersion,
    channel: Updates.channel,
  };

  const runCheck = async () => {
    if (__DEV__ || !Updates.isEnabled) {
      setError("OTA updates are disabled in development builds - test this in a release/production build.");
      setStatus("error");
      return;
    }
    setStatus("checking");
    setError(null);
    try {
      const result = await Updates.checkForUpdateAsync();
      setStatus(result.isAvailable ? "available" : "upToDate");
    } catch (err) {
      setError(err.message || "Couldn't reach the update server");
      setStatus("error");
    }
  };

  const downloadUpdate = async () => {
    setStatus("downloading");
    setError(null);
    try {
      await Updates.fetchUpdateAsync();
      setStatus("ready");
    } catch (err) {
      setError(err.message || "Failed to download the update");
      setStatus("error");
    }
  };

  const applyUpdate = async () => {
    try {
      await Updates.reloadAsync();
    } catch (err) {
      setError(err.message || "Failed to apply the update");
      setStatus("error");
    }
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
          <Text style={styles.cardValue}>{APP_VERSION}</Text>
          <Text style={styles.cardSubtle}>{Platform.OS === "ios" ? "iOS" : "Android"}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Update channel</Text>
          <Text style={styles.cardValue}>
            {runningInfo.isEmbedded ? "Built-in (no OTA applied)" : "OTA update active"}
          </Text>
          {!runningInfo.isEmbedded && runningInfo.createdAt && (
            <Text style={styles.cardSubtle}>
              Applied {new Date(runningInfo.createdAt).toISOString().slice(0, 10)}
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.checkButton, status === "checking" && styles.checkButtonDisabled]}
          onPress={runCheck}
          disabled={status === "checking" || status === "downloading"}
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
          </View>
        )}

        {status === "error" && (
          <View style={styles.statusCard}>
            <Text style={styles.statusBad}>{error}</Text>
          </View>
        )}

        {status === "available" && (
          <View style={styles.statusCard}>
            <Text style={styles.statusGood}>An update is available.</Text>
            <TouchableOpacity style={styles.downloadButton} onPress={downloadUpdate}>
              <Text style={styles.checkButtonText}>Download Update</Text>
            </TouchableOpacity>
          </View>
        )}

        {status === "downloading" && (
          <View style={styles.statusCard}>
            <ActivityIndicator color="#fff" />
            <Text style={[styles.cardSubtle, { marginTop: 8, textAlign: "center" }]}>Downloading...</Text>
          </View>
        )}

        {status === "ready" && (
          <View style={styles.statusCard}>
            <Text style={styles.statusGood}>Update downloaded.</Text>
            <Text style={styles.cardSubtle}>Restart the app now to apply it.</Text>
            <TouchableOpacity style={styles.downloadButton} onPress={applyUpdate}>
              <Text style={styles.checkButtonText}>Restart & Apply</Text>
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
  statusGood: { color: "#7AC547", fontSize: 15, fontWeight: "700" },
  statusBad: { color: "#FF6B6B", fontSize: 14, fontWeight: "600" },

  downloadButton: {
    backgroundColor: ACCENT,
    borderRadius: 20,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
});

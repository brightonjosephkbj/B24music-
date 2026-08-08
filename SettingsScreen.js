import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
  Image,
  TextInput,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Updates from "expo-updates";
import * as ImagePicker from "expo-image-picker";
import appJson from "./app.json";
import { uploadAvatar, updateUsername, updateBio } from "./apiClient";

const ACCENT = "#B983FF";
const GLASS_BG = "rgba(255,255,255,0.14)";
const GLASS_BORDER = "rgba(255,255,255,0.25)";

const APP_VERSION = appJson.expo.version;

export default function SettingsScreen({ authUser, onSignOutPress, onProfileUpdate } = {}) {
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState(null);

  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState(authUser?.username || "");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameError, setUsernameError] = useState(null);

  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState(authUser?.bio || "");
  const [bioSaving, setBioSaving] = useState(false);
  const [bioError, setBioError] = useState(null);

  const pickAndUploadAvatar = async () => {
    setAvatarError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setAvatarError("Photo library permission is required");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    setAvatarUploading(true);
    try {
      const avatarUrl = await uploadAvatar(authUser.id, uri);
      onProfileUpdate?.({ avatar_url: avatarUrl });
    } catch (err) {
      setAvatarError(err.message || "Upload failed");
    } finally {
      setAvatarUploading(false);
    }
  };

  const saveUsername = async () => {
    const trimmed = usernameDraft.trim();
    if (!trimmed || trimmed === authUser.username) {
      setEditingUsername(false);
      setUsernameDraft(authUser.username);
      return;
    }
    setUsernameSaving(true);
    setUsernameError(null);
    try {
      await updateUsername(authUser.id, trimmed);
      onProfileUpdate?.({ username: trimmed, handle: `${trimmed}@b24.me` });
      setEditingUsername(false);
    } catch (err) {
      setUsernameError(err.message || "Failed to update username");
    } finally {
      setUsernameSaving(false);
    }
  };

  const saveBio = async () => {
    const trimmed = bioDraft.slice(0, 150);
    if (trimmed === (authUser.bio || "")) {
      setEditingBio(false);
      return;
    }
    setBioSaving(true);
    setBioError(null);
    try {
      await updateBio(authUser.id, trimmed);
      onProfileUpdate?.({ bio: trimmed });
      setEditingBio(false);
    } catch (err) {
      setBioError(err.message || "Failed to update bio");
    } finally {
      setBioSaving(false);
    }
  };

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
        {authUser && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Profile</Text>

            <View style={styles.profileRow}>
              <TouchableOpacity onPress={pickAndUploadAvatar} disabled={avatarUploading}>
                {authUser.avatar_url ? (
                  <Image source={{ uri: authUser.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]}>
                    <Text style={styles.avatarPlaceholderText}>
                      {(authUser.username || "?")[0].toUpperCase()}
                    </Text>
                  </View>
                )}
                {avatarUploading && (
                  <View style={styles.avatarOverlay}>
                    <ActivityIndicator color="#fff" size="small" />
                  </View>
                )}
              </TouchableOpacity>

              <View style={styles.profileInfo}>
                {editingUsername ? (
                  <View style={styles.editRow}>
                    <TextInput
                      style={styles.editInput}
                      value={usernameDraft}
                      onChangeText={setUsernameDraft}
                      autoFocus
                      editable={!usernameSaving}
                      maxLength={24}
                    />
                    {usernameSaving ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <TouchableOpacity onPress={saveUsername}>
                          <Text style={styles.editConfirm}>✓</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            setEditingUsername(false);
                            setUsernameDraft(authUser.username);
                            setUsernameError(null);
                          }}
                        >
                          <Text style={styles.editCancel}>✕</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => setEditingUsername(true)}>
                    <Text style={styles.cardValue}>{authUser.username}</Text>
                  </TouchableOpacity>
                )}
                {!!usernameError && <Text style={styles.fieldError}>{usernameError}</Text>}

                {!!authUser.handle && (
                  <Text style={styles.cardSubtle}>{authUser.handle}</Text>
                )}
              </View>
            </View>

            {!!avatarError && <Text style={styles.fieldError}>{avatarError}</Text>}

            <View style={styles.accountRow}>
              <Text style={styles.accountTypeBadge}>
                {(authUser.account_type || "personal").replace("_", " ")}
              </Text>
              {!!authUser.verified && (
                <Text
                  style={[
                    styles.verifiedBadge,
                    authUser.verified === "cyan" && styles.verifiedBadgeCyan,
                  ]}
                >
                  ✓ verified
                </Text>
              )}
            </View>

            <View style={styles.bioBlock}>
              {editingBio ? (
                <View>
                  <TextInput
                    style={[styles.editInput, styles.bioInput]}
                    value={bioDraft}
                    onChangeText={(t) => setBioDraft(t.slice(0, 150))}
                    multiline
                    autoFocus
                    editable={!bioSaving}
                    maxLength={150}
                  />
                  <View style={styles.bioEditActions}>
                    <Text style={styles.cardSubtle}>{bioDraft.length}/150</Text>
                    {bioSaving ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <View style={{ flexDirection: "row", gap: 16 }}>
                        <TouchableOpacity onPress={saveBio}>
                          <Text style={styles.editConfirm}>✓</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            setEditingBio(false);
                            setBioDraft(authUser.bio || "");
                            setBioError(null);
                          }}
                        >
                          <Text style={styles.editCancel}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              ) : (
                <TouchableOpacity onPress={() => setEditingBio(true)}>
                  <Text style={authUser.bio ? styles.bioText : styles.bioPlaceholder}>
                    {authUser.bio || "Add a bio"}
                  </Text>
                </TouchableOpacity>
              )}
              {!!bioError && <Text style={styles.fieldError}>{bioError}</Text>}
            </View>
          </View>
        )}

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

        {authUser && (
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={() => {
              Alert.alert("Sign Out", "Are you sure you want to sign out?", [
                { text: "Cancel", style: "cancel" },
                { text: "Sign Out", style: "destructive", onPress: onSignOutPress },
              ]);
            }}
          >
            <Text style={styles.signOutButtonText}>Sign Out</Text>
          </TouchableOpacity>
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

  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    gap: 8,
  },
  accountTypeBadge: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "capitalize",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: "hidden",
  },
  verifiedBadge: {
    color: "#B983FF",
    fontSize: 11,
    fontWeight: "700",
    backgroundColor: "rgba(185,131,255,0.15)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: "hidden",
  },
  verifiedBadgeCyan: {
    color: "#4FD8E8",
    backgroundColor: "rgba(79,216,232,0.15)",
  },

  signOutButton: {
    backgroundColor: "rgba(255,107,107,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,107,107,0.4)",
    borderRadius: 20,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  signOutButtonText: { color: "#FF6B6B", fontWeight: "700", fontSize: 15 },

  profileRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  avatarPlaceholder: {
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPlaceholderText: { color: "#fff", fontSize: 24, fontWeight: "700" },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  profileInfo: { flex: 1 },

  editRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  editInput: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    borderBottomWidth: 1,
    borderBottomColor: ACCENT,
    paddingVertical: 2,
    flex: 1,
  },
  editConfirm: { color: "#7AC547", fontSize: 20, fontWeight: "800" },
  editCancel: { color: "#FF6B6B", fontSize: 20, fontWeight: "800" },
  fieldError: { color: "#FF6B6B", fontSize: 12, marginTop: 4 },

  bioBlock: { marginTop: 14 },
  bioText: { color: "rgba(255,255,255,0.9)", fontSize: 14, lineHeight: 20 },
  bioPlaceholder: { color: "rgba(255,255,255,0.4)", fontSize: 14, fontStyle: "italic" },
  bioInput: {
    fontSize: 14,
    fontWeight: "400",
    minHeight: 60,
    textAlignVertical: "top",
  },
  bioEditActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
});

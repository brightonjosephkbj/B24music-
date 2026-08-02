import { Platform } from "react-native";
import Constants from "expo-constants";
import appJson from "./app.json";

const API_BASE = "https://nrighton233j-b24music.hf.space";

// Uses the version actually baked into this build (app.json's "version"
// at build time), not some hardcoded string - so this stays correct
// automatically as you bump versions for future releases.
export function getCurrentVersion() {
  // Constants.expoConfig can be empty once an expo-updates OTA is active
  // (our self-hosted manifest does not embed the full app config), and
  // Constants.nativeAppVersion is not reliable in every build - so read
  // straight from the static app.json bundled at build time instead,
  // same approach already confirmed working in SettingsScreen.js.
  return appJson.expo.version || Constants.expoConfig?.version || Constants.nativeAppVersion || "0.0.0";
}

// Talks to your own custom OTA backend (ota.py) - NOT expo-updates. This
// backend does whole-APK replacement (a real download_url + changelog +
// mandatory flag), which is a different mechanism from Expo's JS-bundle-only
// OTA system, so the two should never be mixed.
export async function checkForUpdate() {
  const platform = Platform.OS === "ios" ? "ios" : "android";
  const currentVersion = getCurrentVersion();

  const params = new URLSearchParams({ platform, current_version: currentVersion });
  const res = await fetch(`${API_BASE}/api/ota/check?${params.toString()}`);
  if (!res.ok) throw new Error(`OTA check failed: ${res.status}`);
  return res.json();
  // Shape: { update_available, latest_version, current_version, mandatory,
  // download_url, changelog, published_at }
}

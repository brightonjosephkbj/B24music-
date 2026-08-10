import { Platform } from "react-native";
import Constants from "expo-constants";
import appJson from "./app.json";
import { authedHeaders } from "./apiClient";

const API_BASE = "https://gateway-cah4.onrender.com";

// Uses the version actually baked into this build (app.json's "version"
// at build time), not some hardcoded string - so this stays correct
// automatically as you bump versions for future releases.
export function getCurrentVersion() {
  return appJson.expo.version || Constants.expoConfig?.version || Constants.nativeAppVersion || "0.0.0";
}

// Talks to the shared OTA server's /app/version route, which handles both
// native (APK) update checks and expo-updates runtime-version OTA checks
// in one call. app_id identifies which app is asking (this one: b24music).
//
// Real response shape from /app/version: { version, apk_url, notes,
// update_available, update_type } where update_type is "native", "ota",
// or "none" - NOT { latest_version, mandatory, download_url, changelog }.
// This function normalizes to the shape UpdatePrompt.js expects, since
// the backend has no concept of "mandatory" updates or changelogs yet.
export async function checkForUpdate() {
  const currentVersion = getCurrentVersion();
  const currentRuntimeVersion = Constants.expoConfig?.runtimeVersion
    ?? Constants.manifest2?.runtimeVersion
    ?? currentVersion;

  const params = new URLSearchParams({
    app_id: "b24music",
    current_version: currentVersion,
    current_runtime_version: String(currentRuntimeVersion),
  });

  const res = await fetch(`${API_BASE}/api/apicache/api/ota/app/version?${params.toString()}`, {
    headers: await authedHeaders(),
  });
  if (!res.ok) throw new Error(`OTA check failed: ${res.status}`);
  const data = await res.json();

  // Only surface this as a native-update prompt if the backend actually
  // found a newer native version - "ota" or "none" update_type means
  // there's nothing for UpdatePrompt (the whole-APK-replace UI) to show.
  return {
    update_available: data.update_available && data.update_type === "native",
    latest_version: data.version,
    current_version: currentVersion,
    mandatory: false, // backend has no mandatory-update concept yet
    download_url: data.apk_url,
    changelog: data.notes || null,
  };
}

// ---------------------------------------------------------------------------
// Single source of truth for talking to the B24 gateway. Every request from
// this app must carry X-Gateway-Key or the gateway now rejects it with 401
// (enforced once B24_GATEWAY_API_KEYS was set on Render). Centralizing it
// here means the key only lives in one place instead of copy-pasted into
// every api*.js file - rotate it once, everything picks it up.
// ---------------------------------------------------------------------------

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";

export const API_BASE = "https://gateway-cah4.onrender.com";
const GATEWAY_KEY = "Joy_brightonjosephkbj_Joan";
const AUTH_STORAGE_KEY = "b24_auth";

// Base headers every gateway request needs. Pass extra headers (like
// Content-Type for JSON bodies) via the second arg.
export function gatewayHeaders(extra = {}) {
  return { "X-Gateway-Key": GATEWAY_KEY, ...extra };
}

// Same as gatewayHeaders, but also attaches the signed-in user's JWT if one
// is stored - needed for any route that identifies "who is calling"
// (messages, file ownership checks, profile updates, etc). Safe to call
// even when logged out; just omits Authorization in that case.
export async function authedHeaders(extra = {}) {
  const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
  const user = raw ? JSON.parse(raw) : null;
  const headers = gatewayHeaders(extra);
  if (user?.token) headers["Authorization"] = `Bearer ${user.token}`;
  return headers;
}

// Convenience wrapper: fetch() with the gateway key always attached, JWT
// attached automatically when signed in. Use this instead of bare fetch()
// for any call to API_BASE going forward.
export async function gatewayFetch(path, options = {}) {
  const headers = await authedHeaders(options.headers || {});
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}

// ---------------------------------------------------------------------------
// Profile editing (avatar / username / bio). All three require a signed-in
// user (Bearer token) - callers should guard on authUser being present.
// ---------------------------------------------------------------------------

// Uploads a picked image to the downloads service under category "avatar",
// which routes it to the dedicated Avatar HF dataset repo and forces it
// public. Returns the resulting public URL, or throws on failure.
export async function uploadAvatar(userId, fileUri) {
  // FileSystem.uploadAsync (not fetch+FormData) - the picker's URI is often
  // a content:// path on Android that RN's own FormData/fetch layer can't
  // always serialize ("Unsupported FormDataPart implementation"). This is
  // a native multipart uploader purpose-built to handle that correctly.
  const headers = await authedHeaders(); // no Content-Type - native layer sets multipart boundary
  const uploadRes = await FileSystem.uploadAsync(
    `${API_BASE}/api/downloads/files/upload`,
    fileUri,
    {
      fieldName: "file",
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      headers,
      parameters: { app_id: "b24music", category: "avatar" },
    }
  );
  const uploadData = JSON.parse(uploadRes.body || "{}");
  if (uploadRes.status < 200 || uploadRes.status >= 300 || !uploadData.ok) {
    throw new Error(uploadData.error || "Avatar upload failed");
  }
  const avatarUrl = uploadData.data.url;

  const setRes = await fetch(`${API_BASE}/api/db/users/${userId}/avatar`, {
    method: "POST",
    headers: await authedHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ avatar_url: avatarUrl }),
  });
  const setData = await setRes.json().catch(() => ({}));
  if (!setRes.ok || !setData.ok) {
    throw new Error(setData.error || "Failed to set avatar");
  }
  return avatarUrl;
}

// Returns the new username on success, or throws with the server's error
// message (e.g. "That username is already taken").
export async function updateUsername(userId, newUsername) {
  const res = await fetch(`${API_BASE}/api/db/users/${userId}/username`, {
    method: "POST",
    headers: await authedHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ new_username: newUsername }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Failed to update username");
  }
  return newUsername;
}

export async function updateBio(userId, bio) {
  const res = await fetch(`${API_BASE}/api/db/users/${userId}/bio`, {
    method: "POST",
    headers: await authedHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ bio }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Failed to update bio");
  }
  return bio;
}


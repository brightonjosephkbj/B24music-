const API_BASE = "https://nrighton233j-b24music.hf.space";

// Matches backend/ota.py's /check route: takes platform + current_version,
// returns { update_available, latest_version, current_version, mandatory,
// download_url, changelog, published_at }.
export async function checkForUpdate(platform, currentVersion) {
  const res = await fetch(
    `${API_BASE}/api/ota/check?platform=${encodeURIComponent(platform)}&current_version=${encodeURIComponent(currentVersion)}`
  );
  if (!res.ok) throw new Error(`Update check failed: ${res.status}`);
  return res.json();
}

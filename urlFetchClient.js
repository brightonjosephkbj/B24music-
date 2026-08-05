// ---------------------------------------------------------------------------
// "Paste a URL" resolution, client-first: try to find a direct playable
// media URL by scraping the page's raw HTML ourselves - a plain fetch() run
// right on the phone, no backend involved at all. Only when that comes up
// empty do we fall back to the backend's yt-dlp endpoint, which handles
// sites that hide the real stream URL behind obfuscated JS (YouTube, etc.).
// ---------------------------------------------------------------------------

const API_BASE = "https://nrighton233j-b24music.hf.space";

// Plain fetch() has no built-in timeout, and we've already seen (the hung
// yt-dlp curl test) how badly a stuck request can stall a UI. The scrape
// path is supposed to be the *fast* option, so if a page hasn't responded
// in 12s, bail out and let the backend fallback take over instead of
// leaving the user staring at a spinner.
async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function firstMatch(re, html) {
  const m = html.match(re);
  return m ? m[1] : null;
}

// Looks for a direct .mp4/.m3u8/.webm URL, a <video>/<source> tag, or an
// og:video meta tag, in that order of confidence. Works well on simple
// sites that don't hide their video behind JS - returns null on anything
// obfuscated, which is exactly the signal we want to trigger the fallback.
function extractDirectVideoUrl(html) {
  const ogVideo =
    firstMatch(/<meta[^>]+property=["']og:video(?::url)?["'][^>]+content=["']([^"']+)["']/i, html) ||
    firstMatch(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video(?::url)?["']/i, html);
  if (ogVideo) return ogVideo;

  const videoTag =
    firstMatch(/<video[^>]+src=["']([^"']+)["']/i, html) ||
    firstMatch(/<video[^>]*>[\s\S]{0,500}?<source[^>]+src=["']([^"']+)["']/i, html);
  if (videoTag) return videoTag;

  const rawFileUrl = firstMatch(/https?:\/\/[^\s"'<>\\]+\.(?:mp4|m3u8|webm)(?:\?[^\s"'<>\\]*)?/i, html);
  return rawFileUrl || null;
}

function extractTitle(html) {
  const ogTitle = firstMatch(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i, html);
  if (ogTitle) return ogTitle;
  const titleTag = firstMatch(/<title[^>]*>([^<]+)<\/title>/i, html);
  return titleTag ? titleTag.trim() : null;
}

function extractThumbnail(html) {
  return firstMatch(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i, html);
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "web";
  }
}

function resolveMaybeRelative(maybeRelativeUrl, pageUrl) {
  if (/^https?:\/\//i.test(maybeRelativeUrl)) return maybeRelativeUrl;
  try {
    return new URL(maybeRelativeUrl, pageUrl).toString();
  } catch {
    return maybeRelativeUrl;
  }
}

// Attempt 1: scrape the page directly from the phone. Returns a
// track-shaped object on success, or null if nothing usable was found (the
// caller should fall back to the backend in that case, not treat it as an
// error - most sites simply won't match this simple pattern).
export async function tryClientSideFetch(pageUrl) {
  const res = await fetchWithTimeout(pageUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 10)" },
  });
  if (!res.ok) return null;
  const html = await res.text();

  const videoUrl = extractDirectVideoUrl(html);
  if (!videoUrl) return null;

  return {
    id: `scrape_${Date.now()}`,
    provider: "scrape",
    type: "video",
    title: extractTitle(html) || "Untitled video",
    artist: hostnameOf(pageUrl),
    artwork: extractThumbnail(html) || null,
    stream_url: resolveMaybeRelative(videoUrl, pageUrl),
    downloadUrl: resolveMaybeRelative(videoUrl, pageUrl),
    duration: 0,
  };
}

// Attempt 2: ask the backend's yt-dlp endpoint for metadata only. The
// actual file only gets produced later, by hitting /api/fetch/download -
// see backendDownloadUrl() below.
export async function fetchInfoFromBackend(pageUrl) {
  const params = new URLSearchParams({ url: pageUrl });
  const res = await fetch(`${API_BASE}/api/fetch/info?${params.toString()}`);
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);

  return {
    id: `ytdlp_${Date.now()}`,
    provider: "ytdlp",
    type: "video", // caller can still choose an audio-only download separately
    title: data.title || "Untitled",
    artist: data.uploader || hostnameOf(pageUrl),
    artwork: data.thumbnail || null,
    duration: data.duration || 0,
    sourceUrl: pageUrl,
  };
}

// The one entry point the UI calls: tries the free client-side scrape
// first, and only touches the backend if that comes back empty or errors.
export async function resolveUrl(pageUrl) {
  try {
    const direct = await tryClientSideFetch(pageUrl);
    if (direct) return { ...direct, method: "scrape" };
  } catch {
    // Network hiccup, timeout, or a page that blocks non-browser fetches -
    // fall through to the backend rather than surfacing this as an error.
  }
  const viaBackend = await fetchInfoFromBackend(pageUrl);
  return { ...viaBackend, method: "ytdlp" };
}

// Builds the download URL for the yt-dlp fallback path.
export function backendDownloadUrl(pageUrl, mode) {
  const params = new URLSearchParams({ url: pageUrl, mode });
  return `${API_BASE}/api/fetch/download?${params.toString()}`;
}

// Resolves a URL to a real, directly-downloadable stream_url via Lightning.ai's
// yt-dlp setup (fast, PO-token capable, avoids HF's datacenter-IP blocking).
// Returns { stream_url, title, mimetype, ext } - caller downloads straight
// from stream_url, which points at Lightning's own /media/<job_id> route.
export async function lightningExtract(pageUrl, mode = "audio", quality = "medium") {
  const params = new URLSearchParams({ url: pageUrl, mode, quality });
  const res = await fetch(`${API_BASE}/api/fetch/lightning_stream?${params.toString()}`);
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Server responded ${res.status}`);
  }
  if (data.error) throw new Error(data.error);
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  return data;
}

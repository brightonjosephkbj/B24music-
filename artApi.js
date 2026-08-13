import { authedHeaders } from "./apiClient";

const API_BASE = "https://gateway-cah4.onrender.com";

// Normalizes all three art backends into one shape the grid + ImageViewer
// both understand: { id, title, artist, date, credit, license, thumbnail,
// image, download_url, source }.

function normalizeArtic(item) {
  return {
    id: `artic_${item.id}`,
    title: item.title || "Untitled",
    artist: item.artist || "Unknown artist",
    date: item.date,
    credit: [item.medium, item.department].filter(Boolean).join(" \u00b7 "),
    license: item.is_public_domain ? "Public domain" : null,
    thumbnail: item.image, // Art Institute only returns one fixed-size (843px) image
    image: item.image,
    download_url: item.image,
    source: "artic",
  };
}

function normalizeMet(item) {
  return {
    id: `met_${item.id}`,
    title: item.title || "Untitled",
    artist: item.artist || "Unknown artist",
    date: item.date,
    credit: item.credit_line,
    license: item.is_public_domain ? "Public domain" : null,
    thumbnail: item.thumbnail || item.image,
    image: item.image,
    download_url: item.download_url || item.image,
    source: "met",
  };
}

function normalizeCommons(item) {
  return {
    id: `commons_${item.title}`,
    title: item.title || "Untitled",
    artist: item.artist || "Wikimedia Commons",
    date: null,
    credit: item.description,
    license: item.license,
    thumbnail: item.thumbnail || item.full_image,
    image: item.full_image,
    download_url: item.download_url || item.full_image,
    source: "commons",
  };
}

// Art Institute is the only source with a real browse endpoint (no query
// needed). Picking a random page each call is what gives the "keep
// swiping, new stuff appears" random-discovery feel for the default feed.
export async function fetchArticRandomPage(limit = 24) {
  const randomPage = Math.floor(Math.random() * 60) + 1; // ~60 pages of variety
  const res = await fetch(`${API_BASE}/api/apicache/api/art/browse?page=${randomPage}&limit=${limit}`, { headers: await authedHeaders() });
  if (!res.ok) throw new Error(`Art Institute request failed: ${res.status}`);
  const data = await res.json();
  return (data.artworks || []).map(normalizeArtic).filter((a) => a.image);
}

export async function searchArtic(query, limit = 24) {
  const res = await fetch(`${API_BASE}/api/apicache/api/art/search?q=${encodeURIComponent(query)}&limit=${limit}`, { headers: await authedHeaders() });
  if (!res.ok) throw new Error(`Art Institute search failed: ${res.status}`);
  const data = await res.json();
  return (data.artworks || []).map(normalizeArtic).filter((a) => a.image);
}

export async function searchMet(query, limit = 24) {
  const res = await fetch(`${API_BASE}/api/apicache/api/met/search?q=${encodeURIComponent(query)}&limit=${limit}`, { headers: await authedHeaders() });
  if (!res.ok) throw new Error(`Met search failed: ${res.status}`);
  const data = await res.json();
  return (data.artworks || []).map(normalizeMet).filter((a) => a.image);
}

export async function searchCommons(query, limit = 24) {
  const res = await fetch(`${API_BASE}/api/apicache/api/commons/search?q=${encodeURIComponent(query)}&limit=${limit}`, { headers: await authedHeaders() });
  if (!res.ok) throw new Error(`Commons search failed: ${res.status}`);
  const data = await res.json();
  return (data.images || []).map(normalizeCommons).filter((a) => a.image);
}

// Fires all three in parallel and merges - a failed source doesn't sink
// the others, it just contributes nothing.
export async function searchAllSources(query, limit = 24) {
  const [artic, met, commons] = await Promise.allSettled([
    searchArtic(query, limit),
    searchMet(query, limit),
    searchCommons(query, limit),
  ]);
  return [
    ...(artic.status === "fulfilled" ? artic.value : []),
    ...(met.status === "fulfilled" ? met.value : []),
    ...(commons.status === "fulfilled" ? commons.value : []),
  ];
}

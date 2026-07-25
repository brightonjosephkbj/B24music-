const API_BASE = "https://nrighton233j-b24music.hf.space";

// A curated set of well-known cities with lat/lon baked in, so the
// "random weather in different places" cards don't need a geocode
// round-trip per city - just straight to /current for each.
export const RANDOM_CITIES = [
  { name: "Kampala", country: "Uganda", latitude: 0.3476, longitude: 32.5825 },
  { name: "Nairobi", country: "Kenya", latitude: -1.2921, longitude: 36.8219 },
  { name: "Lagos", country: "Nigeria", latitude: 6.5244, longitude: 3.3792 },
  { name: "Cairo", country: "Egypt", latitude: 30.0444, longitude: 31.2357 },
  { name: "London", country: "UK", latitude: 51.5072, longitude: -0.1276 },
  { name: "Paris", country: "France", latitude: 48.8566, longitude: 2.3522 },
  { name: "New York", country: "USA", latitude: 40.7128, longitude: -74.0060 },
  { name: "Tokyo", country: "Japan", latitude: 35.6762, longitude: 139.6503 },
  { name: "Dubai", country: "UAE", latitude: 25.2048, longitude: 55.2708 },
  { name: "Sydney", country: "Australia", latitude: -33.8688, longitude: 151.2093 },
  { name: "Rio de Janeiro", country: "Brazil", latitude: -22.9068, longitude: -43.1729 },
  { name: "Mumbai", country: "India", latitude: 19.0760, longitude: 72.8777 },
  { name: "Cape Town", country: "South Africa", latitude: -33.9249, longitude: 18.4241 },
  { name: "Reykjavik", country: "Iceland", latitude: 64.1466, longitude: -21.9426 },
  { name: "Moscow", country: "Russia", latitude: 55.7558, longitude: 37.6173 },
];

export function pickRandomCities(count = 6) {
  const shuffled = [...RANDOM_CITIES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export async function geocodeSearch(query) {
  const res = await fetch(`${API_BASE}/api/weather/geocode?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
  const data = await res.json();
  return data.results || [];
}

export async function fetchCurrentWeather(lat, lon) {
  const res = await fetch(`${API_BASE}/api/weather/current?lat=${lat}&lon=${lon}`);
  if (!res.ok) throw new Error(`Weather request failed: ${res.status}`);
  return res.json();
}

// Maps a weather_code (Open-Meteo's WMO codes, mirrored in the backend) to
// a background gradient + a short emoji glyph for the card. Grouped by
// broad condition family rather than one entry per code.
export function conditionTheme(code) {
  if (code === 0 || code === 1) {
    return { colors: ["#4A90D9", "#87CEEB", "#FFD97D"], glyph: "\u2600\ufe0f", label: "Clear" }; // sunny blue -> gold
  }
  if (code === 2 || code === 3) {
    return { colors: ["#6B7A8F", "#A0AEC0", "#CBD5E0"], glyph: "\u26c5", label: "Cloudy" };
  }
  if (code === 45 || code === 48) {
    return { colors: ["#5C6670", "#8A94A0", "#B0B8C1"], glyph: "\ud83c\udf2b\ufe0f", label: "Fog" };
  }
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) {
    return { colors: ["#33475B", "#4A6B8A", "#6E9BC4"], glyph: "\ud83c\udf27\ufe0f", label: "Rain" };
  }
  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return { colors: ["#8A9BB0", "#C3D0DE", "#F0F4F8"], glyph: "\u2744\ufe0f", label: "Snow" };
  }
  if ([95, 96, 99].includes(code)) {
    return { colors: ["#2B1A3D", "#4A2E5C", "#6B4A8A"], glyph: "\u26c8\ufe0f", label: "Storm" };
  }
  return { colors: ["#4A5568", "#718096", "#A0AEC0"], glyph: "\ud83c\udf24\ufe0f", label: "Unknown" };
}

import { gatewayHeaders } from "./apiClient";

const API_BASE = "https://gateway-cah4.onrender.com";

// Open Food Facts has no "random product" endpoint, so the default grid
// is built the same way Weather's random cities are: a curated list of
// common search terms, one product picked from each result set.
const RANDOM_FOOD_QUERIES = [
  "chocolate", "pizza", "cereal", "yogurt", "bread", "cheese",
  "peanut butter", "orange juice", "pasta", "potato chips",
  "ice cream", "coffee",
];

export function pickRandomQueries(count = 6) {
  const shuffled = [...RANDOM_FOOD_QUERIES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export async function searchFood(query, limit = 10) {
  const res = await fetch(`${API_BASE}/api/apicache/api/food/search?q=${encodeURIComponent(query)}&limit=${limit}`, { headers: gatewayHeaders() });
  if (!res.ok) throw new Error(`Food search failed: ${res.status}`);
  const data = await res.json();
  return data.products || [];
}

export async function fetchRandomFoodCards(count = 6) {
  const queries = pickRandomQueries(count);
  const results = await Promise.allSettled(
    queries.map(async (q) => {
      const products = await searchFood(q, 1);
      return products[0];
    })
  );
  return results
    .filter((r) => r.status === "fulfilled" && r.value)
    .map((r) => r.value);
}

export async function getByBarcode(barcode) {
  const res = await fetch(`${API_BASE}/api/apicache/api/food/barcode/${encodeURIComponent(barcode)}`, { headers: gatewayHeaders() });
  const data = await res.json();
  if (!data.found) return null;
  return data.product;
}

// Nutri-Score letter -> color, standard scheme used across food-scanning apps.
export function nutriscoreColor(grade) {
  const map = { a: "#1E8F4E", b: "#7AC547", c: "#FFC734", d: "#FF8C42", e: "#E63946" };
  return map[(grade || "").toLowerCase()] || "#6B7280";
}

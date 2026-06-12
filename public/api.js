/**
 * Tiny AJAX wrapper around the Express backend.
 * Stores the JWT token in localStorage.
 */

const TOKEN_KEY = "partyfindr_token";

const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

async function request(path, options = {}) {
  const token = tokenStore.get();
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((data && data.error) || "Request failed");
  return data;
}

const api = {
  register: (input) => request("/auth/register", { method: "POST", body: JSON.stringify(input) }),
  login:    (input) => request("/auth/login",    { method: "POST", body: JSON.stringify(input) }),
  me:       () => request("/auth/me").then(r => r.user),
  listParties:  () => request("/parties"),
  getParty:     (id) => request("/parties/" + id),
  createParty:  (input) => request("/parties", { method: "POST", body: JSON.stringify(input) }),
  updateParty:  (id, input) => request("/parties/" + id, { method: "PUT", body: JSON.stringify(input) }),
  deleteParty:  (id) => request("/parties/" + id, { method: "DELETE" }),
  attendParty:  (id) => request("/parties/" + id + "/attend", { method: "POST" }),
  unattendParty: (id) => request("/parties/" + id + "/attend", { method: "DELETE" }),
  myAttended:   () => request("/me/attended"),
};

// Open-Meteo weather (no API key required)
async function fetchWeather(lat, lng) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.current;
  } catch { return null; }
}

async function fetchPlaceName(lat, lng) {
  const res = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
  const data = await res.json();
  return data.place;
}

function weatherEmoji(code) {
  if (code == null) return "";
  if (code === 0) return "☀️";
  if (code < 3) return "🌤️";
  if (code < 50) return "☁️";
  if (code < 70) return "🌧️";
  if (code < 80) return "❄️";
  return "⛈️";
}

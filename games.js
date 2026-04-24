// API configuration for catalog page requests.
const API_KEY = "8d195865436943f4a5ac7e55e21f9a7b";
const API_BASE_URL = "https://api.gamebrain.co/v1";
const CATALOG_COUNT = 20;

// Root container where catalog cards are rendered.
const gameContainer = document.getElementById("gameContainer");

// Formats API score from 0-1 scale to user-friendly 0-10 scale.
function scoreText(game) {
  return typeof game?.rating?.mean === "number"
    ? `${(game.rating.mean * 10).toFixed(1)}/10`
    : "N/A";
}

function gameId(game) {
  return game?.id || game?.game_id || game?._id || game?.slug || game?.name;
}

function gameName(game) {
  return String(game?.name || "").trim() || "Untitled Game";
}

// Chooses the primary platform text for a card.
function platformText(game) {
  const list = [
    ...(Array.isArray(game.platforms) ? game.platforms : []),
    ...(Array.isArray(game.platform) ? game.platform : [game.platform]),
  ]
    .map((p) => {
      if (!p) return "";
      if (typeof p === "string") return p;
      return p.name || p.platform?.name || p.slug || "";
    })
    .filter(Boolean);

  const unique = [...new Set(list)];
  // Show only the first platform; fall back to genre from list endpoint
  return unique.length ? unique[0] : (sanitizeText(game.genre) || "Unknown");
}

// Sanitizes incoming text fields from the API payload.
function sanitizeText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Recursively scans game payloads to discover a description-like value.
function findDescriptionCandidate(input, depth = 0) {
  if (!input || depth > 4) return "";

  if (typeof input === "string") {
    const cleaned = sanitizeText(input);
    return cleaned.length >= 20 ? cleaned : "";
  }

  if (Array.isArray(input)) {
    let best = "";
    input.forEach((item) => {
      const candidate = findDescriptionCandidate(item, depth + 1);
      if (candidate.length > best.length) best = candidate;
    });
    return best;
  }

  if (typeof input === "object") {
    const preferredKeyMatch = /(description|summary|overview|synopsis|about|blurb|story)/i;
    let best = "";

    Object.entries(input).forEach(([key, value]) => {
      if (!preferredKeyMatch.test(key)) return;
      const candidate = findDescriptionCandidate(value, depth + 1);
      if (candidate.length > best.length) best = candidate;
    });

    return best;
  }

  return "";
}

// Utility used for handling API boolean-like values.
function toBool(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

// Detects whether a game should be marked as adult-only.
function isAdultGame(game) {
  if (toBool(game?.tag?.adult_only)) return true;
  if (toBool(game?.adult_only)) return true;
  if (toBool(game?.tags?.adult_only)) return true;

  if (Array.isArray(game?.tags)) {
    for (const tag of game.tags) {
      if (typeof tag === "object" && tag && toBool(tag.adult_only)) return true;
      if (typeof tag === "string" && tag.toLowerCase() === "adult_only") return true;
    }
  }

  return false;
}

// Stores extra template fields used by the details page fallback behavior.
function buildTemplateGameData(game) {
  return {
    ...game,
    template_short_description: sanitizeText(
      game.short_description || game["short description"] || game.shortDescription,
    ),
    template_description: sanitizeText(
      game.description || game.summary || game.overview || game.synopsis,
    ),
    template_discovered_description: findDescriptionCandidate(game),
  };
}

// Persists selected game data to session storage before navigation.
function saveSelectedGame(game) {
  try {
    sessionStorage.setItem("selectedGame", JSON.stringify(buildTemplateGameData(game)));
  } catch {
    // Ignore storage errors.
  }
}

// Removes duplicate game entries by a normalized identifier.
function uniqueById(games) {
  const seen = new Set();
  const output = [];

  games.forEach((game) => {
    const id = String(gameId(game) || "");
    if (!id || seen.has(id)) return;
    seen.add(id);
    output.push(game);
  });

  return output;
}

// Fetches catalog entries with multiple sort parameter fallbacks.
async function fetchCatalogGames() {
  const paramSets = [
    { limit: String(CATALOG_COUNT), sort: "-rating.count" },
    { limit: String(CATALOG_COUNT), ordering: "-rating.count" },
    { limit: String(CATALOG_COUNT), sort: "-rating.mean" },
    { limit: String(CATALOG_COUNT), ordering: "-rating.mean" },
    { limit: String(CATALOG_COUNT) },
  ];

  for (const paramSet of paramSets) {
    try {
      const params = new URLSearchParams(paramSet);
      const response = await fetch(`${API_BASE_URL}/games?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) continue;

      const data = await response.json();
      const results = Array.isArray(data?.results) ? uniqueById(data.results) : [];
      if (results.length) return results.slice(0, CATALOG_COUNT);
    } catch {
      // Try next params set.
    }
  }

  return [];
}

// Builds one catalog card and wires the "View Entry" action.
function renderCard(game) {
  const card = document.createElement("article");
  card.className = "game-card";

  const id = encodeURIComponent(String(gameId(game) || ""));
  const name = gameName(game);
  const image = game.image || "https://via.placeholder.com/400x200?text=No+Image";
  const linkHref = `gamedetails.html?id=${id}&from=games`;
  const adult = isAdultGame(game);

  card.innerHTML = `
    <div class="thumb-wrap">
      <img src="${image}" alt="${name}" loading="lazy" class="${adult ? "adult-thumb" : ""}" />
      ${adult ? '<span class="adult-badge">18+</span>' : ""}
    </div>
    <h3 class="game-title">${name}</h3>
    <p class="game-meta">Platform: ${platformText(game)} | Rating: ${scoreText(game)}</p>
    <a href="${linkHref}" class="view-entry">View Entry</a>
  `;

  const viewLink = card.querySelector(".view-entry");
  viewLink.addEventListener("click", () => saveSelectedGame(game));

  return card;
}

// Displays a simple error card in the catalog container.
function renderError(text) {
  gameContainer.innerHTML = `<div class="card">${text}</div>`;
}

// Main page bootstrap: load, render, and handle empty/error states.
async function initCatalog() {
  if (!gameContainer) return;

  gameContainer.innerHTML = '<div class="card">Loading catalog…</div>';

  const games = await fetchCatalogGames();
  if (!games.length) {
    renderError("Unable to load games right now. Please try again shortly.");
    return;
  }

  gameContainer.innerHTML = "";
  games.forEach((game) => gameContainer.appendChild(renderCard(game)));
}

// Start catalog page behavior on script load.
initCatalog();

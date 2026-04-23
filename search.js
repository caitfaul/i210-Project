const API_KEY = "8d195865436943f4a5ac7e55e21f9a7b";
const API_BASE_URL = "https://api.gamebrain.co/v1";
const REQUEST_LIMIT = 10;
const SEARCH_STORAGE_KEY = "gamebrain:lastSearch";

const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const clearButton = document.getElementById("clearButton");
const resultsDiv = document.getElementById("results");
const messageDiv = document.getElementById("message");

const cache = new Map();
let requestCount = 0;

function saveSearchQuery(value) {
  try {
    localStorage.setItem(SEARCH_STORAGE_KEY, value);
  } catch {
    // Ignore storage errors
  }
}

function restoreSearchQuery() {
  try {
    const saved = localStorage.getItem(SEARCH_STORAGE_KEY);
    if (saved) {
      searchInput.value = saved;
    }
  } catch {
    // Ignore storage errors
  }
}

function setMessage(text, error = false) {
  messageDiv.classList.remove("hidden");
  messageDiv.className = error ? "msg err" : "msg";
  messageDiv.textContent = text;
}

function clearMessage() {
  messageDiv.classList.add("hidden");
}

function platformText(game) {
  const platforms = [
    ...(Array.isArray(game.platforms) ? game.platforms : []),
    ...(Array.isArray(game.platform) ? game.platform : [game.platform]),
  ]
    .map((p) => {
      if (!p) return "";
      if (typeof p === "string") return p;
      return p.name || p.platform?.name || p.slug || "";
    })
    .filter(Boolean);

  const unique = [...new Set(platforms)];
  return unique.length ? unique.join(", ") : "Unknown";
}

function scoreText(game) {
  return typeof game?.rating?.mean === "number"
    ? `${(game.rating.mean * 10).toFixed(1)}/10`
    : "N/A";
}

function getGameId(game) {
  return game.id || game.game_id || game._id || game.slug || game.name;
}

function toBool(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function hasAdultOnlyTag(game) {
  // Most direct shapes from API responses
  if (toBool(game?.tag?.adult_only)) return true;
  if (toBool(game?.adult_only)) return true;

  // tags can be object/array/string in some payloads
  if (toBool(game?.tags?.adult_only)) return true;

  if (Array.isArray(game?.tags)) {
    for (const tag of game.tags) {
      if (typeof tag === "object" && tag && toBool(tag.adult_only)) return true;
      if (typeof tag === "string" && tag.toLowerCase() === "adult_only") return true;
    }
  }

  return false;
}

function isAdultGame(game) {
  if (hasAdultOnlyTag(game)) return true;

  const directFlags = [game.adult, game.nsfw, game.is_adult, game.isAdult].some(
    (value) => value === true || value === 1 || value === "true",
  );

  if (directFlags) return true;

  const ageText = [
    game.age_rating,
    game.ageRating,
    game.esrb_rating,
    game.esrb,
    game.content_rating,
    game.contentRating,
  ]
    .map((v) => (v == null ? "" : String(v)))
    .join(" ")
    .toLowerCase();

  if (/(18\+|ao|adults? only|mature 17\+|mature 18\+)/i.test(ageText)) {
    return true;
  }

  const genres = [
    game.genre,
    ...(Array.isArray(game.genres)
      ? game.genres.map((g) => (typeof g === "string" ? g : g?.name || ""))
      : []),
    game.tags,
  ]
    .flat()
    .map((v) => (v == null ? "" : String(v)))
    .join(" ")
    .toLowerCase();

  return /(adult|erotic|hentai|nsfw|porn|sexual)/i.test(genres);
}

function sanitizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

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

function buildTemplateGameData(game) {
  const shortDescription = sanitizeText(
    game.short_description || game["short description"] || game.shortDescription,
  );
  const longDescription = sanitizeText(
    game.description || game.summary || game.overview || game.synopsis,
  );
  const discoveredDescription = findDescriptionCandidate(game);

  return {
    ...game,
    template_adult_only: hasAdultOnlyTag(game),
    template_short_description: shortDescription,
    template_description: longDescription,
    template_discovered_description: discoveredDescription,
  };
}

function openGameTemplate(game) {
  const gameId = getGameId(game);
  const templateGame = buildTemplateGameData(game);
  sessionStorage.setItem("selectedGame", JSON.stringify(templateGame));
  window.location.href = `gamedetails.html?id=${encodeURIComponent(gameId)}`;
}

function renderResults(games) {
  resultsDiv.innerHTML = "";

  if (!games.length) {
    setMessage("No games found. Try a different search.");
    return;
  }

  clearMessage();

  games.forEach((game) => {
    const card = document.createElement("article");
    card.className = "card";
    const adult = isAdultGame(game);

    const image = game.image || "https://via.placeholder.com/600x340?text=No+Image";
    const release = game.release_date || game.year || "TBA";
    card.innerHTML = `
      <div class="thumb-wrap">
        <img
          src="${image}"
          alt="${game.name || "Game"}"
          loading="lazy"
          class="${adult ? "adult-thumb" : ""}"
        />
        ${adult ? '<span class="adult-badge">18+</span>' : ""}
      </div>
      <div class="card-body">
        <h3>${game.name || "Untitled Game"}</h3>
        <p class="meta"><strong>Score:</strong> ${scoreText(game)}</p>
        <p class="meta"><strong>Released:</strong> ${release}</p>
        <p class="meta"><strong>Platforms:</strong> ${platformText(game)}</p>
        <div class="card-actions">
          <button class="toggle-btn" type="button">Show details</button>
        </div>
      </div>
    `;

    const toggleBtn = card.querySelector(".toggle-btn");
    toggleBtn.addEventListener("click", () => openGameTemplate(game));

    resultsDiv.appendChild(card);
  });
}

function buildSearchURL(query) {
  const params = new URLSearchParams();
  params.append("query", query);
  params.append("limit", "30");
  return `${API_BASE_URL}/games?${params.toString()}`;
}

function httpErrorText(status) {
  if (status === 401 || status === 403) return "API key/auth issue (401/403).";
  if (status === 402) return "Plan limit reached for this endpoint (402).";
  if (status === 429) return "Rate limit hit (429).";
  return `Request failed (${status}).`;
}

async function searchGames() {
  const query = searchInput.value.trim();

  if (!query) {
    setMessage("Enter a search term.", true);
    return;
  }

  if (!API_KEY || API_KEY === "YOUR_API_KEY") {
    setMessage("Set a valid API key first.", true);
    return;
  }

  const key = query.toLowerCase();
  saveSearchQuery(query);

  if (cache.has(key)) {
    renderResults(cache.get(key));
    return;
  }

  if (requestCount >= REQUEST_LIMIT) {
    setMessage(
      "Session request cap reached. Reuse prior searches or reload later.",
      true,
    );
    return;
  }

  searchButton.disabled = true;
  setMessage("Searching...");

  try {
    const response = await fetch(buildSearchURL(query), {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    requestCount += 1;

    if (!response.ok) {
      setMessage(httpErrorText(response.status), true);
      return;
    }

    const data = await response.json();
    const games = Array.isArray(data.results) ? data.results : [];
    cache.set(key, games);
    renderResults(games);
  } catch {
    setMessage("Network error. Check your connection and try again.", true);
  } finally {
    searchButton.disabled = false;
  }
}

searchButton.addEventListener("click", searchGames);
searchInput.addEventListener("input", () => {
  saveSearchQuery(searchInput.value);
  clearButton.style.display = searchInput.value ? "block" : "none";
});
searchInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") searchGames();
});
clearButton.addEventListener("click", () => {
  searchInput.value = "";
  saveSearchQuery("");
  clearButton.style.display = "none";
  resultsDiv.innerHTML = "";
  clearMessage();
  searchInput.focus();
});

restoreSearchQuery();
if (searchInput.value) clearButton.style.display = "block";
setMessage("Ready. Search by game title or platform keyword.");

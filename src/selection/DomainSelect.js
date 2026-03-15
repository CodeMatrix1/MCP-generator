import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import numTokensFromString from "../LLM_calls/lib/tiktoken-script.js";
import { runGeminiPrompt, sanitizeGeminiJson } from "../core/llm/geminiCli.js";
import { fuzzyMatch, tokenize } from "../core/query/textMatching.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");

const tagIndex = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "data", "tag_index.json"), "utf8")
);

const CATEGORY_HINTS = {
  authentication: ["auth", "login", "token", "session", "password", "2fa"],
  "content-management": ["asset", "emoji", "sound", "status", "upload"],
  integrations: ["integration", "oauth", "webdav", "app"],
  "marketplace-apps": ["marketplace", "app", "jitsi", "whatsapp", "rasa"],
  messaging: ["message", "chat", "dm", "thread", "send", "history"],
  miscellaneous: ["command", "mail", "calendar", "license"],
  notifications: ["notification", "push", "banner", "alert"],
  omnichannel: ["livechat", "omnichannel", "visitor", "department", "inquiry", "transcript"],
  rooms: ["room", "channel", "group", "team", "invite"],
  statistics: ["analytics", "stat", "engagement", "report", "metrics"],
  "user-management": ["user", "role", "permission", "ldap", "profile"],
  settings: ["setting", "config", "dns", "federation", "policy"],
};

function scoreByHints(tokens, hints) {
  let score = 0;
  for (const hint of hints) {
    if (tokens.some((token) => fuzzyMatch(token, hint))) {
      score += 1;
    }
  }
  return score;
}

function pickTagsForCategory(category, queryTokens, maxTags = 4) {
  const tags = Object.keys(tagIndex[category] || {});
  if (tags.length === 0) return [];

  const scored = tags
    .map((tag) => {
      const tagTokens = tokenize(tag);
      let score = 0;
      for (const q of queryTokens) {
        if (tagTokens.some((t) => fuzzyMatch(t, q))) score += 2;
      }
      return { tag, score };
    })
    .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag));

  const selected = scored.filter((s) => s.score > 0).slice(0, maxTags).map((s) => s.tag);
  if (selected.length > 0) return selected;

  return tags.slice(0, Math.min(2, tags.length));
}

function buildDomainPrompt(userQuery) {
  const lines = Object.entries(tagIndex)
    .map(([category, tags]) => `${category}: ${Object.keys(tags).join(", ")}`)
    .join("\n");

  return `
Select the most relevant Rocket.Chat categories and tags for this user request.
Return strict JSON object only, no markdown.
Output shape:
{
  "category-name": ["Tag A", "Tag B"]
}

Rules:
- Choose 2-4 categories maximum.
- Choose 1-4 tags per category.
- Use category and tag names exactly as provided below.
- Do not invent names.

User query:
${userQuery}

Available category -> tags:
${lines}
`;
}

function normalizeCategoryTagMap(candidate) {
  const result = {};
  if (!candidate || typeof candidate !== "object") return result;

  for (const [category, tags] of Object.entries(candidate)) {
    if (!(category in tagIndex) || !Array.isArray(tags)) continue;

    const knownTags = tagIndex[category];
    const valid = tags
      .map((tag) => String(tag).trim())
      .filter((tag) => tag in knownTags)
      .slice(0, 4);

    if (valid.length > 0) result[category] = valid;
  }

  return result;
}

function classifyDomainFallback(userQuery) {
  const query = String(userQuery || "").trim();
  const tokens = tokenize(query);

  const scoredCategories = Object.keys(tagIndex)
    .map((category) => {
      const hints = CATEGORY_HINTS[category] || [];
      const score = scoreByHints(tokens, hints);
      return { category, score };
    })
    .sort((a, b) => b.score - a.score || a.category.localeCompare(b.category));

  let selectedCategories = scoredCategories
    .filter((entry) => entry.score > 0)
    .slice(0, 4)
    .map((entry) => entry.category);

  if (selectedCategories.length === 0) {
    selectedCategories = ["rooms", "messaging", "user-management"].filter((c) => c in tagIndex);
  }

  const result = {};
  for (const category of selectedCategories) {
    result[category] = pickTagsForCategory(category, tokens);
  }

  return result;
}

export async function classifyDomain(userQuery) {
  const query = String(userQuery || "").trim();
  const tokenMetrics = numTokensFromString(query);

  try {
    const prompt = buildDomainPrompt(query);
    const raw = await runGeminiPrompt(prompt, 25000, 2 * 1024 * 1024);
    const parsed = JSON.parse(sanitizeGeminiJson(raw));
    const normalized = normalizeCategoryTagMap(parsed);

    if (Object.keys(normalized).length > 0) {
      return {
        success: true,
        gemini: JSON.stringify(normalized),
        tokenMetrics,
      };
    }
  } catch {
    // Fallback to deterministic selector when gemini is unavailable or malformed.
  }

  const fallback = classifyDomainFallback(query);
  return {
    success: true,
    gemini: JSON.stringify(fallback),
    tokenMetrics,
  };
}

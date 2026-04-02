import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import numTokensFromString from "./lib/tiktoken-script.js";
import { runGeminiPrompt } from "../core/llm/geminiCli.js";
import {
  compileSchema,
  parseGeminiJsonWithSchema,
} from "../core/validation/structured.js";
import { fuzzyMatch, tokenize } from "../core/query/textMatching.js";
import { logger } from "../config/loggerConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");

const tagIndex = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "data", "tag_index.json"), "utf8"),
);

const validateCategoryTagMap = compileSchema({
  type: "object",
  properties: {
    tags: {
      type: "object",
      additionalProperties: {
        type: "array",
        items: { type: "string" },
      },
    },
    keywords: {
      type: "array",
      items: { type: "string" },
    },
  },
  additionalProperties: false,
});

function buildAvoidKeywords() {
  const generic = [
    "get",
    "set",
    "data",
    "do",
    "make",
    "thing",
    "process",
    "flow",
    "task",
    "chat",
    "info",
    "list",
    "detail",
  ];
  const fromHints = Object.values(CATEGORY_HINTS).flat();
  const fromTagIndex = Object.values(tagIndex)
    .flatMap((category) => category?._meta?.commonTokens || []);
  return Array.from(
    new Set(
      [...generic, ...fromHints, ...fromTagIndex]
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ).sort();
}

// Builds the domain-selection prompt for category, tag, and keyword retrieval.
function buildDomainPrompt(userQuery) {
  const avoidKeywords = buildAvoidKeywords();
  const lines = Object.entries(tagIndex)
    .map(([category, tags]) => `${category}: ${Object.keys(tags).join(", ")}`)
    .join("\n");

  return `
You are a retrieval planner for Rocket.Chat API endpoints.

Return strict JSON only:
{
"tags": {
"category-name": ["Tags"]
},
"keywords": ["token1", "token2"],
}

---

Categories:
${lines}

User query:
${userQuery}

### TASK

From the query:

* Identify main entities and actions
* Select relevant categories/tags (2–4 categories, 1–3 tags each)
* Generate:
  * 8–13 keywords (for matching)
---

### RULES

* Use only provided category/tag names
* Tags = where to search
* Keywords = actions + conditions + useful entities

---

### KEYWORDS

* Single tokens only
* Prefer all actions: examples:
    post, create, pin, assign, send, upload, generate, analyze, send, invite
* Include conditions: failed, inactive, before, after
* Include useful synonyms (send → post, add → invite)
* dont use these keywords : ${avoidKeywords.join(", ")}

---

### DOMAIN OVERVIEW

DOMAIN OVERVIEW (YAML GROUPS)

Authentication:
Handles login and session management.

User Management:
Handles creation, updates, and role assignments for users.

Rooms (Channels / Groups / Direct Messages):
Handles creation and management of communication spaces.

Messaging:
Handles sending, updating, and deleting messages.
Notifications:
Handles sending alerts or announcements to users or rooms.

Content Management (Files):
Handles file uploads and sharing. Produces fileId and associates files with a roomId.

Settings:
Handles configuration of user or system preferences. Typically independent but may follow authentication.

Integrations:
Handles external connections such as webhooks. Produces webhookId and allows sending messages via external triggers.

Omnichannel (Live Chat):
Handles communication between external visitors and agents. Used for support workflows and live chat sessions.

Statistics:
Provides analytics and usage data. Typically read-only and does not produce reusable identifiers.

Miscellaneous:
Contains utility or uncategorized endpoints that support various operations.

---

`;
}

// Normalizes model output to valid categories and tags from the local tag index.
function normalizeCategoryTagMap(candidate) {
  const result = {};
  if (!candidate || typeof candidate !== "object") return result;

  const tagSource = candidate.tags && typeof candidate.tags === "object"
    ? candidate.tags
    : candidate;

  for (const [category, tags] of Object.entries(tagSource)) {
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

// Classifies a raw query into retrieval domains, tags, and optional keywords.
export async function classifyDomain(userQuery) {
  const query = String(userQuery || "").trim();
  const tokenMetrics = numTokensFromString(query);

  try {
    const prompt = buildDomainPrompt(query);
    const raw = await runGeminiPrompt(prompt, 25000, 2 * 1024 * 1024);
    const parsed = parseGeminiJsonWithSchema(
      raw,
      validateCategoryTagMap,
      "domain selection JSON",
    );
    const normalized = normalizeCategoryTagMap(parsed);

    if (Object.keys(normalized).length > 0) {
      const payload = { tags: normalized };
      if (Array.isArray(parsed?.keywords)) {
        payload.keywords = Array.from(new Set(
          parsed.keywords
            .map((value) => String(value || "").trim().toLowerCase())
            .filter(Boolean),
        ))
          .slice(0, 12)
          .map((value) => value.replace(/\s+/g, "_"))
          .filter(Boolean);
      }
      return {
        success: true,
        gemini: JSON.stringify(payload),
        intent: typeof parsed?.intent === "string" ? parsed.intent.trim() : "",
        tokenMetrics,
      };
    }
  } catch {
    // Fallback to deterministic selector when gemini is unavailable or malformed.
  }

  const fallback = classifyDomainFallback(query);
  return {
    success: true,
    gemini: JSON.stringify({ tags: fallback }),
    tokenMetrics,
  };
}

//fallback

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

  const selected = scored
    .filter((s) => s.score > 0)
    .slice(0, maxTags)
    .map((s) => s.tag);
  if (selected.length > 0) return selected;

  return tags.slice(0, Math.min(2, tags.length));
}


function classifyDomainFallback(userQuery) {
  logger.info("Using fallback domain classifier for query");
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
    selectedCategories = ["rooms", "messaging", "user-management"].filter(
      (c) => c in tagIndex,
    );
  }

  const result = {};
  for (const category of selectedCategories) {
    result[category] = pickTagsForCategory(category, tokens);
  }

  return result;
}

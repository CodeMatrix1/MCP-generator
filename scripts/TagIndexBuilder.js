import fs from "fs";
import path from "path";
import { logger } from "../src/config/loggerConfig.js";

const astPath = path.join("data", "ast_object.json");
const outDir = path.join("data");
const tagIndexPath = path.join(outDir, "tag_index.json");
const tagCategoriesPath = path.join(outDir, "tag_categories.json");

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const ast = JSON.parse(fs.readFileSync(astPath, "utf8"));

const tagIndex = {};
const tagCategories = {};
const concernedRequests = ["get", "post", "put", "delete"];

const endpointIndexPath = path.join(outDir, "endpoint_index.json");
const endpointIndex = fs.existsSync(endpointIndexPath)
  ? JSON.parse(fs.readFileSync(endpointIndexPath, "utf8"))
  : {};

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "or",
  "the",
  "to",
  "of",
  "for",
  "in",
  "on",
  "with",
  "by",
  "from",
  "at",
  "as",
  "is",
  "are",
  "be",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "your",
  "you",
  "me",
  "my",
  "we",
  "our",
  "their",
  "they",
  "api",
  "v1",
  "get",
  "post",
  "put",
  "patch",
  "delete",
]);

function tokenizeText(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function buildEndpointTokenSet(endpointKey, methodPayload, endpointPath) {
  const tokens = new Set();
  const addTokens = (value) => {
    for (const token of tokenizeText(value)) tokens.add(token);
  };

  addTokens(endpointKey);
  addTokens(endpointPath);
  addTokens(methodPayload?.summary);
  addTokens(methodPayload?.description);
  addTokens(Array.isArray(methodPayload?.tags) ? methodPayload.tags.join(" ") : "");

  const endpointMeta = endpointIndex[methodPayload?.operationId] || {};
  addTokens(endpointMeta?.summary);
  addTokens(endpointMeta?.description);
  addTokens(endpointMeta?.purpose);
  addTokens(endpointMeta?.path);
  addTokens(Array.isArray(endpointMeta?.tags) ? endpointMeta.tags.join(" ") : "");
  if (Array.isArray(endpointMeta?.inputs)) {
    addTokens(endpointMeta.inputs.map((item) => item?.name).join(" "));
  }
  if (Array.isArray(endpointMeta?.produces)) {
    addTokens(endpointMeta.produces.join(" "));
  }

  return tokens;
}

function computeCommonTokens(tokenSets) {
  if (tokenSets.length === 0) return [];
  let intersection = new Set(tokenSets[0]);
  for (let i = 1; i < tokenSets.length; i += 1) {
    const next = tokenSets[i];
    intersection = new Set([...intersection].filter((token) => next.has(token)));
    if (intersection.size === 0) break;
  }
  return [...intersection].sort();
}

for (const file in ast) {
  const tags = {};
  const paths = ast[file]?.paths || {};
  const fileName = path.parse(file).name;
  const endpointTokenSets = [];

  for (const endpoint in paths) {
    const methods = paths[endpoint];

    for (const method of concernedRequests) {
      const methodPayload = methods[method];
      if (!methodPayload || !methodPayload.operationId) continue;
      const tagArr = methodPayload.tags || [];

      endpointTokenSets.push(
        buildEndpointTokenSet(endpoint, methodPayload, endpoint),
      );

      tagArr.forEach((tag) => {
        if (!tags[tag]) tags[tag] = new Set();
        tags[tag].add(methodPayload.operationId);
      });
    }
  }

  const tagMap = Object.fromEntries(
    Object.entries(tags).map(([tag, set]) => [tag, [...set]]),
  );
  const commonTokens = computeCommonTokens(endpointTokenSets);

  tagIndex[fileName] = {
    ...tagMap,
    _meta: {
      commonTokens,
    },
  };

  tagCategories[fileName] = [];
  for (const tag in tags) tagCategories[fileName].push(tag);
}

fs.writeFileSync(tagIndexPath, JSON.stringify(tagIndex, null, 2));
fs.writeFileSync(tagCategoriesPath, JSON.stringify(tagCategories, null, 2));
logger.info(`Tag indices built`);

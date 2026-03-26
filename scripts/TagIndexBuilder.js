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

for (const file in ast) {
  const tags = {};
  const paths = ast[file]?.paths || {};
  const fileName = path.parse(file).name;

  for (const endpoint in paths) {
    const methods = paths[endpoint];

    for (const method of concernedRequests) {
      const tagArr = methods[method]?.tags || [];

      tagArr.forEach((tag) => {
        if (!tags[tag]) tags[tag] = new Set();
        tags[tag].add(methods[method].operationId);
      });
    }
  }

  tagIndex[fileName] = Object.fromEntries(
    Object.entries(tags).map(([tag, set]) => [tag, [...set]]),
  );

  tagCategories[fileName] = [];
  for (const tag in tags) {
    tagCategories[fileName].push(tag);
  }
}

fs.writeFileSync(tagIndexPath, JSON.stringify(tagIndex, null, 2));
fs.writeFileSync(tagCategoriesPath, JSON.stringify(tagCategories, null, 2));
logger.info(`Tag indices built`);

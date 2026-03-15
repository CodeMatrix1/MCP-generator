import fs from "fs";
import path from "path";

const astPath = path.join("data", "ast_object.json");
const outDir = path.join("data");
const outPath = path.join(outDir, "tag_index.json");

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const ast = JSON.parse(fs.readFileSync(astPath, "utf8"));

const tagIndex = {};
const concernedRequests = ['get','post','put','delete'];

for (const file in ast) {
  const tags = {};
  const paths = ast[file]?.paths || {};

  for (const endpoint in paths) {
    const methods = paths[endpoint];

    for (const method of concernedRequests) {
      const tagArr = methods[method]?.tags || [];
      tagArr.forEach(t => {
        if (!tags[t]) tags[t] = new Set();
        tags[t].add(methods[method].operationId); // Assuming operationId is unique for each endpoint
      });
    }
  }

  tagIndex[path.parse(file).name] = Object.fromEntries(
    Object.entries(tags).map(([tag, set]) => [tag, [...set]])
  );
}

fs.writeFileSync(outPath, JSON.stringify(tagIndex, null, 2));
console.log("✅ Tag index built:", outPath);
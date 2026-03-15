import fs from "fs";
import path from "path";

const astPath = path.join("data", "ast_object.json");
const outDir = path.join("data");
const outPath = path.join(outDir, "endpoint_index.json");

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const ast = JSON.parse(fs.readFileSync(astPath, "utf8"));

const OperationIndex = {};

for (const file in ast) {
  const paths = ast[file]?.paths || {};
  const filename = file.replace(/\.(yaml|yml)$/i, "");

  for (const endpoint in paths) {
    const methods = paths[endpoint];

    for (const method in methods) {
      if(method.toLowerCase() === "parameters") continue;
      const op = methods[method];
      if(!('operationId' in op)){
        console.warn(`⚠️ Missing operationId for ${method.toUpperCase()} ${endpoint} in file ${file}`);
        continue;
      }
      OperationIndex[`${op.operationId}`] = {
        file: filename,
        method: method.toUpperCase(),
        path: endpoint,
        summary: op.summary || "",
        description: op.description || "",
        tags: op.tags || [],
        operationId: op.operationId || "",
        parameters: op.parameters || [],
        requestBody: op.requestBody || null,
      };
    }
  }
}

fs.writeFileSync(outPath, JSON.stringify(OperationIndex, null, 2));
console.log("✅ Endpoint index built:", outPath);
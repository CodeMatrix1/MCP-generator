import fs from "fs";
import path from "path";
import SwaggerParser from "@apidevtools/swagger-parser";
import { logger } from "../src/config/loggerConfig.js";

const inputDir = "Rocket.Chat-Open-API";
const outPath = path.join("data", "ast_object.json");

const files = fs.readdirSync(inputDir);
const ast_object = {};

for (const file of files) {
  if (!file.endsWith(".yaml") && !file.endsWith(".yml")) continue;

  const fullPath = path.join(inputDir, file);
  logger.info(`Expanding refs for: ${file}`);

  const dereferenced = await SwaggerParser.dereference(fullPath);
  ast_object[file] = dereferenced;
}

fs.writeFileSync(outPath, JSON.stringify(ast_object, null, 2));

logger.info("All references expanded.");

const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

const dirPath = path.join(".", "Rocket.Chat-Open-API");

const yamlFiles = fs.readdirSync(dirPath);

const astObject = {};

for (const file of yamlFiles) {
  if (file.endsWith(".yaml") || file.endsWith(".yml")) {
    const fullPath = path.join(dirPath, file);
    const fileContent = fs.readFileSync(fullPath, "utf8");
    const spec = YAML.parse(fileContent);
    astObject[path.parse(file).name] = spec;
  }
}

fs.writeFileSync("data/ast_object.json", JSON.stringify(astObject, null, 2));

console.log("AST objects saved to data/ast_object.json");
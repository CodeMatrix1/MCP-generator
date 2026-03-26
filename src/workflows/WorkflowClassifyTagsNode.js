import { classifyDomain } from "../selection/DomainSelect.js";

export async function classifyTags(state) {
  const domain = await classifyDomain(state.query);
  return {
    currentNode: "classify_tags",
    parsedDomain: JSON.parse(domain.gemini || "{}"),
  };
}

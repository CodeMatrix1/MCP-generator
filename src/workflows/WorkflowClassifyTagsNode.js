import { classifyDomain } from "../selection/DomainSelect.js";

export async function classifyTags(state) {
const intent = state.intentConfirmation?.intent;
const inputs = state.intentConfirmation?.inputs || [];
const queryForClassify = intent
  ? `${intent} | inputs: ${inputs.join(", ")}`
  : state.query;

  const domain = await classifyDomain(queryForClassify || state.query);
  return {
    currentNode: "classify_tags",
    parsedDomain: JSON.parse(domain.gemini || "{}"),
  };
}

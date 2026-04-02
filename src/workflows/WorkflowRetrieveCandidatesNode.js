import { IntentToEndpoints } from "../selection/IntentToCandEndpoints.js";

export async function retrieveCandidates(state) {
  const { relevant_endpoints } = IntentToEndpoints(state.parsedDomain || {});
  return {
    currentNode: "retrieve_candidates",
    candidateEndpoints: Array.from(relevant_endpoints),
  };
}

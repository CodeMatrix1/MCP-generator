import { TagsToEndpoints } from "../selection/lib/TagsToEndpoints.js";

export async function retrieveCandidates(state) {
  const { relevant_endpoints } = TagsToEndpoints(state.parsedDomain || {});
  return {
    currentNode: "retrieve_candidates",
    candidateEndpoints: Array.from(relevant_endpoints),
  };
}

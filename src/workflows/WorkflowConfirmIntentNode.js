import { confirmIntent } from "../selection/ConfirmIntent.js";

export async function confirmIntentNode(state) {
  if (state.intentConfirmed === true) {
    return {
      currentNode: "confirm_intent",
      intentConfirmation: state.intentConfirmation || {},
    };
  }

  const result = await confirmIntent(state.query);
  let payload = {};
  try {
    payload = JSON.parse(result?.gemini || "{}");
  } catch {
    payload = {};
  }

  return {
    currentNode: "confirm_intent",
    intentConfirmation: payload,
  };
}

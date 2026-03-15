import { get_encoding } from "@dqbd/tiktoken";

let encoder = null;

function getEncoder() {
  if (!encoder) {
    encoder = get_encoding("cl100k_base");
  }
  return encoder;
}

export default function numTokensFromString(input) {
  const text = String(input || "");
  if (!text) return 0;

  try {
    return getEncoder().encode(text).length;
  } catch {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }
}

export function tokenize(input) {
  return String(input || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

export function normalizeToken(token) {
  const value = String(token || "").toLowerCase();
  if (value.endsWith("ies") && value.length > 4) {
    return value.slice(0, -3) + "y";
  }
  if (value.endsWith("es") && value.length > 4) {
    return value.slice(0, -2);
  }
  if (value.endsWith("s") && value.length > 3) {
    return value.slice(0, -1);
  }
  return value;
}

export function fuzzyMatch(a, b) {
  if (!a || !b) return false;
  const left = normalizeToken(a);
  const right = normalizeToken(b);
  if (left === right) return true;
  if (left.length >= 4 && right.startsWith(left)) return true;
  if (right.length >= 4 && left.startsWith(right)) return true;
  return false;
}

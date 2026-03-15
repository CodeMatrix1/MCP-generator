export function resolveBaseUrl(baseUrl) {
  const value = typeof baseUrl === "string" ? baseUrl.trim() : "";
  if (!value) {
    throw new Error(`Missing BASE_URL. Set process.env.BASE_URL or pass context.baseUrl for ${TOOL_KEY}`);
  }
  return value.replace(/\/$/, "");
}

export function interpolatePath(template, pathParams = {}) {
  return template.replace(/\{([^}]+)\}/g, (match, key) => {
    if (!(key in pathParams)) {
      throw new Error(`Missing path param "${key}" for ${TOOL_KEY}`);
    }
    return encodeURIComponent(String(pathParams[key]));
  });
}

export function encodeQuery(query = {}) {
  const entries = Object.entries(query).filter(([, value]) => value !== undefined && value !== null);
  if (entries.length === 0) return "";

  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
      continue;
    }
    params.append(key, String(value));
  }
  return params.toString();
}
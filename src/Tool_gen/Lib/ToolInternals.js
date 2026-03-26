export function resolveBaseUrl(baseUrl, toolKey = "tool") {
  const value = typeof baseUrl === "string" ? baseUrl.trim() : "";
  if (!value) {
    throw new Error(`Missing BASE_URL. Set process.env.BASE_URL or pass context.baseUrl for ${toolKey}`);
  }
  return value.replace(/\/$/, "");
}

export function interpolatePath(template, pathParams = {}, toolKey = "tool") {
  return template.replace(/\{([^}]+)\}/g, (match, key) => {
    if (!(key in pathParams)) {
      throw new Error(`Missing path param "${key}" for ${toolKey}`);
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

export async function executeToolRequest({
  toolKey,
  method,
  routePath,
  args = {},
  context = {},
}) {
  const {
    baseUrl = process.env.BASE_URL,
    pathParams = {},
    query = {},
    headers = {},
    body,
    signal,
  } = context;

  const resolvedBaseUrl = resolveBaseUrl(baseUrl, toolKey);
  const resolvedPath = interpolatePath(routePath, pathParams, toolKey);
  const queryString = encodeQuery(query);
  const url = queryString
    ? `${resolvedBaseUrl}${resolvedPath}?${queryString}`
    : `${resolvedBaseUrl}${resolvedPath}`;

  const requestHeaders = {
    Accept: "application/json",
    ...headers,
  };

  const request = {
    method,
    headers: requestHeaders,
    signal,
  };

  if (method !== "GET" && method !== "HEAD") {
    const payload = body === undefined ? args : body;
    if (payload !== undefined) {
      request.headers["Content-Type"] = "application/json";
      request.body = JSON.stringify(payload);
    }
  }

  const response = await fetch(url, request);
  const text = await response.text();
  const parsed = parseResponseText(text);

  if (!response.ok) {
    const reason = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${toolKey}: ${reason}`);
  }

  return parsed;
}

function parseResponseText(text) {
  if (text.length === 0) return undefined;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

import type { ChatClient } from "./director.js";

export interface ProductInfo {
  url: string;
  title: string;
  description: string;
  imageUrl: string | null;
}

export type CreativeStyle = "ugc" | "cgi" | "cinematic";

export interface MarketingDirection {
  style: CreativeStyle;
  tagline: string;
  prompt: string;
}

export class MarketingScrapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketingScrapeError";
  }
}

export class MarketingPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketingPlanError";
  }
}

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB — plenty for <head>, avoids huge pages

const BLOCKED_HOSTNAMES = new Set(["localhost", "0.0.0.0", "::1"]);

// Blocks the common literal-IP SSRF cases (loopback, RFC1918 private ranges,
// link-local/cloud-metadata range). This does NOT defend against DNS
// rebinding (a public hostname resolving to a private IP at request time) --
// that would need a custom dns.lookup override on the fetch agent, which
// Node's built-in fetch doesn't expose a simple hook for.
function isBlockedIpLiteral(hostname: string): boolean {
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  return (
    a === 127 || // loopback
    a === 10 || // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 169 && b === 254) // 169.254.0.0/16 (link-local, cloud metadata)
  );
}

function assertFetchableUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new MarketingScrapeError("Not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new MarketingScrapeError("URL must use http or https");
  }
  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname) || isBlockedIpLiteral(hostname)) {
    throw new MarketingScrapeError("URL host is not allowed");
  }
  return url;
}

function extractMetaContent(html: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) return decodeHtmlEntities(match[1].trim());
  }
  return null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

function ogMetaPatterns(property: string): RegExp[] {
  const attr = (first: string, second: string) =>
    new RegExp(
      `<meta[^>]*${first}=["']${property}["'][^>]*${second}=["']([^"']*)["']`,
      "i",
    );
  return [attr("property", "content"), attr("content", "property")];
}

export interface ScrapeOptions {
  fetch?: typeof globalThis.fetch;
}

export async function scrapeProductPage(
  url: string,
  options: ScrapeOptions = {},
): Promise<ProductInfo> {
  const validUrl = assertFetchableUrl(url);
  const fetchImpl = options.fetch ?? globalThis.fetch;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetchImpl(validUrl.toString(), {
      signal: controller.signal,
      redirect: "follow",
    });
  } catch {
    throw new MarketingScrapeError("Could not reach the URL");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new MarketingScrapeError(`URL returned HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  let html = "";
  if (reader) {
    let received = 0;
    const decoder = new TextDecoder();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        break;
      }
      html += decoder.decode(value, { stream: true });
    }
  } else {
    html = await response.text();
  }

  const title =
    extractMetaContent(html, ogMetaPatterns("og:title")) ??
    /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ??
    null;
  const description =
    extractMetaContent(html, ogMetaPatterns("og:description")) ??
    extractMetaContent(html, [/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i]) ??
    null;
  const imageUrl = extractMetaContent(html, ogMetaPatterns("og:image"));

  if (!title) {
    throw new MarketingScrapeError("Could not find a page title to extract");
  }

  return {
    url: validUrl.toString(),
    title,
    description: description ?? "",
    imageUrl,
  };
}

const CREATIVE_STYLES: readonly CreativeStyle[] = ["ugc", "cgi", "cinematic"];

function buildSystemPrompt(): string {
  return [
    "You are a creative director for short-form product ads.",
    "Given a product's title, description, and page URL, propose one creative direction.",
    'Choose exactly one style: "ugc" (authentic handheld phone-style), "cgi" (polished 3D product render), or "cinematic" (dramatic film-style).',
    "Also write a short punchy tagline (under 12 words) and a single vivid generation prompt describing the ad visual (no camera direction, just what is seen).",
  ].join("\n");
}

function marketingDirectionJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      style: { type: "string", enum: CREATIVE_STYLES },
      tagline: { type: "string" },
      prompt: { type: "string" },
    },
    required: ["style", "tagline", "prompt"],
    additionalProperties: false,
  };
}

export interface ProposeCreativeDirectionOptions {
  model?: string;
}

const DEFAULT_MARKETING_MODEL = "seed-2-1-260628";

export async function proposeCreativeDirection(
  client: ChatClient,
  product: ProductInfo,
  options: ProposeCreativeDirectionOptions = {},
): Promise<MarketingDirection> {
  const response = await client.createChatCompletion({
    model: options.model ?? DEFAULT_MARKETING_MODEL,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      {
        role: "user",
        content: `Title: ${product.title}\nDescription: ${product.description || "(none provided)"}\nURL: ${product.url}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "marketing_direction", schema: marketingDirectionJsonSchema(), strict: true },
    },
  });

  const content = response.choices[0]?.message.content;
  if (!content) {
    throw new MarketingPlanError("Marketing agent returned no content");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new MarketingPlanError("Marketing agent returned invalid JSON");
  }

  return validateMarketingDirection(parsed);
}

function validateMarketingDirection(value: unknown): MarketingDirection {
  if (typeof value !== "object" || value === null) {
    throw new MarketingPlanError("Marketing agent response is not an object");
  }
  const { style, tagline, prompt } = value as Record<string, unknown>;

  if (typeof style !== "string" || !CREATIVE_STYLES.includes(style as CreativeStyle)) {
    throw new MarketingPlanError(`Marketing agent returned an unknown style: ${String(style)}`);
  }
  if (typeof tagline !== "string" || tagline.trim().length === 0) {
    throw new MarketingPlanError("Marketing agent response is missing a tagline");
  }
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new MarketingPlanError("Marketing agent response is missing a prompt");
  }

  return { style: style as CreativeStyle, tagline: tagline.trim(), prompt: prompt.trim() };
}

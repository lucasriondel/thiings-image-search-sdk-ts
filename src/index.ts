export interface ThiingsImage {
  id: string;
  name: string;
  /** Full-size PNG (~1.4 MB), served with permissive CORS. */
  imageUrl: string;
  /** 1000px PNG via thiings.co's Next.js image resizer (~80 KB). */
  thumbnailUrl: string;
  categories: string[];
  shareUrl: string;
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

// Undocumented internal tRPC endpoint used by the thiings.co site.
const SEARCH_URL = "https://www.thiings.co/api/trpc/object.searchItems";
const BLOB_BASE = "https://lftz25oez4aqbxpq.public.blob.vercel-storage.com";

interface RawThing {
  id: string;
  name: string;
  fileId: string;
  categories?: string[];
  shareUrl?: string;
}

function isRawThing(value: unknown): value is RawThing {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.fileId === "string" &&
    (v.categories === undefined ||
      (Array.isArray(v.categories) &&
        v.categories.every((c) => typeof c === "string"))) &&
    (v.shareUrl === undefined || typeof v.shareUrl === "string")
  );
}

function extractThings(body: unknown): RawThing[] {
  const items = (body as { result?: { data?: { json?: unknown } } })?.result
    ?.data?.json;
  if (!Array.isArray(items) || !items.every(isRawThing)) {
    throw new Error(
      "Unexpected response shape from thiings.co search API; the endpoint may have changed"
    );
  }
  return items;
}

function toImage(thing: RawThing): ThiingsImage {
  const imageUrl = `${BLOB_BASE}/image-${thing.fileId}.png`;
  return {
    id: thing.id,
    name: thing.name,
    imageUrl,
    thumbnailUrl: `https://www.thiings.co/_next/image?url=${encodeURIComponent(imageUrl)}&w=1000&q=75`,
    categories: thing.categories ?? [],
    shareUrl: thing.shareUrl ?? `https://www.thiings.co/things/${thing.id}`,
  };
}

/**
 * Search thiings.co for images matching the given text.
 *
 * Matching is done server-side and may include related things
 * (e.g. "tomato" also returns "Ketchup"). Queries of 2 characters or
 * fewer return no results.
 *
 * @param searchText - The search query
 * @param limit - Maximum number of results (default: 12)
 * @returns Array of matching images
 * @throws If the API responds with an error or an unexpected shape
 */
export async function searchThiingsImages(
  searchText: string,
  limit = 12
): Promise<ThiingsImage[]> {
  const query = searchText?.trim();
  if (!query) return [];

  const url = `${SEARCH_URL}?input=${encodeURIComponent(JSON.stringify({ json: { query } }))}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });

  if (!res.ok) {
    throw new Error(`Failed to search thiings.co: ${res.status}`);
  }

  return extractThings(await res.json())
    .slice(0, limit)
    .map(toImage);
}

const SUGGEST_URL =
  "https://www.thiings.co/api/trpc/suggestion.create?batch=1";

export interface ThiingsIconRequest {
  /** Name of the thing you'd like an icon for, e.g. "Curry (spice)". */
  name: string;
  /** Contact email thiings.co may use to follow up. */
  email: string;
  /** Optional free-form details, e.g. a reference link or description. */
  note?: string;
}

/**
 * Ask thiings.co to create a new icon.
 *
 * Submits the same suggestion form as the "request a thing" UI on the site.
 * This sends a real request to the thiings.co team — don't call it in a loop.
 *
 * @throws If the request is invalid or the API responds with an error
 */
export async function requestThiingsIcon(
  request: ThiingsIconRequest
): Promise<void> {
  const name = request.name?.trim();
  const email = request.email?.trim();
  if (!name) throw new Error("name is required");
  if (!email) throw new Error("email is required");

  // thiings.co's schema requires `note` to be present, even if empty.
  const json = { name, email, note: request.note?.trim() ?? "" };

  const res = await fetch(SUGGEST_URL, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/json",
      Origin: "https://www.thiings.co",
      "x-trpc-source": "nextjs-react",
    },
    body: JSON.stringify({ 0: { json } }),
  });

  if (!res.ok) {
    const message = await res
      .json()
      .then(
        (body) =>
          (body as { error?: { json?: { message?: unknown } } }[])?.[0]?.error
            ?.json?.message
      )
      .catch(() => undefined);
    throw new Error(
      `Failed to request thiings.co icon: ${res.status}` +
        (typeof message === "string" ? ` (${message})` : "")
    );
  }
}

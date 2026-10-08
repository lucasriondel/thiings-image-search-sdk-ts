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

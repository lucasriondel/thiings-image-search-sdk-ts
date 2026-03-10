import * as cheerio from "cheerio";

export interface ThiingsImage {
  id: string;
  name: string;
  imageUrl: string;
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

interface RawThing {
  id: string;
  name: string;
  fileId?: string;
  shareUrl?: string;
}

function parseThingsFromHtml(html: string): RawThing[] {
  let things: RawThing[] = [];

  // Pattern 1: __NEXT_DATA__ (old Next.js format)
  const nextDataMatch = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s
  );

  if (nextDataMatch) {
    const nextData = JSON.parse(nextDataMatch[1]);
    things =
      nextData?.props?.pageProps?.things ||
      nextData?.props?.pageProps?.results ||
      [];
  } else {
    // Pattern 2: Next.js RSC streaming format via self.__next_f.push()
    const nextFMatches = html.matchAll(
      /self\.__next_f\.push\(\[([0-9]+),"([^"]*(?:\\.[^"]*)*)"\]\)/g
    );

    for (const match of nextFMatches) {
      try {
        const dataStr = match[2];
        if (dataStr.includes('\\"objects\\"')) {
          const objMatches = dataStr.matchAll(
            /\{\\"id\\":\\"([^\\]+)\\",\\"name\\":\\"([^\\]+)\\"[^}]*\\"fileId\\":\\"([^\\]+)\\"[^}]*\\"shareUrl\\":\\"([^\\]+)\\"[^}]*\}/g
          );
          for (const objMatch of objMatches) {
            const [_, id, name, fileId, shareUrl] = objMatch;
            things.push({
              id,
              name,
              fileId,
              shareUrl: shareUrl.replace(/\\\//g, "/"),
            });
          }
        }
      } catch {
        // skip malformed entries
      }
    }

    // Deduplicate
    const seenIds = new Set<string>();
    things = things.filter((thing) => {
      if (seenIds.has(thing.id)) return false;
      seenIds.add(thing.id);
      return true;
    });
  }

  return things;
}

function filterByQuery(things: RawThing[], query: string): RawThing[] {
  const searchLower = query.toLowerCase().trim();
  return things.filter((thing) => {
    const nameLower = thing.name.toLowerCase();
    const idLower = thing.id.toLowerCase();
    return nameLower.includes(searchLower) || idLower.includes(searchLower);
  });
}

async function fetchOgImage(thing: RawThing): Promise<ThiingsImage | null> {
  const thingUrl =
    thing.shareUrl || `https://www.thiings.co/things/${thing.id}`;
  try {
    const res = await fetch(thingUrl, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);
    const imageUrl = $('meta[property="og:image"]').attr("content");
    if (!imageUrl) return null;

    return { id: thing.id, name: thing.name, imageUrl };
  } catch {
    return null;
  }
}

/**
 * Search thiings.co for images matching the given text.
 *
 * @param searchText - The search query
 * @param limit - Maximum number of results (default: 12)
 * @returns Array of matching images with id, name, and imageUrl
 */
export async function searchThiingsImages(
  searchText: string,
  limit = 12
): Promise<ThiingsImage[]> {
  if (!searchText || searchText.trim() === "") {
    return [];
  }

  const searchUrl = `https://www.thiings.co/things?q=${encodeURIComponent(searchText)}`;
  const searchRes = await fetch(searchUrl, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!searchRes.ok) {
    throw new Error(`Failed to fetch from thiings.co: ${searchRes.status}`);
  }

  const html = await searchRes.text();
  let things = parseThingsFromHtml(html);
  things = filterByQuery(things, searchText);

  if (things.length === 0) return [];

  const limited = things.slice(0, limit);
  const results = await Promise.all(limited.map(fetchOgImage));

  return results.filter((r): r is ThiingsImage => r !== null);
}

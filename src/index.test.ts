import { afterEach, describe, expect, mock, test } from "bun:test";
import { searchThiingsImages } from "./index";

const realFetch = globalThis.fetch;

function mockFetch(body: unknown, status = 200) {
  const fn = mock(async (_url: string | URL | Request) =>
    new Response(JSON.stringify(body), { status })
  );
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

const tomato = {
  id: "tomato",
  name: "Tomato",
  categories: ["food & drink", "vegetable"],
  fileId: "v4Bz5uvOIDciAdqa3qIpabpC0VrOkp",
  shareUrl: "https://www.thiings.co/things/tomato",
  isLatest: false,
};
const ketchup = { ...tomato, id: "ketchup", name: "Ketchup", fileId: "abc" };

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("searchThiingsImages", () => {
  test("queries the tRPC endpoint and maps results", async () => {
    const fn = mockFetch({ result: { data: { json: [tomato, ketchup] } } });

    const results = await searchThiingsImages("tomato");

    const url = new URL(String(fn.mock.calls[0]![0]));
    expect(url.origin + url.pathname).toBe(
      "https://www.thiings.co/api/trpc/object.searchItems"
    );
    expect(JSON.parse(url.searchParams.get("input")!)).toEqual({
      json: { query: "tomato" },
    });
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      id: "tomato",
      name: "Tomato",
      imageUrl:
        "https://lftz25oez4aqbxpq.public.blob.vercel-storage.com/image-v4Bz5uvOIDciAdqa3qIpabpC0VrOkp.png",
      thumbnailUrl:
        "https://www.thiings.co/_next/image?url=https%3A%2F%2Flftz25oez4aqbxpq.public.blob.vercel-storage.com%2Fimage-v4Bz5uvOIDciAdqa3qIpabpC0VrOkp.png&w=1000&q=75",
      categories: ["food & drink", "vegetable"],
      shareUrl: "https://www.thiings.co/things/tomato",
    });
  });

  test("keeps server results that don't contain the query", async () => {
    mockFetch({ result: { data: { json: [tomato, ketchup] } } });
    const results = await searchThiingsImages("tomato");
    expect(results.map((r) => r.id)).toEqual(["tomato", "ketchup"]);
  });

  test("applies limit", async () => {
    mockFetch({ result: { data: { json: [tomato, ketchup] } } });
    expect(await searchThiingsImages("tomato", 1)).toHaveLength(1);
  });

  test("returns [] for blank input without fetching", async () => {
    const fn = mockFetch({});
    expect(await searchThiingsImages("   ")).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  test("throws on non-OK response", async () => {
    mockFetch({ error: "nope" }, 500);
    expect(searchThiingsImages("tomato")).rejects.toThrow(/500/);
  });

  test("throws on unexpected response shape", async () => {
    mockFetch({ result: { data: { items: [] } } });
    expect(searchThiingsImages("tomato")).rejects.toThrow(/unexpected/i);
  });

  test("throws when an item is missing fileId", async () => {
    const { fileId: _, ...noFile } = tomato;
    mockFetch({ result: { data: { json: [noFile] } } });
    expect(searchThiingsImages("tomato")).rejects.toThrow(/unexpected/i);
  });
});

describe.skipIf(!process.env.THIINGS_LIVE)("live", () => {
  test("finds tomato", async () => {
    const results = await searchThiingsImages("tomato", 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.id).toBe("tomato");
  });
});

// Token metadata JSON (Metaplex standard) rebuilt from the query string, so a launch needs no storage.
// ponytail: the on-chain URI field holds 200 characters, so long image links don't fit; serve stored JSON
// once uploads land.
const MAX = { n: 32, s: 10, d: 200, i: 160 };

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const field = (k: keyof typeof MAX) => (q.get(k) ?? "").slice(0, MAX[k]);
  const image = field("i");
  return Response.json(
    {
      name: field("n"),
      symbol: field("s"),
      description: field("d"),
      image: image.startsWith("https://") ? image : "",
    },
    { headers: { "cache-control": "public, max-age=31536000, immutable", "access-control-allow-origin": "*" } },
  );
}

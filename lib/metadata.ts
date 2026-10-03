import { PublicKey, type Connection } from "@solana/web3.js";

const METADATA_PROGRAM = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const enc = new TextEncoder();

// Name, symbol and image of a token from its Metaplex metadata account (DBC creates it at launch).
export async function tokenMetadata(conn: Connection, mint: PublicKey) {
  const [pda] = PublicKey.findProgramAddressSync(
    [enc.encode("metadata"), METADATA_PROGRAM.toBytes(), mint.toBytes()],
    METADATA_PROGRAM,
  );
  const account = await conn.getAccountInfo(pda);
  if (!account) return null;
  const data = account.data;
  let offset = 1 + 32 + 32; // key, update authority, mint
  const readString = () => {
    const len = data.readUInt32LE(offset);
    offset += 4;
    const s = data.subarray(offset, offset + len).toString("utf8").replace(/\0/g, "").trim();
    offset += len;
    return s;
  };
  const name = readString();
  const symbol = readString();
  const uri = readString();
  const image = await fetch(uri)
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { image?: string } | null) => j?.image ?? null)
    .catch(() => null);
  return { name, symbol, uri, image };
}

import { LAMPORTS_PER_SOL } from "@solana/web3.js";

// Holder rewards live in Supabase (tables dh_*). Anyone can read them with the publishable key; only the
// keeper (scripts/keeper.mts) writes, through database functions that check its secret.
export async function supabase<T>(path: string, body?: object): Promise<T> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_KEY ?? "", "content-type": "application/json" },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path.split("?")[0]}: ${res.status} ${await res.text()}`);
  return (res.status === 204 ? null : await res.json()) as T;
}

// SOL the keeper has paid `owner` for their orders on `mint`.
export async function rewardsPaid(mint: string, owner: string) {
  const rows = await supabase<{ lamports: number }[]>(`dh_payouts?mint=eq.${mint}&owner=eq.${owner}&select=lamports`);
  return rows.reduce((s, r) => s + Number(r.lamports), 0) / LAMPORTS_PER_SOL;
}

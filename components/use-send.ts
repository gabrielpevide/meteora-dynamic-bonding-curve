"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { Keypair, Transaction } from "@solana/web3.js";
import { useState } from "react";

export type SendStatus = { kind: "idle" } | { kind: "pending"; step?: string } | { kind: "done"; sig: string } | { kind: "error"; msg: string };

// Signs with the wallet (plus any extra keypairs, e.g. a new mint or position base) and waits for confirmation.
export function useSend() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [status, setStatus] = useState<SendStatus>({ kind: "idle" });

  async function send(tx: Transaction, signers: Keypair[] = [], step?: string) {
    if (!publicKey) throw new Error("Connect your wallet");
    setStatus({ kind: "pending", step });
    try {
      const latest = await connection.getLatestBlockhash();
      tx.recentBlockhash = latest.blockhash;
      tx.feePayer = publicKey;
      const sig = await sendTransaction(tx, connection, { signers });
      const res = await connection.confirmTransaction({ signature: sig, ...latest }, "confirmed");
      if (res.value.err) throw new Error(`Transaction failed: ${JSON.stringify(res.value.err)}`);
      setStatus({ kind: "done", sig });
      return sig;
    } catch (e) {
      setStatus({ kind: "error", msg: (e as Error).message });
      throw e;
    }
  }

  return { send, status, setStatus, publicKey };
}

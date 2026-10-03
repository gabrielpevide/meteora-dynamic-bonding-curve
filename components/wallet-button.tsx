"use client";

import dynamic from "next/dynamic";

// The wallet button reads browser-only state; rendering it on the server causes a hydration mismatch.
export const WalletButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);

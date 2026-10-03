import type { Metadata } from "next";
import { Chakra_Petch, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Providers } from "@/components/providers";
import { WalletButton } from "@/components/wallet-button";
import "./globals.css";

const chakra = Chakra_Petch({ variable: "--font-chakra", subsets: ["latin"], weight: ["500", "600", "700"] });
const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Diamond Hands",
  description: "Lock your tokens at a target price and earn SOL while you wait. Conviction Pools on Meteora.",
};

const REPO_URL = "https://github.com/gabrielpevide/meteora-dynamic-bonding-curve";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${chakra.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-ink font-sans text-text">
        <Providers>
          <header className="relative z-10 border-b border-rule">
            <div className="container-page flex flex-wrap items-center justify-between gap-x-10 gap-y-3.5 py-[18px]">
              <Link href="/" className="flex items-center gap-3 text-text">
                <Logo className="size-[30px]" />
                <span className="font-display text-lg font-semibold tracking-[0.14em]">DIAMOND HANDS</span>
              </Link>
              <nav aria-label="Main" className="flex flex-wrap gap-x-9 gap-y-2 text-[15px]">
                <Link href="/#tokens" className="text-text-2 hover:text-text">
                  Tokens
                </Link>
                <Link href="/#how" className="text-text-2 hover:text-text">
                  How it works
                </Link>
                <Link href="/launch" className="text-text-2 hover:text-text">
                  Launch
                </Link>
              </nav>
              <WalletButton />
            </div>
          </header>
          <main className="relative flex-1">{children}</main>
          <footer className="border-t border-rule">
            <div className="container-page flex flex-wrap items-center justify-between gap-4 py-7 font-mono text-xs tracking-[0.12em] text-faint">
              <span>DIAMOND HANDS · CONVICTION POOLS ON METEORA</span>
              <span>DBC · DAMM v2 · DLMM · SOLANA</span>
              <a href={REPO_URL} target="_blank" rel="noreferrer" className="text-text-2 hover:text-text">
                GitHub
              </a>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}

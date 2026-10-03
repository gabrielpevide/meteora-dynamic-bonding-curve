"use client";

import { useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { launchSummaries, type LaunchSummary } from "@/lib/launches";

let shared: Promise<LaunchSummary[]> | null = null;

// The hero card and the token grid read the same list; fetch it once per page load.
export function useLaunches() {
  const { connection } = useConnection();
  const [launches, setLaunches] = useState<LaunchSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    shared ??= launchSummaries(connection).catch((e) => {
      shared = null;
      throw e;
    });
    shared.then(setLaunches).catch((e: Error) => setError(e.message));
  }, [connection]);

  return { launches, error };
}

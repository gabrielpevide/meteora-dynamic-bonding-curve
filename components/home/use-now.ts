"use client";

import { useEffect, useState } from "react";

// Wall-clock seconds, ticking once a second, for countdowns.
export function useNow() {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 1_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

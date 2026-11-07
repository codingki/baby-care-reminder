"use client";

import { useRef, useState } from "react";

export function useSaveLock() {
  const lock = useRef(false);
  const [pending, setPending] = useState(false);

  async function run<T>(task: () => Promise<T>): Promise<T | undefined> {
    if (lock.current) return undefined;
    lock.current = true;
    setPending(true);
    try {
      return await task();
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  return { pending, run };
}

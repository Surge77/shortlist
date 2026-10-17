import { useEffect } from "react";

const POLL_MS = 4000;

// Scoring takes 10-20 s in the background; refresh while anything is still processing.
export function usePolling(isActive: boolean, refresh: () => void): void {
  useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [isActive, refresh]);
}

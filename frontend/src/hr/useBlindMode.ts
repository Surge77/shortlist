import { useState } from "react";

const STORAGE_KEY = "shortlist-blind-review";

function stored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false; // storage blocked (private mode): start with names shown
  }
}

// A per-reviewer preference, so it lives in this browser rather than in the database.
export function useBlindMode(): [boolean, (isBlind: boolean) => void] {
  const [isBlind, setIsBlind] = useState(stored);

  function update(next: boolean) {
    setIsBlind(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      // Still works for this visit.
    }
  }

  return [isBlind, update];
}

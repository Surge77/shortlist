import { useCallback, useEffect, useRef, useState } from "react";

import type { ApiResult } from "./types";

export type Loaded<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: T };

export interface Load<T> {
  state: Loaded<T>;
  reload: () => void;
}

// Runs `loader` whenever `key` changes. A reply for a key the page has moved past (or an
// unmounted page) is dropped. `reload` refetches without blanking what is on screen.
export function useLoad<T>(loader: () => Promise<ApiResult<T>>, key: string): Load<T> {
  const [state, setState] = useState<Loaded<T>>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const [loadedKey, setLoadedKey] = useState(key);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let isCurrent = true;
    loaderRef.current().then(
      (result) => {
        if (!isCurrent) return;
        if (result.ok) setState({ status: "ready", data: result.data });
        // A failed refresh keeps what is already on screen; only a first load shows the error.
        else setState((previous) => (previous.status === "ready" ? previous : { status: "error", message: result.message }));
      },
      () => {
        if (isCurrent) {
          setState((previous) =>
            previous.status === "ready" ? previous : { status: "error", message: "Something went wrong. Try again." },
          );
        }
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [key, version]);

  // Reset during render (React's documented pattern for state derived from a prop), so the
  // previous key's data is never shown for the new key, not even for one frame.
  if (loadedKey !== key) {
    setLoadedKey(key);
    setState({ status: "loading" });
  }

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { state, reload };
}

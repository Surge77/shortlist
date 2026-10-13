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
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let isCurrent = true;
    loaderRef.current().then(
      (result) => {
        if (!isCurrent) return;
        setState(result.ok ? { status: "ready", data: result.data } : { status: "error", message: result.message });
      },
      () => {
        if (isCurrent) setState({ status: "error", message: "Something went wrong. Try again." });
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [key, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { state, reload };
}

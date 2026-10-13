import { useSyncExternalStore, type MouseEvent, type ReactNode } from "react";

// A dozen routes with one parameter each do not need a router library: the History API,
// one event, and a pattern matcher cover it.
const NAVIGATE_EVENT = "shortlist:navigate";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(NAVIGATE_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(NAVIGATE_EVENT, onChange);
  };
}

function currentLocation(): string {
  return window.location.pathname + window.location.search;
}

export function useLocation(): { path: string; search: URLSearchParams } {
  const location = useSyncExternalStore(subscribe, currentLocation);
  const [path, query = ""] = location.split("?");
  return { path, search: new URLSearchParams(query) };
}

export function navigate(to: string, { replace = false } = {}): void {
  if (replace) window.history.replaceState(null, "", to);
  else window.history.pushState(null, "", to);
  window.scrollTo?.(0, 0);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}

// "/hr/jobs/:id" against "/hr/jobs/42" gives { id: "42" }; no match gives null.
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = path.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (const [index, part] of patternParts.entries()) {
    const value = pathParts[index];
    if (part.startsWith(":")) params[part.slice(1)] = decodeURIComponent(value);
    else if (part !== value) return null;
  }
  return params;
}

interface LinkProps {
  to: string;
  children: ReactNode;
  className?: string;
  "aria-current"?: "page";
}

export function Link({ to, children, className, ...rest }: LinkProps) {
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    // Let the browser handle new-tab clicks and anything but a plain left click.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(to);
  }
  return (
    <a href={to} className={className} onClick={onClick} {...rest}>
      {children}
    </a>
  );
}

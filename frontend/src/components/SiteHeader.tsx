import { LogoMark } from "./icons";
import { ThemeToggle } from "./ThemeToggle";

interface SiteHeaderProps {
  showNewResume: boolean;
  onNewResume: () => void;
}

// The slug line a galley carries along its top edge: whose proof it is and who set it.
export function SiteHeader({ showNewResume, onNewResume }: SiteHeaderProps) {
  return (
    <header className="slug">
      <div className="slug-inner">
        <span className="wordmark">
          <LogoMark />
          Shortlist
        </span>
        <span className="slug-note hidden sm:inline">Read by Gemini. Added up and checked by code.</span>
        <div className="slug-actions">
          {showNewResume && (
            <button type="button" className="btn-outline" onClick={onNewResume}>
              New resume
            </button>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

"""Prints the fictional demo resumes (scripts/demo_resumes/*.txt) to PDF with headless
Microsoft Edge, into app/demo/resumes/. Run by hand after editing a resume; the PDFs are
committed, so neither the seed nor the server needs a browser or a PDF library.

    python scripts/build_demo_resumes.py

Text format: line 1 name, line 2 headline, line 3 contact; an ALL-CAPS line starts a
section; "- " starts a bullet.
"""

import html
import subprocess
import sys
import tempfile
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
SOURCE_DIR = BACKEND_DIR / "scripts" / "demo_resumes"
OUTPUT_DIR = BACKEND_DIR / "app" / "demo" / "resumes"
EDGE = Path("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe")
PRINT_TIMEOUT_SECONDS = 60
HEADER_LINES = 3

STYLE = """
@page { size: A4; margin: 16mm 18mm; }
body { font: 10.5pt/1.45 "Segoe UI", Arial, sans-serif; color: #1b1f24; }
h1 { font-size: 20pt; margin: 0; letter-spacing: .02em; }
.headline { font-size: 11.5pt; margin: 2pt 0; color: #31546e; }
.contact { font-size: 9.5pt; color: #555; margin-bottom: 10pt; }
h2 { font-size: 10pt; letter-spacing: .12em; color: #31546e; border-bottom: 1px solid #c9d3db;
     margin: 12pt 0 4pt; padding-bottom: 2pt; }
p { margin: 3pt 0; }
ul { margin: 2pt 0 4pt 16pt; padding: 0; }
"""


def is_section(line: str) -> bool:
    return line.isupper() and ":" not in line


def render(text: str) -> str:
    lines = [line.rstrip() for line in text.strip().splitlines()]
    name, headline, contact = (html.escape(line) for line in lines[:HEADER_LINES])
    body: list[str] = []
    bullets: list[str] = []

    def flush() -> None:
        if bullets:
            body.append("<ul>" + "".join(f"<li>{item}</li>" for item in bullets) + "</ul>")
            bullets.clear()

    for line in lines[HEADER_LINES:]:
        if not line:
            continue
        if line.startswith("- "):
            bullets.append(html.escape(line[2:]))
            continue
        flush()
        tag = "h2" if is_section(line) else "p"
        body.append(f"<{tag}>{html.escape(line)}</{tag}>")
    flush()
    return (f"<!doctype html><html><head><meta charset='utf-8'><title>{name}</title><style>{STYLE}</style>"
            f"</head><body><h1>{name}</h1><p class='headline'>{headline}</p><p class='contact'>{contact}</p>"
            f"{''.join(body)}</body></html>")


def print_pdf(page: Path, target: Path) -> None:
    # Fixed executable and arguments; the only inputs are paths this script built.
    subprocess.run([str(EDGE), "--headless", "--disable-gpu", "--no-pdf-header-footer",
                    f"--print-to-pdf={target}", page.as_uri()],
                   check=True, timeout=PRINT_TIMEOUT_SECONDS, capture_output=True)


def main() -> None:
    if not EDGE.is_file():
        sys.exit(f"Microsoft Edge not found at {EDGE}")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as scratch:
        for source in sorted(SOURCE_DIR.glob("*.txt")):
            page = Path(scratch) / f"{source.stem}.html"
            page.write_text(render(source.read_text(encoding="utf-8")), encoding="utf-8")
            target = OUTPUT_DIR / f"{source.stem}.pdf"
            print_pdf(page, target)
            print(f"{target.name}: {target.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Download all chess sound effects from sfxengine.com."""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Iterable, List, Sequence, Set
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen
import shutil

AUDIO_EXTENSIONS: Sequence[str] = (
    ".mp3",
    ".wav",
    ".ogg",
    ".flac",
    ".aac",
    ".m4a",
)

DEFAULT_SOURCE_URL = "https://sfxengine.com/fr/sound-effects/chess"
DEFAULT_OUTPUT_DIR = Path("public/audio/chess")
USER_AGENT = "Mozilla/5.0 (compatible; ai-chess-architect/1.0)"


def fetch_html(url: str) -> str:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request) as response:  # noqa: S310 - intended network call
        charset = response.headers.get_content_charset("utf-8")
        return response.read().decode(charset, errors="replace")


def extract_links(html: str, base_url: str) -> List[str]:
    attr_pattern = r"(?:href|src|data-url|data-href|data-src|data-mp3|data-ogg)"
    ext_pattern = r"\.(?:mp3|wav|ogg|flac|aac|m4a)(?:\?[^'\"]*)?"
    combined = re.compile(rf"{attr_pattern}\\s*=\\s*['\"]([^'\"]+{ext_pattern})['\"]", re.IGNORECASE)
    absolute = re.compile(r"https?://[^'\"\s]+\.(?:mp3|wav|ogg|flac|aac|m4a)(?:\?[^'\"\s]+)?", re.IGNORECASE)

    found: Set[str] = set()

    for match in combined.findall(html):
        resolved = urljoin(base_url, match)
        found.add(resolved)

    for match in absolute.findall(html):
        resolved = urljoin(base_url, match)
        found.add(resolved)

    return sorted(found)


def ensure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def download_file(url: str, dest_dir: Path, overwrite: bool = False) -> Path:
    parsed = urlparse(url)
    filename = Path(parsed.path).name or "audio"
    if not any(filename.lower().endswith(ext) for ext in AUDIO_EXTENSIONS):
        filename = f"{filename or 'audio'}.mp3"

    destination = dest_dir / filename
    if destination.exists() and not overwrite:
        stem = destination.stem
        suffix = destination.suffix
        counter = 1
        while destination.exists():
            destination = dest_dir / f"{stem}-{counter}{suffix}"
            counter += 1

    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request) as response, destination.open("wb") as output:  # noqa: S310 - intended network call
        shutil.copyfileobj(response, output)

    return destination


def write_manifest(manifest_path: Path, source_url: str, files: Iterable[Path]) -> None:
    files_list = list(files)
    manifest_data = {
        "source_page": source_url,
        "file_count": len(files_list),
        "files": [
            {
                "filename": file_path.name,
                "relative_path": str(file_path.relative_to(manifest_path.parent)),
                "source_url": source_url,
            }
            for file_path in files_list
        ],
    }
    manifest_path.write_text(json.dumps(manifest_data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=DEFAULT_SOURCE_URL, help="Source page to scan for chess sound effects.")
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory where downloaded files should be stored.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Only list the discovered audio links without downloading.")
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite files with the same name instead of creating numbered copies.",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])

    try:
        html = fetch_html(args.url)
    except (HTTPError, URLError) as error:
        print(f"Failed to fetch {args.url}: {error}", file=sys.stderr)
        return 1

    links = extract_links(html, args.url)
    if not links:
        print("No audio links found.")
        return 0

    print(f"Discovered {len(links)} audio files:")
    for link in links:
        print(f" - {link}")

    if args.dry_run:
        return 0

    ensure_directory(args.output)
    downloaded: List[Path] = []

    for link in links:
        try:
            destination = download_file(link, args.output, overwrite=args.overwrite)
        except (HTTPError, URLError, OSError) as error:
            print(f"Failed to download {link}: {error}", file=sys.stderr)
            continue
        downloaded.append(destination)
        print(f"Downloaded {link} -> {destination}")

    if downloaded:
        manifest_path = args.output / "manifest.json"
        write_manifest(manifest_path, args.url, downloaded)
        print(f"Wrote manifest with {len(downloaded)} entries to {manifest_path}")
    else:
        print("No files were downloaded.")

    return 0


if __name__ == "__main__":
    sys.exit(main())

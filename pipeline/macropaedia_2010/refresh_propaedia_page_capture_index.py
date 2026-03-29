#!/usr/bin/env python3
"""Refresh the tracked capture index for 2010 Propaedia page photos."""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path

from paths import DATA_DIR, IMAGE_ROOT, PROJECT_DATA_DIR


OUTPUT_PATH = PROJECT_DATA_DIR / "propaedia_page_capture_index.csv"
PROPAEDIA_ROOT = IMAGE_ROOT / "propaedia_pages"
SUPPORTED_SUFFIXES = {".jpg", ".jpeg", ".png", ".heic"}
PART_DIR_RE = re.compile(r"part_(\d+)$")
SEQUENCE_RE = re.compile(r"-(\d+)(?:\.[^.]+)?$")
FIELDNAMES = [
    "part_number",
    "capture_sequence",
    "block_index",
    "section_code",
    "image_relative_path",
    "propaedia_page_reference",
    "crop_top_pct",
    "crop_bottom_pct",
    "header_context_override",
    "topic_summary_override",
    "capture_status",
    "notes",
]


def read_existing_rows(path: Path) -> dict[str, list[dict[str, str]]]:
    if not path.exists():
        return {}
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    grouped: dict[str, list[dict[str, str]]] = {}
    for row in rows:
        grouped.setdefault(row["image_relative_path"], []).append(row)
    return grouped


def infer_part_number(path: Path) -> int:
    for parent in path.parents:
        match = PART_DIR_RE.search(parent.name)
        if match:
            return int(match.group(1))
    raise ValueError(f"Could not infer part number from {path}")


def infer_capture_sequence(path: Path) -> int:
    match = SEQUENCE_RE.search(path.name)
    if match:
        return int(match.group(1))
    raise ValueError(f"Could not infer capture sequence from {path.name}")


def discover_images() -> list[Path]:
    paths = [
        path
        for path in PROPAEDIA_ROOT.rglob("*")
        if path.is_file() and path.suffix.lower() in SUPPORTED_SUFFIXES
    ]
    return sorted(paths)


def load_known_section_codes() -> dict[tuple[str, str, str, str, str], str]:
    known: dict[tuple[str, str, str, str, str], str] = {}
    for path in sorted(DATA_DIR.glob("propaedia_part_*_suggested_reading.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        for page in payload.get("pages", []):
            section_code = str(page.get("sectionCode", "") or "").strip()
            if not section_code:
                continue
            key = (
                str(payload.get("partNumber", "")),
                str(page.get("captureSequence", "")),
                str(page.get("blockIndex", 1)),
                str(page.get("imageRelativePath", "")),
                str(page.get("propaediaPageReference", "")),
            )
            known[key] = section_code
    return known


def main() -> None:
    existing = read_existing_rows(OUTPUT_PATH)
    known_section_codes = load_known_section_codes()
    rows: list[dict[str, str | int]] = []

    for path in discover_images():
        relative_path = path.relative_to(IMAGE_ROOT).as_posix()
        prior_rows = existing.get(relative_path)
        if prior_rows:
            for ordinal, prior in enumerate(prior_rows, start=1):
                rows.append(
                    {
                        "part_number": infer_part_number(path),
                        "capture_sequence": infer_capture_sequence(path),
                        "block_index": (prior.get("block_index", "").strip() or str(ordinal)),
                        "section_code": (
                            known_section_codes.get(
                                (
                                    str(infer_part_number(path)),
                                    str(infer_capture_sequence(path)),
                                    (prior.get("block_index", "").strip() or str(ordinal)),
                                    relative_path,
                                    prior.get("propaedia_page_reference", "").strip(),
                                ),
                                "",
                            )
                            or prior.get("section_code", "").strip()
                        ),
                        "image_relative_path": relative_path,
                        "propaedia_page_reference": prior.get("propaedia_page_reference", "").strip(),
                        "crop_top_pct": prior.get("crop_top_pct", "").strip(),
                        "crop_bottom_pct": prior.get("crop_bottom_pct", "").strip(),
                        "header_context_override": prior.get("header_context_override", "").strip(),
                        "topic_summary_override": prior.get("topic_summary_override", "").strip(),
                        "capture_status": prior.get("capture_status", "").strip() or "captured",
                        "notes": prior.get("notes", "").strip(),
                    }
                )
            continue

        rows.append(
            {
                "part_number": infer_part_number(path),
                "capture_sequence": infer_capture_sequence(path),
                "block_index": 1,
                "section_code": "",
                "image_relative_path": relative_path,
                "propaedia_page_reference": "",
                "crop_top_pct": "",
                "crop_bottom_pct": "",
                "header_context_override": "",
                "topic_summary_override": "",
                "capture_status": "captured",
                "notes": "",
            }
        )

    rows.sort(
        key=lambda row: (
            int(row["part_number"]),
            int(row["capture_sequence"]),
            int(row["block_index"]),
            str(row["section_code"]),
            str(row["propaedia_page_reference"]),
        )
    )
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} rows to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()

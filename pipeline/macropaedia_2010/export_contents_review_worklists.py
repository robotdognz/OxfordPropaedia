#!/usr/bin/env python3
"""Export human-review worklists for 2010 Macropaedia contents-page extraction."""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path

from paths import DATA_DIR, PROJECT_DATA_DIR, RAW_OUTPUT_DIR


REVIEWED_CANDIDATES_PATH = DATA_DIR / "2010_article_candidates_reviewed.json"
RAW_CANDIDATES_PATH = RAW_OUTPUT_DIR / "2010_article_candidates.json"
PAGE_REVIEW_PATH = PROJECT_DATA_DIR / "contents_page_review_human.csv"
RISK_REVIEW_PATH = PROJECT_DATA_DIR / "contents_risk_review_human.csv"
ENTRY_PAGE_RE = re.compile(r"^(\d+[A-Z]?)\s+")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reviewed-candidates", type=Path, default=REVIEWED_CANDIDATES_PATH)
    parser.add_argument("--raw-candidates", type=Path, default=RAW_CANDIDATES_PATH)
    parser.add_argument("--page-review-path", type=Path, default=PAGE_REVIEW_PATH)
    parser.add_argument("--risk-review-path", type=Path, default=RISK_REVIEW_PATH)
    return parser.parse_args()


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def read_existing_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def index_existing_rows(rows: list[dict[str, str]], key_fields: list[str]) -> dict[tuple[str, ...], dict[str, str]]:
    return {tuple(row.get(field, "") for field in key_fields): row for row in rows}


def apply_existing_values(
    rows: list[dict[str, object]],
    existing_rows: dict[tuple[str, ...], dict[str, str]],
    key_fields: list[str],
    fields_to_preserve: list[str],
) -> None:
    for row in rows:
        key = tuple(str(row.get(field, "")) for field in key_fields)
        existing = existing_rows.get(key)
        if existing is None:
            continue
        for field in fields_to_preserve:
            if field in existing and existing[field]:
                row[field] = existing[field]


def normalize_image_path(path: str) -> str:
    prefix = "Macropaedia 2010/"
    return path[len(prefix) :] if path.startswith(prefix) else path


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def format_entry(page: str, title: str) -> str:
    page_prefix = f"{page} " if page else ""
    return f"{page_prefix}{title}".strip()


def entry_sort_key(entry: str) -> tuple[int, int, str]:
    match = ENTRY_PAGE_RE.match(entry)
    if not match:
        return (1, 10**9, entry)
    page_label = match.group(1)
    digits = "".join(character for character in page_label if character.isdigit())
    page_index = int(digits) if digits else 10**9
    return (0, page_index, entry)


def build_page_rows(reviewed: dict) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for volume in reviewed["volumes"]:
        rows.append(
            {
                "volume": volume["volumeNumber"],
                "image": normalize_image_path(volume["sourceImage"]),
                "orientation": volume.get("chosenOrientation", ""),
                "article_count": volume["articleCount"],
                "titles": " | ".join(
                    format_entry(article["startPage"], article["title"]) for article in volume["articles"]
                ),
                "status": "pending",
                "visible_article_count": "",
                "missing_entries": "",
                "extra_entries": "",
                "notes": "",
            }
        )
    return rows


def article_lookup(volume: dict) -> dict[str, dict]:
    return {article["startPage"]: article for article in volume["articles"]}


def build_risk_rows(reviewed: dict, raw: dict) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    raw_by_volume = {volume["volumeNumber"]: volume for volume in raw["volumes"]}

    for volume in reviewed["volumes"]:
        volume_number = volume["volumeNumber"]
        raw_volume = raw_by_volume.get(volume_number, {"articles": [], "leftovers": []})
        reviewed_lookup = article_lookup(volume)
        raw_lookup = article_lookup(raw_volume)

        reviewed_pages = set(reviewed_lookup)
        raw_pages = set(raw_lookup)

        rescued_pages = sorted(reviewed_pages - raw_pages, key=lambda label: reviewed_lookup[label]["startPageIndex"])
        for page in rescued_pages:
            article = reviewed_lookup[page]
            rows.append(
                {
                    "volume": volume_number,
                    "image": normalize_image_path(volume["sourceImage"]),
                    "entry": format_entry(article["startPage"], article["title"]),
                    "status": "pending",
                    "corrected_entry": "",
                    "notes": "rescued_from_manual_review",
                }
            )

        renamed_pages = sorted(reviewed_pages & raw_pages, key=lambda label: reviewed_lookup[label]["startPageIndex"])
        for page in renamed_pages:
            reviewed_article = reviewed_lookup[page]
            raw_article = raw_lookup[page]
            if reviewed_article["title"] == raw_article["title"]:
                continue
            rows.append(
                {
                    "volume": volume_number,
                    "image": normalize_image_path(volume["sourceImage"]),
                    "entry": format_entry(reviewed_article["startPage"], reviewed_article["title"]),
                    "status": "pending",
                    "corrected_entry": "",
                    "notes": f"retitled_from_raw:{format_entry(raw_article['startPage'], raw_article['title'])}",
                }
            )

        for leftover in volume.get("leftovers", []):
            rows.append(
                {
                    "volume": volume_number,
                    "image": normalize_image_path(volume["sourceImage"]),
                    "entry": leftover,
                    "status": "pending",
                    "corrected_entry": "",
                    "notes": "unresolved_leftover",
                }
            )

    rows.sort(key=lambda row: (int(row["volume"]),) + entry_sort_key(str(row["entry"])))
    return rows


def export_review_worklists(
    reviewed_candidates_path: Path = REVIEWED_CANDIDATES_PATH,
    raw_candidates_path: Path = RAW_CANDIDATES_PATH,
    page_review_path: Path = PAGE_REVIEW_PATH,
    risk_review_path: Path = RISK_REVIEW_PATH,
) -> tuple[int, int]:
    reviewed = load_json(reviewed_candidates_path)
    raw = load_json(raw_candidates_path)
    page_rows = build_page_rows(reviewed)
    risk_rows = build_risk_rows(reviewed, raw)

    apply_existing_values(
        page_rows,
        index_existing_rows(read_existing_rows(page_review_path), ["volume", "image"]),
        ["volume", "image"],
        ["status", "visible_article_count", "missing_entries", "extra_entries", "notes"],
    )
    apply_existing_values(
        risk_rows,
        index_existing_rows(read_existing_rows(risk_review_path), ["volume", "image", "entry"]),
        ["volume", "image", "entry"],
        ["status", "corrected_entry", "notes"],
    )

    write_csv(
        page_review_path,
        [
            "volume",
            "image",
            "orientation",
            "article_count",
            "titles",
            "status",
            "visible_article_count",
            "missing_entries",
            "extra_entries",
            "notes",
        ],
        page_rows,
    )
    write_csv(
        risk_review_path,
        [
            "volume",
            "image",
            "entry",
            "status",
            "corrected_entry",
            "notes",
        ],
        risk_rows,
    )
    return len(page_rows), len(risk_rows)


def main() -> None:
    args = parse_args()
    page_count, risk_count = export_review_worklists(
        reviewed_candidates_path=args.reviewed_candidates,
        raw_candidates_path=args.raw_candidates,
        page_review_path=args.page_review_path,
        risk_review_path=args.risk_review_path,
    )
    print(f"Wrote contents page-review worklist to {args.page_review_path} ({page_count} rows)")
    print(f"Wrote contents risk-review worklist to {args.risk_review_path} ({risk_count} rows)")


if __name__ == "__main__":
    main()

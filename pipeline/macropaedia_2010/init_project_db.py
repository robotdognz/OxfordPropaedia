#!/usr/bin/env python3
"""Initialize the long-running 2010 Macropaedia project database and worklists."""

from __future__ import annotations

import argparse
import csv
import json
import sqlite3
from pathlib import Path

from paths import DATA_DIR, IMAGE_ROOT, PROJECT_DATA_DIR, RAW_OUTPUT_DIR, REPO_ROOT
from propaedia_name_aliases import (
    build_propaedia_name_candidate_summary,
    build_propaedia_name_evidence,
    build_propaedia_name_summary_lookup,
    build_unmatched_propaedia_occurrences,
    build_unmatched_propaedia_summary,
    discover_payloads,
)

SCHEMA_PATH = REPO_ROOT / "pipeline" / "macropaedia_2010" / "schema.sql"
REVIEWED_CANDIDATES_PATH = DATA_DIR / "2010_article_candidates_reviewed.json"
MANIFEST_PATH = RAW_OUTPUT_DIR / "manifest.json"
DEFAULT_DB_PATH = PROJECT_DATA_DIR / "macropaedia_2010_project.sqlite"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    parser.add_argument("--force", action="store_true", help="Replace an existing database file")
    return parser.parse_args()


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, object]]) -> None:
    ensure_parent(path)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def build_connection(db_path: Path, force: bool) -> sqlite3.Connection:
    ensure_parent(db_path)
    if db_path.exists():
        if not force:
            raise SystemExit(f"Database already exists: {db_path}. Use --force to replace it.")
        db_path.unlink()

    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    connection.executescript(SCHEMA_PATH.read_text())
    return connection


def insert_project_meta(connection: sqlite3.Connection, db_path: Path) -> None:
    rows = [
        ("project_name", "Macropaedia 2010 Long-Running Review"),
        ("repo_root", str(REPO_ROOT)),
        ("image_root", str(IMAGE_ROOT)),
        ("database_path", str(db_path)),
        ("reviewed_candidates_source", str(REVIEWED_CANDIDATES_PATH.relative_to(REPO_ROOT))),
        ("volume_manifest_source", str(MANIFEST_PATH.relative_to(REPO_ROOT))),
        ("notes", "This database is separate from app data and is intended for long-running manual review."),
    ]
    connection.executemany("INSERT INTO project_meta(key, value) VALUES(?, ?)", rows)


def seed_database(connection: sqlite3.Connection) -> None:
    reviewed = json.loads(REVIEWED_CANDIDATES_PATH.read_text())
    manifest = json.loads(MANIFEST_PATH.read_text())
    manifest_by_volume = {entry["volumeNumber"]: entry for entry in manifest["images"]}

    article_rows: list[tuple[object, ...]] = []
    image_rows: list[tuple[object, ...]] = []

    for volume in reviewed["volumes"]:
        manifest_entry = manifest_by_volume.get(volume["volumeNumber"], {})
        articles = volume["articles"]
        first_start = articles[0]["startPage"] if articles else None
        last_start = articles[-1]["startPage"] if articles else None

        connection.execute(
            """
            INSERT INTO volumes(
                volume_number,
                volume_label,
                contents_image_relative_path,
                contents_image_orientation,
                image_width,
                image_height,
                first_start_page_label,
                last_start_page_label,
                notes
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                volume["volumeNumber"],
                f"Volume {volume['volumeNumber']}",
                manifest_entry.get("relativePath"),
                manifest_entry.get("chosenOrientation"),
                manifest_entry.get("width"),
                manifest_entry.get("height"),
                first_start,
                last_start,
                None,
            ),
        )

        if manifest_entry.get("relativePath"):
            image_rows.append(
                (
                    "volume_contents",
                    manifest_entry["relativePath"],
                    volume["volumeNumber"],
                    None,
                    None,
                    None,
                    "captured",
                    "Seeded from the reviewed contents-page OCR manifest.",
                )
            )

        for sort_order, article in enumerate(articles, start=1):
            article_rows.append(
                (
                    volume["volumeNumber"],
                    sort_order,
                    article["startPage"],
                    article["startPageIndex"],
                    article["pageCountEstimate"],
                    article["title"],
                    None,
                    "missing",
                    None,
                    "missing",
                    "missing",
                    "missing",
                    None,
                )
            )

    connection.executemany(
        """
        INSERT INTO articles(
            volume_number,
            sort_order,
            start_page_label,
            start_page_index,
            page_length,
            macropaedia_contents_name,
            propaedia_name,
            propaedia_name_status,
            propaedia_name_source_image_path,
            article_contents_image_status,
            propaedia_mapping_status,
            britannica_mapping_status,
            notes
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        article_rows,
    )

    connection.executemany(
        """
        INSERT INTO images(
            image_kind,
            relative_path,
            volume_number,
            article_id,
            linked_start_page_label,
            page_reference,
            capture_status,
            notes
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)
        """,
        image_rows,
    )

    connection.commit()


def fetch_rows(connection: sqlite3.Connection, query: str) -> list[sqlite3.Row]:
    return list(connection.execute(query))


def export_worklists(connection: sqlite3.Connection) -> None:
    payloads = discover_payloads()
    alias_evidence_rows = build_propaedia_name_evidence(payloads)
    alias_summary_rows = build_propaedia_name_candidate_summary(alias_evidence_rows)
    alias_summary = build_propaedia_name_summary_lookup(alias_summary_rows)
    unmatched_occurrences = build_unmatched_propaedia_occurrences(payloads)

    write_csv(
        PROJECT_DATA_DIR / "propaedia_name_evidence_worklist.csv",
        [
            "volume_number",
            "start_page_label",
            "macropaedia_contents_name",
            "observed_propaedia_name",
            "match_method",
            "extraction_method",
            "part_number",
            "capture_sequence",
            "propaedia_page_reference",
            "source_image_relative_path",
        ],
        alias_evidence_rows,
    )

    write_csv(
        PROJECT_DATA_DIR / "propaedia_name_candidate_summary.csv",
        [
            "volume_number",
            "start_page_label",
            "macropaedia_contents_name",
            "candidate_count",
            "suggested_propaedia_name",
            "suggested_occurrence_count",
            "suggested_match_methods",
            "suggested_source_pages",
            "suggested_source_images",
            "alternate_propaedia_names",
        ],
        alias_summary_rows,
    )

    write_csv(
        PROJECT_DATA_DIR / "propaedia_unmatched_contents_occurrences.csv",
        [
            "part_number",
            "capture_sequence",
            "propaedia_page_reference",
            "header_context",
            "topic_summary",
            "observed_propaedia_name",
            "extraction_method",
            "image_relative_path",
        ],
        unmatched_occurrences,
    )

    write_csv(
        PROJECT_DATA_DIR / "propaedia_unmatched_contents_summary.csv",
        [
            "observed_propaedia_name",
            "occurrence_count",
            "part_numbers",
            "propaedia_page_references",
            "header_contexts",
            "image_relative_paths",
            "review_notes",
            "resolved_macropaedia_contents_name",
        ],
        build_unmatched_propaedia_summary(unmatched_occurrences),
    )

    article_rows = fetch_rows(
        connection,
        """
        SELECT
            volume_number,
            start_page_label,
            start_page_index,
            page_length,
            macropaedia_contents_name
        FROM articles
        ORDER BY volume_number, sort_order
        """,
    )

    identity_rows = [
        {
            "volume_number": row["volume_number"],
            "start_page_label": row["start_page_label"],
            "start_page_index": row["start_page_index"],
            "page_length": row["page_length"] or "",
            "macropaedia_contents_name": row["macropaedia_contents_name"],
            "suggested_propaedia_name": alias_summary.get(
                (int(row["volume_number"]), row["start_page_label"]),
                {},
            ).get("suggested_propaedia_name", ""),
            "suggested_propaedia_name_occurrence_count": alias_summary.get(
                (int(row["volume_number"]), row["start_page_label"]),
                {},
            ).get("suggested_occurrence_count", ""),
            "suggested_propaedia_name_match_methods": alias_summary.get(
                (int(row["volume_number"]), row["start_page_label"]),
                {},
            ).get("suggested_match_methods", ""),
            "suggested_propaedia_name_source_pages": alias_summary.get(
                (int(row["volume_number"]), row["start_page_label"]),
                {},
            ).get("suggested_source_pages", ""),
            "suggested_propaedia_name_source_images": alias_summary.get(
                (int(row["volume_number"]), row["start_page_label"]),
                {},
            ).get("suggested_source_images", ""),
            "alternate_propaedia_names": alias_summary.get(
                (int(row["volume_number"]), row["start_page_label"]),
                {},
            ).get("alternate_propaedia_names", ""),
            "propaedia_name": "",
            "propaedia_name_source_image_path": "",
            "notes": "",
        }
        for row in article_rows
    ]
    write_csv(
        PROJECT_DATA_DIR / "article_identity_worklist.csv",
        [
            "volume_number",
            "start_page_label",
            "start_page_index",
            "page_length",
            "macropaedia_contents_name",
            "suggested_propaedia_name",
            "suggested_propaedia_name_occurrence_count",
            "suggested_propaedia_name_match_methods",
            "suggested_propaedia_name_source_pages",
            "suggested_propaedia_name_source_images",
            "alternate_propaedia_names",
            "propaedia_name",
            "propaedia_name_source_image_path",
            "notes",
        ],
        identity_rows,
    )

    article_capture_rows = [
        {
            "volume_number": row["volume_number"],
            "start_page_label": row["start_page_label"],
            "macropaedia_contents_name": row["macropaedia_contents_name"],
            "article_contents_image_relative_path": "",
            "capture_status": "missing",
            "notes": "",
        }
        for row in article_rows
    ]
    write_csv(
        PROJECT_DATA_DIR / "article_contents_capture_worklist.csv",
        [
            "volume_number",
            "start_page_label",
            "macropaedia_contents_name",
            "article_contents_image_relative_path",
            "capture_status",
            "notes",
        ],
        article_capture_rows,
    )

    mapping_rows = [
        {
            "volume_number": row["volume_number"],
            "start_page_label": row["start_page_label"],
            "macropaedia_contents_name": row["macropaedia_contents_name"],
            "propaedia_name": "",
            "part_number": "",
            "division_id": "",
            "section_code": "",
            "subsection_path": "",
            "confidence": "draft",
            "source_image_relative_path": "",
            "notes": "",
        }
        for row in article_rows
    ]
    write_csv(
        PROJECT_DATA_DIR / "propaedia_mapping_worklist.csv",
        [
            "volume_number",
            "start_page_label",
            "macropaedia_contents_name",
            "propaedia_name",
            "part_number",
            "division_id",
            "section_code",
            "subsection_path",
            "confidence",
            "source_image_relative_path",
            "notes",
        ],
        mapping_rows,
    )

    britannica_rows = [
        {
            "volume_number": row["volume_number"],
            "start_page_label": row["start_page_label"],
            "macropaedia_contents_name": row["macropaedia_contents_name"],
            "propaedia_name": "",
            "britannica_title": "",
            "britannica_url": "",
            "confidence": "draft",
            "source_image_relative_path": "",
            "notes": "",
        }
        for row in article_rows
    ]
    write_csv(
        PROJECT_DATA_DIR / "britannica_breakdown_worklist.csv",
        [
            "volume_number",
            "start_page_label",
            "macropaedia_contents_name",
            "propaedia_name",
            "britannica_title",
            "britannica_url",
            "confidence",
            "source_image_relative_path",
            "notes",
        ],
        britannica_rows,
    )

    volume_image_rows = fetch_rows(
        connection,
        """
        SELECT
            volume_number,
            contents_image_relative_path,
            contents_image_orientation,
            image_width,
            image_height,
            first_start_page_label,
            last_start_page_label
        FROM volumes
        ORDER BY volume_number
        """,
    )
    write_csv(
        PROJECT_DATA_DIR / "volume_contents_index.csv",
        [
            "volume_number",
            "contents_image_relative_path",
            "contents_image_orientation",
            "image_width",
            "image_height",
            "first_start_page_label",
            "last_start_page_label",
        ],
        [dict(row) for row in volume_image_rows],
    )


def write_project_readme(db_path: Path, connection: sqlite3.Connection) -> None:
    article_count = connection.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
    volume_count = connection.execute("SELECT COUNT(*) FROM volumes").fetchone()[0]
    null_length_count = connection.execute("SELECT COUNT(*) FROM articles WHERE page_length IS NULL").fetchone()[0]

    text = f"""# Macropaedia 2010 Project Outputs

This folder contains the long-running 2010 Macropaedia review workspace.

Tracked canonical files:

- `../manual_review_fill_in.txt`
- `../2010_article_candidates_reviewed.json`
- `../2010_vs_2005_comparison_reviewed.json`
- `*.csv` in this folder

The SQLite database is a local working index regenerated from the tracked files above.

- database: `{db_path.name}`
- seeded volumes: `{volume_count}`
- seeded articles: `{article_count}`
- articles with blank page length: `{null_length_count}`

Generated files:

- `article_identity_worklist.csv`
- `propaedia_name_evidence_worklist.csv`
- `propaedia_name_candidate_summary.csv`
- `propaedia_unmatched_contents_occurrences.csv`
- `propaedia_unmatched_contents_summary.csv`
- `article_contents_capture_worklist.csv`
- `propaedia_mapping_worklist.csv`
- `britannica_breakdown_worklist.csv`
- `volume_contents_index.csv`

The database is the intended source of truth for this project. The CSV files are fill-in worklists
for manual capture and review.

Useful commands:

```bash
python3 pipeline/macropaedia_2010/export_project_worklists.py
python3 pipeline/macropaedia_2010/apply_project_worklists.py
```
"""
    (PROJECT_DATA_DIR / "README.md").write_text(text)


def main() -> None:
    args = parse_args()
    connection = build_connection(args.db, args.force)
    insert_project_meta(connection, args.db)
    seed_database(connection)
    export_worklists(connection)
    write_project_readme(args.db, connection)
    connection.close()
    print(f"Initialized project database at {args.db}")
    print(f"Wrote worklists under {PROJECT_DATA_DIR}")


if __name__ == "__main__":
    main()

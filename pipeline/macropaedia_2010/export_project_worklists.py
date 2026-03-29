#!/usr/bin/env python3
"""Export the current Macropaedia 2010 project database into editable worklists."""

from __future__ import annotations

import argparse
import csv
import sqlite3
from pathlib import Path

from export_contents_review_worklists import export_review_worklists as export_contents_review_worklists
from export_propaedia_review_worklists import export_review_worklists
from paths import PROJECT_DATA_DIR
from propaedia_name_aliases import (
    build_propaedia_name_candidate_summary,
    build_propaedia_name_evidence,
    build_propaedia_name_summary_lookup,
    discover_payloads,
)


DEFAULT_DB_PATH = PROJECT_DATA_DIR / "macropaedia_2010_project.sqlite"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    return parser.parse_args()


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def fetch_rows(connection: sqlite3.Connection, query: str) -> list[sqlite3.Row]:
    return list(connection.execute(query))


def current_propaedia_name_summaries() -> list[dict[str, object]]:
    return build_propaedia_name_candidate_summary(
        build_propaedia_name_evidence(discover_payloads())
    )


def export_propaedia_name_evidence_worklist() -> None:
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
        build_propaedia_name_evidence(discover_payloads()),
    )


def export_propaedia_name_candidate_summary_worklist() -> dict[tuple[int, str], dict[str, object]]:
    summary_rows = current_propaedia_name_summaries()
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
        summary_rows,
    )
    return build_propaedia_name_summary_lookup(summary_rows)


def export_identity_worklist(connection: sqlite3.Connection) -> None:
    alias_summary = export_propaedia_name_candidate_summary_worklist()
    rows = fetch_rows(
        connection,
        """
        SELECT
            volume_number,
            start_page_label,
            start_page_index,
            page_length,
            macropaedia_contents_name,
            propaedia_name,
            propaedia_name_source_image_path,
            notes
        FROM articles
        ORDER BY volume_number, sort_order
        """,
    )
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
        [
            {
                **({
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
                }),
                "volume_number": row["volume_number"],
                "start_page_label": row["start_page_label"],
                "start_page_index": row["start_page_index"],
                "page_length": row["page_length"] or "",
                "macropaedia_contents_name": row["macropaedia_contents_name"],
                "propaedia_name": row["propaedia_name"] or "",
                "propaedia_name_source_image_path": row["propaedia_name_source_image_path"] or "",
                "notes": row["notes"] or "",
            }
            for row in rows
        ],
    )


def export_article_contents_worklist(connection: sqlite3.Connection) -> None:
    rows = fetch_rows(
        connection,
        """
        SELECT
            a.volume_number,
            a.start_page_label,
            a.macropaedia_contents_name,
            i.relative_path AS article_contents_image_relative_path,
            COALESCE(i.capture_status, a.article_contents_image_status) AS capture_status,
            COALESCE(i.notes, a.notes, '') AS notes
        FROM articles a
        LEFT JOIN images i
            ON i.article_id = a.article_id
           AND i.image_kind = 'article_contents'
        ORDER BY a.volume_number, a.sort_order, i.relative_path
        """,
    )
    normalized_rows: list[dict[str, object]] = []
    for row in rows:
        normalized_rows.append(
            {
                "volume_number": row["volume_number"],
                "start_page_label": row["start_page_label"],
                "macropaedia_contents_name": row["macropaedia_contents_name"],
                "article_contents_image_relative_path": row["article_contents_image_relative_path"] or "",
                "capture_status": row["capture_status"] or "missing",
                "notes": row["notes"] or "",
            }
        )
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
        normalized_rows,
    )


def export_mapping_worklist(connection: sqlite3.Connection) -> None:
    rows = fetch_rows(
        connection,
        """
        SELECT
            a.volume_number,
            a.start_page_label,
            a.macropaedia_contents_name,
            COALESCE(a.propaedia_name, '') AS propaedia_name,
            pm.part_number,
            pm.division_id,
            pm.section_code,
            pm.subsection_path,
            pm.confidence,
            pm.source_image_relative_path,
            pm.notes
        FROM articles a
        LEFT JOIN propaedia_mappings pm ON pm.article_id = a.article_id
        ORDER BY a.volume_number, a.sort_order, pm.mapping_order, pm.mapping_id
        """,
    )
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
        [
            {
                "volume_number": row["volume_number"],
                "start_page_label": row["start_page_label"],
                "macropaedia_contents_name": row["macropaedia_contents_name"],
                "propaedia_name": row["propaedia_name"],
                "part_number": row["part_number"] or "",
                "division_id": row["division_id"] or "",
                "section_code": row["section_code"] or "",
                "subsection_path": row["subsection_path"] or "",
                "confidence": row["confidence"] or "draft",
                "source_image_relative_path": row["source_image_relative_path"] or "",
                "notes": row["notes"] or "",
            }
            for row in rows
        ],
    )


def export_britannica_worklist(connection: sqlite3.Connection) -> None:
    rows = fetch_rows(
        connection,
        """
        SELECT
            a.volume_number,
            a.start_page_label,
            a.macropaedia_contents_name,
            COALESCE(a.propaedia_name, '') AS propaedia_name,
            bt.target_title,
            bt.target_url,
            bt.confidence,
            bt.source_image_relative_path,
            bt.notes
        FROM articles a
        LEFT JOIN britannica_targets bt ON bt.article_id = a.article_id
        ORDER BY a.volume_number, a.sort_order, bt.target_id
        """,
    )
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
        [
            {
                "volume_number": row["volume_number"],
                "start_page_label": row["start_page_label"],
                "macropaedia_contents_name": row["macropaedia_contents_name"],
                "propaedia_name": row["propaedia_name"],
                "britannica_title": row["target_title"] or "",
                "britannica_url": row["target_url"] or "",
                "confidence": row["confidence"] or "draft",
                "source_image_relative_path": row["source_image_relative_path"] or "",
                "notes": row["notes"] or "",
            }
            for row in rows
        ],
    )


def export_volume_index(connection: sqlite3.Connection) -> None:
    rows = fetch_rows(
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
        [dict(row) for row in rows],
    )


def main() -> None:
    args = parse_args()
    connection = sqlite3.connect(args.db)
    connection.row_factory = sqlite3.Row
    export_propaedia_name_evidence_worklist()
    export_identity_worklist(connection)
    export_article_contents_worklist(connection)
    export_mapping_worklist(connection)
    export_britannica_worklist(connection)
    export_volume_index(connection)
    page_count, risk_count = export_review_worklists()
    contents_page_count, contents_risk_count = export_contents_review_worklists()
    connection.close()
    print(f"Exported worklists from {args.db}")
    print(f"Exported Propaedia page review rows: {page_count}")
    print(f"Exported Propaedia risk review rows: {risk_count}")
    print(f"Exported contents page review rows: {contents_page_count}")
    print(f"Exported contents risk review rows: {contents_risk_count}")


if __name__ == "__main__":
    main()

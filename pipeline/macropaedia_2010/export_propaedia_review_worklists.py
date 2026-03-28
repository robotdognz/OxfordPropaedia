#!/usr/bin/env python3
"""Export human-review worklists for extracted Propaedia suggested-reading data."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

from paths import DATA_DIR, PROJECT_DATA_DIR


PAGE_REVIEW_PATH = PROJECT_DATA_DIR / "propaedia_suggested_reading_page_review.csv"
RISK_REVIEW_PATH = PROJECT_DATA_DIR / "propaedia_suggested_reading_risk_review.csv"
PAGE_REVIEW_HUMAN_PATH = PROJECT_DATA_DIR / "propaedia_suggested_reading_page_review_human.csv"
RISK_REVIEW_HUMAN_PATH = PROJECT_DATA_DIR / "propaedia_suggested_reading_risk_review_human.csv"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=DATA_DIR)
    parser.add_argument("--page-review-path", type=Path, default=PAGE_REVIEW_PATH)
    parser.add_argument("--risk-review-path", type=Path, default=RISK_REVIEW_PATH)
    parser.add_argument("--page-review-human-path", type=Path, default=PAGE_REVIEW_HUMAN_PATH)
    parser.add_argument("--risk-review-human-path", type=Path, default=RISK_REVIEW_HUMAN_PATH)
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


def discover_payloads(data_dir: Path) -> list[dict[str, object]]:
    payloads: list[dict[str, object]] = []
    for path in sorted(data_dir.glob("propaedia_part_*_suggested_reading.json")):
        payloads.append(json.loads(path.read_text(encoding="utf-8")))
    return payloads


def risk_reason(rec: dict[str, object]) -> str:
    reasons: list[str] = []
    extraction_method = str(rec.get("extractionMethod", ""))
    match_method = str(rec.get("matchMethod", ""))
    if extraction_method and extraction_method != "single_ocr_line":
        reasons.append("ocr_line_recombination")
    if match_method and match_method != "direct":
        reasons.append(match_method)
    return "|".join(reasons)


def build_page_rows(payloads: list[dict[str, object]]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for payload in payloads:
        part_number = int(payload["partNumber"])
        for page in payload["pages"]:
            recommendations = page["recommendations"]
            risky = [rec for rec in recommendations if risk_reason(rec)]
            rows.append(
                {
                    "part_number": part_number,
                    "capture_sequence": page["captureSequence"],
                    "propaedia_page_reference": page["propaediaPageReference"],
                    "image_relative_path": page["imageRelativePath"],
                    "header_context": page["headerContext"],
                    "topic_summary": page["topicSummary"],
                    "extracted_count": len(recommendations),
                    "risky_recommendation_count": len(risky),
                    "extracted_titles": " | ".join(str(rec["observedTitle"]) for rec in recommendations),
                    "review_status": "pending",
                    "visual_title_count": "",
                    "missing_titles": "",
                    "extra_titles": "",
                    "notes": "",
                }
            )
    return rows


def build_risk_rows(payloads: list[dict[str, object]]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for payload in payloads:
        part_number = int(payload["partNumber"])
        for page in payload["pages"]:
            for rec in page["recommendations"]:
                reason = risk_reason(rec)
                if not reason:
                    continue
                rows.append(
                    {
                        "part_number": part_number,
                        "capture_sequence": page["captureSequence"],
                        "propaedia_page_reference": page["propaediaPageReference"],
                        "image_relative_path": page["imageRelativePath"],
                        "sort_order": rec["sortOrder"],
                        "observed_title": rec["observedTitle"],
                        "extraction_method": rec["extractionMethod"],
                        "match_method": rec.get("matchMethod", "") or "",
                        "matched_title": rec.get("matchedTitle", "") or "",
                        "risk_reason": reason,
                        "review_status": "pending",
                        "corrected_observed_title": "",
                        "corrected_matched_title": "",
                        "notes": "",
                    }
                )
    return rows


def build_page_rows_human(page_rows: list[dict[str, object]]) -> list[dict[str, object]]:
    return [
        {
            "page": row["propaedia_page_reference"],
            "image": row["image_relative_path"],
            "title_count": row["extracted_count"],
            "titles": row["extracted_titles"],
            "status": row["review_status"],
            "missing_titles": row["missing_titles"],
            "extra_titles": row["extra_titles"],
            "notes": row["notes"],
        }
        for row in page_rows
    ]


def build_risk_rows_human(risk_rows: list[dict[str, object]]) -> list[dict[str, object]]:
    return [
        {
            "page": row["propaedia_page_reference"],
            "image": row["image_relative_path"],
            "observed_title": row["observed_title"],
            "matched_title": row["matched_title"],
            "status": row["review_status"],
            "corrected_observed_title": row["corrected_observed_title"],
            "corrected_matched_title": row["corrected_matched_title"],
            "notes": row["notes"],
        }
        for row in risk_rows
    ]


def export_review_worklists(
    data_dir: Path = DATA_DIR,
    page_review_path: Path = PAGE_REVIEW_PATH,
    risk_review_path: Path = RISK_REVIEW_PATH,
    page_review_human_path: Path = PAGE_REVIEW_HUMAN_PATH,
    risk_review_human_path: Path = RISK_REVIEW_HUMAN_PATH,
) -> tuple[int, int]:
    payloads = discover_payloads(data_dir)
    page_rows = build_page_rows(payloads)
    risk_rows = build_risk_rows(payloads)
    page_rows_human = build_page_rows_human(page_rows)
    risk_rows_human = build_risk_rows_human(risk_rows)

    apply_existing_values(
        page_rows,
        index_existing_rows(
            read_existing_rows(page_review_path),
            ["part_number", "capture_sequence", "propaedia_page_reference", "image_relative_path"],
        ),
        ["part_number", "capture_sequence", "propaedia_page_reference", "image_relative_path"],
        ["review_status", "visual_title_count", "missing_titles", "extra_titles", "notes"],
    )
    apply_existing_values(
        risk_rows,
        index_existing_rows(
            read_existing_rows(risk_review_path),
            ["part_number", "capture_sequence", "propaedia_page_reference", "image_relative_path", "sort_order"],
        ),
        ["part_number", "capture_sequence", "propaedia_page_reference", "image_relative_path", "sort_order"],
        ["review_status", "corrected_observed_title", "corrected_matched_title", "notes"],
    )
    page_rows_human = build_page_rows_human(page_rows)
    risk_rows_human = build_risk_rows_human(risk_rows)
    apply_existing_values(
        page_rows_human,
        index_existing_rows(read_existing_rows(page_review_human_path), ["page", "image"]),
        ["page", "image"],
        ["status", "missing_titles", "extra_titles", "notes"],
    )
    apply_existing_values(
        risk_rows_human,
        index_existing_rows(read_existing_rows(risk_review_human_path), ["page", "image", "observed_title", "matched_title"]),
        ["page", "image", "observed_title", "matched_title"],
        ["status", "corrected_observed_title", "corrected_matched_title", "notes"],
    )

    write_csv(
        page_review_path,
        [
            "part_number",
            "capture_sequence",
            "propaedia_page_reference",
            "image_relative_path",
            "header_context",
            "topic_summary",
            "extracted_count",
            "risky_recommendation_count",
            "extracted_titles",
            "review_status",
            "visual_title_count",
            "missing_titles",
            "extra_titles",
            "notes",
        ],
        page_rows,
    )
    write_csv(
        risk_review_path,
        [
            "part_number",
            "capture_sequence",
            "propaedia_page_reference",
            "image_relative_path",
            "sort_order",
            "observed_title",
            "extraction_method",
            "match_method",
            "matched_title",
            "risk_reason",
            "review_status",
            "corrected_observed_title",
            "corrected_matched_title",
            "notes",
        ],
        risk_rows,
    )
    write_csv(
        page_review_human_path,
        [
            "page",
            "image",
            "title_count",
            "titles",
            "status",
            "missing_titles",
            "extra_titles",
            "notes",
        ],
        page_rows_human,
    )
    write_csv(
        risk_review_human_path,
        [
            "page",
            "image",
            "observed_title",
            "matched_title",
            "status",
            "corrected_observed_title",
            "corrected_matched_title",
            "notes",
        ],
        risk_rows_human,
    )
    return len(page_rows), len(risk_rows)


def main() -> None:
    args = parse_args()
    page_count, risk_count = export_review_worklists(
        data_dir=args.data_dir,
        page_review_path=args.page_review_path,
        risk_review_path=args.risk_review_path,
        page_review_human_path=args.page_review_human_path,
        risk_review_human_path=args.risk_review_human_path,
    )
    print(f"Wrote page-review worklist to {args.page_review_path} ({page_count} rows)")
    print(f"Wrote risk-review worklist to {args.risk_review_path} ({risk_count} rows)")
    print(f"Wrote human page-review worklist to {args.page_review_human_path} ({page_count} rows)")
    print(f"Wrote human risk-review worklist to {args.risk_review_human_path} ({risk_count} rows)")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build reusable Propaedia-name alias evidence from extracted suggested-reading matches."""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

from paths import DATA_DIR


def discover_payloads(data_dir: Path = DATA_DIR) -> list[dict[str, object]]:
    payloads: list[dict[str, object]] = []
    for path in sorted(data_dir.glob("propaedia_part_*_suggested_reading.json")):
        payloads.append(json.loads(path.read_text(encoding="utf-8")))
    return payloads


def build_propaedia_name_evidence(payloads: list[dict[str, object]]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for payload in payloads:
        part_number = int(payload["partNumber"])
        for page in payload["pages"]:
            for recommendation in page["recommendations"]:
                if recommendation["matchStatus"] != "matched":
                    continue
                rows.append(
                    {
                        "volume_number": recommendation["matchedVolumeNumber"],
                        "start_page_label": recommendation["matchedStartPage"],
                        "macropaedia_contents_name": recommendation["matchedTitle"],
                        "observed_propaedia_name": recommendation["observedTitle"],
                        "match_method": recommendation.get("matchMethod", "") or "",
                        "extraction_method": recommendation.get("extractionMethod", "") or "",
                        "part_number": part_number,
                        "capture_sequence": page["captureSequence"],
                        "propaedia_page_reference": page["propaediaPageReference"],
                        "source_image_relative_path": page["imageRelativePath"],
                    }
                )
    return rows


def build_propaedia_name_candidate_summary(
    evidence_rows: list[dict[str, object]],
) -> list[dict[str, object]]:
    grouped: dict[tuple[int, str], dict[str, object]] = {}
    evidence_by_candidate: dict[tuple[int, str], dict[str, dict[str, object]]] = defaultdict(dict)

    for row in evidence_rows:
        key = (int(row["volume_number"]), str(row["start_page_label"]))
        grouped.setdefault(
            key,
            {
                "volume_number": int(row["volume_number"]),
                "start_page_label": str(row["start_page_label"]),
                "macropaedia_contents_name": str(row["macropaedia_contents_name"]),
            },
        )
        candidate_name = str(row["observed_propaedia_name"])
        candidate = evidence_by_candidate[key].setdefault(
            candidate_name,
            {
                "count": 0,
                "match_methods": set(),
                "source_pages": set(),
                "source_images": set(),
            },
        )
        candidate["count"] += 1
        if row["match_method"]:
            candidate["match_methods"].add(str(row["match_method"]))
        if row["propaedia_page_reference"]:
            candidate["source_pages"].add(str(row["propaedia_page_reference"]))
        if row["source_image_relative_path"]:
            candidate["source_images"].add(str(row["source_image_relative_path"]))

    summary_rows: list[dict[str, object]] = []
    for key, article in sorted(grouped.items()):
        candidates = []
        for observed_name, details in evidence_by_candidate[key].items():
            candidates.append(
                {
                    "observed_propaedia_name": observed_name,
                    "count": int(details["count"]),
                    "match_methods": sorted(details["match_methods"]),
                    "source_pages": sorted(details["source_pages"], key=lambda value: (len(value), value)),
                    "source_images": sorted(details["source_images"]),
                }
            )
        candidates.sort(key=lambda item: (-item["count"], item["observed_propaedia_name"].casefold()))
        suggested = candidates[0] if candidates else None
        summary_rows.append(
            {
                "volume_number": article["volume_number"],
                "start_page_label": article["start_page_label"],
                "macropaedia_contents_name": article["macropaedia_contents_name"],
                "candidate_count": len(candidates),
                "suggested_propaedia_name": suggested["observed_propaedia_name"] if suggested else "",
                "suggested_occurrence_count": suggested["count"] if suggested else "",
                "suggested_match_methods": " | ".join(suggested["match_methods"]) if suggested else "",
                "suggested_source_pages": " | ".join(suggested["source_pages"]) if suggested else "",
                "suggested_source_images": " | ".join(suggested["source_images"]) if suggested else "",
                "alternate_propaedia_names": " | ".join(
                    candidate["observed_propaedia_name"] for candidate in candidates[1:]
                ),
            }
        )

    return summary_rows


def build_propaedia_name_summary_lookup(
    summary_rows: list[dict[str, object]],
) -> dict[tuple[int, str], dict[str, object]]:
    return {
        (int(row["volume_number"]), str(row["start_page_label"])): row
        for row in summary_rows
    }


def build_unmatched_propaedia_occurrences(payloads: list[dict[str, object]]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for payload in payloads:
        part_number = int(payload["partNumber"])
        for page in payload["pages"]:
            for recommendation in page["recommendations"]:
                if recommendation["matchStatus"] != "unmatched":
                    continue
                rows.append(
                    {
                        "part_number": part_number,
                        "capture_sequence": page["captureSequence"],
                        "propaedia_page_reference": page["propaediaPageReference"],
                        "header_context": page["headerContext"],
                        "topic_summary": page["topicSummary"],
                        "observed_propaedia_name": recommendation["observedTitle"],
                        "extraction_method": recommendation.get("extractionMethod", "") or "",
                        "image_relative_path": page["imageRelativePath"],
                    }
                )
    return rows


def build_unmatched_propaedia_summary(
    occurrence_rows: list[dict[str, object]],
) -> list[dict[str, object]]:
    grouped: dict[str, dict[str, object]] = {}
    for row in occurrence_rows:
        key = str(row["observed_propaedia_name"])
        summary = grouped.setdefault(
            key,
            {
                "observed_propaedia_name": key,
                "occurrence_count": 0,
                "part_numbers": set(),
                "propaedia_page_references": set(),
                "header_contexts": set(),
                "image_relative_paths": set(),
            },
        )
        summary["occurrence_count"] += 1
        summary["part_numbers"].add(str(row["part_number"]))
        summary["propaedia_page_references"].add(str(row["propaedia_page_reference"]))
        summary["header_contexts"].add(str(row["header_context"]))
        summary["image_relative_paths"].add(str(row["image_relative_path"]))

    return [
        {
            "observed_propaedia_name": key,
            "occurrence_count": value["occurrence_count"],
            "part_numbers": " | ".join(sorted(value["part_numbers"])),
            "propaedia_page_references": " | ".join(
                sorted(value["propaedia_page_references"], key=lambda item: (len(item), item))
            ),
            "header_contexts": " | ".join(sorted(value["header_contexts"])),
            "image_relative_paths": " | ".join(sorted(value["image_relative_paths"])),
            "review_notes": "",
            "resolved_macropaedia_contents_name": "",
        }
        for key, value in sorted(grouped.items(), key=lambda item: item[0].casefold())
    ]

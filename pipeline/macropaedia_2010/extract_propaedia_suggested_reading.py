#!/usr/bin/env python3
"""Extract Propaedia suggested-reading links and match them to 2010 Macropaedia articles."""

from __future__ import annotations

import argparse
import csv
import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from paths import DATA_DIR, PROJECT_DATA_DIR, RAW_OUTPUT_DIR


PARENTHETICAL_RE = re.compile(r"\s*\([^)]*\)")
WHITESPACE_RE = re.compile(r"\s+")
PUNCTUATION_RE = re.compile(r"[^a-z0-9 ]+")
HEADER_CONTEXT_RE = re.compile(r"(Division\s+[IVXLC]+\.\s+Section\s+\d+)")
PAGE_RE = re.compile(r"^\s*(\d+)\b")
TRAILING_PAGE_RE = re.compile(r"\b(\d+)\s*$")
LEADING_ARTICLE_COLON_RE = re.compile(r"^(.*?),\s*(The|A|An)\s*:\s*(.*)$", re.IGNORECASE)


@dataclass(frozen=True)
class Article:
    title: str
    volume_number: int
    start_page: str
    start_page_index: int
    page_count_estimate: int | None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--part-number", type=int, required=True)
    parser.add_argument("--ocr-dir", type=Path)
    parser.add_argument(
        "--capture-index",
        type=Path,
        default=PROJECT_DATA_DIR / "propaedia_page_capture_index.csv",
    )
    parser.add_argument(
        "--reviewed-candidates",
        type=Path,
        default=DATA_DIR / "2010_article_candidates_reviewed.json",
    )
    parser.add_argument("--output-json", type=Path)
    parser.add_argument("--output-csv", type=Path)
    parser.add_argument("--output-summary", type=Path)
    args = parser.parse_args()
    suffix = f"propaedia_part_{args.part_number}"
    if args.ocr_dir is None:
        args.ocr_dir = RAW_OUTPUT_DIR / f"{suffix}_ocr" / "ocr"
    if args.output_json is None:
        args.output_json = DATA_DIR / f"{suffix}_suggested_reading.json"
    if args.output_csv is None:
        args.output_csv = DATA_DIR / f"{suffix}_suggested_reading.csv"
    if args.output_summary is None:
        args.output_summary = DATA_DIR / f"{suffix}_suggested_reading_summary.md"
    return args


def normalize_key(value: str) -> str:
    ascii_value = (
        unicodedata.normalize("NFKD", value)
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
    )
    ascii_value = ascii_value.replace("&", " and ")
    ascii_value = ascii_value.replace("-", " ")
    ascii_value = ascii_value.replace(",", " ")
    ascii_value = PUNCTUATION_RE.sub(" ", ascii_value)
    return WHITESPACE_RE.sub(" ", ascii_value).strip()


def lookup_variants(title: str) -> dict[str, str]:
    variants: dict[str, str] = {}

    def add(source: str, method: str) -> None:
        normalized = normalize_key(source)
        if not normalized:
            return
        variants.setdefault(normalized, method)
        variants.setdefault(normalized.replace(" ", ""), method)

    add(title, "direct")

    without_parenthetical = PARENTHETICAL_RE.sub("", title).strip()
    if without_parenthetical and without_parenthetical != title:
        add(without_parenthetical, "without_parenthetical")

    if "," in title:
        head, tail = [part.strip() for part in title.split(",", 1)]
        if head and tail:
            add(f"{tail} {head}", "comma_flip")
            if " " not in tail:
                add(head, "comma_head_only")

    article_colon_match = LEADING_ARTICLE_COLON_RE.match(title)
    if article_colon_match:
        head = article_colon_match.group(1).strip()
        article = article_colon_match.group(2).strip()
        tail = article_colon_match.group(3).strip()
        add(f"{article} {head}: {tail}", "comma_article_colon")

    return variants


def load_article_index(path: Path) -> dict[str, tuple[Article, str]]:
    reviewed = json.loads(path.read_text())
    index: dict[str, tuple[Article, str]] = {}
    for volume in reviewed["volumes"]:
        for article in volume["articles"]:
            entry = Article(
                title=article["title"],
                volume_number=volume["volumeNumber"],
                start_page=article["startPage"],
                start_page_index=article["startPageIndex"],
                page_count_estimate=article["pageCountEstimate"],
            )
            for variant, method in lookup_variants(entry.title).items():
                index.setdefault(variant, (entry, method))
    return index


def load_capture_index(path: Path, part_number: int) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    selected = [row for row in rows if int(row["part_number"]) == part_number]
    return sorted(selected, key=lambda row: int(row["capture_sequence"]))


def read_ocr_lines(path: Path) -> list[str]:
    return [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def extract_page_reference(lines: list[str]) -> str:
    for line in lines[:5]:
        match = PAGE_RE.match(line)
        if match and ("Part " in line or line.strip() == match.group(1)):
            return match.group(1)
    for line in lines[:5]:
        if "Section" in line or "Part " in line:
            trailing = TRAILING_PAGE_RE.search(line)
            if trailing:
                return trailing.group(1)
    return ""


def extract_header_context(lines: list[str]) -> str:
    for line in lines[:6]:
        match = HEADER_CONTEXT_RE.search(line)
        if match:
            return match.group(1)
    return lines[0] if lines else ""


def extract_macropaedia_block(lines: list[str]) -> list[str]:
    block: list[str] = []
    in_macro = False
    for line in lines:
        if line.startswith("MACROPAEDIA:"):
            in_macro = True
            remainder = line.split("MACROPAEDIA:", 1)[1].strip()
            if remainder:
                block.append(remainder)
            continue
        if in_macro and line.startswith("MICROPAEDIA:"):
            break
        if in_macro:
            block.append(line)
    return block


def match_title(title: str, article_index: dict[str, tuple[Article, str]]) -> tuple[Article | None, str | None]:
    for variant, method in lookup_variants(title).items():
        match = article_index.get(variant)
        if match is not None:
            article, article_method = match
            return article, method if method == "direct" else f"observed_{method}"
    return None, None


def split_descriptor_and_titles(
    block_lines: list[str],
    article_index: dict[str, tuple[Article, str]],
) -> tuple[str, list[tuple[str, str]]]:
    if not block_lines:
        return "", []

    descriptor_lines: list[str] = [block_lines[0]]
    index = 1
    while index < len(block_lines) and block_lines[index][:1].islower():
        descriptor_lines.append(block_lines[index])
        index += 1

    titles: list[tuple[str, str]] = []
    while index < len(block_lines):
        current = block_lines[index]
        if index + 1 < len(block_lines):
            combined = f"{current} {block_lines[index + 1]}"
            combined_match, _ = match_title(combined, article_index)
            current_match, _ = match_title(current, article_index)
            next_match, _ = match_title(block_lines[index + 1], article_index)
            if combined_match is not None and current_match is None and next_match is None:
                titles.append((combined, "combined_adjacent_ocr_lines"))
                index += 2
                continue
        titles.append((current, "single_ocr_line"))
        index += 1

    descriptor = " ".join(descriptor_lines).replace("ofmatter", "of matter").strip()
    return descriptor, titles


def reconcile_fragmented_titles(
    recommendations: list[dict[str, object]],
    article_index: dict[str, tuple[Article, str]],
) -> list[dict[str, object]]:
    unmatched_indices = [
        index
        for index, item in enumerate(recommendations)
        if item["matchStatus"] == "unmatched"
    ]
    used: set[int] = set()
    merged_items: dict[int, dict[str, object]] = {}

    for left in unmatched_indices:
        if left in used:
            continue
        for right in unmatched_indices:
            if right <= left or right in used:
                continue
            left_title = str(recommendations[left]["observedTitle"])
            right_title = str(recommendations[right]["observedTitle"])
            if not (
                left_title.endswith(",")
                or left_title.endswith(":")
                or (len(left_title.split()) == 1 and len(right_title.split()) == 1)
            ):
                continue
            combined_title = f"{left_title} {right_title}"
            match, match_method = match_title(combined_title, article_index)
            if match is None:
                continue
            merged_items[left] = {
                "sortOrder": recommendations[left]["sortOrder"],
                "observedTitle": combined_title,
                "extractionMethod": "combined_fragment_titles",
                "matchStatus": "matched",
                "matchMethod": match_method,
                "matchedTitle": match.title,
                "matchedVolumeNumber": match.volume_number,
                "matchedStartPage": match.start_page,
                "matchedStartPageIndex": match.start_page_index,
                "matchedPageCountEstimate": match.page_count_estimate,
            }
            used.add(left)
            used.add(right)
            break

    normalized: list[dict[str, object]] = []
    for index, item in enumerate(recommendations):
        if index in merged_items:
            normalized.append(merged_items[index])
        elif index not in used:
            normalized.append(item)

    for sort_order, item in enumerate(normalized, start=1):
        item["sortOrder"] = sort_order
    return normalized


def build_page_payload(
    row: dict[str, str],
    ocr_dir: Path,
    article_index: dict[str, tuple[Article, str]],
) -> dict[str, object]:
    image_relative_path = row["image_relative_path"]
    stem = Path(image_relative_path).stem
    ocr_path = ocr_dir / f"{stem}.txt"
    lines = read_ocr_lines(ocr_path)
    block = extract_macropaedia_block(lines)
    topic_summary, titles = split_descriptor_and_titles(block, article_index)

    page_payload: dict[str, object] = {
        "partNumber": int(row["part_number"]),
        "captureSequence": int(row["capture_sequence"]),
        "imageRelativePath": image_relative_path,
        "propaediaPageReference": row.get("propaedia_page_reference") or extract_page_reference(lines),
        "headerContext": extract_header_context(lines),
        "topicSummary": topic_summary,
        "recommendations": [],
    }

    recommendations: list[dict[str, object]] = []
    for sort_order, (observed_title, extraction_method) in enumerate(titles, start=1):
        match, match_method = match_title(observed_title, article_index)
        item: dict[str, object] = {
            "sortOrder": sort_order,
            "observedTitle": observed_title,
            "extractionMethod": extraction_method,
            "matchStatus": "matched" if match is not None else "unmatched",
            "matchMethod": match_method,
        }
        if match is not None:
            item.update(
                {
                    "matchedTitle": match.title,
                    "matchedVolumeNumber": match.volume_number,
                    "matchedStartPage": match.start_page,
                    "matchedStartPageIndex": match.start_page_index,
                    "matchedPageCountEstimate": match.page_count_estimate,
                }
            )
        recommendations.append(item)

    recommendations = reconcile_fragmented_titles(recommendations, article_index)
    page_payload["recommendations"] = recommendations
    return page_payload


def write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "part_number",
                "capture_sequence",
                "propaedia_page_reference",
                "header_context",
                "image_relative_path",
                "topic_summary",
                "sort_order",
                "observed_title",
                "extraction_method",
                "match_status",
                "match_method",
                "matched_title",
                "matched_volume_number",
                "matched_start_page",
                "matched_page_count_estimate",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)


def write_summary(path: Path, pages: list[dict[str, object]], matched_count: int, unmatched_count: int) -> None:
    lines = [
        f"# Part {pages[0]['partNumber']} Propaedia Suggested Reading",
        "",
        f"- Pages captured: `{len(pages)}`",
        f"- Matched recommendations: `{matched_count}`",
        f"- Unmatched recommendations: `{unmatched_count}`",
        "",
    ]

    if unmatched_count:
        lines.extend(["## Unmatched recommendations", ""])
        for page in pages:
            page_ref = page["propaediaPageReference"]
            for rec in page["recommendations"]:
                if rec["matchStatus"] == "unmatched":
                    lines.append(f"- Page `{page_ref}`: `{rec['observedTitle']}`")
        lines.append("")

    lines.extend(["## Page summaries", ""])
    for page in pages:
        lines.append(f"### Page {page['propaediaPageReference']}")
        lines.append("")
        lines.append(f"- Header context: `{page['headerContext']}`")
        if page["topicSummary"]:
            lines.append(f"- Topic summary: {page['topicSummary']}")
        lines.append("- Recommendations:")
        for rec in page["recommendations"]:
            if rec["matchStatus"] == "matched":
                lines.append(
                    f"  - `{rec['observedTitle']}` -> `{rec['matchedTitle']}` "
                    f"(v{rec['matchedVolumeNumber']} p{rec['matchedStartPage']})"
                )
            else:
                lines.append(f"  - `{rec['observedTitle']}` -> unmatched")
        lines.append("")

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    args = parse_args()
    article_index = load_article_index(args.reviewed_candidates)
    capture_rows = load_capture_index(args.capture_index, args.part_number)
    pages = [build_page_payload(row, args.ocr_dir, article_index) for row in capture_rows]

    matched_count = sum(
        1
        for page in pages
        for rec in page["recommendations"]
        if rec["matchStatus"] == "matched"
    )
    unmatched_count = sum(
        1
        for page in pages
        for rec in page["recommendations"]
        if rec["matchStatus"] == "unmatched"
    )

    payload = {
        "partNumber": args.part_number,
        "pageCount": len(pages),
        "matchedRecommendationCount": matched_count,
        "unmatchedRecommendationCount": unmatched_count,
        "pages": pages,
    }
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")

    csv_rows: list[dict[str, object]] = []
    for page in pages:
        for rec in page["recommendations"]:
            csv_rows.append(
                {
                    "part_number": page["partNumber"],
                    "capture_sequence": page["captureSequence"],
                    "propaedia_page_reference": page["propaediaPageReference"],
                    "header_context": page["headerContext"],
                    "image_relative_path": page["imageRelativePath"],
                    "topic_summary": page["topicSummary"],
                    "sort_order": rec["sortOrder"],
                    "observed_title": rec["observedTitle"],
                    "extraction_method": rec["extractionMethod"],
                    "match_status": rec["matchStatus"],
                    "match_method": rec["matchMethod"] or "",
                    "matched_title": rec.get("matchedTitle", ""),
                    "matched_volume_number": rec.get("matchedVolumeNumber", ""),
                    "matched_start_page": rec.get("matchedStartPage", ""),
                    "matched_page_count_estimate": rec.get("matchedPageCountEstimate", ""),
                }
            )
    write_csv(args.output_csv, csv_rows)
    write_summary(args.output_summary, pages, matched_count, unmatched_count)

    print(f"Wrote JSON to {args.output_json}")
    print(f"Wrote CSV to {args.output_csv}")
    print(f"Wrote summary to {args.output_summary}")
    print(f"Matched recommendations: {matched_count}")
    print(f"Unmatched recommendations: {unmatched_count}")


if __name__ == "__main__":
    main()

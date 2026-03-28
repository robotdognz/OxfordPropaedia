#!/usr/bin/env python3
"""Apply manual review corrections to the separate 2010 Macropaedia dataset."""

from __future__ import annotations

import json
from copy import deepcopy

from compare_with_2005 import build_comparison_payload
from paths import DATA_DIR, RAW_OUTPUT_DIR, REPO_ROOT


BASELINE_PATH = RAW_OUTPUT_DIR / "2005_baseline_titles.json"
CANDIDATES_PATH = RAW_OUTPUT_DIR / "2010_article_candidates.json"
MANUAL_REVIEW_PATH = DATA_DIR / "manual_review_fill_in.txt"
REVIEWED_CANDIDATES_PATH = DATA_DIR / "2010_article_candidates_reviewed.json"
REVIEWED_COMPARISON_PATH = DATA_DIR / "2010_vs_2005_comparison_reviewed.json"


def parse_fill_in(path: Path) -> dict[str, dict[str, str]]:
    sections: dict[str, dict[str, str]] = {}
    current_section = "__root__"
    sections[current_section] = {}

    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("[") and line.endswith("]"):
            current_section = line[1:-1].strip()
            sections.setdefault(current_section, {})
            continue
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        sections[current_section][key.strip()] = value.strip()

    return sections


def normalize_lookup_text(value: str) -> str:
    return " ".join(value.split()).strip().lower()


def page_label_to_index(label: str) -> int:
    digits = "".join(character for character in label if character.isdigit())
    return int(digits) if digits else 0


def volume_by_number(candidates: dict, volume_number: int) -> dict:
    return next(volume for volume in candidates["volumes"] if volume["volumeNumber"] == volume_number)


def upsert_article(volume: dict, start_page: str, title: str) -> None:
    normalized_page = start_page.strip().upper()
    normalized_title = " ".join(title.split()).strip()
    existing = next((item for item in volume["articles"] if item["startPage"] == normalized_page), None)
    if existing is None:
        volume["articles"].append(
            {
                "title": normalized_title,
                "lookupKey": normalize_lookup_text(normalized_title),
                "startPage": normalized_page,
                "startPageIndex": page_label_to_index(normalized_page),
                "pageCountEstimate": None,
            }
        )
        return

    existing["title"] = normalized_title
    existing["lookupKey"] = normalize_lookup_text(normalized_title)
    existing["startPageIndex"] = page_label_to_index(normalized_page)


def rename_article(volume: dict, old_title: str, new_title: str) -> None:
    for article in volume["articles"]:
        if article["title"] == old_title:
            article["title"] = new_title
            article["lookupKey"] = normalize_lookup_text(new_title)
            return


def remove_leftovers(volume: dict, values: list[str]) -> None:
    remaining = list(volume["leftovers"])
    for value in values:
        if value in remaining:
            remaining.remove(value)
    volume["leftovers"] = remaining


def remove_articles_by_page(volume: dict, page_labels: list[str]) -> None:
    remove_set = {label.strip().upper() for label in page_labels if label.strip()}
    if not remove_set:
        return
    volume["articles"] = [article for article in volume["articles"] if article["startPage"].upper() not in remove_set]


def recompute_volume(volume: dict) -> None:
    ordered = sorted(
        volume["articles"],
        key=lambda entry: (
            entry["startPageIndex"],
            entry["startPage"],
            entry["title"].lower(),
        ),
    )

    for index, article in enumerate(ordered):
        next_article = ordered[index + 1] if index + 1 < len(ordered) else None
        page_count = None
        if next_article is not None and next_article["startPageIndex"] > article["startPageIndex"]:
            page_count = next_article["startPageIndex"] - article["startPageIndex"]

        article["pageCountEstimate"] = page_count
        article["lookupKey"] = normalize_lookup_text(article["title"])
        article["startPageIndex"] = page_label_to_index(article["startPage"])

    volume["articles"] = ordered
    volume["articleCount"] = len(ordered)
    volume["leftoverCount"] = len(volume["leftovers"])


def apply_volume_1_review(volume: dict, review: dict[str, str]) -> None:
    page_pairs = [
        (review.get("accounting_page", ""), "ACCOUNTING"),
        (review.get("ansel_adams_page", ""), "Ansel ADAMS"),
        (review.get("john_adams_page", ""), "John ADAMS"),
        (review.get("aesthetics_page", ""), "AESTHETICS"),
        ("349", review.get("page_349_title", "")),
        ("441", review.get("page_441_title", "")),
    ]

    for page, title in page_pairs:
        if page and title:
            upsert_article(volume, page, title)

    confirmed_page = review.get("african_american_literature_page", "")
    if confirmed_page:
        upsert_article(volume, confirmed_page, "AFRICAN AMERICAN LITERATURE")

    remove_leftovers(
        volume,
        [
            "ACCOUNTING",
            "Ansel ADAMS",
            "John ADAMS",
            "AESTHETICS",
            "349",
            "441",
        ],
    )


def apply_generic_page_title_review(volume: dict, review: dict[str, str]) -> None:
    for key, title in review.items():
        if not key.startswith("page_") or not key.endswith("_title") or not title:
            continue
        page = key.removeprefix("page_").removesuffix("_title").upper()
        upsert_article(volume, page, title)
        remove_leftovers(volume, [title, page, f"{page}{title}".replace(" ", "")])


def apply_explicit_leftover_removals(volume: dict, review: dict[str, str]) -> None:
    values_to_remove: list[str] = []
    for key, value in review.items():
        if not key.startswith("remove_"):
            continue
        if value.strip().lower() not in {"yes", "true", "1"}:
            continue
        values_to_remove.append(key.removeprefix("remove_"))
    if values_to_remove:
        remove_leftovers(volume, values_to_remove)


def apply_explicit_article_removals(volume: dict, review: dict[str, str]) -> None:
    pages_to_remove: list[str] = []
    for key, value in review.items():
        if not key.startswith("remove_page_"):
            continue
        if value.strip().lower() not in {"yes", "true", "1"}:
            continue
        pages_to_remove.append(key.removeprefix("remove_page_"))
    if pages_to_remove:
        remove_articles_by_page(volume, pages_to_remove)


def apply_volume_13_review(volume: dict, review: dict[str, str]) -> None:
    page_pairs = [
        ("550", review.get("page_550_title", "")),
        ("562", review.get("page_562_title", "")),
        ("652", review.get("page_652_title", "")),
        ("733", review.get("page_733_title", "")),
        ("807", review.get("page_807_title", "")),
        ("828", review.get("page_828_title", "")),
        ("893", review.get("page_893_title", "")),
        ("908", review.get("page_908_title", "")),
    ]

    for page, title in page_pairs:
        if title:
            corrected_title = title
            if page == "908" and corrected_title == "POISONS AND POSISONING":
                corrected_title = "POISONS AND POISONING"
            upsert_article(volume, page, corrected_title)

    remove_leftovers(
        volume,
        [
            "PHILOSOPHICAL ANTHROPOLOGY",
            "550",
            "Western PHILOSOPHICAL SCHOOLS AND DOCTRINES",
            "733",
            "Principles of PHYSICAL SCIENCE",
            "807",
            "Plato and PLATONISM",
            "893",
        ],
    )


def apply_volume_11_review(volume: dict, review: dict[str, str]) -> None:
    apply_generic_page_title_review(volume, review)
    remove_leftovers(volume, ["LIGHT"])


def apply_optional_spelling_fixes(candidates: dict, review_sections: dict[str, dict[str, str]]) -> None:
    optional = review_sections.get("optional_spelling_checks", {})
    notes = review_sections.get("notes", {})

    rename_map = [
        (
            2,
            "BIBLICAL LITERATUrE and Its Critical Interpretation",
            optional.get("biblical_literature_title", ""),
        ),
        (
            2,
            "The BIosPHErE and Concepts of Ecology",
            optional.get("biosphere_title", ""),
        ),
        (3, "BUSINESSLAW", optional.get("business_law_title", "")),
        (13, "Jackson PoLLOCK", optional.get("jackson_pollock_title", "")),
        (11, "Los ANGELES", optional.get("los_angeles_title", "")),
        (
            10,
            "KARÁCHI",
            "KARĀCHI" if "macron" in notes.get("extra_notes", "").lower() else optional.get("karachi_title", ""),
        ),
        (
            15,
            "Modern SocIo-ECONOMIC DOCTRINES AND REFORM MOVEMENTS",
            optional.get("modern_socio_economic_doctrines_and_reform_movements_title", ""),
        ),
    ]

    for volume_number, old_title, new_title in rename_map:
        if not new_title:
            continue
        rename_article(volume_by_number(candidates, volume_number), old_title, new_title)


def build_reviewed_candidates(raw_candidates: dict, review_sections: dict[str, dict[str, str]]) -> dict:
    reviewed = deepcopy(raw_candidates)

    volume_1 = volume_by_number(reviewed, 1)
    volume_2 = volume_by_number(reviewed, 2)
    volume_3 = volume_by_number(reviewed, 3)
    volume_5 = volume_by_number(reviewed, 5)
    volume_6 = volume_by_number(reviewed, 6)
    volume_7 = volume_by_number(reviewed, 7)
    volume_9 = volume_by_number(reviewed, 9)
    volume_11 = volume_by_number(reviewed, 11)
    volume_13 = volume_by_number(reviewed, 13)

    apply_volume_1_review(volume_1, review_sections.get("volume_1", {}))
    apply_generic_page_title_review(volume_2, review_sections.get("volume_2", {}))
    apply_generic_page_title_review(volume_3, review_sections.get("volume_3", {}))
    apply_generic_page_title_review(volume_5, review_sections.get("volume_5", {}))
    apply_generic_page_title_review(volume_6, review_sections.get("volume_6", {}))
    apply_generic_page_title_review(volume_7, review_sections.get("volume_7", {}))
    apply_generic_page_title_review(volume_9, review_sections.get("volume_9", {}))
    apply_volume_11_review(volume_11, review_sections.get("volume_11", {}))
    apply_volume_13_review(volume_13, review_sections.get("volume_13_confirmed_pairs", {}))
    apply_optional_spelling_fixes(reviewed, review_sections)

    for volume in reviewed["volumes"]:
        apply_explicit_article_removals(
            volume,
            review_sections.get(f"volume_{volume['volumeNumber']}_remove_articles", {}),
        )
        apply_explicit_leftover_removals(
            volume,
            review_sections.get(f"volume_{volume['volumeNumber']}_remove_leftovers", {}),
        )
        recompute_volume(volume)

    reviewed["articleCount"] = sum(volume["articleCount"] for volume in reviewed["volumes"])
    reviewed["manualReviewPath"] = str(MANUAL_REVIEW_PATH.relative_to(REPO_ROOT))
    reviewed["source"] = reviewed.get("source", "") + " + manual review"
    return reviewed


def main() -> None:
    baseline = json.loads(BASELINE_PATH.read_text())
    raw_candidates = json.loads(CANDIDATES_PATH.read_text())
    review_sections = parse_fill_in(MANUAL_REVIEW_PATH)

    reviewed_candidates = build_reviewed_candidates(raw_candidates, review_sections)
    reviewed_comparison = build_comparison_payload(baseline, reviewed_candidates)

    REVIEWED_CANDIDATES_PATH.write_text(json.dumps(reviewed_candidates, indent=2, ensure_ascii=True) + "\n")
    REVIEWED_COMPARISON_PATH.write_text(json.dumps(reviewed_comparison, indent=2, ensure_ascii=True) + "\n")

    print(f"Wrote reviewed candidates to {REVIEWED_CANDIDATES_PATH}")
    print(f"Wrote reviewed comparison to {REVIEWED_COMPARISON_PATH}")


if __name__ == "__main__":
    main()

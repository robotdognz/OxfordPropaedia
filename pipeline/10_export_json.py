#!/usr/bin/env python3
"""
Step 10 — Final export to Astro content collection format.

Derives the Part/Division structure from section codes rather than
relying on boundary detection (which has many false positives from
TOC entries, page headers, and inline references).

Section code encoding:
  Parts 1-9: {part}{div}{sec}  e.g. 523 = Part 5, Div 2, Sec 3
  Parts 1-9 (sec>9): {part}{div}/{sec}  e.g. 96/10 = Part 9, Div 6, Sec 10
  Part 10: 10/{div}{sec}  e.g. 10/31 = Part 10, Div 3, Sec 1

Usage:
    python3 pipeline/10_export_json.py
"""

import json
import logging
import os
import re
import shutil
import sys
from copy import deepcopy

sys.path.insert(0, os.path.dirname(__file__))
import config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

PART_COLORS = {i: f"part-{i}" for i in range(1, 11)}

PART_SUBTITLES = {
    1: "The physical universe: atoms, energy, the cosmos",
    2: "The planet, its atmosphere, weather, and geology",
    3: "Biological sciences, botany, zoology, ecology",
    4: "Human biology, medicine, psychology, behaviour",
    5: "Social sciences, economics, law, politics",
    6: "Literature, visual arts, music, performing arts",
    7: "Engineering, agriculture, industry, transportation",
    8: "World religions, philosophy of religion, theology",
    9: "Prehistoric, ancient, medieval, and modern history",
    10: "Logic, mathematics, science, humanities, philosophy",
}

INT_TO_ROMAN = {
    1: "I", 2: "II", 3: "III", 4: "IV", 5: "V",
    6: "VI", 7: "VII", 8: "VIII", 9: "IX", 10: "X",
}

PART_WORD_BY_NUMBER = {value: key for key, value in config.PART_NUMBER_WORDS.items()}

TEXT_REPLACEMENTS = [
    ("\ufb01", "fi"),
    ("\ufb02", "fl"),
    ("\ufb00", "ff"),
    ("\ufb03", "ffi"),
    ("\ufb04", "ffl"),
    ("\u2019", "'"),
    ("\u2018", "'"),
    ("\u201c", '"'),
    ("\u201d", '"'),
    ("\u2013", "-"),
    ("\u2014", "--"),
    ("\u2026", "..."),
    ("\u00a0", " "),
    ("\u00ac", ""),
]

# Authoritative division titles for the 2005 Propaedia (41 divisions)
DIVISION_TITLES: dict[tuple[int, int], str] = {
    # Part 1: Matter and Energy
    (1, 1): "Atoms: Atomic Nuclei and Elementary Particles",
    (1, 2): "Energy, Radiation, and the States and Transformation of Matter",
    (1, 3): "The Universe: Galaxies, Stars, the Solar System",
    # Part 2: The Earth
    (2, 1): "The Earth's Properties, Structure, and Composition",
    (2, 2): "The Earth's Envelope: Its Atmosphere and Hydrosphere",
    (2, 3): "The Earth's Surface Features",
    (2, 4): "The Earth's History",
    # Part 3: Life on Earth
    (3, 1): "The Nature and Diversity of Living Things",
    (3, 2): "The Molecular Basis of Vital Processes",
    (3, 3): "The Structures and Functions of Organisms",
    (3, 4): "Behavioral Responses of Organisms",
    (3, 5): "The Biosphere: the World of Living Things",
    # Part 4: Human Life
    (4, 1): "Stages in the Development of Human Life on Earth",
    (4, 2): "The Human Organism: Health and Disease",
    (4, 3): "Human Behaviour and Experience",
    # Part 5: Human Society
    (5, 1): "Social Groups: Peoples and Cultures",
    (5, 2): "Social Organization and Social Change",
    (5, 3): "The Production, Distribution, and Utilization of Wealth",
    (5, 4): "Politics and Government",
    (5, 5): "Law",
    (5, 6): "Education",
    # Part 6: Art
    (6, 1): "Art in General",
    (6, 2): "The Particular Arts",
    # Part 7: Technology
    (7, 1): "The Nature and Development of Technology",
    (7, 2): "Elements of Technology",
    (7, 3): "Major Fields of Technology",
    # Part 8: Religion
    (8, 1): "Religion in General",
    (8, 2): "The Particular Religions",
    # Part 9: The History of Mankind
    (9, 1): "Peoples and Civilizations of Ancient Southwest Asia, North Africa, and Europe",
    (9, 2): "Peoples and Civilizations of Medieval Europe, North Africa, and Southwest Asia",
    (9, 3): "Peoples and Traditional Civilizations of East, Central, South, and Southeast Asia",
    (9, 4): "Peoples and Civilizations of Sub-Saharan Africa to 1885",
    (9, 5): "Peoples and Civilizations of Pre-Columbian America",
    (9, 6): "The Modern World to 1920",
    (9, 7): "The World Since 1920",
    # Part 10: The Branches of Knowledge
    (10, 1): "Logic",
    (10, 2): "Mathematics",
    (10, 3): "Science",
    (10, 4): "History and the Humanities",
    (10, 5): "Philosophy",
    (10, 6): "Preservation of Knowledge",
}

SECTION_PAGE_CACHE: dict[str, int] = {}


def _dump_json(path: str, data: dict | list) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def _normalize_for_match(text: str) -> str:
    normalized = text
    for old, new in TEXT_REPLACEMENTS:
        normalized = normalized.replace(old, new)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip().lower()


def _clean_extracted_text(text: str) -> str:
    cleaned = text
    for old, new in TEXT_REPLACEMENTS:
        cleaned = cleaned.replace(old, new)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


def _load_page_lines(page_number: int) -> list[str]:
    path = os.path.join(config.RAW_DIR, f"page_{page_number:03d}.txt")
    if not os.path.isfile(path):
        return []
    with open(path, "r", encoding="utf-8") as fh:
        return [line.rstrip("\n") for line in fh]


def _section_code_regex(code: str) -> re.Pattern[str]:
    if "/" in code:
        pattern_parts = []
        for char in code:
            if char.isdigit():
                pattern_parts.append(re.escape(char))
            elif char == "/":
                pattern_parts.append(r"\s*/\s*")
        pattern = "".join(pattern_parts)
    else:
        pattern = r"\s*".join(re.escape(char) for char in code)
    return re.compile(rf"Section\s+{pattern}\s*\.", re.IGNORECASE)


def _find_section_start_page(code: str) -> int | None:
    cached = SECTION_PAGE_CACHE.get(code)
    if cached:
        return cached

    regex = _section_code_regex(code)
    for page_number in range(27, config.TOTAL_PAGES + 1):
        page_lines = _load_page_lines(page_number)
        if any(regex.search(line) for line in page_lines):
            SECTION_PAGE_CACHE[code] = page_number
            return page_number

    return None


def _is_page_header_or_noise(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False
    return bool(
        re.match(r"^\d+\s+Part\s+\w+\.", stripped)
        or re.match(r"^Part\s+\w+\.\s+.+\s+\d+\s*$", stripped)
        or re.match(r"^Division\s+[IVX]+\.\s+Section\s+\d", stripped)
    )


def _starts_new_paragraph(previous_line: str, current_line: str) -> bool:
    return bool(
        re.search(r"[.!?][\"\']?\]?\s*$", previous_line.strip())
        and re.match(r"^[A-Z\"\[]", current_line.strip())
    )


def _append_prose_line(current: str, line: str) -> str:
    stripped = line.strip()
    if not current:
        return stripped
    if current.endswith("-") or current.endswith("¬"):
        return current[:-1] + stripped
    return f"{current} {stripped}"


def _lines_to_paragraphs(lines: list[str]) -> list[str]:
    paragraphs: list[str] = []
    current = ""
    previous_line = ""

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            if current:
                paragraphs.append(_clean_extracted_text(current))
                current = ""
            previous_line = ""
            continue
        if _is_page_header_or_noise(line):
            continue
        if re.match(r"^\[For Part .+ headnote see page \d+\.\]$", line):
            continue
        if current and _starts_new_paragraph(previous_line, line):
            paragraphs.append(_clean_extracted_text(current))
            current = line
        else:
            current = _append_prose_line(current, line)
        previous_line = line

    if current:
        paragraphs.append(_clean_extracted_text(current))

    return [paragraph for paragraph in paragraphs if paragraph]


def _extract_part_headnotes(hierarchy: dict[int, dict[int, list[str]]], sections: dict[str, dict]) -> dict[int, list[str]]:
    headnotes: dict[int, list[str]] = {}

    for part_num in sorted(hierarchy.keys()):
        first_div_num = min(hierarchy[part_num].keys())
        first_section_code = hierarchy[part_num][first_div_num][0]
        page_number = _find_section_start_page(first_section_code)
        if not page_number:
            logger.warning("No page found for Part %d first section %s", part_num, first_section_code)
            continue

        lines = _load_page_lines(page_number)
        if not lines:
            logger.warning("No raw page found for Part %d on page %s", part_num, page_number)
            continue

        part_word = PART_WORD_BY_NUMBER.get(part_num, str(part_num))
        normalized_title = _normalize_for_match(config.PART_NAMES.get(part_num, f"Part {part_num}"))
        header_candidates: list[tuple[int, int]] = []

        for index, line in enumerate(lines):
            normalized_line = _normalize_for_match(line)
            if normalized_line.startswith(_normalize_for_match(f"Part {part_word}.")) and normalized_title in normalized_line:
                header_candidates.append((index, index))
                continue
            if normalized_line == _normalize_for_match(f"Part {part_word}."):
                next_index = index + 1
                while next_index < len(lines) and not lines[next_index].strip():
                    next_index += 1
                if next_index < len(lines) and normalized_title in _normalize_for_match(lines[next_index]):
                    header_candidates.append((index, next_index))

        if not header_candidates:
            logger.warning("Could not locate Part %d headnote header on page %s", part_num, page_number)
            continue

        _, header_end_index = header_candidates[-1]
        collected: list[str] = []
        found_end = False

        for follow_page in range(page_number, page_number + 3):
            page_lines = _load_page_lines(follow_page)
            if not page_lines:
                break
            start_index = header_end_index + 1 if follow_page == page_number else 0
            for line in page_lines[start_index:]:
                if _normalize_for_match(line).startswith("division i."):
                    found_end = True
                    break
                collected.append(line)
            if found_end:
                break

        headnotes[part_num] = _lines_to_paragraphs(collected)

    return headnotes


def _extract_division_headnotes(
    hierarchy: dict[int, dict[int, list[str]]], sections: dict[str, dict]
) -> dict[tuple[int, int], list[str]]:
    headnotes: dict[tuple[int, int], list[str]] = {}

    for part_num in sorted(hierarchy.keys()):
        for div_num in sorted(hierarchy[part_num].keys()):
            first_section_code = hierarchy[part_num][div_num][0]
            page_number = _find_section_start_page(first_section_code)
            if not page_number:
                logger.warning(
                    "No page found for Division %d-%02d first section %s",
                    part_num,
                    div_num,
                    first_section_code,
                )
                continue

            title = DIVISION_TITLES.get((part_num, div_num))
            roman = INT_TO_ROMAN.get(div_num, str(div_num))
            if not title:
                continue

            header_candidates: list[tuple[int, int, int]] = []
            normalized_title = _normalize_for_match(title)
            normalized_division_prefix = _normalize_for_match(f"Division {roman}.")

            for candidate_page in range(max(1, page_number - 2), page_number + 1):
                page_lines = _load_page_lines(candidate_page)
                if not page_lines:
                    continue
                for index, line in enumerate(page_lines):
                    normalized_line = _normalize_for_match(line)
                    if normalized_line.startswith(normalized_division_prefix) and normalized_title in normalized_line:
                        header_candidates.append((candidate_page, index, index))
                        continue
                    if normalized_line == normalized_title:
                        next_index = index + 1
                        while next_index < len(page_lines) and not page_lines[next_index].strip():
                            next_index += 1
                        if next_index < len(page_lines):
                            next_normalized = _normalize_for_match(page_lines[next_index])
                            if next_normalized.startswith(normalized_division_prefix):
                                header_candidates.append((candidate_page, index, next_index))

            if not header_candidates:
                logger.warning("Could not locate Division %d-%02d headnote header", part_num, div_num)
                continue

            start_page, _, header_end_index = header_candidates[-1]
            collected: list[str] = []
            found_end = False

            for follow_page in range(start_page, page_number + 2):
                page_lines = _load_page_lines(follow_page)
                if not page_lines:
                    break
                start_index = header_end_index + 1 if follow_page == start_page else 0
                for line in page_lines[start_index:]:
                    if _normalize_for_match(line).startswith(_normalize_for_match(f"Section {first_section_code}.")):
                        found_end = True
                        break
                    collected.append(line)
                if found_end:
                    break

            headnotes[(part_num, div_num)] = _lines_to_paragraphs(collected)

    return headnotes


def parse_section_code(code: str) -> tuple[int, int, int] | None:
    """Parse a section code into (part_number, division_number, section_number).

    Returns None for invalid/anomalous codes.
    """
    # Part 10: 10/XY where X=div, Y=sec
    if code.startswith("10/"):
        rest = code[3:]
        if len(rest) == 2 and rest.isdigit():
            return (10, int(rest[0]), int(rest[1]))
        return None

    # Parts 1-9 with slash: XY/Z where X=part, Y=div, Z=sec (sec > 9)
    if "/" in code:
        parts = code.split("/")
        if len(parts) == 2 and len(parts[0]) == 2 and parts[0].isdigit() and parts[1].isdigit():
            return (int(parts[0][0]), int(parts[0][1]), int(parts[1]))
        return None

    # Parts 1-9 standard: XYZ where X=part, Y=div, Z=sec
    if len(code) == 3 and code.isdigit():
        return (int(code[0]), int(code[1]), int(code[2]))

    return None


def _load_boundaries() -> dict:
    with open(config.BOUNDARIES_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _roman_to_int(roman: str) -> int:
    values = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}
    total = 0
    prev = 0
    for ch in reversed(roman.upper()):
        val = values.get(ch, 0)
        if val < prev:
            total -= val
        else:
            total += val
        prev = val
    return total


def _clean_division_title(title: str) -> str:
    """Remove trailing page numbers and clean up division titles."""
    # Strip trailing digits + whitespace (page numbers like "21" or "5 1")
    title = re.sub(r"\s+\d+\s*$", "", title.strip())
    # Also handle "Title 2 1" pattern (spaced page numbers)
    title = re.sub(r"\s+\d\s+\d\s*$", "", title.strip())
    return title.strip()


def _get_division_titles(boundaries: dict) -> dict[tuple[int, int], str]:
    """Extract unique division titles from boundaries, keyed by (part_num, div_num).

    Strategy: for each (part, roman) pair, prefer entries whose title does NOT
    end with digits (those without trailing page numbers are the actual headers,
    not TOC listings). Among those, use the last occurrence.
    """
    divs = sorted(boundaries.get("divisions", []), key=lambda d: d["position"])
    parts = sorted(boundaries.get("parts", []), key=lambda p: p["position"])

    def get_part_at(pos):
        part_num = None
        for p in parts:
            if p["position"] <= pos:
                part_num = p["partNumber"]
            else:
                break
        return part_num

    # Collect all candidates for each (part, div) pair
    candidates: dict[tuple[int, int], list[str]] = {}
    for div in divs:
        roman = div.get("roman", "").upper()
        div_num = _roman_to_int(roman)
        if div_num == 0:
            continue
        part_num = get_part_at(div["position"])
        if part_num is None:
            continue
        raw_title = div.get("title", "").strip()
        # Skip entries that are clearly false positives
        if re.match(r"^Section\s+\d", raw_title):
            continue
        if re.match(r"^\d+$", raw_title):
            continue
        if len(raw_title) < 3:
            continue
        key = (part_num, div_num)
        if key not in candidates:
            candidates[key] = []
        candidates[key].append(raw_title)

    # For each key, prefer the title that does NOT end with digits (actual header)
    # Fall back to cleaned version of any title
    result: dict[tuple[int, int], str] = {}
    for key, titles in candidates.items():
        # Try to find one without trailing page numbers
        clean = None
        for t in titles:
            if not re.search(r"\d\s*$", t):
                clean = t
                break
        if clean is None:
            # All have trailing numbers — clean the first one
            clean = _clean_division_title(titles[0])
        result[key] = clean.strip()

    return result


def _extract_toc_titles() -> dict[str, str]:
    """Extract section titles from TOC pages (19-26) of the raw text.

    These are the most reliable source of section titles.
    """
    toc_titles: dict[str, str] = {}
    for p in range(19, 27):
        page_path = os.path.join(config.RAW_DIR, f"page_{p:03d}.txt")
        if not os.path.isfile(page_path):
            continue
        with open(page_path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                m = re.match(
                    r"(\d{2,3}(?:/\d{1,2})?)\.\s+[\u2018\u2019']*\s*(.+)", line
                )
                if m:
                    code = m.group(1)
                    title = m.group(2).strip()
                    # Remove trailing page numbers
                    title = re.sub(r"\s+\d+\s*$", "", title)
                    title = re.sub(r"\s+\d\s+\d\s*$", "", title)
                    if len(title) > 3 and not title[0].islower():
                        toc_titles[code] = title
    return toc_titles


def _collect_sections() -> dict[str, dict]:
    """Load all section JSON files from pipeline output."""
    toc_titles = _extract_toc_titles()
    logger.info("Extracted %d section titles from TOC pages", len(toc_titles))

    sections = {}
    title_fixes = 0
    for fname in os.listdir(config.SECTIONS_DIR):
        if not fname.endswith(".json"):
            continue
        code = config.filename_to_section_code(fname)
        parsed = parse_section_code(code)
        if parsed is None:
            logger.warning("Skipping anomalous section code: %s", code)
            continue
        path = os.path.join(config.SECTIONS_DIR, fname)
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)

        # Fix title if it looks like an outline item (starts with "A." etc.)
        current_title = data.get("title", "")
        if (
            re.match(r"^[A-Z]\.\s", current_title)
            or len(current_title) < 5
        ):
            if code in toc_titles:
                data["title"] = toc_titles[code]
                title_fixes += 1
        # Also use TOC title if it's clearly better (longer and not an outline item)
        elif code in toc_titles:
            toc_title = toc_titles[code]
            if len(toc_title) > len(current_title) and not re.match(r"^[A-Z]\.\s", toc_title):
                data["title"] = toc_title
                title_fixes += 1

        sections[code] = data

    logger.info("Fixed %d section titles from TOC data", title_fixes)
    return sections


def _load_existing_final_sections() -> dict[str, dict]:
    sections_dir = os.path.join(config.FINAL_CONTENT_DIR, "sections")
    if not os.path.isdir(sections_dir):
        return {}

    existing_sections: dict[str, dict] = {}
    for fname in os.listdir(sections_dir):
        if not fname.endswith(".json"):
            continue
        code = config.filename_to_section_code(fname)
        path = os.path.join(sections_dir, fname)
        try:
            with open(path, "r", encoding="utf-8") as fh:
                existing_sections[code] = json.load(fh)
        except json.JSONDecodeError:
            logger.warning("Skipping unreadable final section file: %s", path)

    logger.info("Loaded %d existing final section files", len(existing_sections))
    return existing_sections


def _merge_sections(
    pipeline_sections: dict[str, dict], existing_final_sections: dict[str, dict]
) -> dict[str, dict]:
    if not existing_final_sections:
        return pipeline_sections

    merged_sections: dict[str, dict] = {}
    preserved = 0

    # Keep checked-in section content when present; those files are currently
    # more reliable than the raw pipeline output.
    for code, data in pipeline_sections.items():
        if code in existing_final_sections:
            merged_sections[code] = deepcopy(existing_final_sections[code])
            preserved += 1
        else:
            merged_sections[code] = deepcopy(data)

    for code, data in existing_final_sections.items():
        if code not in merged_sections:
            logger.warning("Keeping existing final section %s without pipeline source", code)
            merged_sections[code] = deepcopy(data)

    logger.info("Preserved %d existing section files during export", preserved)
    return merged_sections


def _build_structure(sections: dict[str, dict]) -> dict:
    """Build the full Part → Division → Section hierarchy from section codes."""
    # Collect all (part, div, sec) tuples
    hierarchy: dict[int, dict[int, list[str]]] = {}
    for code in sections:
        parsed = parse_section_code(code)
        if parsed is None:
            continue
        part_num, div_num, sec_num = parsed
        if part_num not in hierarchy:
            hierarchy[part_num] = {}
        if div_num not in hierarchy[part_num]:
            hierarchy[part_num][div_num] = []
        hierarchy[part_num][div_num].append(code)

    # Sort sections within each division
    for part_num in hierarchy:
        for div_num in hierarchy[part_num]:
            hierarchy[part_num][div_num].sort(
                key=lambda c: parse_section_code(c)[2] if parse_section_code(c) else 0
            )

    return hierarchy


def export_all() -> None:
    """Run all export steps."""
    boundaries = _load_boundaries()
    existing_final_sections = _load_existing_final_sections()
    pipeline_sections = _collect_sections()
    sections = _merge_sections(pipeline_sections, existing_final_sections)
    hierarchy = _build_structure(sections)
    part_headnotes = _extract_part_headnotes(hierarchy, sections)
    division_headnotes = _extract_division_headnotes(hierarchy, sections)

    logger.info(
        "Structure: %d parts, %d divisions, %d sections",
        len(hierarchy),
        sum(len(divs) for divs in hierarchy.values()),
        len(sections),
    )

    # --- Clean old exports ---
    for subdir in ["parts", "divisions", "sections"]:
        d = os.path.join(config.FINAL_CONTENT_DIR, subdir)
        if os.path.isdir(d):
            for f in os.listdir(d):
                os.remove(os.path.join(d, f))

    # --- Export Parts ---
    parts_dir = config.ensure_dir(os.path.join(config.FINAL_CONTENT_DIR, "parts"))
    for part_num in sorted(hierarchy.keys()):
        divs = hierarchy[part_num]
        div_ids = [f"{part_num}-{d:02d}" for d in sorted(divs.keys())]
        data = {
            "partNumber": part_num,
            "title": config.PART_NAMES.get(part_num, f"Part {part_num}"),
            "subtitle": PART_SUBTITLES.get(part_num, ""),
            "color": PART_COLORS[part_num],
            "headnote": part_headnotes.get(part_num, []),
            "divisions": div_ids,
        }
        path = os.path.join(parts_dir, f"part-{part_num:02d}.json")
        _dump_json(path, data)
    logger.info("Exported %d part files", len(hierarchy))

    # --- Export Divisions ---
    divs_dir = config.ensure_dir(os.path.join(config.FINAL_CONTENT_DIR, "divisions"))
    total_divs = 0
    for part_num in sorted(hierarchy.keys()):
        for div_num in sorted(hierarchy[part_num].keys()):
            div_id = f"{part_num}-{div_num:02d}"
            section_codes = hierarchy[part_num][div_num]
            title = DIVISION_TITLES.get((part_num, div_num), f"Division {INT_TO_ROMAN.get(div_num, str(div_num))}")
            data = {
                "divisionId": div_id,
                "partNumber": part_num,
                "romanNumeral": INT_TO_ROMAN.get(div_num, str(div_num)),
                "title": title,
                "headnote": division_headnotes.get((part_num, div_num), []),
                "sections": section_codes,
            }
            path = os.path.join(divs_dir, f"div-{div_id}.json")
            _dump_json(path, data)
            total_divs += 1
    logger.info("Exported %d division files", total_divs)

    # --- Export Sections ---
    secs_dir = config.ensure_dir(os.path.join(config.FINAL_CONTENT_DIR, "sections"))
    exported = 0
    for code, data in sections.items():
        parsed = parse_section_code(code)
        if parsed is None:
            continue
        part_num, div_num, sec_num = parsed
        div_id = f"{part_num}-{div_num:02d}"

        data["sectionCode"] = code
        data["sectionCodeDisplay"] = code
        data["partNumber"] = part_num
        data["divisionId"] = div_id
        data.setdefault("crossReferences", [])
        data.setdefault("macropaediaReferences", [])
        data.pop("page", None)

        # Clean page markers from outline text
        _clean_page_markers(data.get("outline", []))

        dest_filename = config.section_code_to_filename(code) + ".json"
        dest_path = os.path.join(secs_dir, dest_filename)
        _dump_json(dest_path, data)
        exported += 1
    logger.info("Exported %d section files", exported)

    # --- Export Essays ---
    _export_essays()

    # --- Export Cross-References ---
    _export_cross_references()

    # --- Export Navigation ---
    _export_navigation(hierarchy, sections)

    logger.info("All exports complete")


def _clean_page_markers(outline: list) -> None:
    """Recursively remove ===== PAGE N ===== markers from outline text."""
    for item in outline:
        if "text" in item:
            item["text"] = re.sub(r"\s*={5}\s*PAGE\s+\d+\s*={5}\s*.*$", "", item["text"]).strip()
        if "children" in item:
            _clean_page_markers(item["children"])


def _export_essays() -> None:
    src_dir = config.ESSAYS_DIR
    dest_dir = config.ensure_dir(os.path.join(config.FINAL_CONTENT_DIR, "essays"))
    if not os.path.isdir(src_dir):
        logger.warning("No essays directory — skipping")
        return
    count = 0
    for fname in sorted(os.listdir(src_dir)):
        if fname.endswith(".mdx"):
            shutil.copy2(os.path.join(src_dir, fname), os.path.join(dest_dir, fname))
            count += 1
    logger.info("Exported %d essay files", count)


def _export_cross_references() -> None:
    dest_dir = config.ensure_dir(config.FINAL_DATA_DIR)
    src = config.CROSS_REFERENCES_PATH
    dest = os.path.join(dest_dir, "cross-references.json")
    if os.path.isfile(src):
        shutil.copy2(src, dest)
        logger.info("Exported cross-references.json")
    else:
        # Write empty structure
        _dump_json(dest, {"references": [], "reverseIndex": {}})
        logger.info("Wrote empty cross-references.json")


def _export_navigation(
    hierarchy: dict, sections: dict[str, dict],
) -> None:
    dest_dir = config.ensure_dir(config.FINAL_DATA_DIR)
    nav_parts = []
    for part_num in sorted(hierarchy.keys()):
        nav_divs = []
        for div_num in sorted(hierarchy[part_num].keys()):
            div_id = f"{part_num}-{div_num:02d}"
            section_codes = hierarchy[part_num][div_num]
            title = DIVISION_TITLES.get((part_num, div_num), f"Division {INT_TO_ROMAN.get(div_num, str(div_num))}")
            nav_secs = []
            for code in section_codes:
                sec_data = sections.get(code, {})
                nav_secs.append({
                    "sectionCode": code,
                    "title": sec_data.get("title", code),
                })
            nav_divs.append({
                "divisionId": div_id,
                "romanNumeral": INT_TO_ROMAN.get(div_num, str(div_num)),
                "title": title,
                "sections": nav_secs,
            })
        nav_parts.append({
            "partNumber": part_num,
            "title": config.PART_NAMES.get(part_num, f"Part {part_num}"),
            "divisions": nav_divs,
        })

    path = os.path.join(dest_dir, "navigation.json")
    _dump_json(path, {"parts": nav_parts})
    logger.info("Exported navigation.json")


if __name__ == "__main__":
    export_all()

# Macropaedia 2010 Contents Workflow

This folder is a separate ingestion workflow for the 2010 `Encyclopaedia Britannica` Macropaedia contents-page photos.

It does not modify any app data. All generated output goes under:

- `pipeline/output/macropaedia_2010/`

The current goal is to produce separate machine-readable data for:

- 2010 volume contents OCR
- candidate article titles and starting pages
- estimated page lengths within each volume
- comparison against the 2005 Macropaedia title set already referenced in the app
- preserved title crosswalks between Macropaedia contents names and Propaedia lookup/display names

For eventual app use, treat the Macropaedia contents name as the default article label and the
Propaedia name as an alias/crosswalk field.

## Source images

Expected input folder:

- `Macropaedia 2010/`

The current image set contains 17 JPGs, one per volume contents page. One image is landscape and may need a rotated OCR orientation. The OCR script tries multiple orientations and records the chosen one.

## Scripts

### 1. OCR the contents photos

Uses macOS Vision via Swift.

```bash
swift pipeline/macropaedia_2010/ocr_contents.swift \
  --input-dir "Macropaedia 2010" \
  --output-dir "pipeline/output/macropaedia_2010"
```

Outputs:

- `pipeline/output/macropaedia_2010/manifest.json`
- `pipeline/output/macropaedia_2010/ocr/*.txt`
- `pipeline/output/macropaedia_2010/ocr_lines/*.json`

The OCR line JSON keeps the raw bounding boxes and also writes `uprightBoundingBox`, which
maps every line into the chosen reading orientation. That makes later parsing and review much
easier on the rotated photos.

### 2. Build the 2005 baseline title set

```bash
python3 pipeline/macropaedia_2010/build_2005_baseline.py
```

Outputs:

- `pipeline/output/macropaedia_2010/2005_baseline_titles.json`

### 3. Parse OCR lines into article candidates

```bash
python3 pipeline/macropaedia_2010/parse_contents.py
```

Outputs:

- `pipeline/output/macropaedia_2010/2010_article_candidates.json`

This is heuristic parsing. It should get us into reviewable shape, not final truth.

The parser works from upright page geometry and pairs page numbers with titles row by row,
which is much more reliable than treating the full OCR output as a single text stream.

### 4. Compare 2010 candidates with 2005 titles

```bash
python3 pipeline/macropaedia_2010/compare_with_2005.py
```

Outputs:

- `pipeline/output/macropaedia_2010/2010_vs_2005_comparison.json`

The comparison script is more forgiving than the app's current raw lookup key. It strips accents,
reorders comma-flipped titles like `Agriculture, The History of`, and ignores modern names in
parentheses like `Bombay (Mumbai)` when matching 2010 entries back to the 2005 baseline.

### 5. Apply manual review corrections

After filling in:

- `data/macropaedia_2010/manual_review_fill_in.txt`

run:

```bash
python3 pipeline/macropaedia_2010/apply_manual_review.py
```

Outputs:

- `data/macropaedia_2010/2010_article_candidates_reviewed.json`
- `data/macropaedia_2010/2010_vs_2005_comparison_reviewed.json`

This keeps the raw OCR-derived outputs intact and writes a separate reviewed layer on top.

### Dense Propaedia pages

Some Propaedia `Suggested reading` blocks are too dense for a reliable full-page OCR pass.
The extractor now has a second-stage fallback for those pages:

- it finds the `Suggested reading ...` to `MICROPAEDIA:` band from OCR geometry
- crops that band into columns
- reruns Vision OCR on the cropped column images
- then rebuilds the recommendation list from the denser column OCR

Those scratch files are written under:

- `pipeline/output/macropaedia_2010/propaedia_dense_ocr/`

The canonical tracked outputs remain:

- `data/macropaedia_2010/propaedia_part_<n>_suggested_reading.json`
- `data/macropaedia_2010/propaedia_part_<n>_suggested_reading.csv`
- `data/macropaedia_2010/propaedia_part_<n>_suggested_reading_summary.md`

If one Propaedia photo contains more than one logical `Suggested reading` block, the capture index
can now store multiple rows for the same `image_relative_path`. Each row can specify:

- `block_index`
- `section_code`
- `crop_top_pct`
- `crop_bottom_pct`
- `header_context_override`

The extractor will then emit one payload per logical block instead of merging the whole image into
one section.

### 6. Initialize the long-running 2010 project database

For the separate, photo-backed data project:

```bash
python3 pipeline/macropaedia_2010/init_project_db.py --force
```

This seeds:

- `data/macropaedia_2010/project/macropaedia_2010_project.sqlite`
- fill-in worklists under `data/macropaedia_2010/project/`

Long-running project documentation:

- `pipeline/macropaedia_2010/LONG_RUNNING_PROJECT.md`
- `data/macropaedia_2010/README.md`

Useful follow-up commands:

```bash
python3 pipeline/macropaedia_2010/export_project_worklists.py
python3 pipeline/macropaedia_2010/apply_project_worklists.py
```

## Review approach

The likely workflow is:

1. OCR all 17 contents pages
2. Inspect the parsed article candidates
3. Correct any OCR or title parsing issues
4. Use the comparison output to identify:
   - titles present in 2010 but not in the 2005 dataset
   - titles present in 2005 but not seen in the 2010 contents pages
   - starting pages and estimated page lengths for 2010 articles

## Notes

- The parser uses the same normalization rule as the app's current Macropaedia matching: lowercase plus whitespace collapse.
- Estimated page lengths are based on the next article's starting page within the same volume, so the last article in a volume will not get a derived page length unless we add volume-end page data later.
- The long-running 2010 project keeps using the separate image root `Macropaedia 2010/` and does not modify app data.
- Canonical tracked 2010 review data lives under `data/macropaedia_2010/`.
- `pipeline/output/macropaedia_2010/` remains raw scratch output and is not intended as the git-tracked source of truth.

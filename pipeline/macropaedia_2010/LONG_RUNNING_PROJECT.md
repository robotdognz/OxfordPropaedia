# Macropaedia 2010 Long-Running Data Project

This project is separate from the app's current 2005-derived Macropaedia data.

The goal is to build a clean 2010 reference dataset that can eventually support:

- corrected article metadata
- page lengths
- Macropaedia contents names
- Propaedia display names
- Propaedia hierarchy mappings rebuilt from photos
- article contents-page evidence
- Britannica website breakdown links for each article

## Project stance

Do not treat this as a quick import.

This is a long-running curation project with photo evidence. The database should keep raw article
metadata, evidence paths, manual review status, and future mappings separate from app data until the
dataset is mature enough to integrate.

## Source of truth

Use the tracked files under:

- `data/macropaedia_2010/`

as the canonical git-tracked review layer.

The local SQLite database is a working index built from those tracked files.

The 2005 baseline is used only for comparison reports. It is not imported into the 2010 project
database and does not seed article rows, names, mappings, or page lengths there.

The reviewed OCR outputs remain the seed sources:

- `data/macropaedia_2010/2010_article_candidates_reviewed.json`
- `data/macropaedia_2010/2010_vs_2005_comparison_reviewed.json`

## Image root

Keep all long-running photo evidence under the same root:

- `Macropaedia 2010/`

That root can contain:

- the existing 17 volume contents photos
- future Propaedia page photos
- future article contents-page photos

The database stores image paths relative to that root.

## Required article fields

Each 2010 article record is expected to end up with:

- `volume_number`
- `start_page_label`
- `start_page_index`
- `page_length`
- `macropaedia_contents_name`
- `propaedia_name`

Important distinction:

- `macropaedia_contents_name` is the title as printed in the 2010 Macropaedia contents
- `propaedia_name` is the display name as printed in the Propaedia style, including comma reversals
  where Britannica uses them to make volume lookup easier

For now:

- page lengths for the last article in each volume should stay blank until volume-end page evidence is added

## Future evidence layers

The database is already structured for:

- `images`
  - volume contents photos
  - Propaedia page photos
  - article contents-page photos
- `propaedia_mappings`
  - part, division, section, subsection path mappings
- `britannica_targets`
  - current Britannica web article or topic targets

## Database setup

Initialize or rebuild the project database and worklists with:

```bash
python3 pipeline/macropaedia_2010/init_project_db.py --force
```

Generated outputs:

- `data/macropaedia_2010/project/macropaedia_2010_project.sqlite`
- `data/macropaedia_2010/project/article_identity_worklist.csv`
- `data/macropaedia_2010/project/propaedia_page_capture_index.csv`
- `data/macropaedia_2010/project/contents_page_review_human.csv`
- `data/macropaedia_2010/project/contents_risk_review_human.csv`
- `data/macropaedia_2010/project/propaedia_suggested_reading_page_review.csv`
- `data/macropaedia_2010/project/propaedia_suggested_reading_risk_review.csv`
- `data/macropaedia_2010/project/propaedia_suggested_reading_page_review_human.csv`
- `data/macropaedia_2010/project/propaedia_suggested_reading_risk_review_human.csv`
- `data/macropaedia_2010/project/article_contents_capture_worklist.csv`
- `data/macropaedia_2010/project/propaedia_mapping_worklist.csv`
- `data/macropaedia_2010/project/britannica_breakdown_worklist.csv`
- `data/macropaedia_2010/project/volume_contents_index.csv`

Re-export the current database back to CSV worklists with:

```bash
python3 pipeline/macropaedia_2010/export_project_worklists.py
```

Refresh the tracked Propaedia page photo index with:

```bash
python3 pipeline/macropaedia_2010/refresh_propaedia_page_capture_index.py
```

Export the human-review worklists for extracted Propaedia suggested-reading data with:

```bash
python3 pipeline/macropaedia_2010/export_propaedia_review_worklists.py
```

Export the human-review worklists for 2010 contents-page extraction with:

```bash
python3 pipeline/macropaedia_2010/export_contents_review_worklists.py
```

Apply edited worklists back into the database with:

```bash
python3 pipeline/macropaedia_2010/apply_project_worklists.py
```

## Recommended working order

### Phase 1. Lock article identity

For every article:

1. confirm `macropaedia_contents_name`
2. fill in `propaedia_name`
3. confirm page length where derivable
4. leave last-in-volume page lengths blank for now

Primary worklist:

- `article_identity_worklist.csv`

### Phase 1.5. Visually verify the contents-page extraction

For each volume contents page:

1. open the contents photo
2. compare the visible contents list to `contents_page_review_human.csv`
3. mark the page `verified` if the extracted article list is complete
4. fill `missing_entries` or `extra_entries` only if the page and extraction disagree
5. use `contents_risk_review_human.csv` for rescued manual rows and any unresolved leftovers

Primary tracked files:

- `contents_page_review_human.csv`
- `contents_risk_review_human.csv`

### Phase 2. Capture Propaedia page photos

For each photographed Propaedia page:

1. save it under `Macropaedia 2010/propaedia_pages/part_<n>/`
2. use stable sequence names like `propaedia-2010-part-01-photo-01.jpg`
3. refresh the tracked capture index
4. fill in `propaedia_page_reference` when known

Primary tracked file:

- `propaedia_page_capture_index.csv`

### Phase 3. Capture article contents-page photos

For every article:

1. take the article contents-page photo
2. save it under `Macropaedia 2010/article_contents_pages/`
3. record the relative path

Primary worklist:

- `article_contents_capture_worklist.csv`

### Phase 3.5. Visually verify Propaedia suggested-reading extraction

For every photographed Propaedia page with extracted recommendations:

1. open the page photo
2. compare the visible `Suggested reading in the Encyclopædia Britannica` list to
   `propaedia_suggested_reading_page_review.csv`
3. mark the page `verified` if the extracted list is complete
4. fill `missing_titles` or `extra_titles` if anything is off
5. check `propaedia_suggested_reading_risk_review.csv` first for the pages that needed line
   recombination or title normalization

For dense multi-column pages, the extractor now also does a second OCR pass on cropped
Macropaedia columns. That scratch OCR lives under:

- `pipeline/output/macropaedia_2010/propaedia_dense_ocr/`

Primary tracked files:

- `propaedia_suggested_reading_page_review.csv`
- `propaedia_suggested_reading_risk_review.csv`

Preferred human-facing files:

- `propaedia_suggested_reading_page_review_human.csv`
- `propaedia_suggested_reading_risk_review_human.csv`

### Phase 4. Rebuild Propaedia mappings from scratch

For every article with enough evidence:

1. inspect the article contents page
2. inspect the relevant Propaedia page photo
3. record part, division, section, and subsection path mappings

Primary worklist:

- `propaedia_mapping_worklist.csv`

If one article maps to multiple locations, duplicate the article row in the CSV and fill one mapping per row.

### Phase 5. Map to current Britannica web targets

For every article:

1. use article contents-page evidence to understand the topic split
2. identify the current Britannica website page or pages
3. record title, URL, and confidence

Primary worklist:

- `britannica_breakdown_worklist.csv`

If one article maps to multiple Britannica targets, duplicate the article row and fill one target per row.

## Suggested image naming

These are recommendations, not strict parser requirements.

### Propaedia pages

Use:

- `propaedia_pages/propaedia-page-0123.jpg`

If a spread needs two shots:

- `propaedia_pages/propaedia-page-0123-a.jpg`
- `propaedia_pages/propaedia-page-0123-b.jpg`

### Article contents pages

Use the Macropaedia article key in the filename:

- `article_contents_pages/v13-p0302-contents.jpg`

If one article needs multiple photos:

- `article_contents_pages/v13-p0302-contents-01.jpg`
- `article_contents_pages/v13-p0302-contents-02.jpg`

This makes it easy to connect a photo to the article key `(volume, start_page_label)`.

## What not to do yet

- do not overwrite app data with the 2010 dataset
- do not force every 2010 title into the 2005 mapping model
- do not guess last-in-volume page lengths
- do not treat every unmatched title as a true new article without checking editorial retitles

## Current seed status

The seed database comes from the reviewed 2010 candidates, which already include:

- manual fixes for the weak Volume 1 and Volume 13 contents pages
- reviewed title spellings like `BUSINESS LAW`, `Jackson POLLOCK`, and `KARĀCHI`
- blank page lengths for last-in-volume items where we do not yet have end-page evidence

The canonical tracked files are:

- `data/macropaedia_2010/manual_review_fill_in.txt`
- `data/macropaedia_2010/2010_article_candidates_reviewed.json`
- `data/macropaedia_2010/2010_vs_2005_comparison_reviewed.json`
- `data/macropaedia_2010/project/*.csv`

The raw OCR and intermediate parsing artifacts remain in:

- `pipeline/output/macropaedia_2010/`

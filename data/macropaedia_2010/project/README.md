# Macropaedia 2010 Project Outputs

This folder contains the long-running 2010 Macropaedia review workspace.

Tracked canonical files:

- `../manual_review_fill_in.txt`
- `../2010_article_candidates_reviewed.json`
- `../2010_vs_2005_comparison_reviewed.json`
- `*.csv` in this folder

The SQLite database is a local working index regenerated from the tracked files above.

- database: `macropaedia_2010_project.sqlite`
- seeded volumes: `17`
- seeded articles: `702`
- articles with blank page length: `17`

Generated files:

- `article_identity_worklist.csv`
- `propaedia_name_evidence_worklist.csv`
- `propaedia_name_candidate_summary.csv`
- `propaedia_page_capture_index.csv`
- `contents_page_review_human.csv`
- `contents_risk_review_human.csv`
- `propaedia_suggested_reading_page_review.csv`
- `propaedia_suggested_reading_risk_review.csv`
- `propaedia_suggested_reading_page_review_human.csv`
- `propaedia_suggested_reading_risk_review_human.csv`
- `article_contents_capture_worklist.csv`
- `propaedia_mapping_worklist.csv`
- `britannica_breakdown_worklist.csv`
- `volume_contents_index.csv`

The database is the intended source of truth for this project. The CSV files are fill-in worklists
for manual capture and review.

The Propaedia-name files have different roles:

- `propaedia_name_evidence_worklist.csv` stores each matched observed Propaedia title instance
- `propaedia_name_candidate_summary.csv` groups those instances by article and suggests the current best `propaedia_name`
- `article_identity_worklist.csv` includes those suggestions alongside the editable canonical `propaedia_name` field

Use those fields with this split in mind:

- `macropaedia_contents_name` is the canonical article title from the 2010 contents pages and should
  normally be the default app-facing lookup/display label for the article itself
- `propaedia_name` is the Propaedia-side alias used for matching and for any optional secondary
  display that explains the Propaedia wording
- when the names differ, keep both, because readers may navigate from a Propaedia recommendation but
  still need the actual contents-page title to find the article in the Macropaedia
- note that a contents-page title can itself be abbreviated relative to the article heading inside
  the volume, so future mismatches should be checked against both the contents page and the actual
  article heading when that evidence exists
- current example:
  - contents page: `CHILDHOOD DISEASES`
  - article heading: `Childhood Diseases and Disorders`
  - Propaedia recommendation: `Childhood Diseases and Disorders`

`propaedia_page_capture_index.csv` is block-based. A single image can appear on multiple rows when
one photo contains more than one logical `Suggested reading` block. Use:

- `block_index` to distinguish the logical blocks
- `section_code` to store the owning section id
- `crop_top_pct` and `crop_bottom_pct` to isolate the vertical band for that block
- `header_context_override` when the page header on the photo only names one of the sections

Useful commands:

```bash
python3 pipeline/macropaedia_2010/export_project_worklists.py
python3 pipeline/macropaedia_2010/apply_project_worklists.py
python3 pipeline/macropaedia_2010/export_propaedia_review_worklists.py
python3 pipeline/macropaedia_2010/export_contents_review_worklists.py
```

Suggested review flow for Propaedia pages:

1. Open `propaedia_suggested_reading_risk_review_human.csv` first and clear the risky rows.
2. Then work down `propaedia_suggested_reading_page_review_human.csv` and mark each page `verified`.
3. Only if a page disagrees with the extraction do you need to fill `missing_titles`, `extra_titles`,
   or `notes`.

Suggested review flow for volume contents pages:

1. Open `contents_risk_review_human.csv` to inspect rescued rows and unresolved leftovers.
2. Then work down `contents_page_review_human.csv` and mark each volume page `verified`.
3. Only if a volume page disagrees with the extraction do you need to fill `missing_entries`,
   `extra_entries`, or `notes`.

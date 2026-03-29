# Propaedia Page Photos

Store Propaedia page photos for the 2010 data project here.

Use per-part folders like:

- `part_1/`
- `part_2/`

Recommended naming inside each part folder:

- `propaedia-2010-part-01-photo-01.jpg`
- `propaedia-2010-part-01-photo-02.jpg`
- `propaedia-2010-part-01-photo-03.jpg`

These photos will later support:

- `propaedia_name`
- Propaedia hierarchy mappings
- review notes about how an article is framed in the Propaedia

Track the captured files in:

- `data/macropaedia_2010/project/propaedia_page_capture_index.csv`

That capture index can now contain more than one row for the same image. Use that when a single
photo contains multiple section-specific `Suggested reading` blocks. Each row can carry:

- a `block_index`
- a `section_code`
- crop percentages for the relevant vertical band
- an optional header override for the logical block

Refresh that tracked index with:

```bash
python3 pipeline/macropaedia_2010/refresh_propaedia_page_capture_index.py
```

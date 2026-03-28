# Propaedia Suggested Reading Investigation

This note records what was going on with the initially unmatched `Suggested reading in the
Encyclopædia Britannica` titles extracted from the 2010 Propaedia page photos for Parts 1 and 2.

## Outcome

All currently extracted Part 1 and Part 2 Propaedia suggested-reading titles now match the reviewed
2010 Macropaedia article set.

Current state after fixes:

- Part 1 matched recommendations: `46`
- Part 1 unmatched recommendations: `0`
- Part 2 matched recommendations: `43`
- Part 2 unmatched recommendations: `0`

The earlier unmatched titles were caused by upstream 2010 contents-pipeline misses, not by the
Propaedia extraction logic itself.

## Case 1: `LIGHT`

Status:

- real 2010 article
- visible in the volume 11 contents photo at page `1`
- OCR captured the title correctly
- the contents parser dropped it into `leftovers` instead of pairing it with page `1`

Evidence:

- contents image:
  - `Macropaedia 2010/contents_pages/macropaedia-2010-volume-11-contents.jpg`
- raw OCR:
  - `pipeline/output/macropaedia_2010/ocr/macropaedia-2010-volume-11-contents.txt`
- reviewed 2010 article row after fix:
  - volume `11`
  - start page `1`
  - title `LIGHT`

Fix:

- restored through the manual-review layer

Result:

- page 50 in the Part 1 Propaedia extraction now matches `LIGHT`

## Case 2: `Biochemical Components of Organisms`

Status:

- real 2010 article
- visible in the volume 2 contents photo at page `1007`
- OCR captured the page number `1007`
- OCR did **not** capture the title line itself in the raw volume 2 contents OCR
- because the title line was missing at OCR level, the 2010 article parser never had a title/page
  pair to reconstruct

Evidence:

- contents image:
  - `Macropaedia 2010/contents_pages/macropaedia-2010-volume-02-contents.jpg`
- observed entry in the photo:
  - `1007  BIOCHEMICAL COMPONENTS OF ORGANISMS`
- raw OCR around the bottom of the page includes:
  - `1007`
  - `The BIOLOGICAL SCIENCES`
- but not the title line for `Biochemical Components of Organisms`

Fix:

- restored through the manual-review layer as:
  - volume `2`
  - page `1007`
  - `Biochemical Components of Organisms`

Result:

- page 32 in the Part 1 Propaedia extraction now matches correctly

## Case 3: `GEOCHRONOLOGY: The Interpretation and Dating of the Geologic Record`

Status:

- real 2010 article
- visible in the volume 7 contents photo at page `748`
- raw OCR missed both the article title and the page number line in the useful parsed output
- because they were absent from OCR, the article never made it into the reviewed 2010 article set

Evidence:

- contents image:
  - `Macropaedia 2010/contents_pages/macropaedia-2010-volume-07-contents.jpg`
- observed entry in the photo:
  - `748  GEOCHRONOLOGY: The Interpretation and Dating of the Geologic Record`
- raw OCR around that area jumps from:
  - `745  GENGHIS KHAN`
- to:
  - `877  GEOGRAPHY`

Fix:

- restored through the manual-review layer as:
  - volume `7`
  - page `748`
  - `GEOCHRONOLOGY: The Interpretation and Dating of the Geologic Record`

Result:

- pages 88 and 89 in the Part 2 Propaedia extraction now match correctly

## Practical conclusion

The problem was not that the Propaedia pages were pointing to obsolete 2005-only articles.

The real issue was that the reviewed 2010 Macropaedia dataset still had three missing articles due
to two different upstream failure modes:

- `LIGHT`
  - OCR succeeded
  - contents parser pairing failed
- `Biochemical Components of Organisms`
  - OCR captured the page number but missed the title line
- `GEOCHRONOLOGY: The Interpretation and Dating of the Geologic Record`
  - OCR missed the relevant entry entirely in the parsed output

So the correction path is:

- fix the reviewed 2010 article layer first
- then rerun the Propaedia suggested-reading extraction

That has now been done for Parts 1 and 2.

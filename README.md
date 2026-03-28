# Propaedia — Outline of Knowledge

Propaedia is an interactive web edition of the Encyclopaedia Britannica's **Propaedia**, the "Outline of Knowledge" that classifies human understanding into **10 Parts, 41 Divisions, and 177 Sections**.

It turns that outline into a guided reading and listening tool. You can move through the outline directly, track your own coverage, compare reading types, and follow recommendation paths that adapt to what you have already completed.

Live site: [robotdognz.github.io/NeoPropaedia](https://robotdognz.github.io/NeoPropaedia/)

This repository is deployed under the `NeoPropaedia` GitHub Pages path. The product name in the app remains `Propaedia`.

## Current Scope

- Browse the full outline by Part, Division, Section, and subsection
- Explore the homepage in three modes: `Whole Outline`, `Selected Fields`, and `Specific Topic`
- Track user progress across `Parts`, `Divisions`, `Sections`, and `Subsections`
- Compare four reading types:
  - Oxford Very Short Introductions
  - Wikipedia Vital Articles
  - BBC In Our Time episodes
  - Britannica Macropaedia articles
- Get recommendation panels and coverage-based reading paths that respond to current progress
- Save progress locally, export/import backups, and install the site as a PWA for offline use
- Search the outline and reading catalog with Pagefind

## Data Sources

- Propaedia structure, section outlines, and cross-references derived from publicly accessible descriptions of the Britannica Propaedia
- Oxford VSI catalog compiled from the [Wikipedia listing of Very Short Introductions](https://en.wikipedia.org/wiki/List_of_Very_Short_Introductions)
- Wikipedia reading set based on the [Wikipedia Vital Articles](https://en.wikipedia.org/wiki/Wikipedia:Vital_articles) project
- BBC In Our Time data sourced from BBC programme pages and metadata
- Macropaedia references derived from the Propaedia's own section-level reading guidance

## Built With

- [Astro](https://astro.build/) for the static site
- [Preact](https://preactjs.com/) for interactive UI
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [Pagefind](https://pagefind.app/) for static search

## Development

```bash
npm install
npm run dev
```

Local development runs under the GitHub Pages base path. Open:

```text
http://127.0.0.1:4321/NeoPropaedia
```

## AI Mapping Pipeline

The repository includes AI-assisted pipeline scripts for generating `summaryAI` and exact-leaf Propaedia mappings for VSI, Wikipedia, and BBC In Our Time:

- `scripts/generate-summary-ai.mjs`
- `scripts/generate-mappings-ai.mjs`

Useful operator commands:

```bash
# Summary generation / validation
node scripts/generate-summary-ai.mjs --type vsi
node scripts/generate-summary-ai.mjs --type iot
node scripts/generate-summary-ai.mjs --validate

# Mapping validation / coverage
node scripts/generate-mappings-ai.mjs --validate
node scripts/generate-mappings-ai.mjs --coverage --type vsi
node scripts/generate-mappings-ai.mjs --coverage --type wikipedia

# Combined pipeline status
node scripts/generate-mappings-ai.mjs --mode status --type vsi
node scripts/generate-mappings-ai.mjs --mode status --type wikipedia

# Gap planning
node scripts/generate-mappings-ai.mjs --mode gap-fill --type vsi --unresolved-only --top-sections 10 --top-targets 5
node scripts/generate-mappings-ai.mjs --mode gap-fill --type wikipedia --unresolved-only --top-sections 10 --top-targets 5

# Repair planning
node scripts/generate-mappings-ai.mjs --mode repair-queue --type vsi --top-sections 15
node scripts/generate-mappings-ai.mjs --mode repair-queue --type wikipedia --top-sections 15
```

Notes:

- Coverage is measured at exact leaf-path level.
- Broader ancestor-path matches count as controlled fallback debt, not exact coverage.
- Reports under `scripts/output/` are generated artifacts and are ignored by git.

## Deployment

The site is configured for GitHub Pages at [robotdognz.github.io/NeoPropaedia](https://robotdognz.github.io/NeoPropaedia/). Push to `main` and the GitHub Actions workflow will build and deploy automatically.

## License

This is an educational project. The organisational structure of the Propaedia is used for reference and study purposes. All Oxford VSI recommendations link to publicly available book information.

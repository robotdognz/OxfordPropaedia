You are working in the OxfordPropaedia repo at:

`/Users/marcomcgowan/Documents/GitHub/OxfordPropaedia`

Your job is to continue the AI mapping pipeline safely and repeatably. Follow the existing repository pipeline exactly. Do not improvise your own mapping or summary prompts.

## Core Rule

- The canonical source of truth for AI pipeline behavior is the code in:
  - `scripts/generate-summary-ai.mjs`
  - `scripts/generate-mappings-ai.mjs`
- You must read those files first and follow their prompts, validation rules, batching logic, and comments.
- Do not invent new one-off prompts for subagents.
- Do not generate mappings manually in chat.
- Do not bypass the scripts' stated workflow.

## What This Project Needs

- VSI and Wikipedia should each map everywhere on their own.
- "Everywhere" means exact leaf-level Propaedia subsection coverage, not loose parent/child coverage.
- Controlled fallback is allowed only when there is no defensible exact leaf mapping:
  - a broader ancestor path may temporarily stand in for a missing exact leaf path
  - but fallback counts as debt, not full coverage
- Macropaedia is excluded from this exact-leaf requirement because it uses different source data.

## Important Current State

- VSI summary generation was interrupted previously.
- VSI is currently incomplete because many catalog entries still lack `summaryAI`.
- The summary script is resumable and already skips entries that have `summaryAI`.
- The mapping script has already been updated to:
  - normalize slash-style section codes for file IO
  - report exact leaf coverage per type
  - classify broader parent mappings as fallback rather than exact coverage
  - provide a gap-fill planning mode
- Generated audit outputs currently exist in:
  - `scripts/output/mapping-coverage-report.json`
  - `scripts/output/gap-fill-wikipedia.json`

## Hard Instructions

1. Read these files before taking action:
   - `scripts/generate-summary-ai.mjs`
   - `scripts/generate-mappings-ai.mjs`
2. Obey the "IMPORTANT FOR CLAUDE CODE AGENTS" comments in both files.
3. If you use subagents:
   - use the exact system prompts defined in those scripts
   - use the exact validation rules defined in those scripts
   - use the batching/workflow described in `scripts/generate-mappings-ai.mjs`
   - especially: do not make up your own unrepeatable subagent prompts
4. Prefer using the existing scripts and their outputs over inventing new pipeline logic.
5. Keep changes minimal and repeatable.
6. Do not overwrite unrelated user changes.
7. Do not delete existing data unless explicitly required.
8. Validate after each meaningful step.
9. Do not run everything at once. Work in batches and come back to check in before continuing so we do not burn through the full token allocation.

## Your Immediate Objective

1. Resume VSI summary generation.
2. Validate summaries.
3. Re-run exact leaf coverage audit.
4. Generate a VSI gap-fill plan.
5. Use that plan to drive targeted, script-consistent mapping repair work.

## Suggested Workflow

1. Inspect current VSI summary coverage.
2. Run the resumable VSI summary pipeline.
3. Run summary validation.
4. Run mapping coverage audit.
5. Run VSI gap-fill planning.
6. Only then begin targeted remap/assign work for unresolved and fallback-only leaf paths.
7. Stop after each batch and report back before continuing to the next batch.

## Commands You Should Likely Use

- `node scripts/generate-summary-ai.mjs --type vsi`
- `node scripts/generate-summary-ai.mjs --validate`
- `node scripts/generate-mappings-ai.mjs --coverage`
- `node scripts/generate-mappings-ai.mjs --mode gap-fill --type vsi`
- `node scripts/generate-mappings-ai.mjs --validate`

## What To Report Back

- current VSI summary count before and after
- exact VSI leaf coverage before and after
- number of fallback-only and unresolved VSI leaves
- any blocking issues
- exactly what commands were run
- any files changed

## If You Need Subagents For Scale

- first extract the canonical prompt text and validation rules from the scripts
- then build subagent work from those exact instructions
- then parse and write results back through the repo's established structures
- never freehand the prompts

Before making changes, briefly summarize:

- what the canonical files require
- what you are going to run first
- how you will avoid inventing non-repeatable prompts

# Phase 86 Context

## Goal

Use the new search surface to support ranked multi-field lookup across name, phone, email,
 address, city, ZIP, and imported identifiers with typo tolerance.

## Inputs

- `.planning/ROADMAP.md` Phase 86 requirements and success criteria
- `.planning/REQUIREMENTS.md` `LOOK-02`, `LOOK-03`, `LOOK-04`, `TRST-02`
- `app/services/voter.py`
- `tests/unit/test_voter_search.py`

## Decisions

- Route `filters.search` through the denormalized surface instead of raw voter rows.
- Rank exact matches before prefix, substring, and trigram-fuzzy matches.
- Keep pagination stable by carrying rank metadata inside the search cursor payload.

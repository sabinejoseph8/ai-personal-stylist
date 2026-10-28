# Held-out notes cases

A blind test set for the notes reader, written on 27 October 2026 for Phase 7b (the evaluation write-up).

**Who wrote it.** A Claude Code side session that had never worked on the notes reader, and never will. It read the product spec (R15 to R22), the case format in `tests/evals/notes-cases.json` and the note types, and nothing else about the reader: not its prompts, and not the code under `core/notes/`, `lib/notes-*` or `connectors/ai/`. It changed none of them.

**Why it exists.** The reader was built and tuned by sessions that could see the 63 cases in `notes-cases.json`, so the scores there (96% of checks right, 97% of notes within 2 seconds on 25 October 2026) are in-sample. This set says how the reader does on 15 sentences nobody tuned it for.

**The rules.**

- The expected notes were written before anything was run.
- The main 7b session, which builds the rest of the portfolio package, never reads this folder.
- The set is run once, with `npm run eval:notes:held-out` (about 5 cents of Claude). It is not re-run to improve the score, and the cases are not changed after the results are seen. A run that fails for a technical reason (a missing key, a timeout) is fixed and run again, and the write-up says so.
- The runner is the same one as the in-sample set, `tests/evals/notes.eval.ts`, pointed at this file with `NOTES_CASES`. It measures the same things in the same way: each sentence is replayed at 2.5 words a second, sent twice a second, with the app's merging, and each note is timed from its phrase.

**Targets, as agreed for the notes reader:** at least 90% of checks right (set in 2c on 20 October 2026, and the pass mark in the runner itself), and 95% of notes within 2 seconds of their phrase (R17).

**What the 15 cases cover.** New occasions (a baby shower, a christening, an anniversary dinner, a retirement do, a vow renewal, the races, a barn wedding, a housewarming, a gallery opening, a 70th birthday brunch, a work conference, the theatre). Budgets said four ways (no more than, under, a range with no "between", and a budget stretched in a later turn). Three corrections (a budget, a date, a venue). Colours to wear and to avoid, owned items, fit, style words, things to avoid. One long turn, one unclear sentence that the stylist checks and the shopper confirms, one answer to the stylist's question, one chit-chat sentence with nothing to note, and one trend question that is not a note.

**Results:** `tests/evals/results/notes-held-out-latest.json`, written by the one run.

## The one run (27 October 2026, 10:23 pm Cayman time)

| | Held-out, this set | In-sample, notes-cases.json (25 October 2026) |
|---|---|---|
| Cases | 15 | 63 |
| Checks right | 67 of 81 (83%) | 269 of 279 (96%) |
| Notes within 2 seconds | 40 of 47 (85%) | 97% |
| Cost | $0.07 | $0.17 |

Both numbers are below the targets (90% right, 95% within 2 seconds). Of the 7 notes not within 2 seconds, 5 never appeared at all and 2 arrived at 2.0 and 2.1 seconds, so the 95th percentile in the results file reads 99, the runner's code for a note that never came. The readings themselves took a median 1.3 seconds. The 14 wrong checks, case by case:

- **Vow renewal, long turn (5 wrong).** The notes appeared within 2 seconds while the shopper was talking, then a later reading removed every one of them. At the end only the budget note was left, and the stylist asked "Anything else you wanted to mention?". The biggest single loss.
- **Stretching the budget (2 wrong).** In the second turn the shopper said they could stretch to a higher amount. The budget note kept the first amount, and the new one was never written: the sentence has none of the words plain code looks for, and Claude did not update the note.
- **Not quite, moved indoors (3 wrong).** The venue correction became three notes about being indoors, one of them still naming the old venue, and the new venue was never written. The brunch note from the first turn was dropped in favour of the birthday, and had taken 2.1 seconds.
- **A range for a conference (1 wrong).** A budget range said without "between" or a dollar sign was never jotted. The occasion, city and month were right.
- **Minimalist, runs warm (1 wrong).** "Nothing heavy" was jotted as "Runs warm" only. A near miss on wording rather than substance.
- **Baby shower (1 wrong).** Every note right and in time, but "Soft" was left beside "Soft pastel", which the repeated-notes check counts.
- **Best man (1 wrong).** Every note right, the last at 2.0 seconds, but with three near-duplicate pairs (tie and ties, colour and colors, the month inside the wedding note).

The cases were not changed after the run, and it was not run again.

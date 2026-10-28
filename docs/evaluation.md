# Evaluation: AI Personal Stylist

How quality was defined before it was measured, how it was measured, the results with their limits, and what the results changed. The numbers come from the saved evaluation results in `tests/evals/results/` and from the checks recorded in the plan; `node scripts/eval-summary.mjs` prints the headline numbers from those files without spending anything.

## 1. What good looks like

Set before any result, at planning time or when each part's task group was planned, and recorded in the plan files. The dates are when each target was written down.

| Measure | Why it matters to the user | Target | Set on | Measured on |
|---|---|---|---|---|
| Notes jotted quickly | A note that appears late feels like the stylist wasn't listening (R17) | 95% of notes within 2 seconds of their phrase | 17 Oct 2026, tech spec R17 | 63 scripted sentences replayed at speaking pace (`tests/evals/notes-cases.json`) |
| Notes right | A wrong note becomes a wrong look | At least 90% of checks right (the note, its status, no repeats, the next question) | 20 Oct 2026, the 2c plan | The same 63 sentences |
| Notes right and quick on a blind set | The in-sample set was seen by the sessions that built the reader | The same 90% and 95% | 27 Oct 2026, the 7b plan (Q1) | 15 new sentences written by a session that never touched the reader (`tests/evals/held-out/`) |
| Rule breaks caught by code | A look must never break a saved preference (R54 to R56) | All planted rule breaks caught before any judgment | 21 Oct 2026, the 4b plan | 37 looks from the real catalog, 16 of them breaking a rule (`tests/evals/checker.eval.ts`) |
| Judged looks right | The judgment step decides the cases code can't (style words, inspiration photos) | At least 90% right | 21 Oct 2026, the 4b plan | 21 looks needing a judgment, answers reviewed by Sabine |
| Preference rules right | "No high heels" has to become a rule the shopper recognizes (4a) | All 16 right | 21 Oct 2026, the 4a plan | 16 preferences with expected rules (`tests/evals/rules.eval.ts`) |
| Photo details right | A misread photo builds the wrong looks (R28) | At least 85% of details right, and every item found in two-item photos | 20 Oct 2026, the 3b plan (Q2) | 24 catalog photos with answers from the catalog's own details (`tests/evals/photos.eval.ts`) |
| Video start | The first thing every visitor sees (R8) | Within 5 seconds | 17 Oct 2026, product spec S1 | A real call on Sabine's iPhone |
| Interruption | Talking over the stylist should stop her (R7) | Within half a second | 17 Oct 2026, product spec S2 | Phase 0 test page, by button and by voice |
| Cost per demo | A public link must not run up a bill (risk 4) | About $1.10 of AI or less for a 10-minute demo | 17 Oct 2026, tech spec section 9 | The live app's usage table, one full session |
| Phone speed | A slow first load loses a visitor on a phone | Lighthouse phone score of 90 or more on the welcome screen | 17 Oct 2026, the plan's 7a tests | `npm run lighthouse` against the live site, the middle of three runs |
| The success checks S1 to S20 | The product spec's own definition of done | Each passes on an iPhone and a laptop | 7 to 19 Oct 2026, product spec section 9 | Sabine's checks at the end of each phase; the full run is task 7c |

**Changes to the targets:** none after results arrived. Two things were set after planning but before their own results: the notes accuracy target (90%, added in the 2c plan before the 30-sentence evaluation ran) and the camera reader, which has no pass mark by design (3c: "no pass mark", because the camera only names an item for the shopper to confirm).

## 2. How it is measured

- **Data.** Notes: 63 sentences a shopper might say, replayed at 2.5 words a second through the app's own sending and merging, with expected notes, statuses and the next question (30 from Phase 2, 7 spoken swaps from 4c, 6 photo cases from 3b, and the rest from the full code review's batch 3). Checker: 37 looks built from the real sample catalog, 16 of them planted to break a rule (high heels at 6 to 12 cm against "Never: high heels", a missing heel height, sleeveless against "Must have: sleeves", over budget, "Not black", the wrong department or size, an incomplete outfit, the shopper's own item left out), and 21 that need a judgment (shorts at a November wedding, sequins against "too flashy", a missing jacket, an inspiration photo matched or not). Photos: 20 catalog photos, one of each kind, and 4 made by putting two catalog items side by side. Rules: 16 preferences. Blind set: 15 new sentences, written on 28 Oct 2026 by a separate session.
- **Expected answers.** Written before each run. The notes, checker, rules and photo answers live in the repository and were written by the sessions that built those readers, in the same task groups: those results are **in-sample**. The photo answers come from the catalog's own product details, which leaves less room for an answer written to suit the reader. The blind set's answers were written by a session that has never edited the notes reader, in `tests/evals/held-out/`, a folder the sessions that build the reader never read.
- **Method.** Each evaluation is a script (`npm run eval:notes`, `eval:checker`, `eval:photos`, `eval:rules`, `eval:camera`, `eval:notes:held-out`) that calls the real models, compares every answer with the expected one, times each call, records the cost against the live app's monthly Claude stop, and saves a results file. `node scripts/eval-summary.mjs` prints the headline numbers from the saved files. The checks in `checks/run_all.py` confirm the README and the case study quote the same numbers.
- **Separation.** One builder (Sabine working with Claude Code, in one session at a time) wrote the readers and their in-sample answers. The blind set was written and run by a second session that never edits the reader; the session building this write-up never reads the blind cases. The success checks S1 to S19 were run by Sabine on her own iPhone and laptop, following step-by-step files written before each check; she reported what she saw.

## 3. Results

Saved runs of 20 to 28 October 2026, on the versions merged at the time. The notes run is from 25 Oct 2026 (the full code review's batch 3). The blind set ran once, on 28 Oct 2026.

| Measure | Target | Result | Met? | Caveat |
|---|---|---|---|---|
| Notes within 2 seconds (in-sample) | 95% | 97% (95th percentile 1.9 s, 87 timed notes) | Yes | Speed varies a few points between runs: 94% to 99% across the runs recorded in mvp.md |
| Notes right (in-sample) | 90% | 96% (269 of 279 checks, 63 cases) | Yes | In-sample: the answers were seen by the sessions that built the reader |
| Notes within 2 seconds (blind set) | 95% | To be filled from `tests/evals/results/notes-held-out-latest.json` | | One run, 15 sentences |
| Notes right (blind set) | 90% | To be filled from `tests/evals/results/notes-held-out-latest.json` | | One run, 15 sentences |
| Rule breaks caught by code | All | 16 of 16 | Yes | Planted by the builder; a real shopper may phrase a preference the rule maker can't read, which then goes to the judgment step |
| Judged looks right | 90% | 21 of 21 (100%), median 6 s a judgment | Yes | The answers were reviewed by Sabine, who also chose the sample profile; 21 is a small set |
| Preference rules right | All 16 | 16 of 16 | Yes | In-sample |
| Photo details right | 85% | 93% (74 of 80 details, 24 photos); two-item photos 12 of 12 | Yes | Catalog photos are cleaner than phone photos; the misses were close calls (a tuxedo jacket read as a blazer) |
| Camera frames | No pass mark | Type right 18 of 20, colours 20 of 20, 1.3 s a frame | Indicative only | Catalog photos shrunk to 640 px, not real camera frames |
| Video start | 5 s | About 4 s on Sabine's iPhone (2a check) | Yes | By eye, one phone, one network |
| Interruption | 0.5 s | 0.7 s by button, including the network; by voice "felt immediate" | No (button); not timed (voice) | Phase 0 test page, one measurement |
| Cost per demo | About $1.10 | About $1.15 (one 10-minute session with styling changes, 25 Oct 2026); about $0.45 before Phase 5 | No, by 5 cents | One session; the judge's cost depends on how many changes the shopper asks for |
| Phone speed | 90 | 98 on the live welcome screen, 99 on About (27 Oct 2026) | Yes | Lighthouse's phone profile from a Mac, not a real phone's network |
| Success checks | S1 to S20 | S1 to S19 passed on an iPhone and a laptop across the phases | 19 of 20 | S20 (a first-time visitor's first look in under 3 minutes) is run with a friend in 7c; a few checks needed a fix and a second run first (S3, S7, S12 among them) |

## 4. Caveats and limits

- **Sample size.** 63 sentences, 37 looks, 24 photos and 16 rules can show that the readers work on the cases their builders thought of, not how often a real shopper's phrasing falls outside them. One cost measurement is a point, not an average.
- **Blindness.** Every in-sample answer was written by the same builder, often in the same task group as the code. The blind set is the only measurement made by a session that never touched the reader, and it is small (15 sentences). The photo answers come from the catalog's own details, which helps.
- **In-sample results.** The notes reader was tuned in 2c on the same 30 sentences it was then scored on (five setups compared). Later cases were added as features arrived. Treat the in-sample notes score as "the reader handles the cases we wrote", and the blind score as the better estimate of what a new sentence gets.
- **Who tested.** Every real-device check was by one person, the builder, on one iPhone and one laptop. No stranger has used the app yet; that is S20, in 7c.
- **Not measured.** How well the looks match a shopper's taste (the judgment step checks rules and stated preferences, not whether the shopper likes the look); the stylist's conversation quality beyond the notes; Android phones; more than one visitor at a time at full load.
- **Cost figures depend on behaviour.** The $1.15 is for a session with several styling changes, the most expensive path. A session with no changes was about $0.45.

## 5. What the results changed

- **The notes model and its setup (Phase 0, 18 Oct 2026).** Claude Opus 5.5 was right on every note but only 10% arrived within 2 seconds, so the notes moved to Claude Haiku 5.5 with better instructions and plain code reading money and dates, which Haiku had got wrong (mvp.md spike results).
- **Thinking off, readings overlapping, words twice a second (2c, 20 Oct 2026).** The agreed setup scored 94 to 100% right but only 35 to 57% within 2 seconds; half of each reading was the model thinking. Option 3 reached 97 to 99% within 2 seconds. Two code rules came with it: repeated notes fold into one, and a note turns to ink by voice only when it answers something the stylist said.
- **The checker's cases (4b, 21 Oct 2026).** Sabine's review of the first results added six judgment cases (a navy dress with emerald only in the accents, black and white with no earth tones, burgundy as an earth tone, a coat nobody asked for), all passing after the prompt was adjusted.
- **The daily AI allowance (25 Oct 2026).** The measured cost of a session with styling changes, about $1 of judgments, stopped Sabine's own check at the $1 daily allowance. The allowance became $3, and the screens now say when the day's AI is used up instead of showing a technical error (the limit-lines fix).
- **Cheaper Undo and Compare (7a, 27 Oct 2026).** The same measurement showed Undo and Compare re-judging a look that had already passed on identical requirements; they now reuse that verdict, at no cost and with no wait.
- **No speed work (7a, 27 Oct 2026).** The live welcome screen scored 98, so the planned performance task became a measurement and a script to repeat it before launch, not changes.
- **The 7a accessibility checks (27 Oct 2026).** Measuring touch targets and 200% text, which the automatic scanner doesn't, found five layout problems and one conflict in the spec itself; the notes' 28 px rows became the recorded exception to the 44 px rule.

## 6. Next

- A stranger's first session (S20, 7c) with the time to the first look and what they said afterwards.
- A larger blind notes set, written by someone other than the builder, run on each model change.
- Real phone photos in the photo evaluation, alongside the catalog ones.
- A second cost measurement from a session with no styling changes, to report a range rather than a point.

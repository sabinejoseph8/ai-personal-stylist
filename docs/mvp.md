# AI Personal Stylist: MVP Scope

**Status:** Living document, version 1.21
**Last updated:** 21 Oct 2026
**Built from:** MVP PRD v1.8 and Prioritized Backlog v1.8 (7 Oct 2026, in the project root), product spec 1.4, design 1.11, tech spec 1.23 and progress.md
**Rule:** this file explains why the plan is the way it is. If it disagrees with product-spec.md, design.md, tech-spec.md or progress.md, those agreed files win, and this file is updated to match.

---

## 1. The MVP in one paragraph

A mobile-first web app where you talk face to face with a lifelike AI stylist on video, show what you own on camera or in a photo, and watch the stylist jot down what matters in My Styling Notes. The stylist then builds complete looks that mix your clothes with sample products and refines them as you react. Nothing can be bought. It is a portfolio project: a hiring manager can try it with no sign-up, and it runs on about $40 a month.

## 2. In and out of v1

**In v1**
- The video stylist (Tavus), with voice only as the fallback. A working microphone is required.
- My Styling Notes: a free-form notebook the stylist jots in while you talk. Notes are confirmed or removed by touch, and changed by voice.
- Items to style around, from a photo or the live camera.
- A wardrobe of owned items.
- Three checked looks, swaps, and feedback rounds with undo and compare.
- The preference check: no look breaks a saved preference or a confirmed note.
- Saved looks and a demo bag that cannot check out.
- Privacy controls: clear, download and delete.
- Accessibility: everything outside the conversation works by touch or keyboard. The conversation itself needs your voice (accepted trade-off, risk 17).
- Portfolio extras: sample phrases, the About this project page, and the Behind the scenes panel.

**Out of v1**
- Real retailers (ASOS and FARFETCH), checkout, affiliate links, real prices and stock.
- Email or social sign-in, and syncing across devices.
- Native iOS and Android apps.
- Other languages, and currencies other than US dollars.
- Virtual try-on, and a choice of stylists or voices.
- Captions or any transcript of the conversation, and typing to the stylist (future features).
- Ads or any other way of making money.

## 3. How the plan changed from the PRD

| Topic | PRD v1.8 | Agreed plan | Why | Decided |
|---|---|---|---|---|
| Platform | Mobile-first, platform not set | A web app that opens from a link | Recruiters can try it without installing anything | 17 Oct 2026, product spec |
| Video stylist and live camera | P0 | Both in v1 (Q1, option B) | The lifelike stylist is the experience | 17 Oct 2026, Sabine |
| Accounts | Accounts and style profiles | One-tap guest accounts kept for 7 days, plus a sample profile (Q2, option A) | Recruiters won't sign up to try a portfolio project | 17 Oct 2026, Sabine |
| Conversation layer | OpenAI Realtime for speech, with a Tavus face | Tavus runs the whole video conversation, and OpenAI GPT-Live is only a voice-only fallback (TQ1). The text only mode was removed on 19 Oct 2026 | The PRD pairing needs an always-on media server and adds delay. This setup costs less and is simpler | 18 Oct 2026, Sabine |
| Captions | Transcript captions (FR-01, AC-06) | No transcript or captions. The stylist's voice and My Styling Notes are the only output (R10) | The screen should feel like a stylist taking notes, not a chat log | 19 Oct 2026, Sabine |
| My Styling Notes | Labelled fields for occasion, season and date, colors, style, budget, outfit type and owned wardrobe, each with a status (FR-11, FR-12) | A free-form notebook with no fixed fields. The stylist jots down any relevant details, in pencil (To confirm) or ink (Confirmed). The details looks need are still read in the background (R15, R16) | Feels like a real stylist taking notes, and nothing relevant is lost for not fitting a field | 19 Oct 2026, Sabine |
| Typing and the microphone | Typing as another way in (D18), and a graceful fallback when the microphone is refused (release gate) | No typing to the stylist in v1, to be reviewed in a future version. A working microphone is required, and the app explains how to turn it on (R6, R11) | Keeps v1 focused on the voice conversation. Accepted trade-off: people who can't use voice can't use the conversation in v1 (risk 17) | 19 Oct 2026, Sabine |
| Video length | Not set | Video for the whole 10-minute conversation. Voice only is used only when something goes wrong | One consistent voice, at the cost of fewer demos a month | 18 Oct 2026, Sabine |
| Voice change on fallback | Not set | A matched OpenAI voice, and the line "I'm switching to voice only, so I'll sound a little different." | Makes the rare switch less jarring | 18 Oct 2026, Sabine |
| Live camera recognition | A vision session | Frames read by our server and thrown away, never sent to Tavus. The camera turns off after 2 minutes | Privacy, and it works in every mode | 18 Oct 2026, tech spec |
| AI for notes, photos, looks and checks | Not set | Claude, with Opus 5.5 for every job until Phase 0 measures speed and cost (TQ3) | Reliable structured output, image understanding and careful rule following | 18 Oct 2026, Sabine |
| Running cost | Not set | About $40 a month, with daily limits per guest and a "demo is resting" state (TQ2, TQ4) | A fixed, small budget | 18 Oct 2026, Sabine |
| PRD open decisions | Launch region, audience, money, public demo bag | US English and US dollars; adults shopping womenswear, menswear or both; no money-making; demo bag shown with checkout disabled | Sensible defaults for a portfolio demo | 17 Oct 2026, product spec |
| Contract tests and end-to-end tests (D19, D20) | Release R2 | Built in Phases 1 and 7 | Testing from the start keeps a solo build safe | 18 Oct 2026, progress.md |

## 4. Success criteria

**Product goals** (product spec section 3)
1. Feel understood: the stylist jots down notes in My Styling Notes while you talk, and anything can be fixed by voice or touch.
2. Style what they own: looks are built around a photo or camera item.
3. Reach a look they love: feedback rounds keep what you asked for.
4. Never be contradicted: no look breaks a saved preference or a confirmed note.
5. Easy to show: a first-time visitor reaches a first look in under 3 minutes.

**The PRD's release gate, as the plan checks it**
- A demo user can talk to the stylist, show an owned item, save it, get three coordinated looks, swap a piece, save a look, and put sample products in a bag that cannot check out.
- Owned items are never in totals, and no sample product can be bought or shown as live stock.
- Catalog connector contract tests pass.
- Refusing the camera still leaves a working app. Refusing the microphone shows how to turn it on, because the conversation needs it (changed 19 Oct 2026, R6).
- Mixed feedback gives a revised look that keeps confirmed requirements and kept pieces, round after round.
- The item photo stays visible in the notebook through refinement.
- Every look passes the preference check before anyone sees it.

**How they are checked:** success checks S1 to S20 in the product spec, spread across the phases and run in full in task group 7c.

**Portfolio success (default)**
- About 12 full video demos a month within about $50 (Tavus Starter has 120 minutes on Sabine's account, and the database is $10).
- The link works whenever a recruiter clicks it.
- The About page, the README and the one-page case study tell the story behind the product, with the evaluation's results and limits (7b). The interview notes stay private, for interview practice.

## 5. Risks

The tech spec's risk table has the full detail. This list tracks status.

| # | Risk | Handled in | Status |
|---|---|---|---|
| 1 | The video stylist feels slow or out of sync | Phase 0 gate | Passed in Phase 0 (0g) |
| 2 | Live notes miss the 2 second target | Phase 0 (0d), then Phase 2 (2c) | Met in the 2c eval with your option 3: 97 to 99% of notes within 2 seconds, 96 to 99% right, target unchanged. The eval leaves out the phone's connection and the database; on Sabine's iPhone the notes felt quick (2c check, 20 Oct 2026). Closed |
| 3 | Tavus allows one call at a time and a fixed number of minutes | Phase 0 test, Phase 6 fallback | Behavior understood in 0c (an immediate 400 error). Fallback built in Phase 6 |
| 4 | A public link runs up costs | Phase 1 (1b, 1f) | Guarded in 1f: Turnstile, per-guest daily limits, the budget guard's monthly ceilings below each provider's limit, and the provider console limits as a backstop. Each paid feature must call the guard as it's built (Phase 2 on). Since the Phase 3 review, failed AI readings count too, as they're still paid for. In 4d, a second looks build started while one was running (which doubled the cost) is prevented: one build at a time per session |
| 5 | Late updates overwrite newer choices | Phase 2 (2c), then Phases 3 to 5 | Handled for notes in 2c: words sequence numbers, merge rules and out-of-order tests. Handled for the item to style around in 3a: every photo has a version, and the database refuses a late result for a replaced one (tested). Feedback and looks follow the same pattern as they're built |
| 6 | The preference check lets a breaking look through | Phase 4 (4a, 4b, 4c) | Handled in 4a to 4c. Phase 4's end-to-end swap test passes in 4c: no high heels across 10 swaps, on phone and desktop sizes. Swaps and looks checked again after a change go through the same checker and gate. Firm preferences are rules checked in plain code on the catalog's details, and a missing detail fails. Every look is checked by those rules again, then judged one at a time, and is published only by a database step that needs a passing check of that exact look on current requirements. The checker eval caught all 16 rule breaks and judged all 21 looks right, including the color cases from Sabine's review |
| 7 | GPT-Live doesn't send the live words notes need | Phase 0 (0e) | Closed: live words arrive (0e) |
| 8 | The voice changes when the stylist drops to voice only | Softened with a matched voice and a spoken line | Accepted |
| 9 | Recognition reads garments wrong | Phase 3 (3b, 3c) | The camera reader check (3c) named the catalog items' type 18 of 20 and color 20 of 20 at camera size, and an item is only named after two frames agree. Handled in 3b: the photo eval had 94% of details right (pass mark 85%) and found every item in two-item photos; uncertain details show To confirm, and any detail can be confirmed by touch or corrected by voice. Catalog photos are cleaner than phone photos, so real photos are checked on Sabine's iPhone |
| 10 | Provider data handling for audio and words | Phase 0 (0f), Phase 2 (2e) | Reviewed in 0f. Tavus publishes no retention period, so each Tavus conversation is hard-deleted when its call ends. Checked with a real call in 2e: Tavus no longer has it afterwards. Notes are deleted at End and within about 40 minutes of going idle |
| 11 | The database is down when a recruiter clicks the link | Phase 1 (1f) and the uptime check | Lower: the database is on Supabase Pro, which doesn't pause |
| 12 | Phone browser quirks | Phase 0 (0f) | Open. Android isn't tested in v1 (accepted risk) |
| 13 | Sample catalog quality and image rights | Phase 1 (1e) | Handled in 1e: one photo style for all 140 products, no real brands, each photo's source recorded, and every photo approved by Sabine |
| 14 | Outside services change quickly | Every phase | Open |
| 15 | The scope is large for one builder | Task groups, and the cut list in progress.md | Open |
| 16 | Looks feel generic or badly matched (the PRD's "fashion relevance" risk) | Phase 4 looks evals, and you reviewing sample looks | Open |
| 17 | People who can't use voice can't use the conversation in v1, because there are no captions or typing and a working microphone is required. This includes people who are deaf, hard of hearing or can't speak, and anyone whose microphone is blocked or broken | The app explains how to turn the microphone on (R6). Captions and typing are future features | Accepted on 19 Oct 2026 |

## 6. Assumptions

| Assumption | Based on | Checked in |
|---|---|---|
| Tavus Starter costs $22 a month, one call at a time, calls up to 10 minutes, with no overage. Sabine's plan shows 120 minutes a month, not the 60 the pricing page showed on 17 Oct 2026, which allows about 12 full video demos a month instead of 6 | Sabine's Tavus account, 18 Oct 2026 | Phase 0 (0c, 0f). Tech spec section 9 and the portfolio goal were updated in 0g |
| Tavus audio-only minutes cost the same as video minutes | Tavus doesn't say. Its billing docs count any open call | Phase 0 |
| GPT-Live costs $0.05 a minute and needs a paid OpenAI account | OpenAI's model page, 17 Oct 2026 | Phase 0 |
| GPT-Live sends live words that the notes reader can use | Confirmed in 0e (session.input_transcript.delta) | Closed |
| Claude Opus 5.5 costs $4 per million input tokens and $20 per million output tokens; Haiku 5.5 costs $0.10 and $0.50 | Anthropic's model table, Oct 2026 | Phase 0 costs |
| A full demo uses about $1.10 of AI with Opus 5.5 for every job | Tech spec section 9 estimate | Measured in 0f: about $0.05 for notes and camera on Haiku 5.5. With looks and checks on Opus, about $0.35. Notes sent twice a second (2c) bring it to about $0.45. Looks and checks get measured in Phase 4 |
| Supabase pauses free projects after 7 days without activity, and a daily job prevents it | Third-party pricing guides | No longer applies: the project is on Sabine's Pro organization (20 Oct 2026) |
| Vercel's free Hobby plan allows this personal, non-commercial portfolio project | Vercel's Hobby plan docs (checked 18 Oct 2026): personal, non-commercial use only, which fits a portfolio project with no money-making. Hobby also limits functions to 5 minutes and keeps runtime logs for 1 hour | Checked in 0b |
| About 150 sample products are enough for three different looks for common occasions | Estimate | Phase 1 (1e) and Phase 4 |
| About 6 full demos a month is enough for job applications | The $40 budget | Phase 7 monitoring |
| Visitors trying the demo can talk out loud and have a working microphone | Recruiters try it on a phone or laptop | Phase 7 monitoring |

### Phase 3 code review (3e, 20 Oct 2026)

Reviewed all Phase 3 code (78 files, about 5,900 lines, apart from docs) at extra-high effort. 15 findings:

| Finding | Outcome |
|---|---|
| A small HEIC photo could claim to be enormous, and it was decoded before its size was checked, enough to exhaust the server's memory | Fixed: the size is checked first, with a test |
| A connection dropping after a photo was kept marked it failed, or left it on Analyzing | Fixed: the photo stays and the page asks the server for its reading, with a browser test |
| Failed or cut-off photo and camera readings weren't counted by the budget guard, though they still cost money | Fixed: every reading's cost counts, with tests |
| On Vercel, a reading could stop if the page closed mid-reading | Fixed: photo and notes readings are registered with after() |
| A repeated "photo has arrived" request re-checked and re-read a kept photo, outside the hourly photo limit, and could replace a wardrobe item's photo | Fixed: a photo or upload is processed only once, with tests |
| Choosing or removing a photo at the same instant as adding one could fail | Fixed: they take the session's lock, as adding does (migration photo_locks), with a test |
| Switch camera restarted the 2-minute camera limit | Fixed: 2 minutes from turning it on, with a browser test |
| Two quick taps on the photo's details could briefly undo the first | Fixed: each change starts from the last one's result |
| The wardrobe question could follow the shopper to another photo | Fixed: it belongs to its photo |
| Wardrobe detail boxes allowed more than the server, giving a technical error | Fixed: the same lengths |
| An extra photo lookup on every send of words | No change: it runs alongside the other lookups, and keeps the stylist right when the shopper switches photos mid-reading |
| Two copies of the photo checking steps | Fixed: one, shared by session photos and Add item |
| Test clean-up listed the photo store all at once | Fixed: one folder at a time |
| "Use this one" caught everyday phrases ("I'd use that for work") | Decision A: only clear requests, with tests. Your final iPhone check then found "use this one" did nothing: speech recognition doesn't always write the exact words. Decision D: punctuation and capitals don't matter, and a short phrase with "this one" or "that one" counts, with tests |
| No way to stop styling with wardrobe items | Decision B: Clear wardrobe items, with a browser test. Your re-check then found it didn't appear after Style with these and Change: the Wardrobe page kept its old state while hidden (rule 11 of the tech spec). Fixed: it's keyed on the saved items, with a browser test of that path |

Also from the plan:
- "Too many connections" (seen in 3c and 3d) turned out to be Supabase's connection limit filling during bursts of test traffic. The tests share the project with the live site, so a shopper could hit it during a test run. Decision C: the photo store tries a busy request again, from the server and from the browser's uploads, and the tests run at most 2 files at once. GitHub's first run of the 3e pull request showed why the browser needs it too: the test's own upload was turned away while two test runs overlapped.
- The "Cannot coerce" server log is gone: a session deleted mid-reading now counts as ended.
- The TEST_PAGE_PASSCODE setting was already gone from .env.local; Sabine deleted it in Vercel.

After the fixes: 254 unit and database tests and 131 browser tests pass, and the photo eval had 93% of details right (pass mark 85%), with every item found in the two-item photos.

Your final iPhone check then found two more problems, both fixed: "use this one" did nothing (decision D), and after Style with these and Change, the Wardrobe page came back with its old state, hiding Clear wardrobe items (it now starts again from what's saved, rule 11 of the tech spec). Your re-checks passed, and Phase 3 was done on 20 Oct 2026.

## 7. Decisions log

Newest first. The agreed files hold the detail.

| Date | Decision | Made by | Recorded in |
|---|---|---|---|
| 21 Oct 2026 | 4d plan, the recommended answers. Q1: Behind the scenes is made from the records the app already keeps (the other option also wrote a separate log, keeping changes like "$500 to $350"). Q2: it's on for everyone, closed until opened (the other option hid it behind a setting). Q3: it starts with which products fit now (the other option left that out) | Sabine | tech spec 1.25, design 1.13 |
| 21 Oct 2026 | 4c plan, the recommended answers. Q1: Swap picks 3 replacements in code and checks them at once, and the first that passes goes in (the other option had Claude pick, about 15 to 20 seconds a swap). Q2: a spoken swap means the look on screen, or the one named, and she asks if it's unclear (the other option always asked). Q3: after a change, the looks on screen are checked again and only those that fail are replaced (the other option built all new looks each time). Q4: she presents new looks in her own words, kept short (the other option was a fixed line) | Sabine | tech spec 1.24, design 1.12 |
| 21 Oct 2026 | 4b, Sabine's review of the sample looks. A preferred or liked color must be in the main piece (the dress or suit, or the top or bottom), not only in the shoes or bag, and burgundy counts as an earth tone while navy doesn't. Shoes and bag go with the outfit's colors, as a stylist would choose them: black goes with many outfits, but black flats with a navy blazer, a burgundy top and a camel skirt don't, and tan or a neutral suits those colors better (a first wording, black only with black or grey clothes, was too strict, Sabine said). A coat or wrap the shopper didn't ask for is never a reason to fail a look. Each look shown has a different dress, or a different top and bottom, so the same dress with other shoes isn't shown twice | Sabine | tech spec 1.23 |
| 21 Oct 2026 | 4b plan, the recommended answers. Q1: a sample looks report to review before looks are on screen (the other option was waiting for 4c). Q2: if fewer than 3 looks pass after 3 tries, those that passed are shown with an explanation (the other option showed none). Q3: the judgment step checks one look at a time (the other option checked all candidates in one call, about half the cost) | Sabine | tech spec 1.23 |
| 21 Oct 2026 | 4a plan, the recommended answers. Q1: setup reads back each Must have and Never ("Read as: …"), and finishing setup confirms them (the other option was a confirm button on each). Q2: "around" budgets allow up to 10% over (the other option treated "around" as "up to"). Q3: a preference that isn't about a product detail is judged by the preference checker (the other option asked the shopper to reword it) | Sabine | tech spec 1.22, design 1.11 |
| 20 Oct 2026 | Phase 3 code review. A: "use this one" hears only clear requests ("use this one", "use that one", "use this", "capture", "take a photo or picture", or "this one" on its own), rather than leaving the broader phrases from the 3c fix. B: with nothing ticked, Style with these becomes Clear wardrobe items (the other option was a Remove link in the notebook). C: the photo store tries a busy request again, rather than a separate Supabase project for tests (about $10 a month more) or leaving it. D, after the final iPhone check: "use this one" ignores punctuation and capitals and accepts a short phrase with "this one" or "that one" (the other option was the broader 3c rule) | Sabine | tech spec 1.21, design 1.10 |
| 20 Oct 2026 | 3d plan, the recommended answers. Q1: Add item uploads a photo on the Wardrobe page, and the photo reader suggests its details (the other option sent the shopper to a session). Q2: Style with these shows the chosen items in My Styling Notes under From your wardrobe and tells the stylist; they stay chosen until changed (the other option only remembered them for Phase 4). Q3: the Wardrobe page is linked from the session page and the welcome-back screen until the app menu, which is added to Phase 7 (7a) because no task built it (the other option was building the menu in 3d) | Sabine | tech spec 1.20, design 1.9, progress.md (7a) |
| 20 Oct 2026 | 3d: wardrobe items join the app's own records (decision A), written only by the server, so a photo path can't point at anything unchecked. The stylist is now told the session's context as each call starts, not only after the first change | Claude, in the 3d build | tech spec 1.20 |
| 20 Oct 2026 | 3c plan, the recommended answers. Q1: "use this one" is heard by plain code in the page (instant and free) rather than the notes reader (more ways of saying it, but slower while the shopper holds the item still). Q2: the camera turns off after Capture, so the stylist talks about the captured photo rather than naming the camera item and the photo one after the other | Sabine | tech spec 1.18, design 1.8 |
| 20 Oct 2026 | 3b plan, all recommended answers. Q1: once a photo is read, the stylist speaks up, naming the item and asking which one or whose it is (R29 says she asks). Q2: the photo eval uses 20 sample catalog photos plus 4 two-item photos made from them: free, rights-safe, with the right answers from the catalog, though cleaner than real phone photos (the other options were about $0.65 of generated "phone photos", waiting for November's OpenAI allowance, or Sabine's own photos kept private). Q3: what the shopper says about the photo reaches it through the notes reader in the same reading, checked with the notes eval (the other option was a second small reading, about 2 cents more a demo) | Sabine | tech spec 1.17, design 1.7 |
| 20 Oct 2026 | 3b: the photo's matching area isn't outlined in v1, because the photo reader's positions aren't reliable enough to draw. The design asks for an outline only when the position is known | Claude, in the 3b plan Sabine approved | design 1.7 |
| 20 Oct 2026 | 3a plan, all recommended answers. Q1: the browser sends a photo straight to the private photo store with a one-time upload link, and the server then checks and cleans it, because Vercel refuses anything over 4.5 MB and the agreed limit is 10 MB (the other option was shrinking photos in the browser, which would have left the 10 MB check to the browser and couldn't shrink HEIC in Chrome). Q2: Add a photo sits in My Styling Notes, where Style around this item appears, once the conversation has started. Q3: up to 5 photos per session. Q4: photos of sessions that ended from being idle are deleted on the next Start conversation or by the daily job, at most a day later, because the database timer can't delete files and Vercel's free plan only runs daily jobs | Sabine | tech spec 1.16, design 1.6 |
| 20 Oct 2026 | Phase 2 code review: A, split the session screen's code now, before the camera joins it (recommended). B, a call a closed browser left behind is counted until the shopper's last activity plus the 30 seconds Tavus waits, rather than its whole reserved time (Claude recommended the whole time, which can't undercount; Sabine chose the estimate, accepting it can undercount a call left running with nobody there) | Sabine | tech spec 1.15 |
| 20 Oct 2026 | 2e plan: idle sessions are ended and their notes deleted by a database timer every 10 minutes (Supabase Cron), not just by the daily job (Q1). Time left and Time is up are checked by automated tests with a sped-up clock, and the iPhone check covers reconnecting and End, to save 10 Tavus minutes (Q2) | Sabine | tech spec 1.14 |
| 20 Oct 2026 | 2e: the fonts come from the Fontsource packages instead of Google at build time, because the Google download had started failing builds (on GitHub twice in 2c, then every local build in 2e). Moved forward from the 2f list, since it blocked testing | Claude, recorded for Sabine | tech spec 1.14 |
| 20 Oct 2026 | 2d plan: saved preferences in the notebook aren't tappable until Profile and privacy exists in Phase 6 (Q1), and the shopping, style and budget from setup stay in a small From your profile section under the notebook until then (Q2) | Sabine | design 1.2 |
| 20 Oct 2026 | 2c, note speed: option 3. The notes reader runs Haiku 5.5 with thinking off, readings overlap, and words are sent about twice a second. It was the only setup tested that met R17. The agreed setup (low effort, once a second, one reading at a time) got 35 to 57% within 2 seconds. Notes cost about 14 cents a demo instead of about 6 | Sabine | tech spec 1.12 |
| 20 Oct 2026 | 2c plan: a clear voice correction keeps the note's status, so a confirmed budget stays confirmed when changed to $350 (Q1). At most 12 notes a session, saved preferences not counted, with one place kept for the budget (Q2) | Sabine | tech spec 1.12, core/notes/merge.ts |
| 20 Oct 2026 | 2b: the stage shows only controls that work. Camera joins in Phase 3 and Voice only (with More on phones) in 6c, instead of disabled buttons that do nothing | Sabine | progress.md (2b) |
| 20 Oct 2026 | 2b: the three tap-to-try phrases are the wedding example (R18), a job interview next week (smart but comfortable, under $300) and a friend's birthday dinner on Saturday (relaxed, nothing too bright) | Sabine | lib/sample-phrases.ts |
| 20 Oct 2026 | 2b: the phones' pinned bar (a live circle of the stylist, Mute and the notes count) is built in 2d with the notebook, since it shows the notes count | Sabine | progress.md (2d) |
| 20 Oct 2026 | 2b: on phones, Mute and End sit right under the stage and the sample phrases below them, so End is always within reach | Claude | components/session/stylist-stage.tsx |
| 20 Oct 2026 | 2a builds the Tavus and fake engines. The 2a task's "text engine" was left over from before text only was removed (19 Oct), and the voice-only engine (GPT-Live) stays in 6c | Sabine | progress.md (2a) |
| 20 Oct 2026 | Until voice only arrives in 6c, when the video stylist is unavailable (another visitor on a call, or the month's video minutes used), the app says so and the conversation doesn't start | Sabine | tech spec 1.10 (4.1) |
| 20 Oct 2026 | Phase 1 code review, decision A: from Phase 2, the records only the app should change (session state, looks, check results, the bag) are read-only for visitors, and the server writes them with the server key after checking the session is theirs. Built as each feature arrives | Sabine | tech spec 1.8 (6), progress.md (2a) |
| 20 Oct 2026 | Phase 1 code review, decision B: AI calls at the same moment may run a few cents over the AI limits. No change, because the monthly ceilings sit below the provider limits | Sabine | tech spec 1.8 (6) |
| 20 Oct 2026 | 1f limits: per guest per day, 10 minutes of conversation and $1 of AI; per month for the whole demo, 110 minutes of video (10 of Tavus's 120 kept for testing), $12 of Claude and $4 of OpenAI, each below its console limit. Days and months count in UTC. Each limit is a Vercel setting | Sabine | tech spec 1.7 (6) |
| 20 Oct 2026 | The server key is also used by the budget guard, so only the server writes usage records and visitors can't fake or inflate them. It never reaches the browser | Sabine | tech spec 1.7 (6) |
| 20 Oct 2026 | A guest's last-active time is updated on every page visit (at most once an hour), so "7 days without use" means 7 days without a visit, not 7 days without saving setup | Sabine | tech spec 1.7 (7) |
| 20 Oct 2026 | The daily job runs at 08:00 UTC, deletes only anonymous guests and test guests, removes test guests a crashed run left behind once they're a day old, and keeps deleted guests' usage rows (without the guest) so monthly totals stay right | Claude | tech spec 1.7 (7) |
| 20 Oct 2026 | 1e image generator: only OpenAI's generator was tested (no Google key), comparing its two quality settings on the same 10 products. Setting A (medium quality) won: the same look on a phone for about a quarter of the cost of high | Sabine | tech spec 1.6 |
| 20 Oct 2026 | The other 130 photos were made with OpenAI's half-price Batch API (about $3.50, done in about an hour instead of the 24 hours allowed). Sabine added $5 of credit and raised the OpenAI limit to $10 for it, to go back to $5 afterwards | Sabine | tech spec 1.6 |
| 20 Oct 2026 | The sample catalog has 140 products (76 womenswear, 64 menswear), within the "about 150" default. It covers the example conversations (emerald dresses, shoes from flat to 12 cm heels) and three looks for common occasions across budgets | Claude, within the agreed default | catalog/products.json |
| 20 Oct 2026 | Photos are 800 px JPEGs served from the site itself (public/catalog, about 13 MB in the repository) rather than a storage bucket: free to serve, fast, and versioned with the code. They skip the per-page security step, which only pages need. The catalog is loaded by a script (npm run catalog:load) from catalog/products.json and catalog/image-sources.json, not by a database migration, and it refuses any photo Sabine hasn't approved | Claude | tech spec 1.6 (4.3) |
| 20 Oct 2026 | The photo review page is a private page in Sabine's Claude account rather than a passcode page in the app, so no review code ships with the app. Her answers are copied into catalog/image-sources.json with each photo's source | Claude | catalog/scripts/apply-review.mjs |
| 19 Oct 2026 | Scope change: no word-for-word transcript or captions on screen, so the stylist's voice and My Styling Notes are the only output. My Styling Notes becomes a free-form notebook with no fixed fields, where the stylist jots down any relevant details. Typing to the stylist is out of scope for v1, to be reviewed in a future version. A working microphone is required: without one, the shopper can't use the app | Sabine | product spec 1.4 (R6, R10, R11, R15), design 0.7, tech spec 1.2, progress.md |
| 19 Oct 2026 | Defaults accepted with the scope change: notes are confirmed or removed by touch, with Undo, and changed by voice. Uncertain notes are jotted in pencil as To confirm. The details looks need are read in the background. Feedback is jotted under its look. Text only mode is removed, so the conversation pauses or ends with notes and looks kept. Tap-to-try phrases work only once the conversation is running | Sabine | product spec 1.4 (R13, R14, R16, R20, R47, R70) |
| 19 Oct 2026 | Accepted trade-off: with no captions and no typing, people who are deaf, hard of hearing or can't speak can't use the conversation in v1. Captions and typing are listed as future features | Sabine | product spec 1.4 (R67, section 9), risk 17 |
| 19 Oct 2026 | The portfolio package (a recruiter README, an architecture diagram, an evaluation defined before measuring, simple standard-library checks, a one-page case study PDF and a private portfolio kit) is built in Phase 7 (7b), once the app exists, not now on Phase 0 test pages. interview-notes.md becomes private: kept on Sabine's Mac and no longer tracked in the public repository (its earlier versions stay in the history) | Sabine | progress.md (7b), CLAUDE.md, .gitignore |
| 20 Oct 2026 | design.md agreed as version 1.0, so the design system (1c) is built from it | Sabine | design.md 1.0 |
| 20 Oct 2026 | 1b: automated tests use the Supabase server key to create test guests, because bot protection blocks normal sign-in. The Phase 0 test pages stay, behind the passcode, until Phase 2's session screen replaces them | Sabine | tech spec 1.5 |
| 20 Oct 2026 | One Supabase project, ai-personal-stylist, in Sabine's Pro organization ($10 a month), shared by development and the live site until launch. Sabine's organization was already on Pro, so new projects cost about $10 each. She first chose a new free organization, then two Pro projects, then one; the spare project was deleted. The running budget is now about $50 a month | Sabine | tech spec 1.4 |
| 19 Oct 2026 | Phase 0 gate (0g), all recommendations approved: keep video for the whole conversation; keep GPT-Live with the quartz voice; keep the budget at about $40 and the Anthropic limit at $15 until Phase 4 measures looks; live notes are accurate but below the 2-second target, so Phase 2 closes the gap with the target unchanged; TQ3: Haiku 5.5 for live notes and the camera, Opus 5.5 for the photo reader, looks and checks | Sabine | tech spec 1.3 |
| 19 Oct 2026 | A confirmed note always stays in My Styling Notes until the shopper removes it by touch or changes it by voice. The notes reader may never drop it (R16, R22) | Sabine, after demos 1 and 2 | Phase 2 (2c, 2d), and the /test/demo page |
| 19 Oct 2026 | Voice-only voice: OpenAI "quartz" (Australian, feminine), the closest to Anna | Sabine | progress.md (0e) |
| 18 Oct 2026 | Android phones aren't tested in v1, because no Android phone is available. Testing covers an iPhone with Safari and a laptop with Chrome. Accepted risk: Android-only problems with permissions or the back camera could reach visitors. Claude recommended a friend's 5-minute check before launch instead | Sabine | progress.md (0f, 7c). Tech spec section 8 to be updated in 0g |
| 18 Oct 2026 | Hard-delete each Tavus conversation when the session ends, because Tavus publishes no retention period. Notes and preferences are unaffected, since they live in our own database | Sabine | progress.md (2e), mvp.md section 8 |
| 18 Oct 2026 | Direction for TQ3 (final decision in 0g): for live notes, accuracy matters more than speed, and Sonnet 5.5 is too expensive | Sabine | docs/mvp.md spike results |
| 18 Oct 2026 | Stylist face (TQ5): Anna - Casual (Tavus stock face rc9cff32ceba, Phoenix 4.5, one of Tavus's Pro faces) | Sabine | tavus/stylist-pal.json |
| 18 Oct 2026 | 0b plan approved: public repository ai-personal-stylist, commits use the GitHub no-reply email, and the PRD and backlog files stay out of the repository until the About page is built (Phase 7) | Sabine | progress.md (0b) |
| 18 Oct 2026 | Adding keys to Vercel moved from 0a to 0b, because it needs the Vercel project. Vercel gets its own keys (stylist-vercel), separate from the local ones (stylist-local). OpenAI's cap is the $5 prepaid credit with auto-recharge off | Sabine | progress.md (0a, 0b) |
| 18 Oct 2026 | Tavus starts on the Starter plan ($22 a month) from Phase 0 instead of Free, so test demos can run the full 10 minutes. The monthly budget is unchanged, and the Tavus cost starts earlier | Sabine | progress.md (0a, 0f, 7c) |
| 18 Oct 2026 | Plan files live in docs/. CLAUDE.md sets how Claude works. Interview notes and the Memory site were added | Sabine | CLAUDE.md |
| 18 Oct 2026 | Tech spec agreed with the recommended answers to TQ3 to TQ6: Opus 5.5 for every AI job until Phase 0 measures, the "demo is resting" message, the stock face picked in Phase 0, and a public repository | Sabine | tech spec 1.0 |
| 18 Oct 2026 | Monthly budget of about $40: Tavus Starter plus about $18 of AI use, with spending limits on every provider (TQ2) | Sabine | tech spec |
| 18 Oct 2026 | Video for the whole 10-minute conversation. Voice only is used only when something goes wrong | Sabine | product spec 1.2 (R13) |
| 18 Oct 2026 | Soften the voice change with a matched voice and the line "I'm switching to voice only, so I'll sound a little different." | Sabine | product spec 1.1 (R9), tech spec 4.2 |
| 18 Oct 2026 | Tavus full pipeline for video, GPT-Live for voice only, our server for text only, to keep costs lower (TQ1). Text only was removed on 19 Oct 2026 | Sabine | tech spec |
| 18 Oct 2026 | Product spec agreed | Sabine | product spec 1.0 |
| 17 Oct 2026 | The video stylist and the live camera are in v1 (Q1, option B) | Sabine | product spec |
| 17 Oct 2026 | One-tap guest access with a sample profile (Q2, option A) | Sabine | product spec |
| 17 Oct 2026 | Defaults accepted with the product spec: a web app, US English and US dollars, guest data kept 7 days, about 150 sample products, the demo bag shown publicly, and the Behind the scenes panel | Sabine | product spec |
| 7 Oct 2026 | Retailer-independent MVP with ASOS and FARFETCH shortlisted and deferred, a rights-safe sample catalog, and no purchasing until an approved retailer | Sabine, PRD v1.8 | product spec section 11 |
| 7 Oct 2026 | My Styling Notes, feedback refinement, item photos in the notebook and the preference check are must-haves, with one photorealistic female stylist | Sabine, PRD v1.8 | product spec section 11 |
| 7 Oct 2026 | The Rakuten inquiry about ASOS feeds is drafted but must not be sent until Sabine says so | Sabine, PRD v1.8 | backlog X02 |

## 8. Spike results (Phase 0)

Filled in during task group 0f.

| Test | Pass mark | Result | Date | Notes |
|---|---|---|---|---|
| Video start time | 5 seconds or less | Fast, by Sabine's eye on an iPad. The exact seconds get measured in the 0f test demos | 18 Oct 2026 | Test page event log |
| Video start time in the app (2a) | 5 seconds or less | About 15 seconds from tapping Start conversation to the stylist's video, in one automated test call from a Mac (headless Chrome, a fake microphone). On Sabine's iPhone in the 2a check: **about 4 seconds, pass**. The slower test-browser time was most likely its setup (a headless browser with a fake microphone) | 20 Oct 2026 | One real Tavus call in a test browser, then Sabine's iPhone check |
| Stylist stops when interrupted | Half a second or less | Works by voice and button. The button path took 0.7 seconds, including the network | 18 Oct 2026 | Talking over her felt immediate to Sabine. A precise voice timing comes in 0f |
| Lip sync | Looks natural to Sabine | "As natural as we can expect" | 18 Oct 2026 | Anna - Casual, Phoenix 4.5 |
| Tavus live words for notes | Shopper's words arrive while speaking | Yes: conversation.utterance.streaming carries role "user" partial text while the shopper speaks | 18 Oct 2026 | The stylist replied about 1.3 seconds after the shopper stopped |
| Live notes on Opus 5.5 | 95% within 2 seconds | Fail on speed: 10% within 2 seconds (95th percentile 4.0 s, each call about 2.5 s). Pass on accuracy: all 30 notes right, including R18 and the $350 correction. Cost $0.75 for the 11 test sentences | 18 Oct 2026 | Effort low, structured output. Rough estimate: about $2.70 of notes per 10-minute demo if the shopper talks half the time, against $0.60 in the tech spec |
| Live notes on Haiku 5.5 | 95% within 2 seconds | Fail, but close: 83% within 2 seconds (95th percentile 2.9 s, each call about 1.3 s). Less accurate: it dropped "outdoor" from the R18 occasion, marked the $500 budget To confirm, and missed the $350 correction. Cost $0.02 for the same sentences | 18 Oct 2026 | Same prompt as Opus. Rough estimate: about $0.07 of notes per demo. Options for 0g: Haiku with a tuned prompt, plain code for money and dates (already planned in 2c), or both |
| Live notes on Haiku 5.5 at medium effort (extra run you asked for) | 95% within 2 seconds | Fail: 53% within 2 seconds (95th percentile 2.6 s, each call about 1.7 s). Caught the $350 correction this time, but its final wedding notes still dropped "outdoor" and marked emerald green To confirm. Cost $0.02 | 18 Oct 2026 | Every other run used low effort. More thinking made Haiku as slow as Sonnet at low effort, without matching Sonnet's accuracy |
| Live notes on Haiku 5.5, improved (option B, you asked for it) | 95% within 2 seconds, and accuracy first | Accuracy: every final note right in 4 runs (30 of 30 twice on the main sentences, 12 of 12 twice on 5 held-out sentences written before tuning), and R18 passes. The old Haiku reader got 29 of 30 and 11 of 12 in the same session. Speed: 75% to 90% within 2 seconds (95th percentile 2.1 to 2.9 s). Cost about $0.02 per main run | 18 Oct 2026 | Low effort. Better instructions with examples, plus plain code that reads money and dates (spikes/notes-speed/notes-reader-v2.mjs). About $0.07 of notes per demo. Still a small test (42 notes), so Phase 2's 30-utterance eval is the real check |
| Live notes on Sonnet 5.5 (extra run you asked for) | 95% within 2 seconds | Fail on speed: 53% within 2 seconds (95th percentile 3.1 s, each call about 1.7 s). Pass on accuracy: all 30 notes right, including R18 and the $350 correction. Cost $0.37 for the 11 test sentences | 18 Oct 2026 | Same prompt and settings. Rough estimate: about $1.35 of notes per demo |
| GPT-Live live words | Available | Pass. The shopper's words arrive while they speak (session.input_transcript.delta). Sending notes mid-call (session.thinking.append), talking over the stylist and the scripted switch line (session.instructions.append) all worked | 19 Oct 2026 | Sabine on her iPhone. The session must use delegation type "client", because OpenAI rejects null |
| Camera naming time | A few seconds | Pass. Haiku 5.5: about 1 second (0.7 to 1.3 s). Opus 5.5: about 1.5 to 2 seconds (up to 3.2 s). Accuracy needs work on both: Sabine showed an avocado earbud case, a camo Herschel pouch and a black quilted tote bag, and both models sometimes called the quilted tote a "quilted jacket" that wasn't there. Haiku also once called the tote brown and once replied in a full sentence. Opus wobbled between charcoal and dark gray | 18 Oct 2026 | One frame every 2 seconds, 640 px, low effort, iPhone back camera. Rough cost for 2 minutes of camera: under 1 cent on Haiku, about 18 cents on Opus. Phase 3 needs the R28 confirm step, plus a rule to only name an item after the same answer on two frames in a row |
| Live notes in the app (2c), the 30-sentence eval | 95% within 2 seconds, at least 90% right | Five setups compared (each run about 4 to 10 cents). The agreed setup (Haiku 5.5 at low effort, words once a second, one reading at a time): 94 to 100% right, but only 35 to 57% within 2 seconds. About half of each reading was Claude thinking before it answered. With thinking off, readings overlapping and words twice a second (option 3): **96 to 99% right, 97 to 99% within 2 seconds over three runs, pass** (95th percentile 1.9 seconds) | 20 Oct 2026 | Thinking off at first repeated notes and inked notes nobody confirmed, so two code rules were added: repeated notes fold into one, and ink by voice only answers the stylist. Running setups side by side slowed Claude, so the final runs were one at a time. On Sabine's iPhone the notes felt quick |
| A second Tavus call during the first | Behavior understood | Refused within 2 seconds: HTTP 400, "User has reached maximum concurrent conversations" | 18 Oct 2026 | Phase 6 can catch this exact error and switch to voice only |
| iPhone Safari and laptop (Android dropped for v1) | All work | Pass: the microphone prompt, sound after a tap, video and the iPhone's back camera all worked | 19 Oct 2026 | On the /test/demo page |
| AI cost per demo | About $1.10 or less | Pass. Three 10-minute demos on /test/demo (video, jotted notes on improved Haiku 5.5, camera): Claude cost $0.049, $0.050 and $0.060 for notes and camera, about $0.05 a demo. Video used 10.1 minutes each (30.3 of the 120 Starter minutes, about $1.84 of the plan per demo). OpenAI: none, because voice only wasn't needed. Looks and checks aren't built yet; the tech spec estimates about $0.30 for them, so the full AI cost should be about $0.35 a demo | 19 Oct 2026 | Notes quality to tune in Phase 2: demos jotted 16 to 22 notes, some wordy or not really preferences ("Skiing is top priority", "Denim at black-tie party?"). A note cap, merging and a no-questions rule are needed. Confirmations held after the 19 Oct fix (4 confirmed in demo 3) |

### Provider data handling (0f, risk 10)

Checked 18 Oct 2026 against each provider's own pages. These change, so check again before launch (7c).

| Provider | What it receives from a shopper | Trains AI on it? | How long it keeps it | Our settings |
|---|---|---|---|---|
| Tavus (video stylist) | The shopper's voice and the conversation transcript. Never the camera | Its pricing page says it doesn't train on customer data, but its terms let it use customer content to "maintain and improve" its services | No period is published for conversation data. Zero data retention is Enterprise only | Recording off, perception off, camera never sent. Tavus offers a hard delete of each conversation |
| OpenAI (voice only, GPT-Live) | The shopper's voice and transcript, only in voice-only mode | No (API data isn't used for training) | Up to 30 days in abuse-monitoring logs. Sessions aren't stored by default | `store` left off |
| Anthropic (notes, photos, camera, looks) | Transcript text, photos and camera frames | No (commercial terms) | Deleted within 30 days. Up to 2 years if flagged for a usage policy breach | Our server keeps only the resulting notes and confirmed photos, never frames or transcripts |

**Gaps to close**
- Tavus publishes no retention period for API conversations. Decided 18 Oct 2026: hard-delete each Tavus conversation when the session ends (built in 2e).
- Tavus's terms make us responsible for any consent its processing needs. The microphone permission card (R6) should say plainly that the voice is processed by Tavus, or by OpenAI in voice only.
- For Phase 6 security: limit which events the browser may send on the GPT-Live data channel, so only our server can feed the stylist facts.

**Draft for the About page (for Sabine's review)**

> **Your data in this demo.** Your voice goes to Tavus, which runs the video stylist, or to OpenAI if the stylist switches to voice only. Your words, photos and camera frames go to Anthropic's Claude, which writes your notes and builds your looks. None of these services train their AI on what you share here. OpenAI and Anthropic delete it within 30 days, and we ask Tavus to delete each conversation when it ends. Calls are never recorded, and your camera is never sent to the video service. This app keeps only your notes, your saved looks and the photos you choose to save, for 7 days without use, and you can download or delete everything at any time.

Sources: [Tavus privacy policy](https://www.tavus.io/privacy-policy) (12 Nov 2025), [Tavus terms](https://www.tavus.io/terms-of-service) (24 Apr 2025), [Tavus pricing](https://www.tavus.io/pricing), [Tavus Delete Conversation](https://docs.tavus.io/api-reference/conversations/delete-conversation), [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data), [Anthropic data retention](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data) (1 Jul 2026).

### Phase 0 code review (0h, 19 Oct 2026)

Reviewed all Phase 0 code (app, lib, tests, scripts, spikes, tavus) at high effort. 10 findings:

| Finding | Outcome |
|---|---|
| A confirmed note corrected by voice could stay on screen next to its replacement | Fixed: a new note of the same kind replaces it |
| A budget note could lose its id and appear twice | Fixed: a new budget note reuses the old one's id |
| Tapping End call could run the ending twice and zero the demo summary | Fixed |
| A cut-off or refused AI answer crashed that notes reading | Fixed: "Notes paused" instead, with tests |
| A second demo kept the first demo's camera item | Fixed |
| The 2-minute camera timer wasn't cleared | Fixed on both camera pages |
| No limit on passcode guesses | Fixed for now: each wrong guess waits 1.5 seconds. Real rate limits come in 1b |
| Note state is patched in the browser on top of whole-list rewrites | Left on purpose: Phase 2 (2c) builds server-side notes with changes by id |
| Camera and fetch code copied between test pages | Left on purpose: the test pages are throwaway |
| Money parsing copied into the 0d spike reader | Left on purpose: the spike stays as the record of what was measured |

After the fixes: 14 automated tests pass, and the replay check gives 30 of 30 notes right, with R18 passing.

### Phase 1 code review (1g, 20 Oct 2026)

Reviewed all Phase 1 code (77 files, about 4,600 lines, apart from photos and docs) at extra-high effort. 13 findings:

| Finding | Outcome |
|---|---|
| A visitor could reset their own rate limits by calling the counter with a different window size | Fixed: the counter only deletes counts older than a day, with a test |
| Saving preferences deleted the old list, then saved the new one in a second step, so a failure lost them | Fixed: one database step, all or nothing, with tests |
| GitHub's browser tests skipped every signed-in guest test, because that step had no database key | Fixed: the step gets the key |
| Try the demo could stay on "Starting your demo…" forever when the connection dropped | Fixed: shows "We couldn't start your demo" with Try again, with a test |
| A guest's rows could point at another guest's session, look, preference or check result | Fixed: two-column foreign keys, with a test |
| A setup save that couldn't reach the server showed an error screen | Fixed: "That didn't save" banner, with a test |
| Visitors can write the app's own records (session state, looks, check results, the bag) directly | Decision A: read-only for visitors from Phase 2, written by the server |
| The AI money check and the cost record are separate steps | Decision B: accepted, a few cents at most |
| The daily job deleted guests one at a time and could run past 60 seconds | Fixed: 5 at a time |
| Photos skipped the security step by folder name, which would also catch a future /catalog page | Fixed: skipped by file type |
| The catalog scripts read keys only from .env.local | Fixed: the environment first, then .env.local |
| .env.example missed the Phase 1 settings | Fixed |
| A very large budget showed a developer message | Fixed: "Enter a budget up to $100,000.", with a test |

Your iPhone check after the fixes found one more bug: after Use a sample profile, Edit your profile opened setup with the old empty answers, and finishing setup saved them over the sample profile. Next.js 16 keeps a page's state when you leave and come back, so setup still held what it showed on your first visit. Fixed: setup starts from the saved profile whenever that changes, with a test that repeats your steps (tech spec 1.9, pattern 11). The review also caught one mistake in its own fixes: the first version of the one-step preferences save used a query form PostgreSQL doesn't allow, and the new test found it before it shipped. Turning on the signed-in browser tests on GitHub also showed that Supabase allows only about 30 test sign-ins per 5 minutes from one computer, so the welcome tests now share one test guest per worker. After the fixes: 96 unit and database tests and 40 browser tests pass.

### Phase 2 code review (2f, 20 Oct 2026)

Reviewed all Phase 2 code (64 files, about 4,750 lines, apart from docs) at extra-high effort. 15 findings:

| Finding | Outcome |
|---|---|
| Two ends of the same call arriving together gave its reserved time back twice, which could reset the daily 10 minutes | Fixed: the first end claims the call; the other only ends the session. With a test |
| A call that failed to join was never destroyed, and Daily allows one call per page, so every retry would fail | Fixed in the engine and the session screen, with engine tests |
| Fatal call errors were ignored, so the stage could stay on Reconnecting | Fixed: treated as a dropped call, with a test |
| Notes answers weren't tied to their session: after End, a late one could show old notes or hide a new session's | Fixed: answers for an earlier session are ignored |
| Ink by voice was allowed whenever the stylist had said anything, and her greeting always counts | Fixed: the stylist's question has to name the note, with tests |
| A note removed by touch could come back reworded | Fixed: removed notes block rewordings, with tests |
| The overlapping-readings merge could merge a yes and a no ("Emerald green" and "Not green shoes") | Fixed: the yes/no check, with a test |
| "Below 40 degrees" or "about 30 minutes" became a budget | Fixed: numbers followed by units aren't money, with tests |
| "I may need a coat" was read as May, matched to "Maybe..." | Fixed: May and March only when used as months, matched as whole words, with tests |
| The next question came back from the browser into the stylist's instructions | Fixed: the session keeps its question on the server; the browser sends only a turn label |
| Note touches had no rate limit | Fixed: 4 a second |
| The daily job stopped before deleting old guests if ending one left-behind call failed | Fixed: each step carries on |
| Duplicate helpers and four copies of the note shape | Fixed: one of each |
| The session screen's 590-line component ran the whole call | Decision A: split into the conversation hook and the screen |
| Left-behind calls were counted for their whole reserved time, though the docs said otherwise | Decision B: counted until the last activity plus 30 seconds, with a test |

Your final iPhone check then found that after allowing a blocked microphone again, Try again kept failing: Safari applies a changed microphone setting only after the page reloads. Fixed: a blocked microphone's message says to reload, and its button is Reload page (design 1.5), with a test.

Also in 2f, as planned:
- The Phase 0 test pages, their endpoints and their security exemption were deleted. The Phase 0 jotted-notes reader moved into spikes/notes-speed, where its replay script still uses it.
- The tests now reuse a pool of test guests, so a run signs in a few guests at most instead of about 25.
- GitHub's workflow steps moved to versions that run on Node 24.

After the fixes: 178 unit and database tests and 91 browser tests pass (the Phase 0 test pages' own tests went with them). The notes eval scored 99% right with 94% of notes within 2 seconds, then 96% and 96% on a second run: Claude's speed varies by a few points between runs, so the target holds on average but not on every run. The eval also shows notes sometimes repeating (about 1 sentence in 6) when Claude edits a note so it matches another, because the repeat rules only look at new notes. It's left for later polish.

## 9. PRD backlog map

Where every backlog item from PRD v1.8 lives in the plan.

| Item | What it is | Plan | Status |
|---|---|---|---|
| D01 | Avatar and voice prototype | Phase 0 (0c to 0f) | Planned |
| D02 | Catalog connector contract | Phase 1 (1e) | Planned |
| D03 | Sample catalog | Phase 1 (1e) | Planned |
| D04 | Accounts and style profiles | Phase 1 (1b, 1d) | Planned |
| D05 | Live voice session | Phase 2 (2a, 2b), Phase 6 (6c) | Planned |
| D06 | Photorealistic female stylist | Phase 2 (2a, 2b) | Planned |
| D07 | Styling conversation | Phase 2 (2c), Phase 4 (4c) | Planned |
| D08 | Photo capture and upload | Phase 3 (3a) | Upload built in 3a; capture built in 3c |
| D09 | Live camera item showing | Phase 3 (3c) | Built in 3c |
| D10 | Clothing recognition and correction | Phase 3 (3b) | Built in 3b |
| D11 | Wardrobe | Phase 3 (3d) | Planned |
| D12 | Outfit recommendations | Phase 4 (4a, 4b) | Planned |
| D13 | Visual outfit builder | Phase 4 (4c) | Planned |
| D14 | Voice and touch swapping | Phase 4 (4c) | Planned |
| D15 | Saved outfits | Phase 6 (6a) | Planned |
| D16 | Demo shopping bag | Phase 6 (6a) | Planned |
| D17 | Consent, deletion and retention | Phase 1 (1a, 1f), Phase 6 (6b) | Planned |
| D18 | Accessibility and resilient experience | Phase 7 (7a), and every phase. Typing and captions moved to a future version on 19 Oct 2026 (risk 17) | Planned |
| D19 | Contract tests and usage tracking | Phase 1 (1e, 1f), moved earlier than the PRD's R2 | Planned |
| D20 | End-to-end tests and release gate | Phase 7 (7c) | Planned |
| D21 | Live preference capture | Phase 2 (2c) | Planned |
| D22 | My Styling Notes panel | Phase 2 (2d), as a free-form notebook since 19 Oct 2026 (R15) | Planned |
| D23 | Not specified, To confirm and Confirmed states | Phase 2 (2c, 2d). Simplified on 19 Oct 2026 to To confirm and Confirmed, since a free-form notebook has no empty fields (R16) | Planned |
| D24 | Touch editing | Phase 2 (2d). Since 19 Oct 2026: confirm or remove by touch, and change by voice (R20, R21) | Planned |
| D25 | Voice corrections | Phase 2 (2c) | Planned |
| D26 | Confirmed notes into looks | Phase 4 (4a, 4c) | Planned |
| D27 | Privacy and accessibility for live notes | Phase 2 (2d, 2e), Phase 6 (6b), Phase 7 (7a) | Planned |
| D28 | Live notes acceptance | Phase 2 tests and checks | Planned |
| D29 | Outfit feedback by voice and touch | Phase 5 (5a) | Planned |
| D30 | Feedback and items to keep in the notebook | Phase 5 (5a) | Planned |
| D31 | Refining looks while keeping requirements | Phase 5 (5b) | Planned |
| D32 | Revisions and repeated feedback | Phase 5 (5b, 5c) | Planned |
| D33 | Explaining and comparing revisions | Phase 5 (5b, 5c) | Planned |
| D34 | Feedback acceptance | Phase 5 tests and checks | Planned |
| D35 | Session photos and thumbnails | Phase 3 (3a) | Built in 3a |
| D36 | The item photo in the notebook | Phase 3 (3a) | Built in 3a |
| D37 | Keeping the photo item through refinement | Phase 3 (3a), Phase 5 (5b) | Planned |
| D38 | Notebook photo acceptance | Phase 3 tests and checks | Planned |
| D39 | Saved preference rules | Phase 4 (4a) | Planned |
| D40 | The background preference checker | Phase 4 (4b) | Planned |
| D41 | The single publishing gate | Phase 4 (4b, 4c) | Planned |
| D42 | Preference questions and recovery | Phase 4 (4b), Phase 5 (5c) | Planned |
| D43 | Preference check acceptance | Phase 4 tests and checks | Planned |
| X01 | Compare ASOS and FARFETCH | After v1 | Deferred |
| X02 | Send the Rakuten ASOS inquiry | After v1, only when Sabine says so | Deferred |
| X03 | Negotiate retailer permissions | After v1 | Deferred |
| X04 | An approved retailer connector | After v1 | Deferred |
| X05 | Checkout on retailer sites | After v1 | Deferred |
| X06 | In-app checkout feasibility | After v1 | Deferred |

## 10. Change log

- **1.21 (21 Oct 2026):** 4d decisions (Q1 to Q3).
- **1.20 (21 Oct 2026):** 4c decisions (Q1 to Q4), and the preference check risk's end-to-end swap test passing.
- **1.19 (21 Oct 2026):** 4b decisions (Q1 to Q3), the rules from Sabine's review of the sample looks, and the preference check risk handled by the checker and the publishing gate.
- **1.18 (21 Oct 2026):** 4a decisions (Q1 to Q3), and the preference check risk's 4a progress.
- **1.17 (20 Oct 2026):** The Phase 3 code review (3e): 15 findings and decisions A to D, and what "Too many connections" turned out to be.
- **1.16 (20 Oct 2026):** 3d decisions (Q1 to Q3), wardrobe items written only by the server, and the stylist told everything as a call starts.
- **1.15 (20 Oct 2026):** 3c decisions (Q1, Q2), the camera reader check in risk 9, and D08 and D09 built.
- **1.14 (20 Oct 2026):** 3b decisions (Q1 to Q3), no outline on the photo in v1, risk 9 handled with the photo eval result, and D10 built.
- **1.13 (20 Oct 2026):** 3a decisions (Q1 to Q4), risk 5 handled for the item to style around, and D08, D35 and D36 built.
- **1.12 (20 Oct 2026):** The Phase 2 code review: 15 findings, decisions A and B, and the tidying done in 2f.
- **1.11 (20 Oct 2026):** 2e decisions (Q1, Q2), the fonts from Fontsource, and risk 10 updated.
- **1.10 (20 Oct 2026):** 2d decisions (Q1 and Q2).
- **1.9 (20 Oct 2026):** 2c: your option 3 for note speed and the Q1 and Q2 answers, the notes eval results, risk 2 met in the eval, risk 5 handled for notes, and the per-demo cost at about $0.45.
- **1.8 (20 Oct 2026):** 2b decisions: only working controls, the three sample phrases, the pinned bar moved to 2d, and the controls under the stage.
- **1.7 (20 Oct 2026):** 2a decisions (the engines in 2a, and no conversation when video is unavailable until 6c), and the first measured video start in the app.
- **1.6 (20 Oct 2026):** The Phase 1 code review: 13 findings, 11 fixed, decisions A and B, and the setup bug from your iPhone check.
- **1.5 (20 Oct 2026):** 1f decisions: the budget limits, the server key for usage records, last-active time on every visit, and the daily job's rules. Risk 4 updated.
- **1.4 (20 Oct 2026):** 1e decisions: the image generator and quality setting, the half-price batch, 140 products, photos served from the site, the catalog load script and the private review page. Risk 13 updated.
- **1.3 (20 Oct 2026):** One Supabase project on Pro, the budget about $50, and risk 11 updated.
- **1.2 (19 Oct 2026):** Phase 0 results and the 0g decisions, risks 1, 2, 3 and 7 updated, assumptions checked, and about 12 demos a month.
- **1.1 (19 Oct 2026):** Sabine's scope change: no transcript or captions, no typing to the stylist in v1, a working microphone required, and a free-form notebook. Updated the summary, the in and out lists, the PRD table, the success criteria, risk 17, an assumption, the decisions log and the backlog map to match product spec 1.4, design 0.7 and tech spec 1.2.
- **1.0 (18 Oct 2026):** First version, built from PRD v1.8, backlog v1.8 and the agreed plan files.

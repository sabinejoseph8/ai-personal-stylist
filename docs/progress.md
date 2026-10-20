# AI Personal Stylist: Progress

## Summary

- **Current focus:** Phase 0, task group 0f: the iPhone and laptop check, and 3 full test demos to measure real costs.
- **Current status:** Phase 0 is in progress. 0a to 0e are done. Voice only works with live words, and you picked the quartz voice. In 0f, the data-privacy review is done. Live notes: an improved Haiku 5.5 reader got every note right. The camera names items in about 1 second on Haiku, but both models sometimes mistook a tote for a jacket.
- **Recent changes (19 Oct 2026):** 0e done: voice only passed, and quartz picked as the voice. the portfolio package (a recruiter README, an architecture diagram, an evaluation write-up, simple checks, a one-page case study and a private portfolio kit) was added to 7b, to be built once the app is (decision in docs/mvp.md). interview-notes.md is now private: kept on your Mac, no longer in the public repository.
- **Earlier (18 Oct 2026):** Android phones dropped from v1 testing, and each Tavus conversation is hard-deleted when the session ends (both in docs/mvp.md). 0f: the provider data handling review and an About page draft (docs/mvp.md section 8). 0e: the voice-only and camera test pages, and the camera test results. 0d done: notes speed test with a replay script (spikes/notes-speed). 0c done: Tavus stylist from a config file, passcode-locked test page, and a test that the session endpoint never returns a key. 0b done: public GitHub repository, bare Next.js 16.4 site deployed to Vercel, Vercel keys added. 0a done. You chose Tavus Starter now instead of Free (120 minutes a month), and adding keys to Vercel moved to 0b. Earlier the same day, the plan files moved into docs/. Added docs/mvp.md, CLAUDE.md, interview-notes.md and the Memory site. Split this plan into task groups, with a code review at the end of every phase.
- **What's left:** the rest of Phase 0 (0f iPhone and laptop check and 3 test demos, 0g decisions, 0h code review), then phases 1 to 7.
- **Known issues:** tech spec section 9 still says Tavus Starter has 60 minutes (about 6 demos). It gets updated in 0g. Live notes on Opus 5.5 may cost about $2.70 a demo, not $0.60, which matters for the cost gate in 0g. Open assumptions and risks are tracked in docs/mvp.md.
- **Next action:** a plan for the rest of 0f (iPhone and laptop check, 3 test demos) for your approval.

**How this file works**
- Phases are in build order. The riskiest work comes first, as the tech spec's risk table asks.
- Each phase is split into task groups (0a, 0b and so on). Work happens one group at a time: a plan, your approval, the build, then the checks.
- Tasks marked **You:** need you personally: accounts, payments, keys, choices and reviews. Everything else is build work.
- Before a group counts as done, the phase's automated tests run and you go through its manual checks.
- The last group of every phase is a code review. A phase is done only after the review's fixes are made and its tests pass again.
- Tick a task by changing `- [ ]` to `- [x]`, here and on the [Memory site](https://claude.ai/artifact/Ngtm5cTyekAP1cPikjmhuX), then update the Summary above.
- Requirement numbers (R1 to R72) and checks (S1 to S20) come from the product spec. Risk numbers come from the tech spec.
- **(default)** marks a pass mark or extra I chose. Change any of them.

| Phase | Goal | Task groups | Status |
|---|---|---|---|
| 0 | Prove the video stylist, live notes, voice only and phone browsers, and measure real costs | 0a to 0h | In progress |
| 1 | Foundations: live link, guest sign-in, design system, database, sample catalog, budget guard | 1a to 1g | Not started |
| 2 | Live session and My Styling Notes | 2a to 2f | Not started |
| 3 | Photos, camera and wardrobe | 3a to 3e | Not started |
| 4 | Looks and the preference check | 4a to 4e | Not started |
| 5 | Feedback and refinement | 5a to 5d | Not started |
| 6 | Saving, demo bag, privacy and fallbacks | 6a to 6d | Not started |
| 7 | Polish, accessibility and launch | 7a to 7d | Not started |

---

## Phase 0: Prove the risky parts

**Goal:** Before building the real app, prove that the video stylist, live notes, voice only and phone browsers work well enough, and measure what a demo really costs. The code in this phase is a throwaway test page.

**Status:** In progress

### 0a. Accounts and keys
- [x] **You:** create a Tavus account. You chose the Starter plan ($22 a month: 120 minutes, calls up to 10 minutes) on 18 Oct 2026, instead of Free, so the Phase 0 tests can run full-length demos.
- [x] **You:** create OpenAI and Anthropic API accounts with a small prepaid credit each. GPT-Live needs a paid OpenAI account. Set a monthly spending limit on both. Done 18 Oct 2026: OpenAI $5 credit with a $5 limit, Anthropic $10 credit with a $15 limit, automatic top-ups off on both.
- [x] **You:** put the API keys in a local `.env.local` file yourself. Never paste keys into the chat. Done 18 Oct 2026, and all three keys passed a check. Adding keys to Vercel moved to 0b, because it needs the Vercel project.

### 0b. Project skeleton
- [x] Create the public GitHub repository (TQ6), with a .gitignore that keeps .env files and database backups out of it. Done 18 Oct 2026: github.com/sabinejoseph8/ai-personal-stylist. The .gitignore also keeps out the PRD and backlog files and the Memory site build.
- [x] A bare Next.js project deployed to Vercel, so the test page works on phones over a secure link. Done 18 Oct 2026: Next.js 16.4, live at https://ai-personal-stylist-inky.vercel.app, checked on your phone.
- [x] **You:** add the Tavus, OpenAI and Anthropic keys in Vercel's environment settings, for Production only, using fresh keys named stylist-vercel. Preview deployments get their own low-limit keys later (tech spec section 6).

### 0c. Video stylist test
- [x] Set up the Tavus stylist from a config file in the repository: full pipeline, the **tavus-gpt-5.6-terra** conversation model, perception off, recording off, short timeouts. Done 18 Oct 2026: tavus/stylist-pal.json, applied with `npm run tavus:apply`.
- [x] **You:** listen to 2 or 3 female stock faces tuned for low delay, and pick one (TQ5). You picked Anna - Casual.
- [x] Test page: start a Tavus call from a server endpoint, show the video in our own frame, and print the live words as they stream in. Done: /test/video, locked with your passcode.
- [x] Confirm the three controls: send the stylist context (notes), make it say a scripted line, and interrupt it. All three worked.
- [x] Confirm what Tavus does when a second call starts while one is running (risk 3). Tavus refuses at once with error 400, "User has reached maximum concurrent conversations".

### 0d. Live notes speed test
- [x] Stream the wedding sentence (R18) and 10 other test sentences to a first notes reader on Claude Opus 5.5, and record how long each note takes to appear. Done 18 Oct 2026: all notes right, but only 10% within 2 seconds.
- [x] Run the same test on Claude Haiku 5.5, so TQ3 can be decided with real numbers. Done: 83% within 2 seconds at about a fortieth of the cost, but less accurate. Results are in docs/mvp.md.

### 0e. Voice only and camera tests
- [x] GPT-Live test: start a voice-only call through our server, check that live words arrive for notes (risk 7), and check that our server can feed it facts. Done 19 Oct 2026: live words arrive, and notes, interrupting and the switch line all work.
- [x] **You:** pick the OpenAI voice that sounds closest to the chosen Tavus face, and listen to the switch line in both voices. You picked quartz.
- [x] Camera test: send one frame every 2 seconds to a first camera reader, and record how long it takes to name an item. Done 18 Oct 2026: about 1 second on Haiku 5.5 and 1.5 to 2 seconds on Opus 5.5. Both sometimes mistook the quilted tote for a jacket. Details are in docs/mvp.md.

### 0f. Phones, privacy and costs
- [ ] Try it on an iPhone with Safari and a laptop (Android was dropped for v1 on 18 Oct 2026): the microphone prompt, audio starting after a tap, video, and the back camera (risk 12).
- [x] Review how Tavus, OpenAI and Anthropic store data, and write a short plain summary for the About page (risk 10). Done 18 Oct 2026: findings and a draft summary are in docs/mvp.md section 8.
- [ ] Run 3 test demos (10 minutes each on the Tavus Starter plan), and record Tavus minutes, OpenAI minutes and Claude spend. Compare them with the estimate of about $1.10 of AI use per 10-minute demo.
- [ ] Record the results in the spike results table in docs/mvp.md.

### 0g. Phase 0 decisions
- [ ] **You:** make the decisions in the Phase 0 gate below, using the recorded results.
- [ ] Record your decisions in docs/mvp.md, and in the specs if any agreed decision changes.

### 0h. Code review
- [ ] Code review of everything this phase changed, with fixes made, the automated tests re-run, and the findings explained to you.

**Automated tests**
- A replay script sends the wedding sentence to the notes reader in small pieces, checks that the notes match R18, and prints the time for every update.
- The session start endpoint's response never contains a secret key.

**Manual verification**

| Step | Expected result |
|---|---|
| Open the test page on your phone and tap Start | The video stylist appears within about 5 seconds, and its lips match its voice (S1) |
| Talk over the stylist mid-sentence | Voice and video stop within half a second (S2) |
| Say the wedding sentence | Your words show while you speak, and each note appears within about 2 seconds |
| Start a voice-only call | You hear the matched OpenAI voice, and your words still arrive for notes |
| Hold a jacket up to the camera | Its name appears within a few seconds |
| Start a second Tavus call on another device during the first | You see clearly how Tavus refuses it, so the fallback can be built in Phase 6 |
| Check the three provider dashboards after the test demos | Spending per demo is close to the estimate |

**Phase 0 gate**

| Question | Pass mark | If it fails |
|---|---|---|
| Is the video stylist good enough? | Starts within 5 seconds, stops within half a second, and the lip sync looks natural to you | Launch with voice only and keep video switched off until it passes (product spec Q9) |
| Are live notes fast enough? | 95% of notes appear within 2 seconds | Switch the live jobs to Haiku 5.5 (TQ3), or simplify the notes reader |
| Does GPT-Live send live words? | Yes | Run OpenAI's live transcription alongside it (risk 7) |
| Is the cost per demo acceptable? | About $1.10 or less of AI use per demo | Use Haiku 5.5 for the live jobs, or lower the daily limits |

---

## Phase 1: Foundations

**Goal:** A real app skeleton on the live link, with guest sign-in, the design system, a database with access rules, the sample catalog, the budget guard and automatic tests on every change.

**Status:** Not started

### 1a. Project setup and database
- [ ] Project setup: TypeScript, linting, Vitest, Playwright and axe-core, with GitHub Actions running every test on each pull request.
- [ ] **You:** approve creating two Supabase projects on the free plan, one for production and one for previews and development.
- [ ] Database tables from tech spec section 3 as migration files, with an access rule on every table.
- [ ] Private photo storage with one folder per guest.

### 1b. Guest sign-in and security basics
- [ ] Guest sign-in with Turnstile, and a profile row for every new guest.
- [ ] Security basics: content security policy, camera and microphone allowed only on the session screen, and rate limits.

### 1c. Design system
- [ ] Design tokens from design.md in Tailwind (colors, type, spacing, radius, shadows, motion), the Newsreader and Figtree fonts, and Lucide icons.
- [ ] Base components: buttons, chips, status chips, sheets, dialogs, toasts and the permission card.

### 1d. Welcome and setup
- [ ] Welcome screen (R1, R2) and returning guests (R3).
- [ ] Setup with departments, style words, sizes, default budget and saved preferences (R4), and the sample profile (R5).

### 1e. Sample catalog
- [ ] **You:** compare 10 test images from 2 image generators, and pick one.
- [ ] Write about 150 products across womenswear and menswear, with every detail the checks need (R38).
- [ ] Generate every image. **You:** review them, and approve or reject each one (risk 13).
- [ ] Load products and images with their source recorded.
- [ ] Catalog connector with the shared contract tests (PRD D02, D19).

### 1f. Budget guard and daily job
- [ ] Budget guard and usage table: daily and monthly limits are checked before every paid call (risk 4).
- [ ] Daily scheduled job: delete guests unused for 7 days, close idle sessions, and keep the database awake (risk 11).

### 1g. Code review
- [ ] Code review of everything this phase changed, with fixes made, the automated tests re-run, and the findings explained to you.

**Automated tests**
- Access rules: guest A cannot read or change any of guest B's rows or photos.
- The catalog contract tests pass for the sample connector.
- The budget guard blocks a paid call once the daily or monthly limit is reached.
- End-to-end on phone and desktop sizes: welcome, Try the demo, sample profile and the setup steps.
- The accessibility check finds no serious issues on the welcome and setup screens.

**Manual verification**

| Step | Expected result |
|---|---|
| Open the live link on your phone | The welcome screen says "Sample products only. Nothing here is for sale." |
| Tap Try the demo | Setup opens without asking for an email or password |
| Choose Use a sample profile | The profile shows "Never: high heels" |
| Close the browser and open the link again | You are the same guest, with the same profile |
| Open the link in a private window | You are a new guest with no data |
| Run the catalog check script | It reports about 150 products, all with a photo, a price and every required detail |

---

## Phase 2: Live session and My Styling Notes

**Goal:** Talk with the video stylist and watch My Styling Notes fill in live, with touch and voice corrections, on phone and desktop.

**Status:** Not started

### 2a. Conversation connector and sessions
- [ ] Conversation connector with the Tavus engine, the text engine and a fake engine for tests.
- [ ] Session start, End, the 30 minute idle timeout and resuming (R12), with the engine chosen by limits and availability.

### 2b. Stylist stage
- [ ] Stylist stage with its state in words (R8), voice controls and interruption (R7), captions (R10) and the message box (R11).
- [ ] Microphone permission card and the typing fallback (R6).
- [ ] Sample phrases for visitors (R70).

### 2c. Notes reader
- [ ] Notes reader, with plain code for money and dates, receiving new words about once a second (R16, R17).
- [ ] "Latest word wins" and version numbers on every note (R22).
- [ ] Voice corrections (R21), and the next useful question with quick replies (R19).
- [ ] Context updates, so the stylist always knows the confirmed notes.

### 2d. Notebook
- [ ] Notebook: fields and statuses in pencil and ink (R15, R16), the ink-in motion, collapse and reopen (R23), saved preferences in view (R24), and the empty and paused states (R25).
- [ ] Note editor for each field, with Save, Cancel and input checks (R20).
- [ ] Grouped screen reader announcements (R68).

### 2e. Limits and session endings
- [ ] Time limits and time left (R13), and connection problems (R14).
- [ ] Session-only data deleted when the session ends (R63), including a hard delete of the Tavus conversation (decided in 0f).

### 2f. Code review
- [ ] Code review of everything this phase changed, with fixes made, the automated tests re-run, and the findings explained to you.

**Automated tests**
- Out-of-order replay: a late update never overwrites a newer touch edit or spoken correction.
- Budget parsing: "$500", "under 350", "around 400" and "between 200 and 300".
- Notes eval set of about 30 utterances, including R18: at least 90% correct (default), with 95% of updates within 2 seconds.
- End-to-end with the fake engine: the wedding sentence gives the R18 notes, a touch edit shows "Edited by you", collapsing and reopening keeps everything, and ending the session clears the notes.

**Manual verification**

| Step | Expected result |
|---|---|
| Start a conversation on your phone | The video stylist appears within about 5 seconds (S1) |
| Say the wedding sentence | Notes appear while you talk, Outfit type and Existing wardrobe show Not specified, and the stylist asks "dress or pantsuit?" (S4, S5) |
| Say "Actually, make my budget $350" | The budget changes to Up to $350 and the stylist acknowledges it (S6) |
| Tap Budget, enter $400, tap Save | "Edited by you" shows within 1 second (S7) |
| Collapse the notebook, then reopen it | Every value and status is still there |
| Turn on VoiceOver and correct a note | The change is announced and focus stays where it was (S18) |
| Deny the microphone and type instead | Typing works, and the stylist still answers out loud and on video |

---

## Phase 3: Photos, camera and wardrobe

**Goal:** Shoppers can add an item by photo or on camera, confirm what it is, and save items to their wardrobe.

**Status:** Not started

### 3a. Photo upload and the notebook photo
- [ ] Upload endpoint: check the real file type, a 10 MB limit, resizing, removing location and camera details, private storage and short-lived links (R26, FR-27).
- [ ] Pasted photo under "Style around this item", with an instant preview, Enlarge, Replace and Remove (R27, R31).
- [ ] Versions for the item to style around, so a late result never brings back an old photo (R31).

### 3b. Photo reader
- [ ] Photo reader with To confirm details and corrections (R28), several items in one photo (R29), owned or inspiration (R30), and failure states (R32).

### 3c. Camera
- [ ] Camera view: permission, back camera first, Switch camera, swapping places on phones, and the frame guide (R33).
- [ ] Camera frames to the camera reader every 2 seconds, the item name with Capture, and the still moving into the notebook (R34).
- [ ] The camera turns off after 2 minutes and when the session ends, no video is stored, and upload is offered as the fallback (R35).

### 3d. Wardrobe
- [ ] Wardrobe: photo storage permission, save, a list with filters, edit, delete, and select items to style with (R36, R37).

### 3e. Code review
- [ ] Code review of everything this phase changed, with fixes made, the automated tests re-run, and the findings explained to you.

**Automated tests**
- Uploads reject a renamed non-image file and a file over 10 MB, and saved images carry no location data.
- A late recognition result for a replaced photo is ignored.
- Photo eval set of about 20 photos: at least 85% of details correct (default).
- Access rule: guest B cannot open guest A's photo link.
- End-to-end: an upload shows the photo before analysis finishes, and wardrobe add, edit and delete all work.

**Manual verification**

| Step | Expected result |
|---|---|
| Upload a jacket photo | It appears under Style around this item at once, then its details appear with statuses |
| Confirm the jacket is yours | It is marked "You own this" |
| Turn on the camera and hold up a jacket | "Camera on" shows, the stylist names the jacket, and Capture adds a still to the notebook (S8) |
| Leave the camera on for 2 minutes | The camera turns itself off and says how to turn it on again |
| Deny camera access | The stylist suggests uploading a photo, and everything else keeps working (S10) |
| Save the jacket to your wardrobe | You are asked about photo storage once, then the jacket appears in Wardrobe |

---

## Phase 4: Looks and the preference check

**Goal:** Shoppers get three checked looks that respect every saved preference and confirmed note.

**Status:** Not started

### 4a. Preference rules and candidates
- [ ] Preference rule maker: it turns "no high heels" into a rule the shopper confirms, for example heel height over 5 cm.
- [ ] Candidate filter in code: department, categories, firm rules, sizes and budget.
- [ ] Totals in code, without owned items, compared with the budget (R42).

### 4b. Looks builder and the preference checker
- [ ] Looks builder that proposes up to 5 candidates, each with a reason.
- [ ] Preference checker: rules in code first, unknown details fail, then the judgment step, with decision records (R54 to R56).
- [ ] The single publishing gate: the exact look, current versions and a passing check (R54, R55).
- [ ] Up to 3 retries, then a no-match explanation with choices (R59, R45).

### 4c. Look panels
- [ ] Look panels and item tiles with all their states (R39 to R41, R45).
- [ ] Swap a piece (R43), refresh after a note changes (R44), and "Needs a new check" (R58).
- [ ] The stylist presents new looks out loud.

### 4d. Behind the scenes
- [ ] Behind the scenes panel (R72).

### 4e. Code review
- [ ] Code review of everything this phase changed, with fixes made, the automated tests re-run, and the findings explained to you.

**Automated tests**
- The publishing gate shows nothing without a passing check for that exact look on current versions.
- With "Never: high heels" saved, a look with an unknown heel height fails.
- Totals leave out owned items.
- Checker eval set of about 30 looks: every rule break is caught (default, because this is the core promise).
- End-to-end: with the sample profile, no look shows high heels across 10 swaps (S13).

**Manual verification**

| Step | Expected result |
|---|---|
| Confirm the wedding notes | Three looks appear, each with a total, a reason and "Checked against your preferences" |
| Add your jacket as the item to style around | The next looks include it, labeled "You own this", and it is not in any total (S11) |
| Swap the shoes five times | High heels never appear (S13) |
| Change the budget to $350 | The looks show Updating, then every one fits the new budget |
| Open Behind the scenes | Plain entries show captured notes and check results, including any blocked candidate and why |

---

## Phase 5: Feedback and refinement

**Goal:** Shoppers can react to a look and refine it round after round without losing what they asked for.

**Status:** Not started

### 5a. Feedback capture
- [ ] Feedback reader for likes, dislikes, requested changes and items to keep, sharing the notes reader (R46).
- [ ] Keep and Change buttons on every item (R46).
- [ ] "Feedback on this outfit" section in the notebook (R47).

### 5b. Revisions
- [ ] Revised looks with the Revising status, scoped rejections and kept items (R48, R49).
- [ ] Change summary (R50).
- [ ] Newest wins for revisions (R52), and no surprises (R53).

### 5c. Undo, compare and exceptions
- [ ] Repeat, undo and compare, with a check before an earlier look is restored (R51).
- [ ] Session exceptions: the conflict card, "This session only" and Save to my profile (R57).

### 5d. Code review
- [ ] Code review of everything this phase changed, with fixes made, the automated tests re-run, and the findings explained to you.

**Automated tests**
- "Not these shoes" removes only that pair, while "no high heels" applies to the whole session.
- Kept items stay through 3 rounds.
- A revision built on an old budget is dropped.
- A session exception ends with the session and never changes the profile.

**Manual verification**

| Step | Expected result |
|---|---|
| Say "Keep the dress and bag, show me lower heels", then ask for closed-toe shoes, then make one more change | Only the shoes change, and the dress, bag and budget hold through all three rounds (S12) |
| With the sample profile, ask for high heels | The stylist asks first, allowing it adds a "This session only" note, and the profile still says Never: high heels (S14) |
| Change the budget while a revised look is being built | The look that appears fits the new budget (S15) |
| Tap Undo feedback | The previous look and feedback come back |

---

## Phase 6: Saving, demo bag, privacy and fallbacks

**Goal:** Shoppers can save looks, use the demo bag and control their data, and the stylist keeps going when video is not available.

**Status:** Not started

### 6a. Saved looks and the demo bag
- [ ] Saved looks: save, reopen with a fresh check, and remove (R60).
- [ ] Demo bag: sizes, a check when items are added, owned items blocked, and checkout disabled on screen and on the server (R61, R62).

### 6b. Privacy controls
- [ ] Profile and privacy: permissions, saved preferences, clear this session's notes, download my data, and delete all data (R63 to R66).

### 6c. Fallbacks
- [ ] GPT-Live voice only engine with the matched voice (R9).
- [ ] The switch line at handover, plus the "with another visitor" and out-of-minutes messages (R9, design section 4.1).
- [ ] Text only mode and the full fallback order: video, then voice only, then text only (R13, R14).
- [ ] The "demo is resting" welcome state when the monthly allowance is used up (R13, TQ4).
- [ ] Tavus webhook, so usage is recorded exactly.

### 6d. Code review
- [ ] Code review of everything this phase changed, with fixes made, the automated tests re-run, and the findings explained to you.

**Automated tests**
- Fallback order with fake engines: video, then voice only, then text only, with notes and looks kept at every step.
- Download my data includes saved notes and captured stills, and no audio, transcripts or video.
- Delete all data removes rows, photos and the guest sign-in.
- The bag refuses owned items and items without a passing check, and the server refuses checkout.
- The welcome screen shows the resting state once the monthly allowance is used up.

**Manual verification**

| Step | Expected result |
|---|---|
| Tap Voice only, then turn video back on | The stylist says "I'm switching to voice only, so I'll sound a little different.", continues as a still portrait, then returns to video (S3) |
| Start a conversation on a second device while the first is running | The second gets voice only, with "The video stylist is with another visitor." |
| Leave the camera on for 2 minutes, then download your data | The camera turns itself off, and the download has the still but no video (S9) |
| Add items to the demo bag and try to check out | Checkout stays disabled, and every product says Sample product (S16) |
| Deny the microphone and complete the whole journey | Setup, notes, photo, looks, feedback, saving and the bag all work by typing and tapping (S17) |
| Delete all data | You land on the welcome screen, and starting again shows no old data (S19) |

---

## Phase 7: Polish, accessibility and launch

**Goal:** A polished, accessible demo that stays within budget and that you can share in job applications.

**Status:** Not started

### 7a. Accessibility and performance
- [ ] Accessibility pass: keyboard, screen reader, 200% text, reduced motion, contrast and touch targets (R67 to R69).
- [ ] Phone performance: a fast first load and a smooth notebook animation.

### 7b. Portfolio pages
- [ ] About this project page: the problem, the approach, key decisions and how it was built, written for product manager roles, with links to the PRD, the docs and the code (R71).
- [ ] A README for the code repository, written for AI product manager recruiters: the problem and the user, the architecture diagram, how it works, key design choices and tradeoffs, how quality was defined and measured with real results, limitations stated honestly, skills demonstrated, and setup steps.
- [ ] Record a 2 minute demo video for your portfolio, for anyone who can't try it live (default).
- [ ] Bring interview-notes.md up to date for the launch story. It stays private: on your Mac, never in the repository.
- [ ] Evaluation write-up (docs/evaluation.md). Write down what good looks like before measuring: the S1 to S20 checks, notes accuracy and speed (the Phase 2 eval of 30 utterances, plus the 0d results), the preference check against planted looks that break a rule, and cost per demo. Then measure with a small, repeatable script, report the results with their caveats first, and say what the results changed. The expected answers are written before any run, and a session that has seen them doesn't change the code being measured.
- [ ] Architecture diagram as SVG, PNG and PDF, used by the README, the About page and the case study.
- [ ] Simple automated checks for the portfolio pieces: Python standard library only, one run_all script (docs present, README links work, no em dashes, no secrets or private files in the repository, the case study is one page), and a short run guide (docs/how-to-run.md).
- [ ] A one-page "AI product management case study" PDF, made with headless Chrome and checked to be one page.
- [ ] A private portfolio kit PDF, kept outside the repository: a 2-minute and a 10-minute story, answers to likely interview questions, a reader test and a demo video script.
- [ ] Before publishing: scan the repository for secrets, personal email addresses and private files, and check every README link on GitHub. **You:** approve before anything is pushed.

### 7c. Launch
- [ ] **You:** check the Tavus Starter plan ($22 a month, already chosen in 0a) and set the final spending limits (TQ2).
- [ ] Monitoring: error alerts, an uptime check and a weekly cost check.
- [ ] Full run of S1 to S20 on an iPhone and a laptop. Android phones aren't tested in v1.
- [ ] **You:** ask a friend who has never seen the app to try it from the link (S20).

### 7d. Code review
- [ ] Code review of everything this phase changed, with fixes made, the automated tests re-run, and the findings explained to you.

**Automated tests**
- The accessibility check passes on every screen.
- The full end-to-end suite passes on phone and desktop sizes.
- The welcome screen scores 90 or more for phone performance (default).
- The portfolio checks pass (`python3 checks/run_all.py`), and the evaluation script reproduces the numbers in docs/evaluation.md.

**Manual verification**

| Step | Expected result |
|---|---|
| Run every success check from S1 to S20 | All of them pass |
| Use the whole app with VoiceOver and a keyboard only | Every task can be done |
| A first-time visitor starts from the link on a phone | They reach their first look within 3 minutes, without signing up (S20) |
| Check the provider dashboards after the first week live | Spending is on track for about $40 a month |
| Open the README on GitHub and click every link | Every link works, and a recruiter can see the problem, the diagram, the results and the limits without scrolling far |
| Open the case study PDF | It is exactly one page and its numbers match docs/evaluation.md |

---

## If time runs short

These can move to after launch, but only with your OK, and each one needs a small product spec change:
- The Behind the scenes panel (R72, group 4d).
- The compare view (part of R51). Keep undo.
- Naming items live on camera (part of R34). Keep Capture and photo upload.
- Several photos in one session (part of R31).
- The demo video (group 7b).

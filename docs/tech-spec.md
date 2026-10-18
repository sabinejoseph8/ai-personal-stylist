# AI Personal Stylist: Tech Spec

**Status:** Agreed, version 1.1 (18 Oct 2026)
**Last updated:** 18 Oct 2026
**Builds on:** product-spec.md version 1.3 (agreed) and design.md version 0.6
**Next step:** progress.md turns this agreed spec into a phased build plan. Any later change gets a new version number and a change log entry.

**How to read this spec**
- Plain words first. Technical names are in **bold** so an engineer can find them.
- Requirement numbers (R1 to R72) and checks (S1 to S20) refer to the product spec.
- Facts about outside services (Tavus, OpenAI, Anthropic, Supabase, Vercel) were checked against their own docs and pricing pages on 17 Oct 2026. These services change often, so Phase 0 checks again everything we rely on.
- **(default)** marks a choice I made that you can change.
- TQ1 and TQ2 were answered on 18 Oct 2026 and appear under Decisions. TQ3 to TQ6 were accepted with their recommended defaults the same day.

---

## 1. Architecture overview

**In one paragraph.** The app is a website. The browser shows every screen and holds the live call with the stylist. A small server, made of functions that run on demand next to the website, holds every secret key and makes every decision: what the notes say, which looks to show, and whether a look passes the preference check. The stylist's voice and face come from outside services, plugged in through one swappable connector, so they only speak and listen. They never decide anything.

```
 Shopper's browser (phone or laptop)
 +----------------------------------------------------------------+
 |  Screens: stylist, My Styling Notes, looks, wardrobe, bag      |
 |  Conversation connector                                        |
 |     video mode  ->  Tavus live video call                      |
 |     voice only  ->  OpenAI GPT-Live voice call                 |
 |     text only   ->  our server                                 |
 +-------------------------------+--------------------------------+
                                 |  requests from a signed-in guest
 +-------------------------------v--------------------------------+
 |  Our server (Vercel functions)                                 |
 |  Stylist core                                                  |
 |     notes and feedback reader     photo and camera reader      |
 |     looks builder                 preference checker (gate)    |
 |     session state and versions    usage and budget guard       |
 |  Connectors: AI (Claude), catalog (sample), storage            |
 +----------+---------------------+----------------------+--------+
            |                     |                      |
        Supabase            Anthropic API          Tavus and OpenAI
   database, guest sign-in,   Claude models      start calls, set limits
   private photo storage
```

### 1.1 Main parts

| Part | What it does |
|---|---|
| **Web app** | Every screen in design.md. Runs in the browser. Shows notes, looks and the bag from server data. |
| **Conversation connector** | One interface with three engines: Tavus for video, OpenAI GPT-Live for voice only, and our server for text only. Every engine reports the same events: words heard (partial and final), stylist started or stopped speaking, requests from the stylist, and errors. |
| **Stylist core** | Our own server code, with no outside service inside it. It turns words into notes and feedback, reads photos, builds looks, checks them, and keeps session state with version numbers. It is the single source of truth. |
| **AI connector** | The only place that calls Claude. Each job has its own prompt, model setting and output shape. |
| **Catalog connector** | The only place that reads products. v1 has the sample catalog. ASOS or FARFETCH would be new connectors with the same shape (PRD D02). |
| **Database and storage** | Supabase: guest sign-in, data tables with per-guest access rules, and private photo storage. |
| **Scheduled jobs** | Run daily: delete guest data unused for 7 days, reset daily limits, and keep the database awake. |

### 1.2 How a spoken turn flows (video mode)

1. The shopper talks. Tavus hears it and streams the words to the browser while the shopper is still speaking (**conversation.utterance.streaming**, which covers both the shopper and the stylist).
2. The browser sends new words to the server about once a second, with the note versions it has seen.
3. The notes and feedback reader turns the words into typed updates, for example Budget: up to $500, status Confirmed, source voice.
4. The server applies the "latest word wins" rules (section 5), saves the notes with a new version number, and returns them. The browser inks them in.
5. The server also works out the next useful question (for example "Outfit type: dress or pantsuit?"). The browser shows it as quick replies and passes the notes and the question to Tavus as context, so the stylist knows what to say next.
6. When the occasion and any firm requirements are confirmed (R39), the server starts building looks.

### 1.3 How a look reaches the screen

1. The looks builder collects the inputs: confirmed notes, the item to style around, selected wardrobe items, kept items, feedback, saved preferences and session exceptions.
2. Code filters the catalog first: department, categories needed for the outfit type, firm rules, sizes and budget.
3. Claude composes candidate looks from that short list, by product ID only, each with a one-line reason.
4. Code adds up totals, leaving out owned items.
5. The preference checker tests each candidate (section 5, pattern 6). Only exact candidates that pass, built on current versions, can be published.
6. Published looks appear in the browser. The stylist gets a short summary to present them out loud.
7. If nothing passes after 3 tries, the stylist explains which requirement cannot be met (R59).

### 1.4 Code layout

```
CLAUDE.md            how Claude works on this project
interview-notes.md   the project story, told for interviews
docs/                the plan and project memory: product spec, design, tech spec, progress, MVP scope
app/                 screens and server endpoints
core/                stylist core: notes, feedback, looks, checker, versions, limits
connectors/          conversation (tavus, gpt-live, text), ai (claude), catalog (sample), storage
db/                  database migrations and access rules
catalog/             sample catalog data and the image generation script
tests/               unit, contract, AI evals, end-to-end
```

The **core** folder never imports an outside service directly. That keeps it testable and lets any connector be replaced.

## 2. Technology choices

| Need | Choice | Why |
|---|---|---|
| Language | **TypeScript** everywhere | One language for screens, server and tests, with types that catch mistakes early. |
| Web app and server | **Next.js** (current stable, App Router) | Screens and server endpoints in one project, and first-class support on Vercel. |
| Hosting | **Vercel**, free Hobby plan | One-click deploys, a preview link for every change, daily scheduled jobs, free for personal projects. You already have it connected. |
| Database, guest sign-in, photos | **Supabase**, free plan | Postgres with per-row access rules, anonymous guest sign-in, and private file storage in one service. You already have it connected. |
| Video stylist | **Tavus**, full pipeline (TQ1, your decision) | The PRD's intended avatar. Tavus handles listening, turn-taking, interruptions, voice and face in one call from the browser, which its docs describe as the lowest-latency setup. |
| Joining the video call | **Daily** browser SDK | Tavus calls run on Daily, and the SDK lets us use our own screen design and read live events. |
| Voice only mode | **OpenAI GPT-Live 1** (**gpt-live-1**) | The PRD's intended OpenAI voice layer, built to sit in front of your own logic. $0.05 per minute, billed per second. |
| AI jobs | **Anthropic Claude** through the official TypeScript SDK | Reliable structured output, image understanding, and careful rule following for the preference check. Default model: Claude Opus 5.5 (see 4.4). |
| Input and output checking | **Zod** schemas | Every request and every AI answer is checked against a defined shape before use. |
| Styling | **Tailwind CSS** with the design.md tokens | Colors, type, spacing and radius live in one place, as the design doc lists them. |
| Accessible building blocks | **Radix UI** primitives | Dialogs, sheets, popovers and menus with keyboard and screen reader support built in. |
| Icons | **Lucide** | Simple outline icons with the 1.5 px stroke the design doc asks for. |
| Fonts | **Newsreader** and **Figtree** through Next.js font loading | Served from our own site, so no layout jumps and no calls to Google at runtime. |
| Browser state | **Zustand** | A small, predictable store for live session state and versions. |
| Bot protection | **Cloudflare Turnstile** on Try the demo | Stops bots from creating guests and spending the budget. Supabase supports it for anonymous sign-in. |
| Tests | **Vitest**, **Playwright**, **axe-core** | Fast unit tests, real-browser tests on phone and desktop sizes, and automatic accessibility checks. |
| Sample catalog images | AI-generated product photos, reviewed by hand | Rights-safe images with no real brands (PRD D03). The generator is picked in Phase 1 by testing 10 images. |

## 3. Data model

All tables live in Supabase Postgres. Every table that holds guest data has a **user_id** column and an access rule that limits it to the signed-in guest.

| Table | What it holds | Key fields | Kept for |
|---|---|---|---|
| **profiles** | One row per guest | departments, style words, sizes, default budget (amount, currency, meaning), last active time | Until deleted, or 7 days without use |
| **saved_preferences** | Must have, Never and Likes items | kind, the shopper's words, the matching rule (for example heel height over 5 cm), version | Same as profile |
| **consents** | Separate permissions (R64) | wardrobe photos, remember preferences, camera explained, with times | Same as profile |
| **sessions** | One styling conversation | status, engine (video, voice, text), started and last activity times, versions for notes, feedback, anchor and profile | Ends after End or 30 minutes idle, then the row is closed |
| **session_notes** | The seven notes | field, value, status, edited by you, confidence, source, source turn, update time, version | Deleted when the session ends (R63) |
| **session_feedback** | Likes, Dislikes, Requested changes, Items to keep | look, item or attribute, scope, status, source, version | Deleted when the session ends |
| **session_exceptions** | "This session only" permissions | saved preference, confirmed time | Deleted when the session ends |
| **session_assets** | Items to style around | private photo path, thumbnail path, source (upload or camera), recognized details, ownership, active flag, version | Deleted when the session ends, unless saved to the wardrobe |
| **wardrobe_items** | Saved owned items | photo path, name, category, details | Until deleted by the shopper, or 7 days without use |
| **catalog_products** | The sample catalog | provider ("sample"), department, category, name, colors, style tags, price in cents, currency, sizes, attributes (heel height, sleeve length, coverage, formality), image path, can be bought (always false), availability date (empty) | Permanent |
| **looks** | Every candidate and published look | items (product, wardrobe or photo IDs), total, reason, revision of, input versions, status (building, checking, published, held, needs a new check, saved) | Deleted when the session ends, except saved looks |
| **check_results** | Preference check decisions | look, versions checked, verdict (pass, conflict, needs clarification), reasons per rule and item | Deleted with the session. Holds no transcripts, audio or photos (FR-33) |
| **saved_looks** | Looks the shopper saved | a copy of the look, saved time | Until removed, or 7 days without use |
| **bag_items** | Demo bag | product, size, the check that allowed it | Same as profile |
| **usage** | Time and spending | per guest per day: video seconds, voice seconds, AI cost estimate. Per month: totals | 90 days, with no personal content |
| **event_log** | Behind the scenes entries | session, entry type, plain-language summary, time | Deleted with the session |

What is never stored anywhere we control: raw audio, full transcripts, camera video, and captions. Captions live only in the browser's memory.

## 4. Interfaces between parts

### 4.1 Server endpoints

Every endpoint checks the guest's sign-in, checks the input shape, and checks that the session belongs to that guest.

| Endpoint | Used for |
|---|---|
| **POST /api/sessions** | Start a session. Picks the engine from limits and availability, then returns a Tavus call link, a GPT-Live connection, or text only. |
| **POST /api/sessions/:id/voice** | Exchanges the browser's connection offer with OpenAI for GPT-Live. The OpenAI key never reaches the browser. |
| **POST /api/sessions/:id/end** | Ends the call, records usage, and deletes session-only data. |
| **POST /api/sessions/:id/words** | New words heard. Returns note and feedback updates, the next question and new versions. |
| **PATCH /api/sessions/:id/notes/:field** | A touch edit (R20). |
| **POST /api/sessions/:id/assets** | Upload a photo or a captured still. Returns the asset ID at once, then recognition runs. |
| **POST /api/sessions/:id/camera-frame** | One small camera frame for live recognition (R34). The frame is read and thrown away. |
| **POST /api/sessions/:id/looks** | Build looks. Also swap, refine, restore and compare actions on a look. |
| **POST /api/sessions/:id/exceptions** | Allow a saved preference to be broken for this session (R57). |
| **/api/wardrobe**, **/api/saved-looks**, **/api/bag** | Add, edit, list and delete. Adding to the bag runs the preference check first. |
| **GET /api/me/export**, **DELETE /api/me** | Download my data and delete all my data (R65). |
| **POST /api/webhooks/tavus** | Tavus reports a call's end, so usage is exact. |
| **GET /api/cron/daily** | Clean-up, limit resets and database keep-awake. Only Vercel's scheduler can call it. |

### 4.2 Conversation connector

Every engine implements the same small interface, so the rest of the app never knows which one is running.

- **Commands:** start, end, mute, unmute, send typed text, update the stylist's context (notes, looks, next question), say a short scripted line, interrupt.
- **Events:** words heard (speaker, text so far, final or not, turn ID), stylist started or stopped speaking, stylist request, connection state, error.
- **Tavus engine:** joins the call with Daily. Context goes in through Tavus's context interaction, scripted lines through **conversation.echo**, and interruptions through **conversation.interrupt**, all sent as Daily app messages. Live words arrive as **conversation.utterance.streaming** events. The Tavus setup ("PAL") uses **pipeline_mode: "full"**, a stock female face, perception turned off (the camera stays with us), and recording turned off.
- **GPT-Live engine:** a browser WebRTC call set up through our server. Uses the same stylist instructions. Our core supplies facts and results through GPT-Live's client delegation.
- **Switching to voice only:** GPT-Live uses the OpenAI voice that sounds closest to the Tavus face, picked in Phase 0. When the shopper taps Voice only, the Tavus stylist first says "I'm switching to voice only, so I'll sound a little different." through **conversation.echo**. Then the video call ends and GPT-Live picks up with the current notes and a short recap. If video drops without warning, GPT-Live says the same line as its first words. If video is unavailable from the start (another visitor is using it, or the month's video minutes are used up), the stylist starts in voice only and says why.
- **Text engine:** posts typed messages to our server and shows the reply in the captions.
- **Stylist requests are limited to three:** capture the item on camera, open saved looks, end the session. The stylist never changes notes, looks or the bag itself.

### 4.3 Catalog connector

The same contract the PRD asks for (D02), so a real retailer can be added later.

- **search**(filters), **getProduct**(id), **getAvailability**(ids), **capabilities** (checkout, cart transfer, order tracking).
- Every product has normalized IDs, variants, price with currency, region, image rights, availability time, retailer attribution and purchase link.
- The sample connector reports every capability as off, and "can be bought" is always false (R62).
- One shared contract test suite runs against every connector (PRD D19).

### 4.4 AI connector jobs

Each job has its own prompt, a strict output shape and an effort setting. Claude Opus 5.5 is the default for every job (default). Claude Haiku 5.5 is a much faster and cheaper option for the two live jobs if Phase 0 shows Opus 5.5 is too slow. That switch is your call (TQ3).

| Job | Input | Output | Default model and effort |
|---|---|---|---|
| Notes and feedback reader | New words, current notes, the visible look | Typed note and feedback updates with status and confidence | Opus 5.5, low |
| Camera reader | One small frame | Is one item clearly shown? If so, type, colors, pattern | Opus 5.5, low |
| Photo reader | One photo | Items found, details with confidence | Opus 5.5, low |
| Looks builder | Filtered products, notes, anchor, feedback | Up to 5 candidate looks by product ID, each with a reason | Opus 5.5, medium |
| Preference checker, judgment step | One look plus preferences | Pass, conflict or needs clarification, with reasons | Opus 5.5, medium |
| Text replies and voice-only facts | Conversation so far and current state | A short stylist reply | Opus 5.5, low |
| Preference rule maker | The shopper's words, such as "no high heels" | A structured rule, such as heel height over 5 cm, shown to the shopper to confirm | Opus 5.5, low |

Shared settings: stable prompt parts are cached to cut cost, answers come back as structured output, and refusals use Anthropic's built-in fallback option.

## 5. System patterns

These rules keep the app secure and easy to extend. Each one is enforced in one place.

1. **Every data lookup belongs to the signed-in guest.** Database access rules limit every row to its owner, and server endpoints check session ownership as well.
2. **Secrets stay on the server.** The browser only ever gets short-lived call links and connection answers.
3. **Outside services sit behind connectors.** Conversation, AI, catalog and storage can each be swapped without touching the core.
4. **One source of truth.** The server's session state decides everything. The stylist engines only listen and speak.
5. **Versions on everything, newest wins.** Notes, feedback, the item to style around and the profile each carry a version number. Every request says which versions it was based on, and the server drops results built on old versions. A touch edit or spoken correction always beats a later-arriving update from earlier speech. This covers R22, R48, R52 and R58.
6. **One publishing gate.** A look reaches the screen or the bag through a single function. That function requires a passing check of that exact look against the current versions (FR-30). Rules run in code first: budget, Never and Must have rules, colors to avoid, outfit type, kept items and the owned item. A missing required detail is a fail. Claude then judges only subjective fit, and any uncertainty becomes "needs clarification".
7. **Code for facts, AI for language and taste.** Money, totals, dates, filters and firm rules are plain code. AI answers are always shape-checked before use.
8. **Degrade, never break.** Video falls back to voice only, then to text only. A failed check holds the look. A failed notes reader pauses notes while touch editing keeps working.
9. **Private by default.** Session data is deleted when the session ends. Photos sit in private storage behind links that expire in minutes. Decision records hold versions and reasons only.
10. **Every paid call passes the budget guard.** Before any call to Tavus, OpenAI or Claude, the server checks the guest's daily limits and the monthly limit.

## 6. Security

### Sign-in
- Guests sign in anonymously through Supabase. No email or password.
- Sign-in lives in secure, HTTP-only cookies.
- Turnstile runs invisibly on Try the demo to keep bots out.

### Access
- Database access rules on every table: a guest can only read and change their own rows.
- Photo storage is split into one private folder per guest, with the same rule.
- The server key that bypasses those rules is used only by scheduled jobs and account deletion.

### Secrets
- The Tavus, OpenAI, Anthropic and Supabase server keys live only in Vercel's environment settings. They are never committed and never sent to the browser.
- Preview deployments use separate keys with low limits.

### Checking inputs
- Every endpoint checks its input against a Zod schema.
- Uploads: the file type is checked from its contents, not its name. Files are limited to 10 MB, resized, and re-saved without location or camera metadata (FR-27).
- Shopper words and photos are treated as untrusted. They can only fill note fields. They can never change instructions or trigger actions.

### Rate limits (default)
- Starting sessions: 5 per guest per hour.
- New words: 2 requests per second per session.
- Photos: 10 per guest per hour. Camera frames: 1 every 2 seconds, while the camera is on.
- Building looks: 20 per guest per hour.

### Cost limits
- Per guest per day: 10 minutes of conversation, all with video when it is available (R13).
- Tavus: each call is created with **max_call_duration** set to the guest's remaining conversation time, and **participant_left_timeout** of 30 seconds, so an abandoned call stops at once. The Tavus plan's own minute cap is the final backstop.
- OpenAI and Anthropic: spending limits set in their consoles, plus a monthly ceiling in our budget guard.
- When the monthly allowance runs out, the app falls back step by step (R13). If AI is used up too, the welcome screen says the demo is resting until the 1st of next month (TQ4).

### Privacy
- Recording is off for every Tavus call. Tavus never receives the camera. Frames are read by our server and thrown away.
- The browser sends words to our server to update notes. The server keeps only the resulting notes.
- How Tavus, OpenAI and Anthropic store data is checked in Phase 0 and summarized on the About page.
- Deleting all data removes database rows, stored photos and the guest sign-in.

### Browser protections
- A content security policy only allows connections to our own site, Supabase, Tavus and Daily, and OpenAI.
- Microphone and camera access are only allowed on the session screen.

## 7. Hosting, deployment and configuration

- **Code:** a GitHub repository, public so it can be linked from your portfolio (default). Secrets are never committed.
- **Deploys:** Vercel builds every pull request into its own preview link. Merging to main deploys production.
- **Database:** one Supabase project for production and one for previews and development (the free plan allows two). Table changes ship as migration files in the repository.
- **Scheduled job:** a Vercel cron job runs daily. It deletes guest data unused for 7 days, closes idle sessions, and touches the database so Supabase's free plan does not pause it after a week without activity.
- **Tavus setup:** the stylist's Tavus configuration (PAL, face, conversation model, timeouts) is kept as a file in the repository and applied by a script, so it is versioned like code.
- **Address:** the free vercel.app address for v1 (default). A custom domain can be added later.
- **Switches** (environment settings): video on or off (Q9), camera on or off, Behind the scenes on or off, daily and monthly limits.
- **Monitoring:** Vercel logs and alerts for errors, a usage table for minutes and spend, and a weekly check of provider dashboards.

## 8. Testing approach

- **Unit tests** for the rules that must never break: latest word wins, version checks, budget parsing ("under 350", "between 200 and 300"), totals without owned items, preference rules, and the publishing gate.
- **Contract tests:** the same suite runs against every catalog connector (PRD D19) and every conversation engine, using a fake engine that plays scripted conversations.
- **AI evals:** saved sets of examples with expected answers, run on every prompt or model change. They track pass rate, speed and cost.
  - Notes: about 30 utterances, including the wedding example (R18), corrections, unclear speech and long turns.
  - Checker: about 30 looks, including high heels with "Never: high heels", budget edges, and a missing heel height.
  - Photos: about 20 sample photos with known details.
- **End-to-end tests** with Playwright on phone and desktop sizes. The fake engine replaces live voice, so tests are free and repeatable. They cover the success checks that do not need a real voice (S4 to S20).
- **Accessibility:** automatic axe-core checks in every end-to-end test, plus a manual VoiceOver and keyboard pass before each release.
- **Real-device checks** each phase on an iPhone with Safari, an Android phone with Chrome, and a laptop: video start, interruption, camera, permissions (S1 to S3, S8 to S10).
- **Speed measurements** in Phase 0 and before launch: note updates within 2 seconds at the 95th percentile (R17), the stylist stopping within half a second (R7), and video within 5 seconds (R8).

## 9. Cost estimate

Rough estimates behind the TQ2 budget. Phase 0 measures real numbers.

**One full demo:** 10 minutes, all with video, 1 photo, 1 camera use, 4 rounds of looks.

| Item | All jobs on Opus 5.5 | Live jobs on Haiku 5.5 (TQ3) |
|---|---|---|
| Tavus video, 10 minutes | Comes out of the plan's included minutes | Same |
| OpenAI voice only | Nothing, unless video fails or is busy ($0.05 a minute) | Same |
| Claude: reading notes and feedback | About $0.60 | About $0.03 |
| Claude: camera and photo | About $0.15 | About $0.05 |
| Claude: looks and checks | About $0.30 | About $0.30 |
| Claude: text replies and voice-only facts | About $0.05, only when typing or in voice only | Same |
| **Per demo, apart from the Tavus plan** | **About $1.10** | **About $0.45** |

Fixed monthly costs: the Tavus plan only. Vercel and Supabase stay free at this scale. GPT-Live needs a paid OpenAI account, which means a small prepaid credit, because the free tier doesn't support it.

**What each TQ2 budget buys, with video for the whole conversation:**

| Budget | Tavus plan | Full video demos a month | Notes |
|---|---|---|---|
| A, about $40 (chosen) | Starter, $22: 60 minutes, one call at a time, calls up to 10 minutes | About 6 | The rest covers AI use, including about 6 more demos in voice only once the video minutes run out |
| B, about $100 | Builder, $59: 175 minutes, 3 calls at once, calls up to 15 minutes | About 17 | About $40 left for AI use |
| C, about $10 | Free: 20 minutes, one call at a time, calls up to 5 minutes | None at full length | About 4 demos with 5 minutes of video each, because calls can't last longer on this plan. Each would then switch to voice only |

## 10. Critical risks and challenges

The riskiest items go first, so Phase 0 proves them before anything else is built.

| # | Risk | Why it matters | How to handle it | Phase |
|---|---|---|---|---|
| 1 | The video stylist feels slow or out of sync: lip sync, interruptions, start time (PRD D01) | It is the first thing every visitor sees | A Phase 0 test with clear pass marks (S1, S2, R7, R8). If it fails, launch in voice only and keep video switched off until it passes (Q9) | 0 |
| 2 | Live notes miss the 2 second target | It is the signature feature | Measure in Phase 0. Send words about once a second, read money and dates with plain code, and switch the live jobs to Haiku 5.5 if needed (TQ3) | 0 |
| 3 | Tavus's cheaper plans allow one video call at a time and a fixed number of minutes | A second visitor at the same time cannot get video | The fallback ladder gives them voice only, with a clear message. The budget guard tracks minutes, and the Builder plan allows 3 calls at once if needed | 0 |
| 4 | A public link runs up costs, from bots or heavy use | Real money | Turnstile, per-guest daily limits, provider spending limits, a hard-capped Tavus plan, and a monthly ceiling in the budget guard | 1 |
| 5 | Late or out-of-order updates overwrite newer choices | Breaks R22, R48 and R58 and confuses shoppers | Versions on everything, server-side checks, and unit tests that replay events out of order | 2 |
| 6 | The preference check lets a breaking look through | Breaks the core promise (Goal 4) | Rules in code on structured product details, catalog details that are always filled in, unknown counts as fail, one publishing gate, and a checker eval set | 4 |
| 7 | GPT-Live's events differ from what we expect (for example, no live words for notes) | Voice only mode could lose live notes | Confirm in Phase 0. If live words are missing, run OpenAI's live transcription alongside | 0 |
| 8 | The voice changes when the stylist drops to voice only (accepted in TQ1) | The stylist can feel like a different person. With video for the whole conversation, this only happens when video fails, is busy, or runs out of monthly minutes | Pick the GPT-Live voice that sounds closest to the Tavus face (Phase 0), and have the stylist say "I'm switching to voice only, so I'll sound a little different." (section 4.2) | 0 |
| 9 | Recognition reads garments wrong | Bad looks built on wrong details | To confirm statuses, easy correction, and a photo eval set | 3 |
| 10 | Provider data handling for audio and words (Tavus, OpenAI) | Shopper trust and R35 | Recording off, no camera sent to Tavus, a provider terms review in Phase 0, and a plain summary on the About page | 0 |
| 11 | Supabase's free plan pauses after 7 days without activity | A recruiter clicks your link and the app is down | Daily keep-awake job, an uptime check, and the paid plan if pausing still happens | 1 |
| 12 | Phone browser quirks: iPhone audio autoplay, camera switching, permissions | Phones are the main screen | Test on real phones from Phase 0, and start audio only after a tap | 0 |
| 13 | Sample catalog quality and image rights | Weak images make weak looks | One consistent photo style, every image reviewed, and the source recorded per image. No real brands | 1 |
| 14 | Fast-changing outside services (Tavus recently renamed "personas" to "PALs", and GPT-Live is new) | Updates can break the app | Connectors, pinned versions, contract tests, and a monthly check of change logs | All |
| 15 | The scope is large for one builder (72 requirements) | The project might never ship | Every phase ends in a working demo, and progress.md marks what can be cut | All |

## 11. Decisions and open questions

### Decisions

| Date | Decision | Status |
|---|---|---|
| 17 Oct 2026 | TypeScript, Next.js on Vercel, Supabase for data and guest sign-in | Agreed 18 Oct 2026 |
| 18 Oct 2026 | Tavus full pipeline for video, GPT-Live for voice only, our server for text only (TQ1, option A), to keep costs lower. You accepted that the voice changes when the stylist drops to voice only, softened by a matched voice and a spoken heads-up | Your decision |
| 18 Oct 2026 | Video stays on for the whole 10-minute conversation, so voice only is used only when something goes wrong (product spec R13) | Your decision |
| 17 Oct 2026 | Claude runs every AI job behind one AI connector | Agreed 18 Oct 2026 |
| 17 Oct 2026 | The stylist core decides everything, and the stylist engines only listen and speak | Agreed 18 Oct 2026 |
| 17 Oct 2026 | Camera recognition runs on our server in every mode, so Tavus never receives the camera | Agreed 18 Oct 2026 |
| 18 Oct 2026 | Running budget of about $40 a month: Tavus Starter ($22) plus about $18 of AI use, with spending limits on every provider (TQ2, option A) | Your decision |

### Remaining questions (accepted defaults)

TQ1 and TQ2 are answered (see Decisions). TQ3 to TQ6 below were accepted with their recommended defaults on 18 Oct 2026.

| # | Question | Recommended default |
|---|---|---|
| TQ3 | Use Claude Haiku 5.5 for the two live jobs (reading notes and camera frames)? | Start with Opus 5.5 everywhere. Measure speed and cost in Phase 0, then you decide. |
| TQ4 | When the monthly AI allowance is used up, show "The demo is resting until the 1st" on the welcome screen? | Yes. Added to product spec R13 in version 1.3. |
| TQ5 | Which Tavus stock face? | Pick in Phase 0 from the stock faces tuned for low delay, and use a still of it for the voice-only portrait (design DQ1). |
| TQ6 | Public or private code repository? | Public, so you can link it in applications. |

## 12. Change log

- **1.1 (18 Oct 2026):** Added CLAUDE.md, interview-notes.md and docs/ to the code layout. No decisions changed.
- **1.0 (18 Oct 2026):** Agreed by you, with the recommended answers for TQ3 to TQ6. Same content as 0.4, apart from status updates.
- **0.4 (18 Oct 2026):** Video now lasts the whole conversation (product spec 1.2). Updated the voice-only switch, cost limits, the cost estimate, a new budget table for TQ2, and risk 8. TQ2 answered A: about $40 a month.
- **0.3 (18 Oct 2026):** Added how the voice switch is softened (section 4.2 and risk 8) and the reason for TQ1. Now builds on product spec 1.1 and design 0.3.
- **0.2 (18 Oct 2026):** TQ1 answered A. Recorded it under Decisions, removed it from the open questions, and updated risk 8.
- **0.1 (17 Oct 2026):** First draft, based on product spec 1.0 and design 0.2.

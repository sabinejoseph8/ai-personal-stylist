# AI Personal Stylist: Tech Spec

**Status:** Agreed, version 1.21 (20 Oct 2026)
**Last updated:** 20 Oct 2026
**Builds on:** product-spec.md version 1.4 (agreed) and design.md version 1.0 (agreed)
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
| **Conversation connector** | One interface with two engines: Tavus for video, and OpenAI GPT-Live for voice only. Every engine reports the same events: words heard (partial and final), stylist started or stopped speaking, requests from the stylist, and errors. |
| **Stylist core** | Our own server code, with no outside service inside it. It turns words into notes and feedback, reads photos, builds looks, checks them, and keeps session state with version numbers. It is the single source of truth. |
| **AI connector** | The only place that calls Claude. Each job has its own prompt, model setting and output shape. |
| **Catalog connector** | The only place that reads products. v1 has the sample catalog. ASOS or FARFETCH would be new connectors with the same shape (PRD D02). |
| **Database and storage** | Supabase: guest sign-in, data tables with per-guest access rules, and private photo storage. |
| **Scheduled jobs** | Run daily: delete guests unused for 7 days and leftover test guests, close idle sessions, and tidy old usage and rate-limit records. Daily limits reset on their own, because usage is counted per UTC day. |

### 1.2 How a spoken turn flows (video mode)

1. The shopper talks. Tavus hears it and streams the words to the browser while the shopper is still speaking (**conversation.utterance.streaming**, which covers both the shopper and the stylist).
2. The browser sends the turn's words so far to the server about twice a second (your option 3 in 2c), and once more when the turn ends.
3. Plain code reads money and dates at once, and the server streams that update back straight away. Then Claude's notes reader turns the words into short jotted notes in the stylist's words, for example "Outdoor wedding, November", each with a status (To confirm or Confirmed) and a source. Behind each note it keeps the hidden details that looks and checks need, for example month=november and setting=outdoor. Each send starts its own reading, so readings overlap.
4. The server merges each reading's changes with the "latest word wins" rules (section 5), saves the notes with a new version number, and streams them back. The browser shows the newest version it has.
5. The reader also gives the next useful question (for example "Dress or pantsuit?"). The browser shows it as quick replies, and the server passes the notes and the question to Tavus as context, so the stylist knows what to say next. A question stays until a reading of a later turn replaces it, because Claude sometimes leaves it out of one reading.
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
interview-notes.md   the project story, told for interviews (private: on Sabine's Mac, not in the repository)
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
| Database, guest sign-in, photos | **Supabase**, one project in your Pro organization, about $10 a month (decided 20 Oct 2026) | Postgres with per-row access rules, anonymous guest sign-in, and private file storage in one service. You already have it connected. |
| Video stylist | **Tavus**, full pipeline (TQ1, your decision) | The PRD's intended avatar. Tavus handles listening, turn-taking, interruptions, voice and face in one call from the browser, which its docs describe as the lowest-latency setup. |
| Joining the video call | **Daily** browser SDK | Tavus calls run on Daily, and the SDK lets us use our own screen design and read live events. |
| Voice only mode | **OpenAI GPT-Live 1** (**gpt-live-1**) | The PRD's intended OpenAI voice layer, built to sit in front of your own logic. $0.05 per minute, billed per second. |
| AI jobs | **Anthropic Claude** through the official TypeScript SDK | Reliable structured output, image understanding, and careful rule following for the preference check. Live notes and the camera use Claude Haiku 5.5, and the other jobs use Claude Opus 5.5 (TQ3, decided in Phase 0; see 4.4). |
| Input and output checking | **Zod** schemas | Every request and every AI answer is checked against a defined shape before use. |
| Styling | **Tailwind CSS** with the design.md tokens | Colors, type, spacing and radius live in one place, as the design doc lists them. |
| Accessible building blocks | **Radix UI** primitives | Dialogs, sheets, popovers and menus with keyboard and screen reader support built in. |
| Icons | **Lucide** | Simple outline icons with the 1.5 px stroke the design doc asks for. |
| Fonts | **Newsreader** and **Figtree** through Next.js font loading, from the **Fontsource** packages (open font licence) | Served from our own site, so no layout jumps and no calls to Google. Fetching them from Google at build time sometimes failed, so the files come with the packages (2e). |
| Browser state | **Zustand** | A small, predictable store for live session state and versions. |
| Bot protection | **Cloudflare Turnstile** on Try the demo | Stops bots from creating guests and spending the budget. Supabase supports it for anonymous sign-in. |
| Tests | **Vitest**, **Playwright**, **axe-core** | Fast unit tests, real-browser tests on phone and desktop sizes, and automatic accessibility checks. |
| Sample catalog images | **OpenAI gpt-image-2** at medium quality, made through OpenAI's half-price **Batch API**, every photo reviewed by hand | Rights-safe images with no real brands (PRD D03). Picked in 1e by comparing medium and high quality on 10 test images: the same look on a phone for about a quarter of the cost. The photos are 800 px JPEGs served from the site itself (**public/catalog**), so they cost nothing to serve and change with the code. |

## 3. Data model

All tables live in Supabase Postgres. Every table that holds guest data has a **user_id** column and an access rule that limits it to the signed-in guest.

| Table | What it holds | Key fields | Kept for |
|---|---|---|---|
| **profiles** | One row per guest | departments, style words, sizes, default budget (amount, currency, meaning), last active time | Until deleted, or 7 days without use |
| **saved_preferences** | Must have, Never and Likes items | kind, the shopper's words, the matching rule (for example heel height over 5 cm), version | Same as profile |
| **consents** | Separate permissions (R64) | wardrobe photos, remember preferences, camera explained, with times | Same as profile |
| **sessions** | One styling conversation | status (active, paused, ended), engine (video, voice), started and last activity times, the live call's id and start time, the seconds the budget guard reserved for it and their day, versions for notes, feedback, anchor and profile, the words sequence (one number per send of words, for latest word wins), and the next question with the turn and sequence it came from (Phase 2 review). At most one open session per guest. Read-only for guests: only the server changes it (decision A) | Ends after End or 30 minutes idle (a database timer closes idle ones every 10 minutes), then the row is closed |
| **session_notes** | The stylist's jotted notes | note text, kind (occasion, timing, colors, style, budget, outfit, owned item, fit, other), hidden details for looks and checks, status, source (voice or touch), the words sequence that last changed it, created and update times, version, removed. At most 12 per session, saved preferences not counted (your answer to Q2 in 2c). Read-only for guests: the server saves them through **save_notes**, which only saves if nothing else saved in between (decision A, done in 2c) | Deleted when the session ends (R63) |
| **session_feedback** | Likes, Dislikes, Requested changes, Items to keep | look, item or attribute, scope, status, source, version | Deleted when the session ends |
| **session_exceptions** | "This session only" permissions | saved preference, confirmed time | Deleted when the session ends |
| **session_assets** | Items to style around | private photo path, thumbnail path, source (upload or camera), status (uploading or ready), recognized details (the photo reader's items and which one is chosen, each detail in ink or pencil, 3b), ownership, the details' revision, active flag (one per session), version | Deleted when the session ends, unless saved to the wardrobe. Written only by the server (3a). Up to 5 per session (your answer to Q3 in 3a). Adding, choosing and removing a photo each take the session's lock first, so changes at the same moment wait their turn (Phase 3 review) |
| **wardrobe_items** | Saved owned items | photo path, thumbnail path, name, category (tops, bottoms, dresses, outerwear, shoes, bags, accessories or other), details (type, colors, pattern, style), chosen for styling, draft, and the session photo and version it was saved from | Until deleted by the shopper, or 7 days without use. Written only by the server (3d); drafts left for an hour are deleted |
| **catalog_products** | The sample catalog | slug (the catalog's own id and the photo's file name), provider ("sample"), department, category, name, colors, style tags, price in cents, currency, sizes, attributes (heel height, toe, sleeve length, neckline, coverage, formality, material, pattern), image path, image description (read by screen readers), image source (generator, model, prompt, date and your review), can be bought (always false), availability date (empty) | Permanent |
| **looks** | Every candidate and published look | items (product, wardrobe or photo IDs), total, reason, revision of, input versions, status (building, checking, published, held, needs a new check, saved) | Deleted when the session ends, except saved looks |
| **check_results** | Preference check decisions | look, versions checked, verdict (pass, conflict, needs clarification), reasons per rule and item | Deleted with the session. Holds no transcripts, audio or photos (FR-33) |
| **saved_looks** | Looks the shopper saved | a copy of the look, saved time | Until removed, or 7 days without use |
| **bag_items** | Demo bag | product, size, the check that allowed it | Same as profile |
| **usage** | Time and spending | per guest per UTC day: video seconds, voice seconds, Claude cost and OpenAI cost (in millionths of a dollar). Monthly totals are added up from these rows. When a guest is deleted, their rows stay without the guest, so the month's totals stay right | 90 days, with no personal content |
| **event_log** | Behind the scenes entries | session, entry type, plain-language summary, time | Deleted with the session |

What is never stored anywhere we control: raw audio, full transcripts and camera video. The live words that feed the notes are never shown on screen, and are thrown away once read (product spec R10).

## 4. Interfaces between parts

### 4.1 Server endpoints

Every endpoint checks the guest's sign-in, checks the input shape, and checks that the session belongs to that guest.

| Endpoint | Used for |
|---|---|
| **POST /api/sessions** | Start conversation: picks up the guest's open session or opens one (5 starts an hour), reserves their time with the budget guard, and starts the call with that time as its longest length. Returns the call's join link, its longest length, and which limit ends it (today's time or the month's video minutes), for time left and Time is up (R13). Until voice only arrives (6c), if video is unavailable (another visitor, or the month's minutes used) it says so and the conversation doesn't start (your decision, 2a). |
| **POST /api/sessions/:id/voice** | Exchanges the browser's connection offer with OpenAI for GPT-Live. The OpenAI key never reaches the browser. |
| **POST /api/sessions/:id/end** | End: ends the call, hard-deletes the Tavus conversation and gives back the reserved time the call didn't use. With keep: true (the call stopped by itself, or the shopper left the page) the session pauses and can be resumed for 30 minutes. Ending deletes the session's notes and photos, and later its other session-only data (R63). |
| **POST /api/sessions/:id/words** | New words heard: the turn's words so far, what the stylist last said, whether the turn has ended, and a label for the shopper's turn. The session keeps the next question on the server until a reading of a later turn replaces it (Phase 2 review). Streams one line of JSON per update: first the plain-code money and dates, then the notes after Claude's reading, with the next question and the stylist's context. As for photos, the reading is registered with **after()**, so it finishes if the page goes away (Phase 3 review). Feedback updates come in Phase 5. |
| **PATCH /api/sessions/:id/notes/:noteId** | Confirm, remove or restore (Undo) a note by touch (R20), 4 a second at most. |
| **POST /api/sessions/:id/assets** | Add a photo or a captured still, or Replace one (a new version of it), 10 an hour. Returns the photo's id and version at once, with a one-time upload link: the browser sends the photo straight to the private photo store, because Vercel refuses anything over 4.5 MB (your answer to Q1 in 3a). Refused when the session already has 5 photos (your Q3). **GET** gives fresh links to the session's photos. |
| **POST /api/sessions/:id/assets/:assetId/ready** | The photo has arrived: the server checks its real type and size, cleans it (section 6, Checking inputs), keeps the clean copy and its thumbnail, and deletes the original. Streams one line of JSON per update: first the kept photo with 30-minute links, showing Analyzing, then what the photo reader found, with the stylist's context (3b). If the browser goes away meanwhile, the reading still finishes and is saved: it's registered with Next.js's **after()**, because Vercel stops work a cancelled answer leaves behind (Phase 3 review). A photo is checked and read only once: asking again for a kept photo does nothing. Or it answers why the photo was turned away. |
| **PATCH, DELETE /api/sessions/:id/assets/:assetId** | Make a photo the active one, confirm a detail, pick one of several items, or say whether it's the shopper's (3b), or Remove it (R31), 4 photo changes a second at most. Removing the active photo makes the newest one left active. Each answer carries the stylist's context. |
| **POST /api/sessions/:id/camera-frame** | One small camera frame for live recognition (R34): a JPEG of at most 640 px (400 KB at most), for the guest's open session, one every 2 seconds at most. It's read through the budget guard and thrown away; the answer says whether one item, several or none is shown, and what the item is (3c). |
| **POST /api/sessions/:id/looks** | Build looks. Also swap, refine, restore and compare actions on a look. |
| **POST /api/sessions/:id/exceptions** | Allow a saved preference to be broken for this session (R57). |
| **/api/wardrobe** | GET lists the guest's items with 30-minute links. POST is Save to wardrobe for a session photo marked "You own this" (R36): it answers "permission" until wardrobe photos are allowed, then copies the photo and its details. **POST /api/wardrobe/uploads** and **.../uploads/:id/ready** are Add item on the Wardrobe page: a one-time upload link, then the photo is checked, cleaned, kept and read, and comes back as a draft with suggested details (your answer to Q1 in 3d). **PATCH** and **DELETE /api/wardrobe/:id** edit and delete (R37). **PUT /api/wardrobe/styling** is Style with these (your Q2). |
| **GET /api/sessions/:id/context** | What the stylist should know as a call starts: the notes, saved preferences, the photo to style around and the wardrobe items chosen to style with (3d). |
| **/api/saved-looks**, **/api/bag** | Add, edit, list and delete. Adding to the bag runs the preference check first. |
| **GET /api/me/export**, **DELETE /api/me** | Download my data and delete all my data (R65). |
| **POST /api/webhooks/tavus** | Tavus reports a call's end, so usage is exact. |
| **GET /api/cron/daily** | The daily clean-up, at 08:00 UTC (vercel.json). Only Vercel's scheduler can call it, because it sends **CRON_SECRET**. It also ends at Tavus any call a session left behind, and deletes the photos of sessions that ended from being idle. |

### 4.2 Conversation connector

Every engine implements the same small interface, so the rest of the app never knows which one is running.

- **Commands:** start, end, mute, unmute, send a tap-to-try phrase, update the stylist's context (notes, looks, next question), say a short scripted line, interrupt.
- **Events:** words heard (speaker, text so far, final or not, turn ID), stylist or shopper started or stopped speaking, stylist request, connection state, a microphone problem (blocked, missing or stopped working, R6), error. Words heard feed the notes reader and are never shown on screen.
- **Files:** the interface is **connectors/conversation/types.ts**: a server side that starts and ends calls (it holds the keys) and a browser side that joins them. The Tavus engine is in **connectors/conversation/tavus/**, and a **fake engine** (**connectors/conversation/fake.ts**) plays scripted conversations for tests. The fake is only used when **CONVERSATION_ENGINE=fake**, and never on Vercel's live site. The shared contract tests are in **tests/support/conversation-contract.ts**.
- **Tavus engine:** joins the call with Daily, with **avoidEval** on, so the site's strict security policy holds on the session screen. Daily reports microphone trouble as a camera error, which the engine turns into the microphone event. Context goes in through Tavus's context interaction, scripted lines through **conversation.echo**, and interruptions through **conversation.interrupt**, all sent as Daily app messages. Live words arrive as **conversation.utterance.streaming** events. The Tavus setup ("PAL") uses **pipeline_mode: "full"**, a stock female face, perception turned off (the camera stays with us), and recording turned off.
- **GPT-Live engine:** a browser WebRTC call set up through our server, which sends the browser's offer to **POST /v1/live/sessions** and returns only the answer, never the key. The session must set **delegation: { type: "client" }** (OpenAI rejects null). Uses the same stylist instructions. Live words arrive as **session.input_transcript.delta**. Facts go in through **session.thinking.append**, and exact lines through **session.instructions.append**. The browser's data channel should be limited so only our server can feed facts (Phase 6). The voice is **quartz** (picked in Phase 0).
- **Switching to voice only:** GPT-Live uses the OpenAI voice that sounds closest to the Tavus face, picked in Phase 0. When the shopper taps Voice only, the Tavus stylist first says "I'm switching to voice only, so I'll sound a little different." through **conversation.echo**. Then the video call ends and GPT-Live picks up with the current notes and a short recap. If video drops without warning, GPT-Live says the same line as its first words. If video is unavailable from the start (another visitor is using it, or the month's video minutes are used up), the stylist starts in voice only and says why.
- **Stylist requests are limited to three:** capture the item on camera, open saved looks, end the session. The stylist never changes notes, looks or the bag itself.

### 4.3 Catalog connector

The same contract the PRD asks for (D02), so a real retailer can be added later.

- **search**(filters), **getProduct**(id), **getAvailability**(ids), **capabilities** (checkout, cart transfer, order tracking). The interface is in **connectors/catalog/types.ts**.
- Search filters: department, categories, sizes ("One size" always matches), price range, style tags and color words (ignoring case), products to leave out, and a limit. Results come cheapest first. Firm rules such as Never and Must have are applied by the core, not the connector.
- Every product has normalized IDs (our own id plus the provider's), variants (one per size), price with currency, the details the preference check reads, region, image rights, availability time, retailer attribution and purchase link.
- **connectors/catalog/required-details.ts** lists the details each category must have (for example heel height and toe for shoes, sleeve, neckline and coverage for dresses and tops). A missing detail is a fail.
- The sample connector reports every capability as off, "can be bought" is always false, and availability is never "in stock" (R62).
- One shared contract test suite (**tests/support/catalog-contract.ts**) runs against every connector (PRD D19).
- The sample products live in **catalog/products.json**, and each photo's source and review in **catalog/image-sources.json**. **npm run catalog:load** loads them into the database with the server key, matched by slug, and refuses any photo you haven't approved. **npm run catalog:check** reports the count and anything missing.

### 4.4 AI connector jobs

Each job has its own prompt, a strict output shape (structured outputs, because these models don't allow forced tool use) and an effort setting. Phase 0 measured the live jobs (TQ3, decided 19 Oct 2026): Claude Haiku 5.5 runs live notes and the camera, and Claude Opus 5.5 runs the rest, where accuracy matters most and speed matters less. The notes reader pairs Haiku with plain code that reads money and dates, keeps each note's id and wording between readings, and never drops a confirmed note.

| Job | Input | Output | Default model and effort |
|---|---|---|---|
| Notes and feedback reader | New words, what the stylist last said, current notes with short ids, removed notes, the visible look (Phase 4) | Only the changes: notes to add, update (by id) and remove, each with a status and the hidden details looks and checks need, plus the next question with up to 3 options | Haiku 5.5 with thinking off (your option 3 in 2c), with plain code for money and dates |
| Camera reader | One small frame, at most 640 px | One item, several or none; for one item, its name, type and main color, and whether it's sure. An item is named only after two frames in a row agree, and Capture turns it into a photo the photo reader reads | Haiku 5.5, low |
| Photo reader | One photo, at most 1024 px | Up to 4 items, each with a name and its type, main colors, pattern and style, and how sure it is of each | Opus 5.5, low |
| Looks builder | Filtered products, notes, anchor, feedback | Up to 5 candidate looks by product ID, each with a reason | Opus 5.5, medium |
| Preference checker, judgment step | One look plus preferences | Pass, conflict or needs clarification, with reasons | Opus 5.5, medium |
| Voice-only facts | Conversation so far and current state | Short facts for GPT-Live to say | Opus 5.5, low |
| Preference rule maker | The shopper's words, such as "no high heels" | A structured rule, such as heel height over 5 cm, shown to the shopper to confirm | Opus 5.5, low |

Shared settings: stable prompt parts are cached to cut cost, answers come back as structured output, and refusals use Anthropic's built-in fallback option.

**The photo reader as built (3b).** The files are **core/photos/** (the reader, its fake for browser tests, and the item rules) and **lib/photos-service.ts**.
- It reads the cleaned photo right after it's kept, through the budget guard: about 1.3 cents and 2.5 seconds a photo (the photo eval). A failed or cut-off reading still counts its cost toward the guard's limits, as do failed camera readings (Phase 3 review).
- If the connection drops after the photo is kept, the page keeps the photo and asks the server for its reading every few seconds, as it does after a reload mid-reading (Phase 3 review).
- Details it's sure of are in ink (Confirmed), the rest in pencil (To confirm), as R28 says. With one item it's chosen at once; with several, the shopper picks one (R29).
- Nothing found, a failed reading or the day's AI used up all leave the photo with "Couldn't recognize this item. Describe it instead." (R32), and what the shopper then says fills in the item.
- What the shopper says about the photo reaches it through the notes reader (your answer to Q3 in 3b). Only when there's a photo, the same reading gets the item, with numbered items, and returns a small extra part: the item chosen, whose it is, corrected details and confirmed details. Without a photo, the prompt and answer are unchanged. Plain code drops a note that repeats the photo's own item ("Owns a navy wool blazer").
- The stylist is told the active item, its details and whose it is, and what to ask: which item, or whether it's theirs or an inspiration. Once a new photo is read she speaks up: the page sends her "I've added a photo of something I'd like to style around" as the shopper's words, kept out of the notes, once nobody is talking (your answer to Q1 in 3b).

**The wardrobe as built (3d).** The files are **lib/wardrobe.ts** (categories and the edit checks), **lib/wardrobe-service.ts** and **components/wardrobe/**.
- Save to wardrobe appears for an item marked "You own this". It copies the session photo and thumbnail to **<guest>/wardrobe/<item>.jpg** with the chosen item's name and details, so the session's photo can be deleted when it ends (R31). The same photo version is never saved twice. It waits for an It's mine still on its way, so a quick tap can't reach the server first (found by the 3d browser tests).
- The first save or Add item asks for wardrobe photos (R36, R64), recorded in **consents.wardrobe_photos_at**. Not now keeps the item in the session only.
- Add item on the Wardrobe page uploads a photo like a session photo, through the same checking steps (**keepUpload** in lib/photos-service.ts), and the photo reader suggests its name, category and details to check before it's added. An upload is added only once. Categories come from the reader's type by plain word rules.
- Style with these marks the chosen items. They show in My Styling Notes under From your wardrobe, and the stylist is told about them as the call starts and with every update (your answer to Q2 in 3d). Looks use them in Phase 4. With nothing ticked, the button is Clear wardrobe items, which stops the session using them (your decision B in the Phase 3 review).
- Until the app menu (Phase 7), the Wardrobe page is linked from the session page and the welcome-back screen (your answer to Q3 in 3d).

**The camera reader as built (3c).** The files are **core/camera/** (the reader, its fake for browser tests, and the rules for what's shown) and **lib/camera-service.ts**; the page side is **components/session/use-camera.ts**.
- While the camera is on, the page sends one 640 px frame about every 2 seconds, one at a time and only while the page is in view. Each frame costs about 0.015 cents.
- Two frames in a row must agree (the same type, and colors with a word in common) before an item is named, with a question mark unless both frames were sure. Two frames with nothing clear the name. This runs in the page, because frames aren't kept anywhere.
- The stylist is told what's on camera by the page, added to the server's context, and asked to name it once per new item ("I'm holding something up to my camera."), once nobody is talking. Several items in view: she asks which. Camera blocked or missing: she suggests uploading a photo.
- **Capture**, or "use this one" (plain code in the page listens for a few phrases while the camera is on; your answer to Q1 in 3c), takes a full-size still. Only clear requests count (your decision A in the Phase 3 review): "use this one", "use that one", "use this", "capture", "take a photo" or "take a picture", or "this one" when it's all the shopper says and their words are final. Everyday words such as "I'd use that for work" don't. "Use this one" counts for 8 seconds after an item was last on screen, and if it comes before any name, it waits up to 8 seconds for one: on your iPhone it first did nothing, because holding an item up while talking can clear the name just as you speak. It's added as a photo from the camera and read like any photo, and the camera turns off (your answer to Q2 in 3c).
- The camera turns off 2 minutes after it was turned on (Switch camera doesn't restart the 2 minutes; Phase 3 review), when the conversation stops or the session ends, and when the page goes away. The call starts with video off, so Tavus never gets the camera.

**The notes reader as built (2c).** The files are **core/notes/** (the reader, merge rules and plain code) and **connectors/ai/claude.ts**.
- Its answer uses short keys (k, t, s, d, i, q) to keep it small.
- Claude never jots budgets (plain code does), and it can't change or remove the budget note.
- A note turns to ink by voice only when it answers something the stylist said.
- Thinking is off, because in the 2c tests it took about half of each reading's time without making the notes better.

## 5. System patterns

These rules keep the app secure and easy to extend. Each one is enforced in one place.

1. **Every data lookup belongs to the signed-in guest.** Database access rules limit every row to its owner, and server endpoints check session ownership as well.
2. **Secrets stay on the server.** The browser only ever gets short-lived call links and connection answers.
3. **Outside services sit behind connectors.** Conversation, AI, catalog and storage can each be swapped without touching the core.
4. **One source of truth.** The server's session state decides everything. The stylist engines only listen and speak.
5. **Versions on everything, newest wins.** Notes, feedback, the item to style around and the profile each carry a version number. Every request says which versions it was based on, and the server drops results built on old versions. A spoken correction, or a note confirmed or removed by touch, always beats a later-arriving update from earlier speech. This covers R22, R48, R52 and R58.
   - For notes (2c, **core/notes/merge.ts**), each send of words gets the next words sequence number, and a reading may only change a note that nothing newer has changed. A touch is stamped with the current sequence, so it beats every reading of words heard before it.
   - A reading never drops a confirmed note, and a removed note never comes back from older words or after a touch.
   - Because readings overlap, the merge also folds repeated notes together: "November" next to "Outdoor wedding, November", or the same idea jotted by two readings at once. The newer words win.
   - Saving uses the notebook's version as a check, and tries again if another reading saved first.
   - Confirm, Remove and Undo by touch (2d) show on screen at once, laid over the notes until the server answers. Touches on the same note are sent one after another, because the server could otherwise handle Undo and a quick second Remove in either order and bring the note back (found by the 2d browser tests).
   - The photo's details, chosen item and ownership change by touch and by voice, sometimes at the same moment, so each change names the details' revision it started from (**change_asset_details**) and is tried again on the newer details if another saved first (3b).
   - For the item to style around (3a), Replace makes a new version of the same photo, with new files. Keeping a photo, and from 3b saving what the photo reader learned (**save_asset_details**), name the version they were for, and the database refuses an old one, so a late result never brings back a replaced photo (R31). The page also ignores answers for a photo it has since replaced or removed.
6. **One publishing gate.** A look reaches the screen or the bag through a single function. That function requires a passing check of that exact look against the current versions (FR-30). Rules run in code first: budget, Never and Must have rules, colors to avoid, outfit type, kept items and the owned item. A missing required detail is a fail. Claude then judges only subjective fit, and any uncertainty becomes "needs clarification".
7. **Code for facts, AI for language and taste.** Money, totals, dates, filters and firm rules are plain code. AI answers are always shape-checked before use.
8. **Degrade, never break.** Video falls back to voice only. If voice drops, the conversation pauses and reconnects, and notes and looks stay on screen. A failed check holds the look. A failed notes reader pauses notes while confirming and removing notes by touch keeps working.
9. **Private by default.** Session data is deleted when the session ends: at End, and for idle sessions by a database timer every 10 minutes. One database step, **delete_session_data**, deletes a session's session-only data, and each new session-only table joins it (2e). Photo files can only be deleted by the app, so the app deletes a session's photos first (**lib/photos-service.ts**), and photos of sessions the timer ended go on the guest's next start or in the daily job (3a). Photos sit in private storage behind links that expire in 30 minutes. Decision records hold versions and reasons only.
10. **Every paid call passes the budget guard** (**lib/budget-guard.ts**). Before a video or voice call, the server reserves the guest's conversation time in one database step, so two tabs can't share the same minutes, and the call is created with the time granted as its longest length. After the call, the time really used replaces the reservation. Before a Claude or OpenAI call, the server checks the guest's AI money for the day and the provider's money for the month, and records the cost afterwards. If the guard can't answer, the paid call doesn't happen. Ending a call claims it first, so two ends arriving together (End and the tab closing) give its time back only once (Phase 2 review). A call a closed browser left behind is counted until the shopper's last activity plus the 30 seconds Tavus waits before ending it (your answer to B in the Phase 2 review).
11. **Screens start from saved data.** With Cache Components, Next.js hides a page instead of closing it when the shopper navigates away, and keeps its state for when they come back (React **Activity**). A screen that edits saved data is keyed on that data (for example setup on the saved profile), so it never shows, or saves, old answers over new ones. Passing states such as "Starting your demo…" reset when the page is hidden. Found on your iPhone during the Phase 1 check.

## 6. Security

### Sign-in
- Guests sign in anonymously through Supabase. No email or password.
- Sign-in lives in secure, HTTP-only cookies.
- Turnstile runs invisibly on Try the demo to keep bots out. Supabase checks the Turnstile answer before it creates a guest.
- Every new guest gets a profile row automatically (a database trigger).
- Rate limits are counted per guest in the database (the take_rate_limit function).

### Access
- Database access rules on every table: a guest can only read and change their own rows.
- A row that points at a session, look, saved preference or check result must point at one of the same guest's. Two-column foreign keys (the id plus the guest) enforce it in the database (Phase 1 code review).
- From Phase 2, the records only the app should change (session state, notes, photos to style around, wardrobe items, looks, check results and the bag) are read-only for guests. The server writes them with the server key, after checking the session belongs to the guest, so nobody can mark a look as passed or fill the bag without the check by calling the database directly (your decision, Phase 1 code review, 20 Oct 2026). Guests keep write access to what they change themselves, such as their profile and saved preferences.
- Photo storage is split into one private folder per guest, with the same rule. Guests can open their own photos but can't add, replace or delete files: only the server does, after checking them (3a). A photo lives at **<guest>/<session>/<photo>-v<version>.jpg**, with its thumbnail beside it, so a new version always gets new files. The browser gets only links that stop working after 30 minutes, and asks for fresh ones when one runs out.
- The server key that bypasses those rules is used only by the budget guard's usage records (decided 20 Oct 2026, so visitors can't fake or inflate usage), the app's own records from Phase 2 (above), scheduled jobs, account deletion, and automated tests that create test guests (decided 20 Oct 2026, because bot protection blocks normal sign-in in tests). It lives in **lib/supabase/admin.ts** and never reaches the browser. The guard's database functions can only be run with it.

### Secrets
- The Tavus, OpenAI, Anthropic and Supabase server keys live only in Vercel's environment settings. They are never committed and never sent to the browser.
- Preview deployments use separate keys with low limits.

### Checking inputs
- Every endpoint checks its input against a Zod schema.
- Uploads: the file type is checked from its contents, not its name. Files are limited to 10 MB, resized, and re-saved without location or camera metadata (FR-27). As built in 3a: the browser sends the photo to a one-time upload link into **<guest>/incoming/** (the photo store itself refuses anything over 10 MB or not sent as a JPEG, PNG, WebP or HEIC). The server then reads its first bytes for the real type, turns it the right way up, shrinks it to at most 1600 px on its longest side, and saves it again as a JPEG with **sharp**, which keeps no metadata unless asked, plus a 320 px thumbnail. HEIC photos are converted first with **heic-decode**, because sharp's ready-made build can't read them; their size is checked before they're decoded, because a small HEIC file can claim to be enormous (Phase 3 review). The original is then deleted.
- The photo store: every request to it, from the server (**stored()** in **lib/photo-store.ts**) or the browser's uploads (**whileStoreBusy()** in **lib/photos.ts**), is tried again up to twice (about a second in all) when the store says it's busy ("Too many connections"). Supabase's connection limit fills only during bursts of test traffic, but the tests share the project with the live site (your decision C in the Phase 3 review). The tests also run at most 2 files at once.
- Shopper words and photos are treated as untrusted. They can only become notes. They can never change instructions or trigger actions.

### Rate limits (default)
- Starting sessions: 5 per guest per hour.
- New words: 2 requests per second per session.
- Note touches (Confirm, Remove, Undo): 4 per second per guest (Phase 2 review).
- Photos: 10 per guest per hour. Photo changes (checking an arrived photo, switching the active one, Remove): 4 a second (3a). Camera frames: 1 every 2 seconds, while the camera is on.
- Building looks: 20 per guest per hour.

### Cost limits
- Per guest per day: 10 minutes of conversation, all with video when it is available (R13), and $1 of AI (a full demo uses about $0.45).
- Tavus: each call is created with **max_call_duration** set to the guest's remaining conversation time, and **participant_left_timeout** of 30 seconds, so an abandoned call stops at once. The Tavus plan's own minute cap is the final backstop.
- Per month, for the whole demo: 110 minutes of video (Tavus Starter has 120; 10 are kept for testing), $12 of Claude and $4 of OpenAI, each below its console limit ($15 and $5), so the app stops politely before a provider refuses.
- Days and months are counted in UTC (8 pm in New York). Each limit is a Vercel setting: **BUDGET_DAILY_CONVERSATION_MINUTES**, **BUDGET_DAILY_AI_USD**, **BUDGET_MONTHLY_VIDEO_MINUTES**, **BUDGET_MONTHLY_CLAUDE_USD** and **BUDGET_MONTHLY_OPENAI_USD**, with the values above as defaults (your decision, 20 Oct 2026).
- OpenAI and Anthropic: spending limits set in their consoles as the final backstop.
- The AI money check and the cost record are separate steps, so AI calls at the same moment can run a few cents over a limit. Accepted (your decision, Phase 1 code review): the monthly ceilings sit $3 (Claude) and $1 (OpenAI) below the console limits, so a provider never cuts in.
- When the monthly allowance runs out, the conversation ends for now (R13). If AI is used up too, the welcome screen says the demo is resting until the 1st of next month (TQ4).

### Privacy
- Recording is off for every Tavus call. Tavus never receives the camera: the call starts with video off, and the camera is a separate stream only the page uses. Frames are read by our server and thrown away, never saved or logged (3c). Only a still the shopper captures is kept, as a session photo.
- Each Tavus conversation is hard-deleted when its call ends, because Tavus publishes no retention period (decided 18 Oct 2026). Checked with a real call in 2e: afterwards Tavus answers "Invalid conversation_id". A call a closed browser left behind is ended and deleted on the guest's next start or by the daily job. OpenAI and Anthropic delete API data within 30 days and don't train on it.
- The browser sends words to our server to update notes. The server keeps only the resulting notes.
- How Tavus, OpenAI and Anthropic store data is checked in Phase 0 and summarized on the About page.
- Deleting all data removes database rows, stored photos and the guest sign-in.

### Browser protections
- A content security policy only allows connections to our own site, Supabase, Tavus and Daily, OpenAI, and Cloudflare (for Turnstile). Scripts need a fresh per-request nonce (proxy.ts). Every page follows it: the Phase 0 test pages were deleted in 2f.
- Microphone and camera access are only allowed on the session screen.

## 7. Hosting, deployment and configuration

- **Code:** a GitHub repository, public so it can be linked from your portfolio (default). Secrets are never committed.
- **Deploys:** Vercel builds every pull request into its own preview link. Merging to main deploys production.
- **Database:** one Supabase project, **ai-personal-stylist** in your Pro organization, shared by development, previews and the live site until launch (your decision, 20 Oct 2026). Tests clean up the rows they create. A separate production database can be added before launch. Table changes ship as migration files in the repository (supabase/migrations).
- **Scheduled jobs:** a database timer (Supabase Cron, **close-idle-sessions**) runs every 10 minutes: it ends sessions idle for 30 minutes and deletes their notes (your answer to Q1 in 2e). It can't delete photo files, so those sessions' photos are deleted on the guest's next Start conversation or by the daily job, whichever comes first: at most a day, still private (your answer to Q4 in 3a). A Vercel cron job runs daily at 08:00 UTC (4 am in New York). It does the same, ends at Tavus any call those sessions left behind and gives back its unused minutes, deletes their photos, deletes guests unused for 7 days with their photos (R3), deletes test guests older than a day that a test run left behind, and deletes usage records older than 90 days and old rate-limit counts. Only anonymous guests and test guests are ever deleted. A guest's last-active time is updated on every page visit, at most once an hour (your decision, 20 Oct 2026). Keeping the database awake isn't needed on Pro.
- **Tavus setup:** the stylist's Tavus configuration (PAL, face, conversation model, timeouts) is kept as a file in the repository and applied by a script, so it is versioned like code.
- **Address:** the free vercel.app address for v1 (default). A custom domain can be added later.
- **Switches** (environment settings): video on or off (Q9), camera on or off, Behind the scenes on or off, and the daily and monthly limits (section 6, Cost limits). **CONVERSATION_ENGINE=fake** is for automated tests only.
- **Monitoring:** Vercel logs and alerts for errors, a usage table for minutes and spend, and a weekly check of provider dashboards.

## 8. Testing approach

- **Test guests:** database and browser tests reuse a pool of test guests whose sign-ins are saved locally (never committed), because Supabase allows about 30 sign-ins every 5 minutes (Phase 2 review). Tests that need a guest deleted get a fresh one.
- **Unit tests** for the rules that must never break: latest word wins, version checks, budget parsing ("under 350", "between 200 and 300"), totals without owned items, preference rules, and the publishing gate.
- **Contract tests:** the same suite runs against every catalog connector (PRD D19) and every conversation engine, using a fake engine that plays scripted conversations.
- **AI evals:** saved sets of examples with expected answers, run on every prompt or model change. They track pass rate, speed and cost.
  - Notes: 30 utterances, including the wedding example (R18), corrections, unclear speech and long turns (**tests/evals/notes-cases.json**, run with **npm run eval:notes**, about 10 cents). It replays each sentence at 2.5 words a second with the app's sending and merging. It checks the notes, repeated notes, wrong ink and the question, and times each note from its phrase. In 2c it scored 96 to 99% right, with 97 to 99% of notes within 2 seconds.
  - Checker: about 30 looks, including high heels with "Never: high heels", budget edges, and a missing heel height.
  - Photos (3b, your answer to Q2): 20 sample catalog photos, one of each kind plus the patterned ones, and 4 made by putting two catalog items side by side, with the right answers from the catalog's own details (**tests/evals/photos.eval.ts**, run with **npm run eval:photos**, about 30 cents). Pass marks: 85% of details right, and every item found in the two-item photos. First run: 94% right (type 17 of 20, colors 20, pattern 19, style 19), all items found, 2.5 seconds median, about $0.30. The misses were close calls: a tuxedo jacket read as a blazer, a polo as a shirt, a fitted tee as a T-shirt rather than a top. Catalog photos are cleaner than phone photos, so iPhone checks cover real ones.
  - Camera reader check (3c, **npm run eval:camera**, about a third of a cent): the photo eval's 24 photos shrunk to 640 px. No pass mark. First run at low effort: type right 18 of 20, colors 20 of 20, sure on all 20, every two-item frame read as several items, 1.3 seconds median. With thinking off it was no faster (1.7 seconds median), so low effort stays.
  - The notes eval also has 6 cases with a photo (3b): corrections, "it's mine", an inspiration, "the first one", describing a photo that couldn't be read, and "yes, it's navy".
- **End-to-end tests** with Playwright on phone and desktop sizes. The fake engine replaces live voice, so tests are free and repeatable. They cover the success checks that do not need a real voice (S4 to S20).
- **Accessibility:** automatic axe-core checks in every end-to-end test, plus a manual VoiceOver and keyboard pass before each release.
- **Real-device checks** each phase on an iPhone with Safari and a laptop: video start, interruption, camera, permissions (S1 to S3, S8 to S10). Android phones aren't tested in v1 (decided 18 Oct 2026, an accepted risk).
- **Speed measurements** in Phase 0 and before launch: note updates within 2 seconds at the 95th percentile (R17), the stylist stopping within half a second (R7), and video within 5 seconds (R8).

## 9. Cost estimate

Estimates behind the TQ2 budget, with what Phase 0 measured in three 10-minute demos on 19 Oct 2026.

**One full demo:** 10 minutes, all with video, 1 photo, 1 camera use, 4 rounds of looks.

| Item | All jobs on Opus 5.5 (first estimate) | Live jobs on Haiku 5.5 (chosen, TQ3) |
|---|---|---|
| Tavus video, 10 minutes | Comes out of the plan's included minutes | Same |
| OpenAI voice only | Nothing, unless video fails or is busy ($0.05 a minute) | Same |
| Claude: reading notes and feedback | About $0.60 (Phase 0 measured closer to $2.70) | Phase 0 measured about $0.05 for notes and camera together. With your option 3 in 2c (words twice a second), notes alone are about $0.14, if the shopper talks for 5 of the 10 minutes |
| Claude: camera and photo | About $0.15 | Included above, plus a few cents for a photo on Opus |
| Claude: looks and checks | About $0.30 | About $0.30 |
| Claude: voice-only facts | About $0.05, only in voice only | Same |
| **Per demo, apart from the Tavus plan** | **About $1.10** | **About $0.45** (looks and checks still to be measured in Phase 4) |

Fixed monthly costs: the Tavus plan ($22) and the Supabase project (about $10). Vercel stays free at this scale. GPT-Live needs a paid OpenAI account, which means a small prepaid credit, because the free tier doesn't support it.

**What each TQ2 budget buys, with video for the whole conversation:**

| Budget | Tavus plan | Full video demos a month | Notes |
|---|---|---|---|
| A, about $40 (chosen) | Starter, $22: 120 minutes on your account (the pricing page said 60), one call at a time, calls up to 10 minutes | About 12 | The rest covers AI use with plenty to spare, including voice-only demos once the video minutes run out |
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
| 11 | The database is down or paused when a recruiter clicks the link | A recruiter clicks your link and the app is down | The database is on Supabase Pro, which doesn't pause. An uptime check catches outages (originally about the free plan pausing) | 1 |
| 12 | Phone browser quirks: iPhone audio autoplay, camera switching, permissions | Phones are the main screen | Test on real phones from Phase 0, and start audio only after a tap | 0 |
| 13 | Sample catalog quality and image rights | Weak images make weak looks | One consistent photo style, every image reviewed, and the source recorded per image. No real brands | 1 |
| 14 | Fast-changing outside services (Tavus recently renamed "personas" to "PALs", and GPT-Live is new) | Updates can break the app | Connectors, pinned versions, contract tests, and a monthly check of change logs | All |
| 15 | The scope is large for one builder (72 requirements) | The project might never ship | Every phase ends in a working demo, and progress.md marks what can be cut | All |

## 11. Decisions and open questions

### Decisions

| Date | Decision | Status |
|---|---|---|
| 17 Oct 2026 | TypeScript, Next.js on Vercel, Supabase for data and guest sign-in | Agreed 18 Oct 2026 |
| 18 Oct 2026 | Tavus full pipeline for video, GPT-Live for voice only, our server for text only (TQ1, option A; text only removed on 19 Oct 2026), to keep costs lower. You accepted that the voice changes when the stylist drops to voice only, softened by a matched voice and a spoken heads-up | Your decision |
| 18 Oct 2026 | Video stays on for the whole 10-minute conversation, so voice only is used only when something goes wrong (product spec R13) | Your decision |
| 17 Oct 2026 | Claude runs every AI job behind one AI connector | Agreed 18 Oct 2026 |
| 17 Oct 2026 | The stylist core decides everything, and the stylist engines only listen and speak | Agreed 18 Oct 2026 |
| 17 Oct 2026 | Camera recognition runs on our server in every mode, so Tavus never receives the camera | Agreed 18 Oct 2026 |
| 18 Oct 2026 | Running budget of about $40 a month: Tavus Starter ($22) plus about $18 of AI use, with spending limits on every provider (TQ2, option A). Now about $50, with the Supabase project ($10) from 20 Oct 2026 | Your decision |
| 20 Oct 2026 | Phase 3 code review: A, "use this one" hears only clear requests ("use this one", "use that one", "use this", "capture", "take a photo or picture", or "this one" on its own). B, with nothing ticked, Style with these becomes Clear wardrobe items. C, the photo store tries a busy request again, rather than a separate Supabase project for tests (about $10 a month more) or leaving it | Your decision |
| 20 Oct 2026 | 3d: Add item uploads a photo on the Wardrobe page, read by the photo reader to suggest its details (Q1). Style with these shows the chosen items in My Styling Notes and tells the stylist; they stay chosen until changed (Q2). The Wardrobe page is linked from the session page and the welcome-back screen until the app menu, which joins Phase 7 (Q3) | Your decision |
| 20 Oct 2026 | 3c: "use this one" is heard by plain code in the page while an item is named on camera, rather than by the notes reader (Q1). The camera turns off after Capture (Q2) | Your decision |
| 20 Oct 2026 | 3b: once a photo is read, the stylist speaks up, naming the item and asking which one or whose it is (Q1). The photo eval uses 20 catalog photos and 4 two-item photos made from them (Q2). What the shopper says about the photo reaches it through the notes reader, in the same reading; three eval runs afterwards had 95 to 96% of notes within 2 seconds (Q3) | Your decision |
| 20 Oct 2026 | 3a: the browser sends a photo straight to the private photo store with a one-time upload link, and the server then checks and cleans it, keeping the 10 MB limit despite Vercel's 4.5 MB (Q1). Add a photo sits in My Styling Notes once the conversation has started (Q2). Up to 5 photos per session (Q3). Photos of sessions that ended from being idle are deleted on the next Start conversation or by the daily job (Q4) | Your decision |
| 20 Oct 2026 | Phase 2 code review: A, the session screen's call lifecycle moves into its own hook (components/session/use-conversation.ts) before the camera joins it. B, a call left behind is counted until the shopper's last activity plus 30 seconds, accepting it can undercount a call left running with nobody there | Your decision |
| 20 Oct 2026 | 2e: idle sessions are ended and their notes deleted by a database timer every 10 minutes, rather than only by the daily job (Q1). The time left and Time is up are checked by automated tests with a sped-up clock rather than a 10-minute call on your iPhone (Q2) | Your decision |
| 20 Oct 2026 | 2c, note speed (option 3): the notes reader runs Haiku 5.5 with thinking off, readings overlap, and words are sent about twice a second, within the existing limit of 2 a second. It's the only setup tested that meets R17 (97 to 99% of notes within 2 seconds, 96 to 99% right). Notes cost about 14 cents a demo instead of about 6. Also from the 2c plan: a clear voice correction keeps the note's status (Q1), and at most 12 notes a session, saved preferences not counted (Q2) | Your decision |
| 20 Oct 2026 | One Supabase project in your Pro organization ($10 a month), shared by development and the live site until launch, instead of two free projects. Your organization was already on Pro, where each project costs about $10 | Your decision |
| 19 Oct 2026 | Phase 0 gate (0g): video passed and stays on for the whole conversation; GPT-Live passed, with the quartz voice; cost passed at about $0.35 of AI per demo. Live notes are accurate but below the 95%-within-2-seconds target, so the gap is closed in Phase 2 with the target unchanged. TQ3: Haiku 5.5 for live notes and the camera, Opus 5.5 for the rest. Stock face TQ5: Anna - Casual | Your decision |
| 19 Oct 2026 | Product spec 1.4: no transcript or captions, no typing, a working microphone required, and free-form jotted notes. The connector has two engines, and the notes reader writes jotted notes plus hidden details | Your decision |

### Remaining questions (accepted defaults)

TQ1 and TQ2 are answered (see Decisions). TQ3 to TQ6 below were accepted with their recommended defaults on 18 Oct 2026.

| # | Question | Recommended default |
|---|---|---|
| TQ3 | Use Claude Haiku 5.5 for the two live jobs (reading notes and camera frames)? | Decided 19 Oct 2026 after Phase 0: yes, with the improved notes reader. Opus 5.5 for every other job. |
| TQ4 | When the monthly AI allowance is used up, show "The demo is resting until the 1st" on the welcome screen? | Yes. Added to product spec R13 in version 1.3. |
| TQ5 | Which Tavus stock face? | Pick in Phase 0 from the stock faces tuned for low delay, and use a still of it for the voice-only portrait (design DQ1). |
| TQ6 | Public or private code repository? | Public, so you can link it in applications. |

## 12. Change log

- **1.21 (20 Oct 2026):** Phase 3 code review (3e): HEIC size checked before decoding, failed readings counted by the budget guard, readings kept alive with after(), a photo or upload checked only once, choosing and removing photos take the session lock (migration photo_locks), the camera's 2 minutes kept through Switch camera, and your decisions A ("use this one" hears only clear requests), B (Clear wardrobe items) and C (the photo store tries a busy request again).
- **1.20 (20 Oct 2026):** 3d: the wardrobe as built: server-written items with copied photos, the permission recorded, Add item with the photo reader (your Q1), Style with these and From your wardrobe (your Q2), the links until the app menu (your Q3), and the stylist told everything as a call starts.
- **1.19 (20 Oct 2026):** 3c fix after your iPhone check: "use this one" counts for 8 seconds after an item was on screen, waits for a name said just before it, and takes one still however many pieces the words arrive in.
- **1.18 (20 Oct 2026):** 3c: the camera reader and frame endpoint as built, two frames in a row before an item is named, the stylist told by the page, "use this one" in plain code (your Q1), the camera off after Capture (your Q2), the privacy points, and the camera reader check.
- **1.17 (20 Oct 2026):** 3b: the photo reader as built (Opus 5.5 at low effort, streamed on the ready request, ink for sure details), item changes by touch and voice with the details' revision, the stylist told and speaking up (your Q1), the photo eval (your Q2) and photo cases in the notes eval (your Q3).
- **1.16 (20 Oct 2026):** 3a: photo upload as built. The browser sends a photo to a one-time upload link and the server checks and cleans it (your Q1), photos are the app's own record with versions and one active photo, up to 5 per session (your Q3), 30-minute links, and photos deleted at End, on the next start or by the daily job (your Q4).
- **1.15 (20 Oct 2026):** The Phase 2 code review (2f): ending a call claims it, left-behind calls counted until the last activity (your B), the session keeps the next question, a rate limit on note touches, the Phase 0 test pages deleted, the test guest pool, and the conversation hook (your A).
- **1.14 (20 Oct 2026):** 2e: time left and Time is up, a dropped call started again by itself up to 3 times, session data deleted at End and by the database timer (your Q1), calls left behind ended at Tavus, saving notes refused once a session ends, and fonts from the Fontsource packages.
- **1.13 (20 Oct 2026):** 2d: touches on a note show at once and are sent in order (section 5, pattern 5).
- **1.12 (20 Oct 2026):** 2c: the notes reader as built. Words twice a second with overlapping readings, Haiku 5.5 with thinking off (your option 3), notes saved only by the server, the words sequence and merge rules, the words and notes endpoints, and the notes eval.
- **1.11 (20 Oct 2026):** 2b: the connector's microphone event, and the stage's state worked out from the events in one tested rule set (lib/stage.ts). The microphone is checked before the server starts a call, so a blocked microphone never uses Tavus minutes.
- **1.10 (20 Oct 2026):** 2a: the conversation connector's files and fake engine, Start conversation and End as built, server-owned sessions with the call and its reserved time, and your answer that, until 6c, the conversation doesn't start when video is unavailable.
- **1.9 (20 Oct 2026):** System pattern 11, screens start from saved data, after your iPhone check found setup showing and saving old answers.
- **1.8 (20 Oct 2026):** Phase 1 code review: rows can only point at the same guest's session, look, preference or check result; from Phase 2 the app's own records are read-only for guests and written by the server (your decision A); the few-cents AI overshoot is accepted (your decision B).
- **1.7 (20 Oct 2026):** 1f: your limits (10 minutes and $1 of AI per guest per day; 110 video minutes, $12 of Claude and $4 of OpenAI a month, counted in UTC), the server key also used for the budget guard's records, last-active time updated on every visit, how the guard reserves and records, and what the daily job does.
- **1.6 (20 Oct 2026):** 1e: the image generator you picked (OpenAI gpt-image-2 at medium quality, through the half-price Batch API), photos served from the site itself, the catalog connector's filters and required details, and the catalog's load and check scripts.
- **1.5 (20 Oct 2026):** 1b: the server key may also create test guests in automated tests (your decision), guest profiles are created by a trigger, rate limits live in the database, and the security policy details.
- **1.4 (20 Oct 2026):** One Supabase project in your Pro organization, shared until launch ($10 a month), the running budget now about $50, and risk 11 updated, because Pro projects don't pause.
- **1.3 (19 Oct 2026):** Phase 0 results and your 0g decisions: TQ3 (Haiku 5.5 for live notes and the camera, Opus 5.5 for the rest), the stock face (TQ5), the quartz voice, GPT-Live session details, Tavus conversations hard-deleted, Android not tested in v1, Tavus Starter's 120 minutes (about 12 demos), and the measured cost per demo.
- **1.2 (19 Oct 2026):** Updated for product spec 1.4: two conversation engines (text only removed), the notes reader writes jotted notes plus hidden details, notes are confirmed or removed by touch, and live words are never shown on screen. Updated sections 1, 3, 4, 5, 6, 9 and 11.
- **1.1 (18 Oct 2026):** Added CLAUDE.md, interview-notes.md and docs/ to the code layout. No decisions changed.
- **1.0 (18 Oct 2026):** Agreed by you, with the recommended answers for TQ3 to TQ6. Same content as 0.4, apart from status updates.
- **0.4 (18 Oct 2026):** Video now lasts the whole conversation (product spec 1.2). Updated the voice-only switch, cost limits, the cost estimate, a new budget table for TQ2, and risk 8. TQ2 answered A: about $40 a month.
- **0.3 (18 Oct 2026):** Added how the voice switch is softened (section 4.2 and risk 8) and the reason for TQ1. Now builds on product spec 1.1 and design 0.3.
- **0.2 (18 Oct 2026):** TQ1 answered A. Recorded it under Decisions, removed it from the open questions, and updated risk 8.
- **0.1 (17 Oct 2026):** First draft, based on product spec 1.0 and design 0.2.

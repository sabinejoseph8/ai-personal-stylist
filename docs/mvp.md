# AI Personal Stylist: MVP Scope

**Status:** Living document, version 1.0
**Last updated:** 18 Oct 2026
**Built from:** MVP PRD v1.8 and Prioritized Backlog v1.8 (7 Oct 2026, in the project root), product spec 1.3, design 0.6, tech spec 1.1 and progress.md
**Rule:** this file explains why the plan is the way it is. If it disagrees with product-spec.md, design.md, tech-spec.md or progress.md, those agreed files win, and this file is updated to match.

---

## 1. The MVP in one paragraph

A mobile-first web app where you talk face to face with a lifelike AI stylist on video, show what you own on camera or in a photo, and watch your preferences appear in My Styling Notes. The stylist then builds complete looks that mix your clothes with sample products and refines them as you react. Nothing can be bought. It is a portfolio project: a hiring manager can try it with no sign-up, and it runs on about $40 a month.

## 2. In and out of v1

**In v1**
- The video stylist (Tavus), with voice only and text only as fallbacks.
- My Styling Notes, filled in live while you talk and editable by voice or touch.
- Items to style around, from a photo or the live camera.
- A wardrobe of owned items.
- Three checked looks, swaps, and feedback rounds with undo and compare.
- The preference check: no look breaks a saved preference or a confirmed note.
- Saved looks and a demo bag that cannot check out.
- Privacy controls: clear, download and delete.
- Accessibility: everything works by touch, keyboard or typing.
- Portfolio extras: sample phrases, the About this project page, and the Behind the scenes panel.

**Out of v1**
- Real retailers (ASOS and FARFETCH), checkout, affiliate links, real prices and stock.
- Email or social sign-in, and syncing across devices.
- Native iOS and Android apps.
- Other languages, and currencies other than US dollars.
- Virtual try-on, and a choice of stylists or voices.
- Ads or any other way of making money.

## 3. How the plan changed from the PRD

| Topic | PRD v1.8 | Agreed plan | Why | Decided |
|---|---|---|---|---|
| Platform | Mobile-first, platform not set | A web app that opens from a link | Recruiters can try it without installing anything | 17 Oct 2026, product spec |
| Video stylist and live camera | P0 | Both in v1 (Q1, option B) | The lifelike stylist is the experience | 17 Oct 2026, Sabine |
| Accounts | Accounts and style profiles | One-tap guest accounts kept for 7 days, plus a sample profile (Q2, option A) | Recruiters won't sign up to try a portfolio project | 17 Oct 2026, Sabine |
| Conversation layer | OpenAI Realtime for speech, with a Tavus face | Tavus runs the whole video conversation. OpenAI GPT-Live is only a voice-only fallback, and our server handles text only (TQ1) | The PRD pairing needs an always-on media server and adds delay. This setup costs less and is simpler | 18 Oct 2026, Sabine |
| Video length | Not set | Video for the whole 10-minute conversation. Voice only is used only when something goes wrong | One consistent voice, at the cost of fewer demos a month | 18 Oct 2026, Sabine |
| Voice change on fallback | Not set | A matched OpenAI voice, and the line "I'm switching to voice only, so I'll sound a little different." | Makes the rare switch less jarring | 18 Oct 2026, Sabine |
| Live camera recognition | A vision session | Frames read by our server and thrown away, never sent to Tavus. The camera turns off after 2 minutes | Privacy, and it works in every mode | 18 Oct 2026, tech spec |
| AI for notes, photos, looks and checks | Not set | Claude, with Opus 5.5 for every job until Phase 0 measures speed and cost (TQ3) | Reliable structured output, image understanding and careful rule following | 18 Oct 2026, Sabine |
| Running cost | Not set | About $40 a month, with daily limits per guest and a "demo is resting" state (TQ2, TQ4) | A fixed, small budget | 18 Oct 2026, Sabine |
| PRD open decisions | Launch region, audience, money, public demo bag | US English and US dollars; adults shopping womenswear, menswear or both; no money-making; demo bag shown with checkout disabled | Sensible defaults for a portfolio demo | 17 Oct 2026, product spec |
| Contract tests and end-to-end tests (D19, D20) | Release R2 | Built in Phases 1 and 7 | Testing from the start keeps a solo build safe | 18 Oct 2026, progress.md |

## 4. Success criteria

**Product goals** (product spec section 3)
1. Feel understood: preferences appear in My Styling Notes while you talk, and anything can be fixed.
2. Style what they own: looks are built around a photo or camera item.
3. Reach a look they love: feedback rounds keep what you asked for.
4. Never be contradicted: no look breaks a saved preference or a confirmed note.
5. Easy to show: a first-time visitor reaches a first look in under 3 minutes.

**The PRD's release gate, as the plan checks it**
- A demo user can talk to the stylist, show an owned item, save it, get three coordinated looks, swap a piece, save a look, and put sample products in a bag that cannot check out.
- Owned items are never in totals, and no sample product can be bought or shown as live stock.
- Catalog connector contract tests pass.
- Refusing the camera or microphone still leaves a working app.
- Mixed feedback gives a revised look that keeps confirmed requirements and kept pieces, round after round.
- The item photo stays visible in the notebook through refinement.
- Every look passes the preference check before anyone sees it.

**How they are checked:** success checks S1 to S20 in the product spec, spread across the phases and run in full in task group 7c.

**Portfolio success (default)**
- About 6 full video demos a month within about $40.
- The link works whenever a recruiter clicks it.
- The About page and interview-notes.md tell the story behind the product.

## 5. Risks

The tech spec's risk table has the full detail. This list tracks status.

| # | Risk | Handled in | Status |
|---|---|---|---|
| 1 | The video stylist feels slow or out of sync | Phase 0 gate | Open |
| 2 | Live notes miss the 2 second target | Phase 0 (0d) | Open |
| 3 | Tavus allows one call at a time and a fixed number of minutes | Phase 0 test, Phase 6 fallback | Behavior confirmed in 0c, and the fallback is still to build |
| 4 | A public link runs up costs | Phase 1 (1b, 1f) | Open |
| 5 | Late updates overwrite newer choices | Phase 2 (2c) | Open |
| 6 | The preference check lets a breaking look through | Phase 4 (4b) | Open |
| 7 | GPT-Live doesn't send the live words notes need | Phase 0 (0e) | Open |
| 8 | The voice changes when the stylist drops to voice only | Softened with a matched voice and a spoken line | Accepted |
| 9 | Recognition reads garments wrong | Phase 3 (3b) | Open |
| 10 | Provider data handling for audio and words | Phase 0 (0f) | Reviewed in 0f. One gap: Tavus publishes no retention period, so deleting each conversation is recommended |
| 11 | The free database pauses after 7 days without activity | Phase 1 (1f) | Open |
| 12 | Phone browser quirks | Phase 0 (0f) | Open |
| 13 | Sample catalog quality and image rights | Phase 1 (1e) | Open |
| 14 | Outside services change quickly | Every phase | Open |
| 15 | The scope is large for one builder | Task groups, and the cut list in progress.md | Open |
| 16 | Looks feel generic or badly matched (the PRD's "fashion relevance" risk) | Phase 4 looks evals, and you reviewing sample looks | Open |

## 6. Assumptions

| Assumption | Based on | Checked in |
|---|---|---|
| Tavus Starter costs $22 a month, one call at a time, calls up to 10 minutes, with no overage. Sabine's plan shows 120 minutes a month, not the 60 the pricing page showed on 17 Oct 2026, which allows about 12 full video demos a month instead of 6 | Sabine's Tavus account, 18 Oct 2026 | Phase 0 (0c, 0f). Update tech spec section 9 and the portfolio goal in 0g |
| Tavus audio-only minutes cost the same as video minutes | Tavus doesn't say. Its billing docs count any open call | Phase 0 |
| GPT-Live costs $0.05 a minute and needs a paid OpenAI account | OpenAI's model page, 17 Oct 2026 | Phase 0 |
| GPT-Live sends live words that the notes reader can use | Not confirmed in OpenAI's docs | Phase 0 (risk 7) |
| Claude Opus 5.5 costs $4 per million input tokens and $20 per million output tokens; Haiku 5.5 costs $0.10 and $0.50 | Anthropic's model table, Oct 2026 | Phase 0 costs |
| A full demo uses about $1.10 of AI with Opus 5.5 for every job | Tech spec section 9 estimate | Phase 0 (0f) |
| Supabase pauses free projects after 7 days without activity, and a daily job prevents it | Third-party pricing guides | Phase 1, then the uptime check |
| Vercel's free Hobby plan allows this personal, non-commercial portfolio project | Vercel's Hobby plan docs (checked 18 Oct 2026): personal, non-commercial use only, which fits a portfolio project with no money-making. Hobby also limits functions to 5 minutes and keeps runtime logs for 1 hour | Checked in 0b |
| About 150 sample products are enough for three different looks for common occasions | Estimate | Phase 1 (1e) and Phase 4 |
| About 6 full demos a month is enough for job applications | The $40 budget | Phase 7 monitoring |

## 7. Decisions log

Newest first. The agreed files hold the detail.

| Date | Decision | Made by | Recorded in |
|---|---|---|---|
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
| 18 Oct 2026 | Tavus full pipeline for video, GPT-Live for voice only, our server for text only, to keep costs lower (TQ1) | Sabine | tech spec |
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
| Stylist stops when interrupted | Half a second or less | Works by voice and button. The button path took 0.7 seconds, including the network | 18 Oct 2026 | Talking over her felt immediate to Sabine. A precise voice timing comes in 0f |
| Lip sync | Looks natural to Sabine | "As natural as we can expect" | 18 Oct 2026 | Anna - Casual, Phoenix 4.5 |
| Tavus live words for notes | Shopper's words arrive while speaking | Yes: conversation.utterance.streaming carries role "user" partial text while the shopper speaks | 18 Oct 2026 | The stylist replied about 1.3 seconds after the shopper stopped |
| Live notes on Opus 5.5 | 95% within 2 seconds | Fail on speed: 10% within 2 seconds (95th percentile 4.0 s, each call about 2.5 s). Pass on accuracy: all 30 notes right, including R18 and the $350 correction. Cost $0.75 for the 11 test sentences | 18 Oct 2026 | Effort low, structured output. Rough estimate: about $2.70 of notes per 10-minute demo if the shopper talks half the time, against $0.60 in the tech spec |
| Live notes on Haiku 5.5 | 95% within 2 seconds | Fail, but close: 83% within 2 seconds (95th percentile 2.9 s, each call about 1.3 s). Less accurate: it dropped "outdoor" from the R18 occasion, marked the $500 budget To confirm, and missed the $350 correction. Cost $0.02 for the same sentences | 18 Oct 2026 | Same prompt as Opus. Rough estimate: about $0.07 of notes per demo. Options for 0g: Haiku with a tuned prompt, plain code for money and dates (already planned in 2c), or both |
| Live notes on Haiku 5.5 at medium effort (extra run you asked for) | 95% within 2 seconds | Fail: 53% within 2 seconds (95th percentile 2.6 s, each call about 1.7 s). Caught the $350 correction this time, but its final wedding notes still dropped "outdoor" and marked emerald green To confirm. Cost $0.02 | 18 Oct 2026 | Every other run used low effort. More thinking made Haiku as slow as Sonnet at low effort, without matching Sonnet's accuracy |
| Live notes on Haiku 5.5, improved (option B, you asked for it) | 95% within 2 seconds, and accuracy first | Accuracy: every final note right in 4 runs (30 of 30 twice on the main sentences, 12 of 12 twice on 5 held-out sentences written before tuning), and R18 passes. The old Haiku reader got 29 of 30 and 11 of 12 in the same session. Speed: 75% to 90% within 2 seconds (95th percentile 2.1 to 2.9 s). Cost about $0.02 per main run | 18 Oct 2026 | Low effort. Better instructions with examples, plus plain code that reads money and dates (spikes/notes-speed/notes-reader-v2.mjs). About $0.07 of notes per demo. Still a small test (42 notes), so Phase 2's 30-utterance eval is the real check |
| Live notes on Sonnet 5.5 (extra run you asked for) | 95% within 2 seconds | Fail on speed: 53% within 2 seconds (95th percentile 3.1 s, each call about 1.7 s). Pass on accuracy: all 30 notes right, including R18 and the $350 correction. Cost $0.37 for the 11 test sentences | 18 Oct 2026 | Same prompt and settings. Rough estimate: about $1.35 of notes per demo |
| GPT-Live live words | Available | | | |
| Camera naming time | A few seconds | Pass. Haiku 5.5: about 1 second (0.7 to 1.3 s). Opus 5.5: about 1.5 to 2 seconds (up to 3.2 s). Accuracy needs work on both: Sabine showed an avocado earbud case, a camo Herschel pouch and a black quilted tote bag, and both models sometimes called the quilted tote a "quilted jacket" that wasn't there. Haiku also once called the tote brown and once replied in a full sentence. Opus wobbled between charcoal and dark gray | 18 Oct 2026 | One frame every 2 seconds, 640 px, low effort, iPhone back camera. Rough cost for 2 minutes of camera: under 1 cent on Haiku, about 18 cents on Opus. Phase 3 needs the R28 confirm step, plus a rule to only name an item after the same answer on two frames in a row |
| A second Tavus call during the first | Behavior understood | Refused within 2 seconds: HTTP 400, "User has reached maximum concurrent conversations" | 18 Oct 2026 | Phase 6 can catch this exact error and switch to voice only |
| iPhone Safari, Android Chrome and laptop | All work | | | |
| AI cost per demo | About $1.10 or less | | | |

### Provider data handling (0f, risk 10)

Checked 18 Oct 2026 against each provider's own pages. These change, so check again before launch (7c).

| Provider | What it receives from a shopper | Trains AI on it? | How long it keeps it | Our settings |
|---|---|---|---|---|
| Tavus (video stylist) | The shopper's voice and the conversation transcript. Never the camera | Its pricing page says it doesn't train on customer data, but its terms let it use customer content to "maintain and improve" its services | No period is published for conversation data. Zero data retention is Enterprise only | Recording off, perception off, camera never sent. Tavus offers a hard delete of each conversation |
| OpenAI (voice only, GPT-Live) | The shopper's voice and transcript, only in voice-only mode | No (API data isn't used for training) | Up to 30 days in abuse-monitoring logs. Sessions aren't stored by default | `store` left off |
| Anthropic (notes, photos, camera, looks) | Transcript text, photos and camera frames | No (commercial terms) | Deleted within 30 days. Up to 2 years if flagged for a usage policy breach | Our server keeps only the resulting notes and confirmed photos, never frames or transcripts |

**Gaps to close**
- Tavus publishes no retention period for API conversations. Recommended: hard-delete each Tavus conversation when the session ends. Needs Sabine's OK (see the decision below).
- Tavus's terms make us responsible for any consent its processing needs. The microphone permission card (R6) should say plainly that the voice is processed by Tavus, or by OpenAI in voice only.
- For Phase 6 security: limit which events the browser may send on the GPT-Live data channel, so only our server can feed the stylist facts.

**Draft for the About page (for Sabine's review)**

> **Your data in this demo.** Your voice goes to Tavus, which runs the video stylist, or to OpenAI if the stylist switches to voice only. Your words, photos and camera frames go to Anthropic's Claude, which writes your notes and builds your looks. None of these services train their AI on what you share here. OpenAI and Anthropic delete it within 30 days, and we ask Tavus to delete each conversation when it ends. Calls are never recorded, and your camera is never sent to the video service. This app keeps only your notes, your saved looks and the photos you choose to save, for 7 days without use, and you can download or delete everything at any time.

Sources: [Tavus privacy policy](https://www.tavus.io/privacy-policy) (12 Nov 2025), [Tavus terms](https://www.tavus.io/terms-of-service) (24 Apr 2025), [Tavus pricing](https://www.tavus.io/pricing), [Tavus Delete Conversation](https://docs.tavus.io/api-reference/conversations/delete-conversation), [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data), [Anthropic data retention](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data) (1 Jul 2026).

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
| D08 | Photo capture and upload | Phase 3 (3a) | Planned |
| D09 | Live camera item showing | Phase 3 (3c) | Planned |
| D10 | Clothing recognition and correction | Phase 3 (3b) | Planned |
| D11 | Wardrobe | Phase 3 (3d) | Planned |
| D12 | Outfit recommendations | Phase 4 (4a, 4b) | Planned |
| D13 | Visual outfit builder | Phase 4 (4c) | Planned |
| D14 | Voice and touch swapping | Phase 4 (4c) | Planned |
| D15 | Saved outfits | Phase 6 (6a) | Planned |
| D16 | Demo shopping bag | Phase 6 (6a) | Planned |
| D17 | Consent, deletion and retention | Phase 1 (1a, 1f), Phase 6 (6b) | Planned |
| D18 | Accessibility and resilient experience | Phase 7 (7a), and every phase | Planned |
| D19 | Contract tests and usage tracking | Phase 1 (1e, 1f), moved earlier than the PRD's R2 | Planned |
| D20 | End-to-end tests and release gate | Phase 7 (7c) | Planned |
| D21 | Live preference capture | Phase 2 (2c) | Planned |
| D22 | My Styling Notes panel | Phase 2 (2d) | Planned |
| D23 | Not specified, To confirm and Confirmed states | Phase 2 (2c, 2d) | Planned |
| D24 | Touch editing | Phase 2 (2d) | Planned |
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
| D35 | Session photos and thumbnails | Phase 3 (3a) | Planned |
| D36 | The item photo in the notebook | Phase 3 (3a) | Planned |
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

- **1.0 (18 Oct 2026):** First version, built from PRD v1.8, backlog v1.8 and the agreed plan files.

# AI Personal Stylist: Product Spec

**Status:** Agreed, version 1.6 (28 Oct 2026)
**Last updated:** 19 Oct 2026
**Based on:** MVP PRD v1.8 and Prioritized Backlog v1.8 (7 Oct 2026), both in the project root
**Next step:** the tech spec builds on this agreed version. Any later change gets a new version number and a change log entry.

**How to read this spec**
- It says what the product does for people, not how it is built.
- References like (FR-11), (AC-01) or (D28) point back to the PRD and backlog, so every requirement can be traced to its source.
- **(default)** marks a sensible default I added that is not in the PRD. Change any of them.
- Q1 and Q2 were answered on 17 Oct 2026 and now appear under Decisions. Section 13 lists what changed in this version.

---

## 1. Overview

**What it is.** A mobile-first web app where you talk face to face with a lifelike AI stylist on video. You can show clothes you own on your camera or in a photo. While you talk, the stylist jots down short notes of what you want in **My Styling Notes**, a notebook on screen. There is no transcript: the notes are the only written record, and you can confirm or correct any of them. It then builds complete outfits that mix clothes you own with sample products, and keeps refining them as you say what you like and dislike.

**Who it is for.** Adults who shop womenswear, menswear or both, and want help putting together a look for an occasion, using what they own and staying within budget.

**Retailer-independent.** Every product is a clearly labeled sample. Nothing can be bought in v1. Real retailers (ASOS and FARFETCH are shortlisted) come later.

**Why it is being built now (default).** It is a portfolio project. A hiring manager should be able to try it in a few minutes with no sign-up and see the product thinking behind it. It must run on a small, fixed budget.

## 2. Key terms

- **Session:** one styling conversation, from Start conversation to End.
- **Note:** one short line the stylist jots down in My Styling Notes, such as "Budget: up to $500". Each note is either To confirm or Confirmed.
- **Look:** a complete outfit made of several items. A **revision** is a new version of a look after feedback.
- **Saved preference:** something stored in the shopper's profile. There are three kinds: Must have, Never, and Likes.
- **Session exception:** the shopper's permission to break a saved preference for this session only.
- **Item to style around:** a photo the shopper adds so that looks are built around that item.
- **Sample product:** a made-up product from the demo catalog. It cannot be bought.
- **Voice only:** the stylist carries on without video, shown as a still portrait.
- **Show on camera:** holding an item up to the camera during a session so the stylist can recognize it.

## 3. Goals

1. **Feel understood.** A shopper talks face to face with a lifelike stylist, watches the stylist jot down notes in My Styling Notes, and fixes anything by voice or touch.
2. **Style what they own.** A shopper shows an item on camera or in a photo and gets complete outfits built around it.
3. **Reach a look they love.** A shopper says what they like and dislike and gets a revised look, round after round, without losing what they asked for.
4. **Never be contradicted.** No outfit appears that breaks a saved preference or a confirmed requirement.
5. **Easy to show (default).** A first-time visitor gets from the welcome screen to their first look in under 3 minutes, on a phone or a laptop.

## 4. Users

| User | What they need | Sign-in |
|---|---|---|
| **Shopper** | Outfit help for an occasion, built around what they own and within budget | No sign-up. Try the demo creates a private guest account in that browser |
| **Portfolio visitor** (recruiter, hiring manager, interviewer) | Understand the product fast, often at a desk without a headset | Same guest flow, with a working microphone. Can tap sample phrases to get started, and the stylist answers on video (default) |
| **You, the project owner** | Demo it in interviews and keep running costs predictable | Same guest flow. Time limits protect the budget (default) |

Guest accounts (decided in Q2):
- A guest's profile, wardrobe, saved looks and bag stay available in that browser.
- Guest data is deleted automatically after 7 days without use.
- A guest can only ever see their own data.

## 5. User stories

**A. Getting started**
- As a visitor, I can see what the app does and start in one tap, without creating an account.
- As a shopper, I can set my style, sizes, budget and saved preferences, or start from a sample profile.
- As a shopper, I am asked for the microphone only when I start talking, with a clear reason. The stylist needs it to hear me.

**B. Talking to the stylist**
- As a shopper, I can talk with a lifelike stylist on video, and switch to voice only whenever I like.
- As a shopper, I can talk naturally and interrupt the stylist, as in a real conversation.
- As a shopper, I see notes, not a word-for-word transcript of what we say.

**C. My Styling Notes**
- As a shopper, I can watch the stylist jot down notes while I am still speaking, including any detail that matters to me.
- As a shopper, I can tell which notes are confirmed and which still need confirming.
- As a shopper, I can tap a note to confirm or remove it, or simply say a correction.
- As a shopper, I can collapse the notebook and reopen it without losing anything.

**D. Showing an item**
- As a shopper, I can hold an item up to my camera while I talk, and the stylist recognizes it.
- As a shopper, I can upload or take a photo of an item and see it in my notebook right away.
- As a shopper, I can confirm or correct what the stylist thinks the item is, and say whether I own it or it is inspiration.
- As a shopper, I can replace or remove the photo, or choose which item to use when a photo shows several.

**E. My wardrobe**
- As a shopper, I can save items I own, edit or delete them, and pick several to style with.

**F. Outfits**
- As a shopper, I get three complete looks that combine my own items with sample products.
- As a shopper, I can always tell which pieces I own and which are samples.
- As a shopper, I can swap a piece by voice or touch and see the total update.

**G. Feedback and refinement**
- As a shopper, I can say what I like and dislike about a look and get a revised look.
- As a shopper, I can see my feedback in the notebook and correct it.
- As a shopper, I can keep refining over several rounds, undo my last feedback and compare earlier looks.

**H. Saved preference check**
- As a shopper, I never see an outfit that breaks my saved preferences or confirmed notes.
- As a shopper, if I ask for something that clashes with a saved preference, the stylist asks me first. The change applies only to this session unless I choose to save it.

**I. Saving and the demo bag**
- As a shopper, I can save a look and reopen it later.
- As a shopper, I can collect sample products in a demo bag, and it is clear they cannot be bought.

**J. Privacy and control**
- As a shopper, I decide what is kept after the session, and I can clear my notes, download my data or delete everything.

**K. Accessibility**
- As a shopper, I can do everything apart from the conversation itself by touch or keyboard. The conversation needs my voice in v1.
- As a screen reader user, I hear what changed in my notes without losing my place.

**L. Portfolio visitor (default)**
- As a visitor, I can tap a suggested example phrase to get started quickly.
- As a visitor, I can read how and why the product was built.
- As a visitor, I can open Behind the scenes to see what the stylist captured and why each look passed its preference check.

## 6. Functional requirements

Each requirement can be checked by using the app. Empty, loading and error states are included.

### Getting started

- **R1 Welcome.** The welcome screen explains the app in a few lines and offers **Try the demo**. It states that all products are samples and nothing is for sale. (default)
- **R2 Instant guest start.** Try the demo opens setup without asking for an email or password. If the guest account cannot be created, the screen shows "We couldn't start your demo" and **Try again**. (Q2)
- **R3 Returning guest.** Returning in the same browser within 7 days shows the guest's profile, wardrobe, saved looks and bag. After 7 days without use, the data is deleted and the guest starts fresh. (Q2)
- **R4 Profile setup.** The shopper can set departments (womenswear, menswear or both), style words, sizes, a default budget, and saved preferences of three kinds: **Must have** (for example "sleeves"), **Never** (for example "high heels") and **Likes** (for example "earth tones"). Must have and Never are firm rules. Likes only guide choices. Every step can be skipped. (Journey 1, FR-03, FR-28; departments are a default)
- **R5 Sample profile.** **Use a sample profile** fills setup with ready-made answers, including the saved preference "Never: high heels", so the preference check is visible straight away. (Q2)
- **R6 Microphone required.** Before the browser asks, the app explains why it needs the microphone. Talking with the stylist needs a working microphone. If the shopper says no, has no microphone, or it stops working, the app says the stylist can't hear them and explains how to turn the microphone on. The conversation can't start or carry on until it works. (FR-04; a working microphone is required, decided 19 Oct 2026)

### Talking to the stylist

- **R7 Two-way voice.** The shopper and stylist talk in real time. When the shopper starts speaking, the stylist stops talking, voice and video together, within half a second. (FR-01; the half-second target is a default)
- **R8 Lifelike stylist.** The top area shows one photorealistic female stylist on video, with lip movement that matches the speech. The video appears within about 5 seconds of **Start conversation**, with Connecting shown until then. The stylist's current state is always written in words: Connecting, Listening, Thinking, Speaking, Muted, Reconnecting or Voice only. (FR-02, D06; the 5 second target is a default, to be confirmed in the early avatar test)
- **R9 Voice only.** If the video cannot start, freezes or stops keeping up with the voice, or the video stylist is busy with another visitor or out of minutes for the month, the stylist continues in voice only, shown as a still portrait of the same stylist. The voice only voice is picked to sound as close as possible to the video stylist's voice. When the switch happens during a conversation, the stylist says out loud: "I'm switching to voice only, so I'll sound a little different." The shopper can also choose **Voice only** at any time and turn video back on later. Notes and looks are never affected. (FR-02, D06; the matched voice and the spoken line were added on 18 Oct 2026)
- **R10 No transcript.** The screen never shows a word-for-word transcript of the shopper or the stylist, and there are no captions. The stylist's voice and My Styling Notes are the only output. (Replaces the transcript captions in FR-01 and AC-06; decided 19 Oct 2026)
- **R11 Typing is out of scope for v1.** The shopper can't type to the stylist in v1. Typing is a future feature (section 9). (Replaces typing in D18; decided 19 Oct 2026)
- **R12 Sessions.** A session starts with **Start conversation** and ends with **End** or after 30 minutes without activity. Before then, it can be resumed in the same browser. (default)
- **R13 Time limits.** Each guest gets up to 20 minutes of conversation per day, all with the video stylist (10 until your decision of 28 Oct 2026). A single video call lasts at most 15 minutes, the Tavus plan's limit, so a longer conversation carries on in a second call by itself, with nothing lost. Time left is shown during the last 2 minutes. Voice only is used only when something goes wrong (R9). When conversation time runs out, or the demo's monthly allowance is used up, the app says so and the conversation ends for now. Notes and looks stay on screen until the session ends. If the AI allowance is used up as well, the welcome screen says the demo is resting until the 1st of next month and links to About this project. (default; video for the whole conversation set by you, and the resting message added from tech spec TQ4, on 18 Oct 2026; text only removed on 19 Oct 2026)
- **R14 Connection problems.** If the connection weakens, the stylist drops to voice only first. If voice drops too, the stylist area shows Reconnecting and tries again up to 3 times. The conversation pauses, and notes and looks stay on screen. If it cannot reconnect, the app offers **Try again**. (FR-02, nonfunctional; 3 tries is a default)

### My Styling Notes

- **R15 A notebook, not a form.** The notebook, titled **My Styling Notes**, looks like a notebook page with no fixed fields. As the shopper talks, the stylist jots down short notes of anything relevant: the occasion, timing, colors to wear or avoid, style, budget, outfit ideas, items they own, and any other detail that matters, such as "Maid of honor" or "Ceremony on grass". Notes are short summaries, never word-for-word quotes. A short line explains that notes can be confirmed or removed by touch, and changed by voice. (FR-11, FR-12; free-form notes decided 19 Oct 2026)
- **R16 Pencil, then ink.** A note the stylist isn't sure about is jotted in pencil and marked To confirm. Once the shopper confirms it, by tapping or by saying so, it turns to ink and reads Confirmed. Status is always written in words, never shown by color alone. Only confirmed notes act as firm requirements. (FR-13, AC-06)
- **R17 Capture while speaking.** Notes appear while the shopper is still talking, before a long turn ends. 95% of updates appear within 2 seconds of a clear phrase. Unclear details are jotted as To confirm. Nothing is guessed: if the shopper hasn't said something, there's no note for it. (FR-13, FR-17, AC-02, AC-08)
- **R18 The wedding example.** Saying "I'm going to an outdoor wedding in November. I'd like something elegant, preferably emerald green, and my budget is $500" produces notes like these, in the stylist's words:
  - Outdoor wedding, November
  - Elegant
  - Emerald green, preferred
  - Budget: up to $500

  Nothing is jotted about the outfit type or owned items yet, so the stylist asks whether the shopper would prefer a dress or a pantsuit. (AC-01, D28)
- **R19 One useful question at a time.** The stylist asks a short follow-up only when a missing or unclear detail matters for the next look. When the question has clear options, they also appear as buttons to tap. (FR-13; tap buttons are a default)
- **R20 Confirm or remove by touch.** Tapping a note shows **Confirm** and **Remove**. Confirming turns it to ink within 1 second. Removing takes it out of the notebook, with **Undo** for 5 seconds, and affected looks refresh. There is no keyboard: to change what a note says, the shopper says the correction (R21). (FR-14, AC-03; no typing decided 19 Oct 2026)
- **R21 Correct by voice.** Saying "Actually, make my budget $350" replaces the budget within 2 seconds of being understood, and the stylist acknowledges it. If a correction is unclear or clashes with another requirement, the note shows To confirm and the stylist asks which value to use. (FR-15, AC-04)
- **R22 Latest word wins.** A late update from earlier speech never overwrites a newer spoken correction, or brings back a note the shopper removed. (FR-17, AC-08)
- **R23 Collapse and reopen.** The notebook collapses to a one-line summary, with the item thumbnail if there is one, and reopens with every note and status intact. (FR-12, AC-09)
- **R24 Saved preferences in view.** The notebook also shows the saved preferences that apply to this session, jotted at the top of the page, such as "Never: high heels". (FR-28)
- **R25 Empty and error states.** At the start of a session the page is blank, with a line saying notes will appear as the shopper talks. If live capture stops working, the notebook shows "Notes paused", and confirming or removing notes by touch still works. (default)

### Showing an item

- **R26 Add a photo.** The shopper can upload a photo or take one with the phone camera. JPEG, PNG, WebP and HEIC files up to 10 MB are accepted. Other files show a message that says what is accepted. (FR-04, D08; formats and size are defaults)
- **R27 Photo appears at once.** The photo appears under **Style around this item** as soon as it loads, before analysis finishes. Its shape is kept and the garment is not cropped. It can be enlarged by tap or keyboard. When the notebook is collapsed, a thumbnail and label stay visible. (FR-24, AC-IMG-01)
- **R28 Item recognition.** The stylist identifies the item's type, main colors, pattern and style, and shows "Analyzing" while it works. Uncertain details show To confirm. They can be confirmed by touch and corrected by voice. (FR-05, FR-25)
- **R29 Several items in one photo.** The stylist asks which item to style around and clearly marks the chosen one. (FR-25, AC-IMG-02)
- **R30 Owned or inspiration.** The shopper confirms whether the item is theirs or an inspiration. Until then it shows To confirm, and nothing is saved or priced automatically. Owned items appear in looks with their own photo and are left out of totals. Inspiration items never show a price or claim to be a specific product. Suggested alternatives are labeled "Similar sample". (FR-26, AC-IMG-02, AC-IMG-03)
- **R31 Replace and remove.** The shopper can replace or remove the photo, or switch the active photo when there are several. Thumbnails show which one is active. Replacing or removing updates the notes and refreshes affected looks. Removing never deletes a saved wardrobe item. A late analysis result never brings back an old photo. (FR-25, FR-26, AC-IMG-03)
- **R32 Photo failures.** If upload fails, the photo stays in place with **Try again**. If recognition fails, the photo stays visible and the shopper can describe the item out loud instead. If the camera is unavailable, uploading a saved photo still works. (FR-27, AC-IMG-04)
- **R33 Show it on camera.** During a session, the shopper can tap **Camera** to show an item live while talking. The camera stays off until then, and its permission is asked for separately from the microphone. While it is on, the shopper sees their own camera view marked "Camera on" and can turn it off at any time. On phones the back camera opens first, with **Switch camera** to change. (FR-04, D09; back camera first is a default)
- **R34 Recognize what's shown.** The stylist names the item being shown and asks about anything uncertain. If several items are visible, it asks which one to use. **Capture**, or saying "use this one", takes a still photo, which then behaves exactly like an uploaded photo (R27 to R32). (FR-04, FR-05, FR-25, D09; capturing a still is a default)
- **R35 No video kept.** Camera video is used only to recognize items and is never saved. Only a still the shopper captures is kept, as session data like any photo. The camera turns itself off after 2 minutes and when the session ends. If camera access is denied, or there is no camera, the stylist suggests uploading a photo instead. (FR-04, D09, Data and privacy; the 2 minute limit is a default)

### My wardrobe

- **R36 Save to wardrobe.** An item is saved to the wardrobe only when the shopper taps **Save to wardrobe**. The first time, the app asks permission to store wardrobe photos. (FR-06, FR-27)
- **R37 Manage the wardrobe.** The wardrobe page shows saved items with photos, filterable by category. The shopper can edit details, delete an item after confirming, and select several items to style with. An empty wardrobe shows a prompt to add the first item. (FR-06, D11)

### Outfits

- **R38 Sample catalog.** About 150 sample products cover womenswear and menswear. Each has a photo, name, category, colors, style, price in US dollars, sizes, and the details that preference checks need, such as heel height. The range covers the example conversations, for example emerald dresses and shoes with different heel heights. (D03; size and coverage are defaults)
- **R39 When looks appear.** Looks appear once the occasion and any stated firm requirements are confirmed. Before that, the outfit area says what is still needed, for example "Tell the stylist the occasion to see looks". (FR-16, flow step 5)
- **R40 Three looks.** The stylist presents three complete, coordinated looks. They use confirmed notes and selected wardrobe items. Unclear or missing values are treated as open questions, not filters. (FR-07, FR-16, D12, AC-05)
- **R41 What a look shows.** Each item shows a photo, a name, and either "You own this" or "Sample product" with a price. Each look has a one-line reason it works. Labels are words, not color alone. (FR-07, D13)
- **R42 Totals.** Each look shows the total to buy, without owned items, and how it compares with the budget, for example "$38 under your $350 limit". (FR-21, release gate)
- **R43 Swap a piece.** The shopper can swap any piece by voice ("show me different shoes") or with **Swap** on the item. The look and total update, and the new piece is marked New. (FR-08, D14)
- **R44 Refresh after a change.** When a confirmed note changes, affected looks show "Updating" and refresh, and the stylist says what changed. (FR-16, AC-05)
- **R45 Loading, errors and no match.** While looks are being built, placeholders show "Putting looks together". If it takes too long or fails, anything already shown stays and **Try again** appears. If no look can meet the requirements, the stylist says which one cannot be met and offers choices, such as raising the budget. (FR-21, AC-FB-06)

### Feedback and refinement

- **R46 Give feedback.** The shopper can react to a whole look, one item, or a detail (color, shape, coverage, formality, heel height) by voice, or with **Keep** and **Change** buttons on each item. Voice and touch give the same result. (FR-18, AC-FB-02)
- **R47 Feedback in the notebook.** Feedback is jotted in the notebook under the look it's about, for example "Look 1: keep the dress and bag, lower heels". Unclear feedback is jotted as To confirm, and can be confirmed or removed by touch, or corrected by voice. If a reference is unclear, such as "I like that but not this", the stylist asks before acting. (FR-19, AC-FB-02)
- **R48 Revised look.** The stylist says what it will change and keeps the current look visible with a **Revising** status. Then it shows the revised look: kept items stay, disliked items are replaced, and requested changes are applied. A rejection keeps its scope: "not these shoes" is different from "no high heels at all". (FR-20, AC-FB-01)
- **R49 Requirements hold.** Every revision uses the latest confirmed notes, selected wardrobe items and kept items. Feedback never quietly loosens the budget or another confirmed requirement. If feedback clashes with one, the stylist asks which to change. (FR-21, AC-FB-03)
- **R50 Explain the change.** Each revised look says what changed and why, what was kept, and the new total. (FR-23, AC-FB-06)
- **R51 Repeat, undo, compare.** The shopper can do at least three feedback rounds in a row, undo the last feedback, and compare with earlier looks from the session. Bringing back an earlier look first checks it against current requirements. (FR-22, AC-FB-04, AC-FB-05)
- **R52 Newest wins.** If the shopper changes feedback or a note while a revision is being built, the result uses the newest information. An older result that arrives late never replaces it. (FR-22, AC-FB-05)
- **R53 No surprises.** Creating or accepting a look never saves preferences, adds to the bag or starts a purchase by itself. A rejected item does not become a permanent dislike. (FR-19, FR-23, AC-FB-04)

### Saved preference check

- **R54 Checked before shown.** Every look is checked against saved preferences and confirmed notes before it appears. This covers first looks, revisions, swaps, reopened saved looks, and anything added to the bag. While checking, the screen shows "Checking your preferences". (FR-29, FR-30, AC-PREF-01)
- **R55 Failed looks stay hidden.** A look that fails is fixed and checked again, or replaced. The shopper never sees a failing look. Each shown look carries a small note: "Checked against your preferences". (FR-30; the note is a default)
- **R56 Unknown is not a pass.** If a detail needed for a check is missing, such as heel height, the look does not pass. (FR-29, AC-PREF-04)
- **R57 Ask before breaking a preference.** If the shopper asks for something that breaks a saved preference, such as high heels when "Never: high heels" is saved, the stylist asks whether to allow it for this session only or keep the preference. An allowed exception is jotted in the notebook, marked **This session only**, ends with the session, and does not change the profile. **Save to my profile** is a separate action. (FR-31, AC-PREF-03)
- **R58 Changes trigger a recheck.** Changing a saved preference, a note, feedback or the item photo marks affected looks "Needs a new check". Their **Save look** and **Add to bag** buttons stay disabled until the look passes again. (FR-32, AC-PREF-05)
- **R59 Failures hold the look.** If a check times out or fails, the new look is held back and **Try again** appears. The stylist tries at most 3 alternatives, then explains which preference could not be met. (FR-32, AC-PREF-04; 3 tries is a default)

### Saved looks and demo bag

- **R60 Saved looks.** The shopper can save a look, find it in **Saved looks**, reopen it (it is checked again first) and remove it. With none saved, the page says "No saved looks yet". (FR-08, D15)
- **R61 Demo bag.** The shopper can add sample products from a look to the **Demo bag** and pick a size. Owned items cannot be added. The bag says "Demo only: these sample products can't be bought", and the checkout button is disabled with that reason. An empty bag says so and links back to the looks. (FR-08, FR-10, D16)
- **R62 No live retail claims.** Sample products never appear as in stock, on sale, or sold by a real retailer. (FR-10, release gate)

### Privacy and control

- **R63 Session-only by default.** Notes, feedback and exceptions last only for the session and are cleared when it ends. The shopper can keep any single note or preference with **Save to my profile**. Raw audio, full transcripts and camera video are never kept. (AC-07, D09, privacy)
- **R64 Separate permissions.** Microphone, camera, wardrobe photo storage and saving preferences are each asked for separately, with a plain reason. Each can be changed later in **Profile and privacy**. (Data and privacy, D17)
- **R65 Clear, download, delete.** The shopper can clear this session's notes, delete any saved preference or wardrobe item, download their data as a file, and delete all their data. Deleting everything asks for confirmation, cannot be undone, and returns the shopper to the welcome screen. (AC-07, Data and privacy)
- **R66 Private by default.** A guest can only see their own data, photos and looks. (FR-33, AC-PREF-06)

### Accessibility

- **R67 Touch and keyboard outside the conversation.** Everything apart from the conversation itself can be done by touch or keyboard: setup, photos, the wardrobe, notes, looks, feedback buttons, saving and the bag. The conversation needs the shopper's voice in v1 (R6), and there are no captions (R10), so people who are deaf, hard of hearing or can't speak can't use the conversation in v1. (AC-06, D18; accepted trade-off, 19 Oct 2026)
- **R68 Screen readers.** Changes to notes, statuses and looks, and items recognized on camera, are announced politely, without moving focus or talking over the stylist. Every control has a label and every photo has a description. (AC-06, AC-FB-07, FR-27)
- **R69 Visual access.** Text contrast is at least 4.5 to 1. Touch targets are at least 44 by 44 pixels, apart from the notes and photo details in My Styling Notes, which are one 28 px ruled line tall and the full width of the notebook (your decision, 27 Oct 2026; 28 px meets WCAG's AA minimum of 24 px). Focus is always visible. With reduced motion turned on, non-essential animation stops. (Privacy and accessibility)

### Portfolio extras (default)

- **R70 Tap to try.** Once the conversation is running, the session screen offers sample phrases, including the wedding example, that a visitor can tap to send as if spoken. The stylist answers out loud and on video as usual. (default)
- **R71 About this project.** A page explains the problem, the key decisions and how the product was built, and links the PRD, these planning files and the source code. (default)
- **R72 Behind the scenes.** An optional panel, off by default, shows in plain words what the stylist captured (with its source and certainty) and the result of each preference check. Blocked looks appear only as a one-line reason, never as the look itself. It shows only the current guest's records and never raw audio, transcripts, video or photos. (default)

## 7. Layout and responsiveness

- **Phone (under 768 px wide):** one column, top to bottom: the stylist video and voice controls, then My Styling Notes, then looks. While the camera is on, the shopper's own camera view appears in the stylist area. When the shopper scrolls down to the looks, a slim bar with a small live view of the stylist, the voice controls and the notebook summary stays pinned at the top. (Mobile session layout, AC-09; the pinned bars are a default)
- **Tablet and small laptop (768 to 1199 px):** two columns. Left: the stylist above the notebook. Right: looks. (default)
- **Desktop (1200 px and up):** three columns: stylist, notebook, looks. (default)
- **Other pages** (wardrobe, saved looks, bag, profile, about): one column on phones, grids on wider screens.
- **Browsers:** current Chrome, Safari, Edge and Firefox on phones and computers. Where video is not supported, the stylist uses voice only. Where the camera is not supported, photo upload still works. A browser without microphone support can't run the conversation (R6). (default)

## 8. Out of scope for v1

- Buying anything: checkout, payments, affiliate links, real prices or real stock. (PRD)
- Real retailer catalogs, including ASOS and FARFETCH, and any scraping of retailer sites. (PRD)
- A choice of stylists, avatars or voices. v1 has one stylist. (PRD)
- Email or social sign-in, and syncing across devices. (default)
- Native iOS and Android apps. (default)
- Languages other than English, and prices in currencies other than US dollars. (default)
- Virtual try-on, meaning seeing clothes on your own body.
- Keeping raw audio, full transcripts or camera video.
- Captions or any transcript of the conversation, and typing to the stylist. Both are future features. (decided 19 Oct 2026)
- Ads or any other way of making money.

## 9. Future features, and how v1 leaves room

| Future feature | What v1 does now to leave room |
|---|---|
| Real retailers (ASOS, FARFETCH) | Every product records its source, price currency, availability date and whether it can be bought (always "no" in v1). |
| Checkout on retailer sites, or in the app if a retailer allows it | The bag already groups items by source and has a checkout step that is disabled with a reason. It can be switched on per retailer later. |
| Accounts that sync across devices | Guest data belongs to one account, so it can later be linked to an email without loss. |
| More languages and currencies | Every price and budget records its currency, and all interface text is kept in one place for translation. |
| Captions, for people who are deaf or hard of hearing | The stylist's words already reach the browser as text while it speaks, so captions can be added as a switch without changing the conversation. |
| Typing to the stylist | Tap-to-try phrases already send text to the stylist, so a message box can be added later. |
| Remembering style over time | Preferences already record their source, status and version, and saving them always needs the shopper's consent. |

## 10. Success criteria

Each check can be done by a person using the app.

| # | Do this | Expect this |
|---|---|---|
| S1 | Tap Start conversation. | The video stylist appears within about 5 seconds and speaks with lip movement that matches the voice. |
| S2 | Interrupt the stylist mid-sentence. | Voice and video stop within half a second and the stylist listens. |
| S3 | Tap Voice only, then turn video back on. | The stylist says it is switching to voice only, continues as a still portrait, then returns to video. Notes and looks are unchanged throughout. |
| S4 | Say the wedding sentence from R18. | Each note is jotted within about 2 seconds of its phrase, matching R18. Nothing is jotted about the outfit type, and the stylist asks "dress or pantsuit?" |
| S5 | Speak several sentences without pausing. | Notes appear before you finish speaking, while the stylist video keeps playing smoothly. |
| S6 | Say "Actually, make my budget $350." | The budget note changes to up to $350, the stylist acknowledges it, and look totals refresh to fit. |
| S7 | Tap a note in pencil and tap Confirm. Then tap another note and tap Remove. | Within 1 second the first note turns to ink and reads Confirmed. The second note disappears, and any affected looks refresh. |
| S8 | Turn on the camera and hold up a jacket while talking. | The stylist names the jacket. Capture puts a still photo under Style around this item, and the next looks are built around it. |
| S9 | Leave the camera on for 2 minutes, then download your data. | The camera turns itself off. The download includes the captured still but no video. |
| S10 | Deny camera access when asked. | The stylist suggests uploading a photo, and everything else keeps working. |
| S11 | Upload a jacket photo and confirm you own it. | The photo appears in the notebook before analysis finishes. The next three looks include the jacket, labeled "You own this", and it is not in any total. |
| S12 | On a look with a dress, high heels and a bag, say "Keep the dress and bag, show me lower heels." Then ask for closed-toe shoes, then one more change. | Only the shoes change in rounds 1 and 2. The dress, bag and budget hold through all three rounds. |
| S13 | Use the sample profile (Never: high heels). Swap shoes several times, reopen a saved look, add a look to the bag. | No look ever shows high heels. |
| S14 | With the sample profile, ask for high heels. | The stylist asks first. Allowing it adds a "This session only" note. The profile still says Never: high heels. |
| S15 | Change the budget while a revised look is being built. | The look that appears fits the new budget. |
| S16 | Add items to the demo bag and try to check out. | Checkout stays disabled. Every product is labeled Sample product. |
| S17 | Deny microphone access when asked. | The app says the stylist needs the microphone to hear you and explains how to turn it on. The conversation doesn't start until the microphone works. |
| S18 | With a screen reader on, confirm a note. | The change is announced and focus stays where it was. |
| S19 | Delete all data in Profile and privacy. | You return to the welcome screen. Starting again shows no old data. |
| S20 | As a first-time visitor on a phone, start from the welcome screen. | You reach your first look in under 3 minutes without signing up. (default) |

## 11. Decisions

| Date | Decision | Source |
|---|---|---|
| 7 Oct 2026 | Retailer-independent MVP. ASOS and FARFETCH are shortlisted and deferred. | PRD v1.8 |
| 7 Oct 2026 | Sample catalog with rights-safe images. No scraping or unlicensed product images. | PRD v1.8 |
| 7 Oct 2026 | No purchasing until an approved retailer integration exists. | PRD v1.8 |
| 7 Oct 2026 | My Styling Notes is a must-have, with the statuses Not specified, To confirm, Confirmed and Edited by you. Simplified on 19 Oct 2026 (R15, R16). | PRD v1.8 |
| 7 Oct 2026 | Phone layout order: stylist, then notes, then looks. | PRD v1.8 |
| 7 Oct 2026 | Notes and feedback are session-only unless the shopper saves them. | PRD v1.8 |
| 7 Oct 2026 | Feedback refinement, item photos in the notebook and the saved preference check are must-haves for v1. | PRD v1.8 |
| 7 Oct 2026 | One photorealistic female stylist, with Tavus as the intended avatar option. | PRD v1.8 |
| 17 Oct 2026 | v1 includes the full styling loop plus the photorealistic video stylist and live camera item showing (Q1, option B). | Your decision |
| 17 Oct 2026 | Visitors start with one tap as private guests, with an optional sample profile (Q2, option A). | Your decision |
| 17 Oct 2026 | Build it as a mobile-first web app that opens from a link. | Agreed with this spec |
| 18 Oct 2026 | Video stays on for the whole 10-minute conversation. Voice only is a fallback when something goes wrong (R9, R13). | Your decision |
| 18 Oct 2026 | When the whole monthly allowance is used up, the welcome screen says the demo is resting until the 1st (R13, from tech spec TQ4). | Your decision |
| 19 Oct 2026 | No captions and no transcript on screen. The stylist's voice and the notes are the only output (R10). | Your decision |
| 19 Oct 2026 | My Styling Notes is a free-form notebook with no fixed fields: the stylist jots down any relevant details (R15). Notes are confirmed or removed by touch and changed by voice (R16, R20). | Your decision |
| 19 Oct 2026 | No typing to the stylist in v1 (R11), and a working microphone is required (R6). People who are deaf, hard of hearing or can't speak can't use the conversation in v1 (R67). | Your decision |
| 27 Oct 2026 | Notes and photo details in My Styling Notes stay one 28 px ruled line tall, full width: the one exception to R69's 44 px touch targets. | Your decision |
| 28 Oct 2026 | 20 minutes of conversation a day per visitor, up from 10 (R13). | Your decision |

## 12. Open questions

Q1 and Q2 are answered (see Decisions). The rest use the recommended default unless you say otherwise.

| # | Question | Recommended default |
|---|---|---|
| Q3 | Which region and currency? | US English and US dollars. |
| Q4 | How long is guest data kept? | 7 days without use. |
| Q5 | How much conversation time per visitor? | 20 minutes per day since 28 Oct 2026 (10 before), all with video. Voice only covers problems with video, and the conversation ends when time runs out. |
| Q6 | How big is the sample catalog? | About 150 products across womenswear and menswear, covering the example conversations. |
| Q7 | Is the demo bag shown publicly? (open in the PRD) | Yes, labeled Demo with checkout disabled. |
| Q8 | Include the Behind the scenes panel? | Yes, off by default. |
| Q9 | What if the video stylist fails its early quality test (lip sync, interruptions, start time; PRD D01)? | Launch with voice only and the still portrait, and switch video on once it passes, so the rest of v1 is not held up. |

## 13. Change log

- **1.6 (28 Oct 2026):** R13: 20 minutes of conversation a day (your decision in 7c), in calls of up to 15 minutes.
- **1.5 (27 Oct 2026):** R69: notes and photo details in My Styling Notes stay one 28 px ruled line tall, the one exception to 44 px touch targets (your decision in 7a).
- **1.4 (19 Oct 2026):** Your scope changes: no captions or transcript (R10), no typing to the stylist in v1 (R11), a working microphone required (R6), and a free-form notebook where the stylist jots down any relevant details (R15), confirmed or removed by touch and changed by voice (R16, R20). Text only mode is removed (R8, R13, R14). Also updated the overview, key terms, users, stories, R9, R17, R18, R19, R22 to R25, R28, R32, R46, R47, R57, R63, R67, R70, the layout, scope, future features, success checks S3, S4, S6, S7, S17 and S18, Q5 and the decisions. Requirement numbers are unchanged.
- **1.3 (18 Oct 2026):** Added the "demo is resting" welcome message to R13, from tech spec TQ4, which you accepted.
- **1.2 (18 Oct 2026):** Video now lasts the whole 10-minute conversation (R13), and voice only is a fallback when something goes wrong (R9). Updated Q5 and the decisions. Requested by you.
- **1.1 (18 Oct 2026):** R9 and S3 now say how the voice change is softened: a matched voice, and the stylist says out loud that it is switching. Requested by you.
- **1.0 (17 Oct 2026):** Agreed by you. Same content as 0.2.
- **0.2 (17 Oct 2026):** Q1 answered B, so the video stylist and live camera are now in v1. Q2 answered A. Added R9 (Voice only) and R33 to R35 (camera). Updated the overview, key terms, goals, stories, R6, R7, R8, R11, R13, R14, R63, R64, R67, R68, R70, R72, the layout, scope, future features, success checks and open questions. Requirements from R9 onward are renumbered.
- **0.1 (17 Oct 2026):** First draft from PRD v1.8 and backlog v1.8.

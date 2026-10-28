# AI Personal Stylist: Design

**Status:** Agreed, version 1.27 (27 Oct 2026)
**Last updated:** 25 Oct 2026
**Goes with:** product-spec.md, version 1.4 (agreed)
**Screenshots or mockups provided:** none. The layouts below follow the PRD's mobile session layout and the product spec.

---

## 1. The idea in one line

**A stylist's notebook on a quiet showroom floor.** The notebook is the one decorated place: ruled paper, a pasted photo, and notes that start in pencil and turn to ink once confirmed. The stylist's video is the other focal point. Everything else stays calm and neutral, so the stylist, the clothes and the notes stand out.

## 2. Design principles

1. **The notebook is the hero.** Apart from the stylist's video, it is the only element with personality, so the rest of the screen stays quiet.
2. **Pencil until confirmed, ink once agreed.** Tentative notes look sketched and confirmed notes look inked, and the status is always written out as well.
3. **Your words win.** The newest thing the shopper says or taps replaces the stylist's guess, visibly and at once.
4. **Show first, then ask.** Show what was understood before asking anything, and ask one short question at a time.
5. **Owned and sample never blur.** Every item says in words whether it is yours or a sample.
6. **Talk first, tap to fix.** The conversation is spoken. Touch confirms or removes notes and gives quick replies and feedback.
7. **Motion only shows change.** A note inking in or a piece being swapped moves. Nothing moves for decoration.
8. **Clothes on a clean surface.** Product photos sit on plain white, never tinted, filtered or covered by text.
9. **The camera is obvious.** It stays off until the shopper turns it on, is clearly marked while on, and turns itself off.

## 3. Visual design language

### 3.1 Color palette

Light theme only in v1 (default). Every color is a named token, so a dark theme can be added later. Contrast was checked with the WCAG formula: text needs at least 4.5 to 1, and control edges at least 3 to 1.

| Name | Hex | Used for | Contrast |
|---|---|---|---|
| Showroom | #ECEEEC | App background behind everything | Base color |
| Page | #FFFFFF | Notebook page, look panels, sheets, product photo backgrounds | Base color |
| Ink | #1F2A44 | Main text and confirmed note values. A blue-black, like fountain-pen ink | 14.3 on Page, 12.2 on Showroom |
| Graphite | #575E6A | Secondary text, labels, icons, and To confirm values (the "pencil") | 6.5 on Page, 5.6 on Showroom, 5.2 on Highlighter |
| Emerald | #0B6B4F | Primary buttons, links, selected states, the Confirmed check. A nod to the PRD's emerald wedding example | 6.5 on Page. White text on Emerald 6.5 |
| Highlighter | #FFE38A | The mark behind To confirm values | Ink on it 11.3 |
| Red pen | #B42318 | Errors, conflicts, destructive buttons, and the "Camera on" dot | 6.6 on Page, 5.8 on Red wash |
| Emerald wash | #E3F1EA | Selected chips and rows, success banners | Ink on it 12.3 |
| Red wash | #FDECEA | Error and conflict banners | Ink on it 12.5 |
| Control edge | #7A818B | Borders of inputs, checkboxes and secondary buttons | 3.9 on Page, 3.4 on Showroom |
| Focus | #2457C5 | Keyboard focus ring | 6.5 on Page, 5.6 on Showroom |
| Rule blue | #C8D7EA | Notebook ruled lines | Decoration only |
| Margin pink | #E8A1A6 | Notebook margin line | Decoration only |
| Hairline | #D9DDE0 | Dividers and look panel outlines | Decoration only |

Rules:
- Color never carries meaning on its own. Every status has a word and an icon.
- Decoration colors (Rule blue, Margin pink, Hairline) never carry information.
- Product photos, shopper photos and the camera view are never tinted.

### 3.2 Typography

Two families that look clearly different from each other, both free on Google Fonts:
- **Newsreader** (serif) is the notebook's ink. It sets note values, the notebook title, look names and page titles. Its optical sizes keep it readable at 18 px and refined at 48 px.
- **Figtree** (sans serif) is the interface. It sets labels, buttons, prices and body text, and stays clear at small sizes.

| Style | Font and weight | Phone (size / line height, px) | Desktop | Used for |
|---|---|---|---|---|
| Display | Newsreader 500 | 36 / 40 | 48 / 52 | Welcome headline |
| Title | Newsreader 500 | 28 / 34 | 32 / 38 | Page titles |
| Notebook title | Newsreader 400 italic | 24 / 28 | 24 / 28 | "My Styling Notes" |
| Heading | Newsreader 500 | 21 / 28 | 21 / 28 | Look names, notebook sections |
| Note value | Newsreader 400 | 18 / 28 | 18 / 28 | Notebook values. The 28 px line height matches the ruled lines, so values sit on the rules |
| Subheading | Figtree 600 | 17 / 24 | 17 / 24 | Card and dialog titles |
| Body | Figtree 400 | 16 / 24 | 16 / 24 | Default text |
| Label | Figtree 600 | 14 / 20 | 14 / 20 | Note labels, buttons, chips |
| Small | Figtree 400 | 13 / 18 | 13 / 18 | Prices, sources, times. Nothing is smaller than this |

Rules:
- Sentence case everywhere, including labels and buttons. No all-caps labels.
- Reading text stays under 75 characters per line.
- Prices use tabular figures so totals line up.
- Text can be enlarged to 200% without breaking any layout.

### 3.3 Spacing

- Base unit 4 px. Scale: 4, 8, 12, 16, 24, 32, 48, 64.
- Page gutters: 16 px on phones, 24 px on tablets, 32 px on desktops.
- Notebook: ruled lines every 28 px. The margin line sits 28 px from the left edge on phones (36 px on desktops), and text starts 12 px after it.
- Touch targets are at least 44 by 44 px, with at least 8 px between them.
- Desktop columns: stylist 320 px, notebook 440 px, looks take the rest (at least 560 px). Content stops growing at 1440 px.

### 3.4 Corner radius

Radius follows what the object is, rather than one value everywhere.

| Object | Radius |
|---|---|
| Notebook page | 4 px, like paper |
| Pasted photo | 2 px, like a print |
| Product images and the camera view | 8 px |
| Look panels and the stylist video frame | 12 px |
| Buttons and inputs | 10 px |
| Status chips and item labels | Fully rounded |
| Bottom sheets | 20 px on the top corners |
| Voice controls | Circles |

### 3.5 Shadows

Only objects that sit on top of the page get a shadow, and shadows are tinted with Ink rather than plain grey.

| Name | Value | Used on |
|---|---|---|
| Paper | 0 1px 1px rgba(31,42,68,0.08), 0 12px 24px -8px rgba(31,42,68,0.20) | Notebook page |
| Photo | 0 1px 3px rgba(31,42,68,0.25) | Pasted photo, camera view over the stylist video |
| Overlay | 0 16px 40px rgba(31,42,68,0.24) | Sheets, dialogs, menus |
| None | A Hairline outline instead | Look panels and product tiles |

This keeps the notebook visibly on top of everything else.

### 3.6 Motion

| Name | Duration | Used for |
|---|---|---|
| Quick | 120 ms | Button presses, toggles |
| Standard | 200 ms | Status changes, chips, cross-fades |
| Large | 320 ms | Notebook collapse and expand, sheets, a captured photo moving into the notebook |
| Ink in | 500 ms | A captured note writing itself in |

- Easing: cubic-bezier(0.2, 0, 0, 1) for things arriving or moving, and cubic-bezier(0.4, 0, 1, 1) for things leaving.
- **The signature moment, "ink in".** When a note is captured, its value writes in from left to right. A To confirm value writes in Graphite on a Highlighter mark. When it is confirmed, the text turns to Ink and the mark fades. This is the only orchestrated animation in the app.
- **The stylist video** is the only moving thing in the stylist area. In Voice only mode, a soft ring around the still portrait follows the stylist's voice volume instead.
- **Capture.** A captured still moves from the camera view into Style around this item, so the shopper sees where it went.
- **Swap.** The replaced item cross-fades and gets a New chip.
- **Reduced motion.** Values appear at once, the speaking ring becomes a still "Speaking" label, a captured still appears directly in the notebook, and sheets fade instead of sliding. The stylist video keeps playing because it is the conversation itself, and **Voice only** is always one tap away.
- No page-load entrances, no hover lifts on cards, no looping decoration.

### 3.7 Icons

- One set of simple outline icons with a 1.5 px stroke, at 20 and 24 px (Lucide). Lucide has no hanger, so that one is drawn to match.
- Icon-only buttons always have an accessible name, and a visible label wherever space allows.
- Each icon keeps one meaning everywhere:

| Icon | Meaning |
|---|---|
| Check | Confirmed |
| Question mark | To confirm |
| Curved arrow | Undo a removed note |
| Hanger | You own this |
| Tag | Sample product |
| Bookmark | Saved preference |
| Clock | This session only |
| Shield with a check | Checked against your preferences |
| Circular arrows | Needs a new check |
| Alert triangle | Error or conflict |
| Video camera | Camera (show an item) |
| Camera with turning arrows | Switch camera |
| Shutter circle | Capture |
| Crossed-out video | Voice only |
| Microphone | Mute (the microphone is on) |
| Crossed-out microphone | Muted |
| Phone hanging up | End the conversation |

### 3.8 Words

- Sentence case, plain verbs, no filler.
- Buttons say exactly what happens, and the confirmation uses the same words: **Save look** leads to "Look saved".
- One name per action everywhere: Save look, Add to bag, Swap, Keep, Change, Try again, Camera, Capture, Voice only.
- Errors say what happened and what to do next, without apologizing. Examples: "Voice disconnected. Reconnecting, attempt 2 of 3." and "Camera blocked. Upload a photo instead."
- Empty screens invite the next step. Example: "Your wardrobe is empty. Add a photo of something you own."
- Details are separated with commas or line breaks, not symbols. No arrows or emoji in buttons.

## 4. Components

Grouped by where they appear. Each lists its states and how it behaves.

### 4.1 Session

**Stylist stage**
- Shows the live video stylist, the current state in words, and time left when it is running low.
- Frame: on desktops, a 4:5 frame that fills the stylist column. On phones, a full-width 4:5 frame before the session starts, then a 3:2 band (head and shoulders) once it starts. The video is cropped to the center so the stylist's head and shoulders stay in view.
- States: Ready, Connecting, Listening, Thinking, Speaking, Muted, Reconnecting, Voice only, Microphone needed, Time is up, Connection lost, Ended.
- **Voice only:** a still portrait of the same stylist with the speaking ring, and a line that says why: "Video unavailable. Continuing with voice." or "The video stylist is with another visitor. Continuing with voice." When the shopper chose it, the line reads "Voice only" with **Turn video on**. When the switch happens mid-conversation, the stylist also says out loud: "I'm switching to voice only, so I'll sound a little different." The voice only voice is chosen to sound as close as possible to the video stylist.
- **Microphone needed:** shown when the microphone is blocked, missing or not working. It says "The stylist needs your microphone to hear you" and how to turn it on. The conversation can't start or carry on until it works. When it's blocked, the button reads **Reload page**, because browsers apply a changed microphone setting only after a reload (found on your iPhone in 2f); otherwise it reads **Try again**.
- **Time is up:** when the day's or month's conversation time runs out, the stage says so and the conversation ends. Notes and looks stay on screen. A banner says which limit ran out, for example "You've used today's 10 minutes with your stylist. Come back tomorrow to talk again.", and Resume conversation isn't offered; End still clears the notes (2e).
- **Reconnecting:** shown while a weak connection comes back. If the call drops, a fresh call starts by itself up to 3 times, 2, 4 and 6 seconds apart, with Reconnecting showing. While the phone is offline (Wi-Fi off), it first waits up to 90 seconds for the connection to come back, so the tries aren't used up while nothing can work (found on your iPhone in 2e). If it still can't connect, the stage reads **Connection lost**, with "We couldn't reconnect to your stylist. Check your connection, then tap Try again. Your notes are still here." and **Try again** (R14, 2e).
- The moment the shopper talks over the stylist, voice and video stop together and the state switches to Listening.
- In the last 2 minutes of conversation time it shows, for example, "2 minutes left", then "1 minute left", in a pill at the top right of the stage. Screen readers hear it change.

**Voice controls**
- **Start conversation** (primary), **Mute**, **Camera**, **Voice only**, **End**.
- On phones the row shows Mute, Camera, More and End. **More** holds Voice only (as built in 6c: More opens a **Voice only** or **Turn video on** button under the row). On tablets and computers, **Voice only** sits between Camera and End and reads **Video off** when pressed.
- States: enabled, pressed (Mute shows a crossed-out microphone and "Muted", Camera shows "Camera on", Voice only shows "Video off"), disabled while connecting.
- 48 px circles with a label underneath. In the pinned phone bar they are icon-only, with accessible names.
- End asks "End this session? Notes you haven't saved will be cleared." with **Keep talking** and **End session**.

**No transcript**
- There are no captions and no message box. The stylist's voice and My Styling Notes are the only output, and the shopper talks instead of typing (product spec R10, R11).

**Quick replies and sample phrases**
- Quick replies: when the stylist asks a question with clear options, they appear as chips under the stylist, for example Dress, Pantsuit, Not sure yet. Tapping one answers as if spoken. They disappear once answered.
- Sample phrases (portfolio extra): once the conversation is running and before the shopper first speaks, three phrases appear, including the wedding example. Tapping one sends it as if spoken.
- States: shown, pressed, hidden after use, disabled while connecting.

**Pinned bar (phones)**
- Appears when the stylist stage scrolls out of view. Holds a 56 px live circle of the stylist, **Mute**, "Camera on" while the camera is on, and the notebook summary, for example "6 notes, 1 to confirm".
- Tapping the summary scrolls back to the notebook and opens it.

**Camera view**
- Off until the shopper taps **Camera**. The first time, a permission card explains why before the browser asks.
- Shows the shopper's own camera in a tile in the corner of the stylist stage, labeled "Camera on" with a Red pen dot, and the line "Video isn't saved." On tablets and desktops the tile takes a little over half the stage's width, with the labels and the item's name inside it.
- Phones open the back camera first, so the shopper can point at an item while watching the screen. **Switch camera** flips to the front.
- While an item is being shown on a phone, the camera view and the stylist swap places: the camera fills the stage, which turns portrait, with a dashed frame guide ("Hold one item in the frame"), and the stylist shrinks to an 80 px circle in the bottom corner. **Done showing** turns the camera off and swaps them back.
- Under the voice controls while the camera is on: **Capture** (once an item is named), **Switch camera** (only with two cameras) and, on phones, **Done showing**. On tablets and desktops, the pressed Camera button turns it off.
- When the stylist recognizes an item, its name appears on the view, with a question mark if unsure ("Navy wool blazer?"), and **Capture** appears. The stylist says it out loud too.
- Capture takes a still, which moves into Style around this item, labeled "From your camera", and is then handled like an uploaded photo. The camera turns off after Capture (your answer to Q2 in 3c), and the notebook opens.
- Screen readers hear "On camera: Navy wool blazer, not sure", held while anyone is talking.
- States: off, asking permission, starting, on, item found, several items found (the stylist asks which), captured (toast: "Photo added to your notes"), turned off after 2 minutes ("Camera turned off. Turn it on again to show another item."), blocked ("Camera blocked. Upload a photo instead." with **Upload photo**), no camera found (the same fallback).

### 4.2 My Styling Notes

**Notebook**
- A notebook page, not a form: there are no fixed fields. The title "My Styling Notes" sits at the top, with the line "Notes appear here as you talk. Tap a note to confirm or remove it, or say a correction."
- Order on the page: saved preferences that apply, jotted at the top; Style around this item (only with a photo); the stylist's notes in the order they were jotted, newest at the bottom, like writing down a page; then feedback under a small heading for each look (only once a look exists). Session exceptions are jotted where they happen, marked This session only.
- States: expanded; collapsed (one line, for example "6 notes, 1 to confirm", plus the photo thumbnail); empty (a blank ruled page with the hint line); writing (a note is inking in); paused ("Notes paused. You can still confirm or remove notes.").
- **Hide** and **Show** keep everything as it was.
- Look: a white page, Rule blue lines every 28 px, a Margin pink line on the left, and the Paper shadow. The lines sit under the text and are light enough not to affect reading. Every row in the notebook (notes, the hint line, the buttons under a note) is a whole number of lines, so the words always sit on a line (2d).
- Until Profile and privacy arrives (Phase 6), a small **From your profile** section sits under the notebook: shopping, style and budget from setup, with **Edit your profile** (your answer to Q2 in 2d).

**Jotted note**
- One or two lines of Newsreader sitting on the ruled lines, in the stylist's words: short summaries, never quotes. For example "Outdoor wedding, November" or "Budget: up to $500".
- A small status chip at the end of the line.
- States:
  - To confirm: written in Graphite on a Highlighter mark, with a To confirm chip. The mark is a highlighter stroke behind the words, wrapping with them, not a block over the lines (2d).
  - Confirmed: written in Ink, with a Confirmed chip and an Emerald check.
  - Writing: the note inks in from left to right, then screen readers hear, for example, "Noted: budget up to $350, confirmed."
  - Corrected by voice: the old words are struck through for a moment, then the new words ink in.
  - Selected: after a tap, **Confirm** and **Remove** appear beside the note.
  - Removed: the note's line reads "Removed:" with its words struck through, and **Undo** for 5 seconds. Focus moves to Undo, and Undo puts the note back where it was (2d).
- The whole note is one tap target.
- While the shopper is speaking, screen reader updates are grouped, for example "3 notes added", so they do not talk over the conversation.

**Status chip**
- A small pill with an icon and a word: To confirm, Confirmed, Saved preference, This session only, Checking, Checked, Needs a new check, Revising (a pencil, 5b).
- Always an icon plus a word. Never color alone.

**Note actions**
- Tapping a note shows two buttons beside it: **Confirm** and **Remove**. There is no keyboard and no editor.
- To change what a note says, the shopper says the correction, for example "Actually, make my budget $350".
- States: hidden, shown, confirming (the note turns to ink), removed (with **Undo** for 5 seconds).
- Focus moves to Confirm when the buttons appear, and back to the note when they close.

**Pasted photo ("Style around this item")**
- The shopper's photo, uploaded or captured from the camera, with a white print border, a 1 degree tilt and two strips of tape. The label beside it is never tilted.
- Label: the item name (for example "Navy wool blazer"), where it came from (Uploaded or From your camera), and its ownership: You own this, Inspiration, or Ownership: To confirm.
- Controls: **Enlarge**, **Replace**, **Remove**. Tapping the photo also enlarges it.
- Adding one: **Add a photo**, a secondary button in My Styling Notes, where Style around this item appears (after the saved preferences, before the notes). It shows once the conversation has started, because a photo belongs to a session, and opens the phone's own choice of Photo Library, Take Photo or Choose File. With a photo, it reads **Add another photo**, up to 5 photos (your answers to Q2 and Q3 in 3a).
- Before the photo reader has named it, the label reads "Your item". While it reads the photo, the label says **Analyzing**. Ownership shows once an item is chosen.
- Several photos: a row of thumbnails, with the active one outlined in Ink and labeled "Active". A new photo becomes Active once it's checked and kept, not while it uploads, so until then the earlier photo stays Active, on the page and for the looks; a thumbnail still uploading can't be tapped to make it Active. Replace keeps the earlier photo in place until the new one is kept, and a replacement that's turned away leaves it as it was (full code review, batch 1).
- States: loading (a preview from the shopper's device straight away, with "Uploading" and a thin Emerald progress line; "Preparing preview" where the browser can't show a HEIC photo), analyzing, recognized, details to confirm, several items found, recognition failed ("Couldn't recognize this item. Describe it instead."), upload failed (with **Try again**), removed.
- Collapsed notebook: a 40 px thumbnail with the label.
- Enlarge shows the full photo, untilted, with its description.

**Item details review**
- Shown after analysis, under the photo on the ruled lines: type, colors, pattern and style, each with a status chip. Details the photo reader is sure of are in ink (Confirmed), the rest in pencil with To confirm. Tap a pencil detail for **Confirm**, or say a correction, which puts the new value in ink and renames the item ("Black wool blazer").
- Asks "Is this yours or an inspiration?" with **It's mine** and **Inspiration**, which then show in the label as "You own this" or "Inspiration".
- **Save to wardrobe** appears only for owned items. The first use asks for photo storage permission. Once saved it reads "Saved to your wardrobe." with a **Wardrobe** link; Not now shows "Your photos will be used in this session only."

**From your wardrobe** (3d)
- In My Styling Notes, after Style around this item: the items chosen with Style with these, as 56 px photos with their names, and **Change**, which opens the Wardrobe page.
- Several items found: a numbered list ("1. Denim jacket", "2. White T-shirt") under "Which item should we style around?", so the shopper can tap one or say "the first one". The chosen one is filled in Emerald with a check, under "Styling around", and its details follow. The matching area on the photo is outlined when it is known; in v1 it never is, because the photo reader's positions aren't reliable enough to draw (3b).
- Recognition failed: "Couldn't recognize this item. Describe it instead." under the photo. What the shopper then says fills in the item.
- Screen readers hear "Recognized: Navy wool blazer.", "Found 2 items. Which one should we style around?", "Styling around: White T-shirt." and "Marked as yours.", held while anyone is talking.

**Feedback jotted under a look**
- Feedback is jotted like any other note, under a small heading for the look it's about, for example "Look 1".
- Each line says what to keep or change, and its scope, for example "Keep the dress and bag" or "Lower heels, this look only".
- States: To confirm, Confirmed, removed (with **Undo** for 5 seconds).
- Before any feedback, nothing shows under the look's heading.
- **As built (5a):** after the notes, a heading in Graphite for each look with feedback ("Look 1", or "An earlier look" when it's gone), then its lines, which work like notes. A tap on Keep or Change jots its line in ink.

**Saved preferences and session exceptions**
- Saved preferences (since 6b, each a link to it in Profile and privacy): the Must have, Never and Likes items from the profile that apply, jotted at the top of the page, each with a Saved preference chip and its bookmark icon. Tapping one opens it in Profile and privacy, from Phase 6. Until then they aren't tappable (your answer to Q1 in 2d).
- This session only: each exception with a clock icon, for example "High heels allowed for this session. Your profile still says Never: high heels." Buttons: **Save to my profile** and **Remove**. As built (5c), the lines sit after the notes, before the feedback, and Save to my profile first asks "Take "Never: high heels" off your profile? Later sessions will allow it too." with **Take it off** and **Cancel**. What the shopper asked for with it is jotted as its own note ("High heels", Confirmed). Removing that note takes back the request and keeps the permission; **Remove** on the line takes back both (5c fix 5, Q2). Asking again for something already allowed needs no card: it's jotted straight away (Q1). Once jotted, each look shows Revising while only its pieces of that kind change (its shoes), with "Changed: … (you asked for high heels)" above it (5c fix 6).

### 4.3 Looks

**Look panel**
- Heading: "Look 1 of 3", then the look's name in Newsreader, for example "Garden ceremony".
- Item tiles in a grid: 2 columns on phones, 3 on wider screens.
- Below the items: the total to buy ("$312 to buy, owned items not included"), the budget comparison ("$38 under your $350 limit"), a one-line reason, and "Checked against your preferences".
- Actions: **Save look**, **Give feedback**, **Compare**, **Add to bag**.
- States: building (placeholders and "Putting looks together"), checking ("Checking your preferences"), ready, revising (the current look stays, with a Revising chip and paused actions), updating (after a note changed), needs a new check (Save look and Add to bag disabled), saved, error (the previous look stays, with **Try again**), no match (says which requirement cannot be met and offers choices).

**Item tile**
- A square photo on white, the item name and category, then either "You own this" (hanger) or "Sample product" and its price (tag).
- **Keep** and **Change** toggles for touch feedback. When pressed, they read "Keeping" and "Changing". **Swap** asks for a different piece straight away.
- States: default, keeping, changing, new (after a swap or revision), similar sample (an alternative to an inspiration photo), image loading (a Showroom placeholder), image failed (an icon and the item name).

**Change summary**
- Sits above a revised look, for example: "Changed: high heels to block-heel sandals. Kept: dress and bag. New total: $298, $52 under your limit."
- The stylist says a short version out loud. The full text stays on screen.

**Compare and undo**
- Compare: two looks side by side on wider screens. On phones, a switch between Current and an earlier version. Differences are labeled, for example "Different shoes".
- **Use this look** checks the earlier look against current preferences first, then restores it or explains why it no longer fits.
- **Undo feedback** appears after each revision and returns to the previous look and feedback.

**Looks as built (4c)**
- **Where:** under the notebook on phones; the right-hand column on tablets (stylist and notebook on the left); the third column on computers.
- **Before looks:** a dashed box says what's needed: "Looks appear here once you tell the stylist the occasion." before a session, then the server's words, such as "Confirm your budget to see looks". It goes as soon as building starts (found on your iPhone in 4c).
- **Building:** three placeholder panels (Showroom blocks) with "Putting looks together", then "Checking your preferences".
- **Item tiles:** the photo in a square with a Hairline outline, the name, the kind of piece, then a line with the hanger and "You own this", or the tag and "Sample product" with the price under it. **Swap** sits at the bottom of each sample product's tile, so a row's buttons line up; the shopper's own pieces have none. A swapped-in piece fades in with a **New** chip (Emerald, white text) on its photo. While a piece is being swapped, its photo shows a spinner and "Checking your preferences". If nothing else fits, a note on that piece's tile, above its Swap button, says so: "No other shoes fit everything you've asked for, so these stay." (moved onto the tile after your iPhone check in 4d, where the note under the tiles was easy to miss)
- **After a change:** the looks stay, with Needs a new check, and a line with a spinner, "Updating your looks", above them, until they're checked again. Swap is paused meanwhile.
- **Fewer than three:** a box after the looks says what limits them, with its choices as buttons, only ones that work now (your decision A in 4e: "Allow it for this session" arrives in 5c). Tapping one says it to the stylist (only during a call); Try again builds again. With none at all, the same in a banner.
- **Error:** a red banner, "The looks couldn't be put together.", with Try again; anything already shown stays.
- **Keep and Change (5a):** two toggles (chips) on each sample product's tile, above Swap, reading Keeping and Changing (with the check) when pressed; the shopper's own pieces have none.
- **Revisions (5b):** a look being revised shows the Revising chip in place of its check status, with Swap, Keep and Change paused, and "Revising your look" with a spinner above the looks. The revised look's change summary sits above its items in an Emerald-wash box, and its new pieces carry the New chip. When no revision fits, a note in a Showroom box above the items says so, and the look stays. After a Keep or Change tap the looks wait 2 seconds, so several taps make one revision.
- **Undo and compare (5c):** Undo feedback is a quiet button with the undo icon inside the change summary box; while the earlier look is checked, "Checking the earlier look against your preferences" with a spinner shows under it, and if it no longer fits, a note in a Showroom box says why. Compare is a secondary button under the look, for a look with an earlier version; it opens a sheet (wider on tablets and computers) with Current and Earlier side by side, or a Current and Earlier switch on phones, the differences as highlighter labels, Newer and Older, and Use this look.
- **Conflict card (5c):** above the looks, in a highlighter box with the clock icon: the question, **Allow for this session** and **Keep my preference**. The no-match box's "Allow it for this session" opens it too. End closes it with the session, so it never shows in the next one (full code review, batch 2).
- Give feedback and Compare (Phase 5) joined in 5a to 5c. **Save look** and **Add to bag** (6a) sit with Compare under the look, and wait while it's being checked, revised or needs a new check; a saved look's button reads **Saved** (disabled, with the check) after "Look saved".

**Preference check status**
- Inside the look panel: Checking (a spinner and "Checking your preferences"), Checked (a shield and "Checked against your preferences"), Needs a new check (circular arrows), Held ("This look couldn't be checked." with **Try again**).
- Conflict card: "Your profile says Never: high heels. Allow high heels for this session?" with **Allow for this session** and **Keep my preference**. The stylist asks the same question out loud.
- Screen readers hear one polite announcement per change.

### 4.4 Pages and shared parts

**Demo bag**
- A banner at the top: "Demo only: these sample products can't be bought."
- Each item: photo, name, size, price, **Remove**.
- The total, then a disabled **Checkout** button with the reason under it.
- States: empty ("Your demo bag is empty. Add pieces from a look."), with items, checking (new items are checked first), error.
- As built (6a): each piece shows "Sample product", and its size is a menu of the sizes it comes in. The empty bag has **Go to your looks**. Add to bag on a look opens a sheet, "Add Look 1 to your bag", with the demo line, each sample product ticked with its price and a size menu (starting on the profile's size, or "Pick a size"), and the shopper's own pieces as "… you own this" with no tick; its **Add to bag** says "Added to bag".

**Wardrobe**
- A grid of photos with category filters: All, Tops, Bottoms, Dresses, Outerwear, Shoes, Bags, Accessories. Each card shows the photo on a Showroom square, the name and the category, with "Styling with" for chosen items. Items in no category show under All.
- **Add item**, edit details, **Delete** (after confirming), and a select mode with **Style with these**.
- As built (3d): Add item asks for wardrobe photos first, then opens the photo picker; "Adding your item…" and "Analyzing" show while it's checked and read, then a sheet, "Check the details", offers the suggested name, category, type, colors, pattern and style, with **Add to wardrobe**. Tapping an item opens "Edit item" with **Save** and **Delete** ("Delete this item? Its photo is deleted too.", **Delete item** or **Keep it**). Select turns the cards into checkboxes with an Emerald check; **Style with these** goes back to the session. With nothing ticked while items are chosen, the button is **Clear wardrobe items** (secondary), which stays on the page and says "Your session won't use wardrobe items now." (your decision B in the Phase 3 review). Detail boxes stop at the lengths the server allows (Type and Pattern 40 characters, Colors and Style 60).
- States: empty, loading, list, selecting, deleting, error.

**Saved looks**
- A list of saved looks, each with a small collage of its items, its name and the date saved.
- **Open** (checked first) and **Remove** (after confirming).
- States: empty ("No saved looks yet"), loading, list, checking.
- As built (6a): a card per look, newest first, with up to four of its pieces in a row, the name, and "Saved 25 Oct · $312 to buy". **Open** shows "Checking your preferences", then the look in full (its pieces, "Sample product" and prices, the total and budget comparison against the saved profile, the reason and "Checked against your preferences") with **Close**, or a note saying why it no longer fits. **Remove** asks "Remove this saved look?" (**Remove look** or **Keep it**). The shopper's own piece from a session photo shows a "Your item" tile (your answer to Q2). A list on phones, 2 columns on tablets, 3 on computers.

**Permission card**
- Explains one permission at a time in plain words, just before it is needed: microphone, camera, wardrobe photo storage, saving preferences.
- Buttons: **Allow** and **Not now**. For the camera, Not now leads to photo upload. For the microphone, Not now shows that the stylist can't hear the shopper without it.
- Denied: explains how to change it later.

**Dialogs, banners and toasts**
- Confirm dialogs for anything that cannot be undone. The destructive button is Red pen and names the action, for example **Delete all data**.
- Banners stay until the problem is solved: information on Page, success on Emerald wash, errors on Red wash.
- Toasts confirm small actions ("Look saved") for 4 seconds, with **Undo** where possible.

**Behind the scenes panel (portfolio extra)**
- Off by default. Opens from the menu: a side panel on desktops, a bottom sheet on phones.
- A time-stamped list of plain-language entries, newest first. For example:
  - "Captured Budget: up to $500, from your voice, high certainty."
  - "Recognized on camera: navy wool blazer, medium certainty. Still captured by you."
  - "Check passed: Look 2 meets Never: high heels, your budget and your colors."
  - "Check blocked a candidate: 9 cm heels break Never: high heels. Shoes replaced."
- Never shows audio, transcripts, video or photos.
- **As built (4d):** a Behind the scenes button beside Wardrobe until the app menu (Phase 7). On for everyone, closed until opened (your Q2). It starts with a "Now" line: how many products fit everything now, and why the rest were left out (your Q3). Each entry shows its time in Graphite, then the sentence; passed checks have the shield (Emerald), blocked candidates the warning icon (Red pen), and checks after a change the circular arrows. A note confirmed with a tap says "Confirmed by you with a tap."

**App bar and menu**
- Phones: the app name and a **Menu** button. Desktops: the same items across the top.
- Items: Session, Wardrobe, Saved looks, Demo bag (with an item count), Profile and privacy, About this project, Behind the scenes.
- **As built (7a):** a bar on every page with **AI Personal Stylist** (back to the start) and the menu. Below desktop width, **Menu** opens a sheet with the items; on desktops they sit across the top in Label type, the current page in Emerald and underlined. Demo bag shows its count, "Demo bag (2)", kept up to date as pieces are added or removed. A new visitor sees only **Try the demo** and **About this project** (your answer to Q1). On the session page Behind the scenes opens its panel there; from another page it opens the session page with the panel open. The interim buttons on the session page (Wardrobe, Profile and privacy, Saved looks, Demo bag, Behind the scenes, Back to the start), the "Back to your session" links and the welcome-back screen's Profile and privacy button are gone; the welcome screen's own "AI Personal Stylist" label moved into the bar.

## 5. Screens and layouts

No screenshots or mockups were provided, so these wireframes are the starting point. They show structure, not final styling.

### 5.1 Welcome

- The hero is the product itself: a notebook page inks in the wedding example next to the headline. On desktops, a still of the stylist sits beside it, so visitors know they will meet a lifelike stylist. With reduced motion, the finished page is shown.
- Headline: "Say what you need. Watch your stylist take notes."
- Supporting line: "Talk with a lifelike stylist, show what you own, and refine complete looks by voice or touch."
- **Try the demo** (primary) and **How it was built** (a link to About).
- Small print: "Sample products only. Nothing here is for sale."
- Resting state: when the monthly allowance is used up, **Try the demo** is replaced by a line such as "The demo is resting until 1 November. You can still read how it was built." **How it was built** becomes the main button.

```
Phone
+--------------------------------------+
| AI Personal Stylist             Menu |
+--------------------------------------+
|  Say what you need.                  |
|  Watch your stylist take notes.      |
|                                      |
|  +--------------------------------+  |
|  | My Styling Notes               |  |
|  | Outdoor wedding, November      |  |
|  | Elegant                        |  |
|  | Emerald green, preferred       |  |
|  | Budget: up to $500             |  |
|  +--------------------------------+  |
|                                      |
|  [         Try the demo         ]    |
|  How it was built                    |
|  Sample products only. Nothing here  |
|  is for sale.                        |
+--------------------------------------+
```

### 5.2 Setup

- Three steps, shown as "Step 1 of 3" because they are a real sequence:
  1. How it works and what is kept private.
  2. What you shop for (departments), style words and sizes.
  3. Budget and saved preferences (Must have, Never, Likes).
- On step 3, each Must have and Never shows under its chip how the app reads it, in Small Graphite: "Read as: no shoes with heels over 5 cm", or "Read as: checked by your stylist's judgment" for one that isn't about a product detail. "Reading it…" shows while it's being read, and **Finish setup** waits ("Reading your preferences…"). Likes only guide looks, so they have no read-back. If the reading is wrong, **×** removes the preference (your answers to Q1 and Q3 in 4a).
- **Use a sample profile** on step 1 goes straight to the session.
- Every step has **Back**, **Skip** and **Continue**.
- Nothing is requested here. The microphone is requested at Start conversation, and the camera only when the shopper taps Camera.

### 5.3 Styling session on a phone

Top to bottom: stylist, notebook, looks (the PRD's mobile session layout).

```
+--------------------------------------+
| AI Personal Stylist             Menu |
+--------------------------------------+
| +----------------------------------+ |
| |                                  | |
| |    Stylist video, 3:2 band       | |
| |    (head and shoulders)          | |
| |                                  | |
| | Listening                        | |
| +----------------------------------+ |
| [ Dress ] [ Pantsuit ] [ Not sure ]  |
|   Mute     Camera     More     End   |
+--------------------------------------+
| My Styling Notes                Hide |
| Notes appear here as you talk.       |
|  :  Never: high heels (profile)      |
|  :  Outdoor wedding, November        |
|  :  Elegant                          |
|  :  Emerald green, preferred         |
|  :  Budget: up to $500               |
|  :  Maid of honor        To confirm  |
+--------------------------------------+
| Look 1 of 3                          |
| Garden ceremony                      |
|  +---------+  +---------+            |
|  | dress   |  | shoes   |            |
|  +---------+  +---------+            |
|  +---------+  +---------+            |
|  | bag     |  | wrap    |            |
|  +---------+  +---------+            |
| $312 to buy, owned items not included|
| $188 under your $500 limit           |
| Checked against your preferences     |
| [Save look] [Give feedback] [More]   |
+--------------------------------------+
```

When the shopper scrolls down to the looks, the pinned bar appears. The circle is a live view of the stylist:

```
+--------------------------------------+
| (o) Listening   Mute    6 notes,     |
|                         1 to confirm |
+--------------------------------------+
```

### 5.4 Showing an item on camera (phone)

The camera view and the stylist swap places until **Done showing**.

```
+--------------------------------------+
| +----------------------------------+ |
| | Camera on                    (o) | |
| |                                  | |
| |   +--------------------------+   | |
| |   | Hold one item in the     |   | |
| |   | frame                    |   | |
| |   +--------------------------+   | |
| |                                  | |
| | Navy wool blazer?                | |
| | [ Capture ]    [ Switch camera ] | |
| +----------------------------------+ |
| Video isn't saved.    [Done showing] |
| The stylist says what it sees out    |
| loud.                                |
+--------------------------------------+
```

### 5.5 Styling session on a tablet

Two columns: the stylist above the notebook on the left, looks on the right.

```
+------------------------------+-------------------------------------+
| +--------------------------+ | Look 1 of 3                         |
| | Stylist video            | | Garden ceremony                     |
| | Speaking                 | | [dress] [shoes] [bag]               |
| +--------------------------+ | $312 to buy                         |
| [Dress] [Pantsuit]           | [Save look] [Give feedback]         |
| Mute  Camera  More  End      |                                     |
+------------------------------+ Look 2 of 3                         |
| My Styling Notes        Hide | (items)                             |
|  : Outdoor wedding, November |                                     |
|  : Budget: up to $500        |                                     |
|  : (more notes)              |                                     |
+------------------------------+-------------------------------------+
```

### 5.6 Styling session on a desktop

Three columns: stylist, notebook, looks.

```
+----------------------+--------------------------------+-------------------------------------+
| +------------------+ | My Styling Notes          Hide | Look 1 of 3                         |
| |                  | | Notes appear as you talk.      | Garden ceremony                     |
| |  Stylist video   | |  : Style around this item      | +-------+ +-------+ +-------+       |
| |  (4:5)           | |  :  [photo]  Navy wool blazer  | | dress | | shoes | | bag   |       |
| |                  | |  :           You own this      | +-------+ +-------+ +-------+       |
| +------------------+ |  : Outdoor wedding, November   | $312 to buy                         |
| Speaking             |  : Elegant, emerald green      | $38 under your $350 limit           |
|                      |  : Budget: up to $350          | Checked against your preferences    |
|                      |  : Maid of honor   To confirm  | [Save look] [Give feedback]         |
|                      |  : (more notes)                | [Compare] [Add to bag]              |
| [Dress] [Pantsuit]   |  : Look 1                      |                                     |
| Mute Camera More End |  : Keep the dress and bag      | Look 2 of 3                         |
|                      |  : Lower heels, this look only | (items)                             |
+----------------------+--------------------------------+-------------------------------------+
```

### 5.7 Notebook close-up

Shows the pencil and ink states and the pasted photo.

```
 My Styling Notes                                          Hide
 Notes appear here as you talk. Tap a note to confirm or
 remove it, or say a correction.
  :------------------------------------------------------------
  : Never: high heels (from your profile)    Saved preference
  :------------------------------------------------------------
  : Style around this item
  :   +-------------+   Navy wool blazer
  :   |   photo     |   From your camera
  :   |   (tilted,  |   Ownership                  To confirm
  :   |   taped)    |   [Enlarge] [Replace] [Remove]
  :   +-------------+
  :------------------------------------------------------------
  : Outdoor wedding, November          Confirmed   (ink)
  : Ceremony on grass                  To confirm  (pencil on highlighter)
  : Budget: up to $350                 Confirmed   (said as a correction)
  : Maid of honor                      To confirm
  :     [Confirm] [Remove]             (after a tap)
  :------------------------------------------------------------
  : Look 1
  : Keep the dress and bag             Confirmed
  : Lower heels, this look only        To confirm
```

### 5.8 Other pages

- **Wardrobe:** title, category filters, photo grid and **Add item**. 2 columns on phones, 3 on tablets, 4 to 5 on desktops.
- **Saved looks:** a list on phones, a 2 to 3 column grid on wider screens.
- **Demo bag:** one column with the demo banner on top, and the total and disabled Checkout at the bottom (pinned on phones).
- **Profile and privacy:** four sections in this order: Your profile, Saved preferences, Permissions (microphone, camera, wardrobe photos, saving preferences), Your data (Clear this session's notes, Download my data, Delete all my data).
- As built (6b): each section a white panel. Your profile lists shopping, style, sizes and budget with **Edit your profile**. Each saved preference has a quiet **Delete** ("Delete "Never: high heels"?", **Delete preference**); none: "No saved preferences". Microphone and Camera say what they're for and how to change them in Safari's settings; Wardrobe photos and Saving preferences show Allowed or Not allowed, with **Turn off** ("Turn off wardrobe photos?", naming what's deleted, **Turn off and delete**) or **Allow …**. Your data: the privacy promise in a line, **Clear this session's notes** (waits with "No session is open now." when there's none; then "This session's notes are cleared."), **Download my data** ("A ZIP file with your data and your photos."), and **Delete all my data** in Red pen ("Delete all your data?", **Delete all data**). A problem shows in a Red wash line at the top. One column, up to 42 rem wide.
- **About this project:** a readable article page (Newsreader headings, Figtree body, lines of about 70 characters) covering the problem, the approach, key decisions and how it was built, with links to the PRD, the planning files in docs/ and the source code.

## 6. Accessibility built into the design

- Every text color pair in the palette meets 4.5 to 1. Control edges and the focus ring meet 3 to 1.
- Focus: a 2 px Focus ring with a 2 px white gap on every interactive element.
- Status is always an icon plus a word.
- Touch targets are at least 44 by 44 px. The one exception: a note or a photo detail in My Styling Notes is one 28 px ruled line tall and the full width of the notebook (your decision A, 7a; WCAG's AA minimum is 24 px).
- Screen reader announcements are polite, grouped while the shopper speaks, and never move focus.
- There are no captions in v1, and the conversation needs the shopper's voice. People who are deaf, hard of hearing or can't speak can't use the conversation in v1 (product spec R6, R10, R67).
- The camera view says in words whether it is on, and items recognized on camera are announced.
- **Voice only** is always one tap away for anyone who finds video distracting or has a slow connection.
- Every image has a description. Product photos use the product's name and color. Shopper photos use the recognized description, or "Your photo" until recognition finishes.
- Works at 200% text size and with reduced motion.
- **As checked (7a):** at 200% text, a note's status (Confirmed, To confirm, Saved preference) moves under the note when both don't fit on its line, still on the ruled lines; the label-and-value lists (From your profile, Your profile, Welcome back) wrap long values; the welcome screen's column shrinks to the phone; a look's tiles are at least 9 rem wide (11 on desktops), two to a row on phones and three on desktops at normal text and one as the text grows; the call controls wrap onto a second row. Links that stand alone (How it was built, the About page's links) are 44 px tall. The notebook's ink-in moves only the words' reveal, and keeps 60 frames a second on a phone-sized screen with the processor slowed to a quarter.

## 7. Open design questions

| # | Question | Recommended default |
|---|---|---|
| DQ1 | Which stylist avatar? | A ready-made photorealistic female avatar from the avatar provider's library, so nobody has to record themselves or consent to a custom one. The Voice only portrait is a still of the same avatar. |
| DQ2 | Add a dark theme in v1? | No. Colors are named tokens, so it can be added later. |
| DQ3 | Keep "AI Personal Stylist" as the product name? | Yes, as the working name for v1. |

## 8. Change log

- **1.27 (27 Oct 2026):** 7a's accessibility pass: what changed at 200% text, and the 44 px links.
- **1.26 (27 Oct 2026):** The app bar and menu as built (7a, your answer to Q1).
- **1.25 (26 Oct 2026):** 6c as built (second part): the why-lines under the stage when voice stands in for video (another visitor; unavailable or dropped; resting for the month), Turn video on in every voice-only case, and the resting welcome screen.
- **1.24 (26 Oct 2026):** 6c as built (first part): Voice only beside Camera, More on phones, the still portrait with a ring that pulses while she speaks (a pulse, not the voice's volume), "Switching to voice only…" and "Turning video on…" while a switch runs, and "Voice only" with **Turn video on** under the stage.
- **1.23 (26 Oct 2026):** 6b as built: the Profile and privacy page, its links, and saved preferences in the notebook opening it.
- **1.22 (26 Oct 2026):** 6a as built: Save look and Add to bag on the look panel, the bag sheet, the Saved looks and Demo bag pages.
- **1.21 (25 Oct 2026):** Full code review, batch 2: the conflict card closes with End (4.3).
- **1.20 (24 Oct 2026):** Full code review, batch 1: a photo is Active only once kept, and Replace keeps the earlier photo until the new one is kept (4.2).
- **1.19 (22 Oct 2026):** 5c fix 6: once what was asked is jotted, only its pieces change in each look, with Revising and a change summary (4.2, 4.3).
- **1.18 (22 Oct 2026):** 5c fix 5: the jotted request and the This session only line are removed separately (Q2), and asking again for something allowed needs no card (Q1) (4.2).
- **1.17 (22 Oct 2026):** 5c: Undo feedback, Compare, the conflict card and This session only as built (4.2, 4.3).
- **1.16 (21 Oct 2026):** 5b: the Revising chip, the change summary box, New on revised pieces and the nothing-fits note (4.3).
- **1.15 (21 Oct 2026):** 5a: Keep and Change on the tiles (4.3), and feedback under each look in the notebook (4.2).
- **1.14 (21 Oct 2026):** Phase 4 code review: the no-match choices (your decision A, 4.3).
- **1.13 (21 Oct 2026):** 4d: Behind the scenes as built (4.4).
- **1.12 (21 Oct 2026):** 4c: the looks as built: where they sit on each screen size, before looks, building, the item tiles with Swap and New, after a change, fewer than three, and errors (4.3).
- **1.11 (21 Oct 2026):** 4a: setup's read-back for each Must have and Never (5.2).
- **1.10 (20 Oct 2026):** Phase 3 code review: Clear wardrobe items when nothing is ticked (your decision B), and the Wardrobe page's detail lengths (4.2).
- **1.9 (20 Oct 2026):** 3d: Save to wardrobe as built, From your wardrobe in the notebook, and the Wardrobe page as built (4.2).
- **1.8 (20 Oct 2026):** 3c: the camera view as built: the tile's size, the swap on phones, Done showing, the camera's buttons, the camera off after Capture, and what screen readers hear (4.1).
- **1.7 (20 Oct 2026):** 3b: Analyzing in the label, the item details review as built, the several-items list, the failed-recognition line and what screen readers hear (4.2).
- **1.6 (20 Oct 2026):** 3a: where Add a photo sits, the pasted photo's states as built, and its label until 3b (4.2).
- **1.5 (20 Oct 2026):** 2f, after your iPhone check: Reload page for a blocked microphone (4.1).
- **1.4 (20 Oct 2026):** 2e, after your iPhone check: a dropped call waits for the connection to come back before trying again, and the Connection lost state (4.1).
- **1.3 (20 Oct 2026):** 2e: what Time is up and Reconnecting show, and where the time left sits (4.1).
- **1.2 (20 Oct 2026):** 2d: your answers to Q1 (saved preferences become tappable with Profile and privacy in Phase 6) and Q2 (From your profile under the notebook until then), notes sitting on the ruled lines, the highlighter as a stroke behind the words, and the removed line with Undo (4.2).
- **1.1 (20 Oct 2026):** 2b: added the microphone, crossed-out microphone and hang-up icons that Mute and End use (4.1) to the icon table (3.7). No other change.
- **1.0 (20 Oct 2026):** Agreed by you before the design system was built (1c). Same content as 0.7, plus a note that the hanger icon is drawn to match Lucide. Any later change gets a new version number.
- **0.7 (19 Oct 2026):** Updated for product spec 1.4. My Styling Notes is now a free-form notebook of jotted notes, with Confirm and Remove by touch and no editor. Captions, the message box and Text only mode are removed, and Microphone needed and Time is up are new stylist states. Principle 6 and the screen sketches are redrawn.
- **0.6 (18 Oct 2026):** The About page now links the planning files in docs/, where they moved.
- **0.5 (18 Oct 2026):** Added the welcome screen's resting state (product spec R13).
- **0.4 (18 Oct 2026):** Video now runs for the whole conversation, so the time-left message counts conversation time. Voice only gained a reason line for when another visitor is using the video stylist.
- **0.3 (18 Oct 2026):** The Voice only state now includes the spoken switch line and the matched voice.
- **0.2 (17 Oct 2026):** Updated for the agreed product spec (Q1 answered B). Added the live video stylist, the Voice only and Text only modes, the camera view and its wireframe, camera icons and motion, a pinned message box on phones, and principle 9.
- **0.1 (17 Oct 2026):** First draft.

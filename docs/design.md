# AI Personal Stylist: Design

**Status:** Agreed, version 1.1 (20 Oct 2026)
**Last updated:** 20 Oct 2026
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
- States: Ready, Connecting, Listening, Thinking, Speaking, Muted, Reconnecting, Voice only, Microphone needed, Time is up, Ended.
- **Voice only:** a still portrait of the same stylist with the speaking ring, and a line that says why: "Video unavailable. Continuing with voice." or "The video stylist is with another visitor. Continuing with voice." When the shopper chose it, the line reads "Voice only" with **Turn video on**. When the switch happens mid-conversation, the stylist also says out loud: "I'm switching to voice only, so I'll sound a little different." The voice only voice is chosen to sound as close as possible to the video stylist.
- **Microphone needed:** shown when the microphone is blocked, missing or not working. It says "The stylist needs your microphone to hear you" and how to turn it on. The conversation can't start or carry on until it works.
- **Time is up:** when the day's or month's conversation time runs out, the stage says so and the conversation ends. Notes and looks stay on screen.
- The moment the shopper talks over the stylist, voice and video stop together and the state switches to Listening.
- In the last 2 minutes of conversation time it shows, for example, "2 minutes left".

**Voice controls**
- **Start conversation** (primary), **Mute**, **Camera**, **Voice only**, **End**.
- On phones the row shows Mute, Camera, More and End. **More** holds Voice only.
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
- Shows the shopper's own camera in a tile in the corner of the stylist stage, labeled "Camera on" with a Red pen dot, and the line "Video isn't saved."
- Phones open the back camera first, so the shopper can point at an item while watching the screen. **Switch camera** flips to the front.
- While an item is being shown on a phone, the camera view and the stylist swap places: the camera fills the stage with a frame guide ("Hold one item in the frame") and the stylist shrinks to a corner circle. **Done showing** swaps them back.
- When the stylist recognizes an item, its name appears on the view, with a question mark if unsure ("Navy wool blazer?"), and **Capture** appears. The stylist says it out loud too.
- Capture takes a still, which moves into Style around this item and is then handled like an uploaded photo.
- States: off, asking permission, starting, on, item found, several items found (the stylist asks which), captured (toast: "Photo added to your notes"), turned off after 2 minutes ("Camera turned off. Turn it on again to show another item."), blocked ("Camera blocked. Upload a photo instead." with **Upload photo**), no camera found (the same fallback).

### 4.2 My Styling Notes

**Notebook**
- A notebook page, not a form: there are no fixed fields. The title "My Styling Notes" sits at the top, with the line "Notes appear here as you talk. Tap a note to confirm or remove it, or say a correction."
- Order on the page: saved preferences that apply, jotted at the top; Style around this item (only with a photo); the stylist's notes in the order they were jotted, newest at the bottom, like writing down a page; then feedback under a small heading for each look (only once a look exists). Session exceptions are jotted where they happen, marked This session only.
- States: expanded; collapsed (one line, for example "6 notes, 1 to confirm", plus the photo thumbnail); empty (a blank ruled page with the hint line); writing (a note is inking in); paused ("Notes paused. You can still confirm or remove notes.").
- **Hide** and **Show** keep everything as it was.
- Look: a white page, Rule blue lines every 28 px, a Margin pink line on the left, and the Paper shadow. The lines sit under the text and are light enough not to affect reading.

**Jotted note**
- One or two lines of Newsreader sitting on the ruled lines, in the stylist's words: short summaries, never quotes. For example "Outdoor wedding, November" or "Budget: up to $500".
- A small status chip at the end of the line.
- States:
  - To confirm: written in Graphite on a Highlighter mark, with a To confirm chip.
  - Confirmed: written in Ink, with a Confirmed chip and an Emerald check.
  - Writing: the note inks in from left to right, then screen readers hear, for example, "Noted: budget up to $350, confirmed."
  - Corrected by voice: the old words are struck through for a moment, then the new words ink in.
  - Selected: after a tap, **Confirm** and **Remove** appear beside the note.
  - Removed: the note fades out, with **Undo** for 5 seconds.
- The whole note is one tap target.
- While the shopper is speaking, screen reader updates are grouped, for example "3 notes added", so they do not talk over the conversation.

**Status chip**
- A small pill with an icon and a word: To confirm, Confirmed, Saved preference, This session only, Checking, Checked, Needs a new check.
- Always an icon plus a word. Never color alone.

**Note actions**
- Tapping a note shows two buttons beside it: **Confirm** and **Remove**. There is no keyboard and no editor.
- To change what a note says, the shopper says the correction, for example "Actually, make my budget $350".
- States: hidden, shown, confirming (the note turns to ink), removed (with **Undo** for 5 seconds).
- Focus moves to Confirm when the buttons appear, and back to the note when they close.

**Pasted photo ("Style around this item")**
- The shopper's photo, uploaded or captured from the camera, with a white print border, a 1 degree tilt and two strips of tape. The label beside it is never tilted.
- Label: the item name (for example "Navy wool blazer"), where it came from (Uploaded or From your camera), and its ownership: You own this, Inspiration, or Ownership: To confirm.
- Controls: **Enlarge**, **Replace**, **Remove**.
- Several photos: a row of thumbnails, with the active one outlined in Ink and labeled "Active".
- States: loading (a preview with progress), analyzing, recognized, details to confirm, several items found, recognition failed ("Couldn't recognize this item. Describe it instead."), upload failed (with **Try again**), removed.
- Collapsed notebook: a 40 px thumbnail with the label.
- Enlarge shows the full photo, untilted, with its description.

**Item details review**
- Shown after analysis: type, colors, pattern and style, each with a status chip. Tap a detail to confirm it, or say a correction.
- Asks "Is this yours or an inspiration?" with **It's mine** and **Inspiration**.
- **Save to wardrobe** appears only for owned items. The first use asks for photo storage permission.
- Several items found: a numbered list ("1. Denim jacket", "2. White T-shirt") so the shopper can tap one or say "the first one". The matching area on the photo is outlined when it is known.

**Feedback jotted under a look**
- Feedback is jotted like any other note, under a small heading for the look it's about, for example "Look 1".
- Each line says what to keep or change, and its scope, for example "Keep the dress and bag" or "Lower heels, this look only".
- States: To confirm, Confirmed, removed (with **Undo** for 5 seconds).
- Before any feedback, nothing shows under the look's heading.

**Saved preferences and session exceptions**
- Saved preferences: the Must have, Never and Likes items from the profile that apply, jotted at the top of the page, each with a bookmark icon. Tapping one opens it in Profile and privacy.
- This session only: each exception with a clock icon, for example "High heels allowed for this session. Your profile still says Never: high heels." Buttons: **Save to my profile** and **Remove**.

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

**Wardrobe**
- A grid of photos with category filters: All, Tops, Bottoms, Dresses, Outerwear, Shoes, Bags, Accessories.
- **Add item**, edit details, **Delete** (after confirming), and a select mode with **Style with these**.
- States: empty, loading, list, selecting, deleting, error.

**Saved looks**
- A list of saved looks, each with a small collage of its items, its name and the date saved.
- **Open** (checked first) and **Remove** (after confirming).
- States: empty ("No saved looks yet"), loading, list, checking.

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

**App bar and menu**
- Phones: the app name and a **Menu** button. Desktops: the same items across the top.
- Items: Session, Wardrobe, Saved looks, Demo bag (with an item count), Profile and privacy, About this project, Behind the scenes.

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
- **About this project:** a readable article page (Newsreader headings, Figtree body, lines of about 70 characters) covering the problem, the approach, key decisions and how it was built, with links to the PRD, the planning files in docs/ and the source code.

## 6. Accessibility built into the design

- Every text color pair in the palette meets 4.5 to 1. Control edges and the focus ring meet 3 to 1.
- Focus: a 2 px Focus ring with a 2 px white gap on every interactive element.
- Status is always an icon plus a word.
- Touch targets are at least 44 by 44 px.
- Screen reader announcements are polite, grouped while the shopper speaks, and never move focus.
- There are no captions in v1, and the conversation needs the shopper's voice. People who are deaf, hard of hearing or can't speak can't use the conversation in v1 (product spec R6, R10, R67).
- The camera view says in words whether it is on, and items recognized on camera are announced.
- **Voice only** is always one tap away for anyone who finds video distracting or has a slow connection.
- Every image has a description. Product photos use the product's name and color. Shopper photos use the recognized description, or "Your photo" until recognition finishes.
- Works at 200% text size and with reduced motion.

## 7. Open design questions

| # | Question | Recommended default |
|---|---|---|
| DQ1 | Which stylist avatar? | A ready-made photorealistic female avatar from the avatar provider's library, so nobody has to record themselves or consent to a custom one. The Voice only portrait is a still of the same avatar. |
| DQ2 | Add a dark theme in v1? | No. Colors are named tokens, so it can be added later. |
| DQ3 | Keep "AI Personal Stylist" as the product name? | Yes, as the working name for v1. |

## 8. Change log

- **1.1 (20 Oct 2026):** 2b: added the microphone, crossed-out microphone and hang-up icons that Mute and End use (4.1) to the icon table (3.7). No other change.
- **1.0 (20 Oct 2026):** Agreed by you before the design system was built (1c). Same content as 0.7, plus a note that the hanger icon is drawn to match Lucide. Any later change gets a new version number.
- **0.7 (19 Oct 2026):** Updated for product spec 1.4. My Styling Notes is now a free-form notebook of jotted notes, with Confirm and Remove by touch and no editor. Captions, the message box and Text only mode are removed, and Microphone needed and Time is up are new stylist states. Principle 6 and the screen sketches are redrawn.
- **0.6 (18 Oct 2026):** The About page now links the planning files in docs/, where they moved.
- **0.5 (18 Oct 2026):** Added the welcome screen's resting state (product spec R13).
- **0.4 (18 Oct 2026):** Video now runs for the whole conversation, so the time-left message counts conversation time. Voice only gained a reason line for when another visitor is using the video stylist.
- **0.3 (18 Oct 2026):** The Voice only state now includes the spoken switch line and the matched voice.
- **0.2 (17 Oct 2026):** Updated for the agreed product spec (Q1 answered B). Added the live video stylist, the Voice only and Text only modes, the camera view and its wireframe, camera icons and motion, a pinned message box on phones, and principle 9.
- **0.1 (17 Oct 2026):** First draft.

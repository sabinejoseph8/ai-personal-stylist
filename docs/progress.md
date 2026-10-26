# AI Personal Stylist: Progress

## Summary

- **Current focus:** Phase 6: 6a (saved looks and the demo bag) is merged, and 6b (Profile and privacy) is built (26 Oct 2026). Your decision: 6b and 6c first, then one iPhone check for 6a, 6b and 6c. Next: the 6b pull request, then the 6c plan.
- **Current status:** Phase 5 is done (25 Oct 2026): feedback by voice and touch, revisions, undo and compare, and session exceptions, all checked on your iPhone. 5b is done (21 Oct 2026): feedback revises its look, keeping the kept pieces and showing what changed. 5a is done (21 Oct 2026): what you'd keep or change in a look, said aloud or tapped with Keep and Change, is jotted under that look in My Styling Notes. Phase 4 is done (21 Oct 2026), so once the occasion is confirmed the server builds three looks that pass the preference check and publishes them through one gate, the session page shows them with totals, reasons and "Checked against your preferences", Swap works by touch and by voice, the looks are checked again after a change, and Behind the scenes shows what was captured and how each look was checked. The Phase 4 code review (4e) fixed 15 findings, with your decisions Q1 and A. With 4a, each Must have and Never preference has a rule that plain code checks on products, read back in setup, and the catalog can be narrowed to the products a session's looks could use. Phase 3 is done (20 Oct 2026), so during a conversation you can add photos or show items on camera to style around in My Styling Notes, the stylist works out what each item is, and items you own can be kept in your wardrobe and chosen to style with. The Phase 3 code review (3e) fixed 15 findings, with your decisions A to D. Phase 2 is done (20 Oct 2026), so the session page has the stylist stage with real video conversations, her state in words, Mute, End, the microphone card and tap to try, and notes are jotted while you talk, with quick replies for her next question. The real My Styling Notes notebook has Confirm, Remove and Undo by touch (2d). Time left and Time is up, recovering from a dropped call, and notes deleted when a session ends are in place (2e). The Phase 2 code review (2f) fixed 15 findings. Phase 1 is done (20 Oct 2026). The live link has guest sign-in, the design system, the welcome screen, setup and the sample profile, the sample catalog of 140 products behind the catalog connector, the budget guard and the daily clean-up job, all on the database with its access rules, and every change is tested on GitHub on phone and desktop sizes.
- **Recent changes (26 Oct 2026):** 6b built: the Profile and privacy page (your profile, saved preferences with Delete, the four permissions, and Clear this session's notes, Download my data as a ZIP, Delete all my data), with your answers to Q1 to Q3. 6a merged: Save look, Add to bag with sizes, the Saved looks and Demo bag pages, and checkout refused by the server.
- **Earlier (25 Oct 2026):** Your iPhone check passed B to E in the evening: Change and Undo feedback, Compare, Save to my profile (you took Never: high heels off the sample profile), and End clears everything; it cost 57 cents of AI and 7 minutes of video. The limit-lines fix: your iPhone check passed A and stopped at B.1, because the demo's $1-a-day AI allowance for your guest was used up (section A re-judges every look four times, about 45 Opus judgments at about 2 cents each) and the look said "couldn't be checked just now, try again in a moment". Now Change, Swap, Undo and Compare say "You've reached today's limit for the demo, so these stay", nothing is saved for a check that couldn't run, Swap no longer marks untried replacements as failed, the stylist says so briefly, and the daily allowance is $3 (your decisions, Q1 and Q2). 5d done: the review of the five batches' fixes (eight reviewer angles; two more stopped at the session's usage limit) found 15 more bugs, all fixed with tests: a saved preference of three letters or fewer made the notes reader drop every note of a reading; a photo whose cleaning failed could never be tried again, and a retried replacement reused its upload path; the notes merge could remove a feedback line from another look that said the same words, and lose a spoken confirmation; a refused retry of a replacement dropped the original from the page; a failed call start could lose the call the daily job still had to end, or refund twice; a second failed Tavus end discarded the first; a want making room at the note cap removed a note as if you had tapped Remove; a want confirmed from a pencil note had no mark; a refused hourly allowance could leave a candidate look half-saved; a newer "what changed" line could be wiped before she said it; and asking again for a kept preference told her both "kept" and "wait for the answer". Phase 5 is complete pending your iPhone check. - **Earlier (25 Oct 2026):** Full code review, batch 5 (hardening) is done, closing the review's 58 findings: guests can't write the bag, saved looks or feedback tables themselves; a guest can't make themselves permanent by editing their last-active date; raw uploads that never finished are swept daily; a guest's calls are ended before the guest is deleted; the rate-limit step refuses junk; the security policy loses the OpenAI entry until 6c; two "photo has arrived" requests at once clean a photo once; Capture keeps the camera on when the photo is refused; the page catches up on a photo's saved and active flags; a Replace refused for the hourly limit keeps the photo; a camera reading that fails is answered quietly; a failed reading is saved as failed; wardrobe pictures refresh their links; camera frames stop colliding in the rate limit; the pinned circle shows the stylist's video; turn keys never collapse; and a failed join doesn't run two recoveries. Next: the short review of the five batches' fixes (5d), then your iPhone check with the steps I sent. - **Earlier (25 Oct 2026):** Full code review, batch 4 (the looks engine) is done: two looks changed at once can't end up with the same dress (changes to a main piece run one look at a time, and a revision re-reads the others before publishing; shoes and bags still change side by side, so heels stay about 20 seconds); changing two pieces at once pairs replacements within the budget as a whole; confirming a photo detail by tap no longer re-checks every look; feedback about a piece that has left the look changes its kind of piece rather than the whole look; the one-build-at-a-time lock can't be handed to two requests (a token, with a database change applied before the merge); and Undo's answer is right when the look was restored. Your decision: batches 4 and 5 before your phone check, one check after batch 5. Tech spec 1.40, mvp.md 1.38. Next: batch 5 (hardening), then your iPhone check with the steps I sent. - **Earlier (25 Oct 2026):** Full code review, batch 3 (notes and wants) is done: two notes that share one word ("Owns a camel coat", "Owns a camel scarf") stay two notes; the notes reader can report a conflict and an allowed request from one sentence, in two separate fields, with the fix 5 safety check kept only for codes that don't exist (your Q2); a flagged request no longer throws away other notes from the same sentence ("high heels and a high neckline"); what you ask for once allowed ("High heels") carries a hidden mark, so Claude rewording it or Save to my profile can't turn it into a requirement that rebuilds every look, and Remove can always take it back; a re-check that changes only a look's failing shoes keeps the heels you asked for, and so does Swap, whose result the next update now leaves alone; and the small ones: a tap's stamp, the jotted want's update, a stable note order, the 12-note cap, the "Notes paused" flicker and the hourly allowance. The notes eval (real Claude, your Q1), twice at 17 cents a run, with 2 new two-field cases (63 cases): 96% right both times, 95% then 97% of notes within 2 seconds; both new cases right in the second run. Two things it showed: the stricter twin rule lets a few near-duplicates stand ("Bright, colorful" beside "Bright colors"), where the old rule lost distinct notes instead; and once in the two runs Claude gave the sleeves code for "I'd love some high heels" with heels allowed, which under your Q2 is now a card about sleeves (Keep dismisses it) rather than a guess at heels, so the rules now say a request for something allowed gets the allowed code, never a conflict (not measured again, to stay within the two runs). Tech spec 1.39, mvp.md 1.37. Next: your iPhone check (5c's A again, then B, C and D), then batches 4 and 5. - **Earlier (25 Oct 2026):** Full code review, batch 2 (the stylist's behaviour) is done: End now clears everything the page held for the call (a waiting Allow card, the back-up question, queued lines, her replies and her context), so nothing carries into your next session; a line for her waits while she's thinking of her reply to you (4 seconds at most), so she answers you, not the app; a tapped quick reply counts as your turn; a queued back-up question is tied to its preference; Keep my preference, tapped or spoken, is said to her outright; her "what changed" line is cleared once said; a reading that finishes after a later turn can't bring back a question you've moved past, and taps keep the current question in her context; the notes reader is told she just asked only while that's her latest question; the page notices when Change fails in the same words, so she's told again (the second half of fix 9); and check reasons and Behind the scenes number looks as the page does. Your Q1: the app's October video count (159.6 of 165) included minutes Tavus no longer counts or never saw (Tavus: 70.2 of 175 since your 21 Oct upgrade), so the Vercel stop is 260 for the rest of October (steps sent), to be lowered on 1 Nov. Tech spec 1.38, design 1.21, mvp.md 1.36. Next: batch 3 (notes and wants), then your iPhone check. - **Earlier (24 Oct 2026):** Full code review of everything built so far, which you asked for after the run of bugs in 5c. Five reviewers read all of the code (about 14,700 lines plus the database rules), each hunting for the kinds of bug your phone checks kept finding, and I checked their findings against the code: 58 findings, 2 serious, 21 a shopper would notice and 35 small, none a security hole. The fixes go in five pull requests, with your answers to Q1 to Q4, and your iPhone check comes after batch 3. Batch 1, money and data, is done: a call that fails to start gives its reserved 10 minutes back (a Tavus blip used to cost the guest their day and the month 10 video minutes); a session resumed after a dropped call is charged up to its last activity, not for the whole gap; a late "the call stopped" names its call, so it can't end the call that replaced it; a new photo becomes the item to style around only once it's checked and kept, so a failed upload leaves the earlier photo in use (the looks were built with no item while the page still showed it); Replace keeps the original photo, its reading and its files until the new version is kept, and a replacement turned away leaves it as it was; nothing is saved after End, even from a check that was mid-judgment; my real-Claude measurement runs now count against the app's $40 monthly stop, recorded with no guest (Q3); and a Tavus conversation whose end failed is remembered and ended by the daily job, with the end-of-call webhook left for Phase 7 (Q4). Tech spec 1.37, design 1.20, mvp.md 1.35. - **Earlier (23 Oct 2026):** 5c check: A passed. 5c fix 9 from B.1 (Change under the shoes showed Changing, the shoes stayed, and the stylist said they were updated). Once the heels had arrived, "High heels" wasn't passed on to later changes of the look: a re-run swapped the heels for white sneakers, and with the real checker the look probably stayed. And if a failed change's note said the same as before, she wasn't told. Now what was asked still holds for every later change of that kind of piece (Change under heels brings other heels), and she's told every time a change couldn't be made. - **Earlier (22 Oct 2026):** 5c fix 8 from your iPhone check (A.7: asked for heels again, the shoes stayed low). "High heels" had been jotted twice at A.5: your "yes" was read twice at once, and the notes and their version were read as two separate requests, so both readings' saves passed the version check. Removing one note at A.6 took the heels away while the other still asked for them, and asking again found it already jotted. Now the notes and their version come back in one request, allowing confirms a pencil note rather than adding another, and removing one note keeps the heels while another still asks. The browser tests' app now has spending limits real spending can't reach: once this month's real Claude spending passed $12, its notes paused too. The month's Claude spending reached the app's $12 stop during your 5c check, so the notes paused; you raised the stop to $40 in Vercel, with Anthropic's limit above it. This month's video is at 155 of 165 minutes. 5c fix 7 from your iPhone check (A.9: after Remove, the card was right but the stylist said high heels were allowed). Nothing told her the permission had been taken back, and she went by her own earlier words; and "High heels are allowed for this session" counted as her asking, so the app's back-up question stayed quiet. Now her instructions say outright when a permission is taken back, until it's allowed again, and only a question counts as her asking. 5c fix 6 from your iPhone check (A.5: after allowing heels the shoes didn't change, and after asking what heel height she went straight on to the looks). Allowing "High heels" had failed all three looks on their next check, so three whole new looks were built, 1 to 2 minutes; the session ended before they arrived. Now what you ask for once allowed changes only the pieces it's about: each look keeps the rest and its shoes become high heels, checked first, like Change (your Q1). The heels timing with real Claude: 42 seconds and 18 cents with the looks changed one after another (2 of 3 got heels; the third said no heels fit your $500 limit with its other pieces), so they now change side by side, about 20 seconds. Taken back (the note or the clock line removed), the shoes change back the same way. After she asks you something, her line about the looks waits for your answer, or 12 seconds. A build now stops when its session ends, so nothing is saved afterwards; the 3 looks saved after your 7:34 pm session had already been removed by the 10-minute cleanup (your Q2). 5c fix 5 from your iPhone check (A.7: asked for heels again, the card asked to go without sleeves, and the shoes didn't change). At A.6, Remove was tapped on the "High heels" note, which takes back the request but not the permission, so heels stayed allowed. The notes reader was then told only of Must have: sleeves, and matched "high heels" to it. Now the reader is also told what's allowed for this session, each by its own code. Asking again for something allowed is jotted in ink straight away, with no card, so the looks change (your Q1). A safety check drops a flag when the words name an allowed preference and none of the flagged one's. Remove on the note and Remove on the clock line stay separate (your Q2). 5c fix 4 from your iPhone check (with no answer for about 30 seconds, she said "Absolutely, should I allow it?"): while her question waits, no other line is sent to her (the lines sent in your voice, such as "Can you walk me through the looks…?", are never heard by you, only her reply is), and if she reminds you after a silence she repeats the question exactly. 5c fix 3 from your iPhone check (A.3 and A.4: she asked twice, back to back, and the shoes didn't change to heels): her instructions now give her the exact question, and the app says it only as a back-up when her own reply doesn't ask, so one question, never two. Once you allow what you asked for, "High heels" is jotted in ink and the looks change to include heels (your Q1); Remove takes it back. 5c fix 2 from your iPhone check (A.3 again: she allowed high heels herself, then answered the speak-up line literally): she now says the question word for word ("Your profile says never high heels. Shall I allow high heels for this session only, or keep your preference?"), her own first answer is only "Let me check that against your saved preferences.", the speak-up line is gone, and a spoken "yes, allow it" or "no, keep it" does what the buttons do (your Q1). The notes eval: all 7 saved-preference and answer cases right, 95% right overall, 95% within 2 seconds. 5c fix 1 (A.3, the stylist asked which heel height instead of asking first): her standing instructions now tell her from the start of the call to ask first when you ask for something a saved Must have or Never rules out, and the prompt for her to speak up now fires (it was set up before the call started, so it never did). 5c built. When you ask for something a saved Must have or Never rules out ("I'd love high heels"), the stylist asks first and a card asks the same; Allow for this session jots "High heels allowed for this session. Your profile still says Never: high heels." with Save to my profile (which takes it off your profile, after a confirmation) and Remove (your Q1, Q2). It ends with the session. A revised look has Undo feedback, which brings back the look before it, checked first, and takes back that feedback; Compare shows a look's earlier versions, side by side on bigger screens and with a Current and Earlier switch on phones, with the differences labelled and Use this look (your Q3). The "No other shoes fit" note now names the budget when that's the limit, and says when a check couldn't run (your Q4). The notes eval gained 4 cases (all right; 97% right overall, 95% within 2 seconds). Tech spec 1.30, design 1.17, mvp.md 1.28. 5b done (21 Oct 2026): your iPhone check passed A, C and D. B.1 (Change on Look 2's shoes) said "No other shoes fit" because the Claude account had run out of credit, so the one pair that fitted the budget couldn't be checked. About $6 of my real-Claude measurement runs that day had used up the $10 prepaid credit. You added credit, and you chose not to redo B.1. The budget was also the real limit there ($417 of $500 already spent, leaving one pair), which the message doesn't name yet. 5b built: feedback revises its look. A change or dislike line under a look, once confirmed, revises it: when you finish speaking, or 2 seconds after your last Keep or Change tap (your Q1). Changing a piece works like Swap, guided by what you said, and a change to the whole look asks the builder (your Q2). Kept pieces stay through every round, a turned-down piece never comes back to that look, and a detail such as "lower heel" keeps applying. The look shows Revising, then the revised look with New on its new pieces and a change summary above it ("Changed: … Kept: … New total: …"). If nothing fits, the look stays with a note saying so. Feedback for every look ("no high heels in any look") is a requirement for all of them. A revision built on old information is dropped (R52), and revisions never touch your profile or bag (R53). Measured with real Claude on your 5a wedding: three revisions in a row took 10 to 11 seconds and 5 to 6 cents each, with the kept pieces and the budget holding. Your answer to Q3: the app's monthly video stop is now 165 minutes, for your 175-minute Tavus plan. Tech spec 1.29, design 1.16, mvp.md 1.26. 5a done: your iPhone check passed, A to C. Before it, the video stylist couldn't start: the Tavus Starter plan's minutes had run out (Tavus refused with "out of conversational credits", while the app's own count was about 85 of its 110 minutes, since Tavus also counts Phase 0 and test-page calls). Tavus has no way to add minutes, so you upgraded the Tavus plan (175 minutes). You found the looks slower to arrive: 5a didn't change how looks are built. Your 5a wedding (outdoor, November, elegant, up to $500) took 55 to 83 seconds in 5 timed builds, with 2 or 3 looks, because the builder kept offering pieces the judgment step rejects (too casual for a wedding), and round 2 repeated round 1's looks, since it wasn't told them. The looks speed fix (your answer to Q1): the builder is told to match the occasion's formality, it hears which looks are already shown, repeats aren't judged, and the rounds stop when no new look can be made ("Only 2 dresses fit under your $90 limit" now answers without asking Claude). Timed again: 30 to 64 seconds, 3 looks every time. Merged; you'll judge its speed during the 5b iPhone check rather than in a separate re-check. A stricter version was faster but usually gave 2 looks, so it was left out. The checker eval still catches 16 of 16 rule breaks and judges 21 of 21 right. Tech spec 1.28, mvp.md 1.25. 5a built: feedback capture. Say what you'd keep or change in a look ("keep the dress and bag, lower heels", "I don't like the bag in look 3", "no high heels in any look"), or tap Keep or Change on an item, and it's jotted under that look in My Styling Notes, in ink when it's clear and in pencil (with a question) when it isn't (R46, R47). It's kept as notes, so Confirm, Remove and Undo work the same (your Q1); spoken feedback is read when you finish speaking, with the looks on screen (your Q2); a tap is jotted as Confirmed (your Q3). The looks don't change from feedback yet: that's 5b. The notes eval gained 7 feedback cases: 97 to 99% right. Tech spec 1.27, design 1.15, mvp.md 1.23. Phase 4 done: your final iPhone check passed, A to C. 4e, the Phase 4 code review, found 15 issues; none let a look that breaks a preference reach the screen. Fixed: a build that found no look is no longer repeated on every note (it could use up the day's $1); swaps take the same turn as builds; swap memory is kept per piece; only the end-of-turn notes reading hears swaps, so notes stay quick; a malformed saved rule is judged rather than failing every build; asking for looks with nothing changed no longer reads the whole catalog; your own item's photo in a look tries its new link; a spoken swap after looks go from 3 to 2; Behind the scenes asks once; the stylist no longer skips a new photo when looks update at the same moment; unused code removed; and the two flaky browser tests steadied. Your decisions: the no-match box offers only choices that work until 5c (A), and the unused event_log table is deleted (Q1). Tech spec 1.26, design 1.14, mvp.md 1.22. 4d done: your re-check passed, A and B. From your 4d iPhone check, "the same item comes back" on Swap: every replacement had failed your preferences, so the piece stayed, and the note saying so was easy to miss. The note is now on the piece's own tile ("No other dresses fit everything you've asked for, so this one stays."), and a second Swap no longer pays to check the same failed replacements again until something you've asked for changes. 4d built: Behind the scenes. A button beside Wardrobe opens it (a sheet on phones, a side panel on computers), on for everyone and closed until opened (your Q2). It lists, newest first, what the stylist captured (each note, whether it's confirmed and how, and what was read from a photo) and every preference check: looks that passed and what they meet, blocked candidates as one line of reasons, swaps, and checks again after a change, all from the records the app already keeps (your Q1). It starts with how many products fit everything now, and why the rest were left out (your Q3). Building it found a 4c bug, now fixed: a note changing during a build started a second full build, doubling the cost; now one build runs at a time per session. Tech spec 1.25, design 1.13, mvp.md 1.21. 4c done: your iPhone check passed, A to E. Your note from it is fixed: "Confirm your budget to see looks" now goes as soon as the looks start building, rather than staying until they arrive. 4c built: the looks are on screen. Each look's panel shows its items with photos, "You own this" or "Sample product" and a price, Swap, the total to buy and how it compares with your budget, the reason, and "Checked against your preferences". Before looks, the area says what's needed; while they're built, placeholders say "Putting looks together" and "Checking your preferences". Swap, by touch or by saying "show me different shoes" (the look on screen, or the one you name), checks 3 replacements at once and puts in the first that passes, marked New (your Q1, Q2). After a change, such as the budget, the looks show Needs a new check and Updating, are checked again, and only those that no longer fit are replaced (your Q3). The stylist presents new looks briefly in her own words and says what changed (your Q4). Phase 4's end-to-end test passes: no high heels across 10 swaps. The notes eval gained 7 swap cases: all right, 97% overall. Tech spec 1.24, design 1.12, mvp.md 1.20. 4b done: your review of the sample looks passed, with 3 looks for the job interview and the birthday dinner and 2 for the wedding. 4b built: the looks builder and the preference checker. Looks are built once the occasion is confirmed (R39). Claude (Opus 5.5, medium) composes up to 5 candidates from 4a's filtered products, by number only. Every candidate goes through rules in code (each product again, the budget, your own item, a complete outfit), then the judgment step, one look at a time (your Q3), for what code can't check, such as the occasion or "Never: anything too flashy". A look is published only by one database step that needs a passing check of that exact look on your current requirements. Up to 3 rounds; if fewer than 3 pass, those are shown with an explanation of what limits the rest (your Q2). Your review of the sample looks added four rules: a preferred or liked color must be in the main piece, not only the shoes or bag (burgundy is an earth tone, navy isn't); shoes and bag go with the outfit's colors (black goes with many outfits, but not black flats with a navy blazer, burgundy top and camel skirt, where tan or a neutral suits better); a coat or wrap you didn't ask for never fails a look; and each look shown has a different dress, or a different top and bottom. The checker eval: all 16 rule breaks caught and all 21 judged looks right, about 25 cents. The sample looks report (your Q1), rebuilt: 3 looks for the job interview and the birthday dinner, and 2 for the wedding, with its explanation (only two dresses fit: emerald satin and burgundy velvet), 24 to 50 seconds and 11 to 19 cents a build. The sleeve read-back now says "sleeveless or have cap or short sleeves". Tech spec 1.23, mvp.md 1.19. 4a done: your iPhone check passed: each Must have and Never was read back in setup (your own wordings too: "Never: Arms exposed" became no sleeveless, cap or short sleeves, and "Never: Revealing clothing" is judged), the read-backs were kept when you edited your profile, and the sample profile still goes straight to the session. 4a built: preference rules and candidates. Claude (Opus 5.5) turns each Must have and Never into a rule on the products' details, and setup reads it back: "Read as: no shoes with heels over 5 cm" (your Q1). A preference that isn't about a product detail is "checked by your stylist's judgment" (your Q3). The sample profile's rules are ready-made. The rule maker eval: 16 of 16 preferences right, about 11 cents a run. In plain code: the candidate filter (department, the outfit's categories, sizes, budget, firm rules and confirmed notes such as "Not black", with every product left out explained), which budget counts (a confirmed note, or else your profile's; "around" allows 10% over, your Q2), and totals that never count owned items. Tech spec 1.22, design 1.11, mvp.md 1.18.
- **Earlier (20 Oct 2026):** The unused TEST_PAGE_PASSCODE setting is gone from Vercel and your .env.local. Phase 3 done: your final iPhone check passed: a photo start to finish, Save to wardrobe, the camera ("I'd use that for work" did nothing, and "use this one" took a still), and Style with these, Change and Clear wardrobe items. 3e fix 2: your re-check found that after Style with these and Change, the Wardrobe page came back in Select with the old choice, so Clear wardrobe items didn't appear (C.7). Next.js keeps a page as it was while it's hidden, and the Wardrobe page didn't start again from what's saved, the rule from Phase 1 (tech spec section 5, rule 11). It's now keyed on the saved items, with a browser test that takes your exact path. 3e fix: your final iPhone check found that "use this one" did nothing (B.7). Your words arrived each time, but speech recognition didn't write the exact words decision A needed. Your decision D: punctuation and capitals don't matter, and a short phrase of up to 4 words with "this one" or "that one" counts ("yes, this one"), while longer everyday sentences still don't. 3e built: the Phase 3 code review found 15 issues, all fixed. The ones that mattered most: an iPhone (HEIC) photo claiming to be enormous could exhaust the server's memory (its size is now checked first); a weak signal could make a photo that had arrived look failed (it now stays, and the page asks for its reading); failed AI readings weren't counted by the budget guard; a reading could stop on the live site if the page closed (now kept alive with after()); and an upload could be processed and read twice. Smaller ones: photo actions at the same instant could fail (they now take turns, migration photo_locks), Switch camera restarted the 2-minute limit, two quick taps could undo each other on screen, the wardrobe question could follow you to another photo, and long wardrobe details gave a technical error. Your decisions: A, "use this one" hears only clear requests (then D, after your iPhone check found it did nothing: punctuation and capitals don't matter, and a short phrase with "this one" or "that one" counts); B, Clear wardrobe items when nothing is ticked; C, the photo store tries a busy request again. The "Cannot coerce" log is gone (a deleted session now counts as ended). After the fixes: 254 unit and database tests and 131 browser tests pass, and the photo eval had 93% of details right (pass mark 85%). Design 1.10, tech spec 1.21, mvp.md 1.17. 3d done: your iPhone check passed (Save to wardrobe asked about wardrobe photos once, then the item was on the Wardrobe page after the session ended; Add item, rename, the category filters and Delete; and Style with these put two items in My Styling Notes, and the stylist talked about them). 3d built: the wardrobe. An item marked You own this can be saved to the wardrobe; the first time, the app asks about wardrobe photos. The new Wardrobe page shows a photo grid with category filters, Add item (a photo read by the photo reader, which suggests the details to check; your Q1), Edit, Delete after confirming, and Select with Style with these, which puts the items in My Styling Notes under From your wardrobe and tells the stylist (your Q2). It's linked from the session page and the welcome-back screen until the app menu, now a 7a task (your Q3). The stylist is also told everything so far as each call starts. Design 1.9, tech spec 1.20, mvp.md 1.16. 3c done: your iPhone re-check passed: "use this one" added one photo and turned the camera off, both after the name appeared and when said just before it; the camera turned itself off after 2 minutes; and a blocked camera offered Upload photo, with the stylist suggesting it. Blocking the camera only takes effect after the page reloads in Safari, as with the microphone in 2f, so that step now blocks it before the conversation starts. 3c fix: your iPhone check found that saying "use this one" did nothing (the camera stayed on). Your words did reach the app, so the cause was in the page: holding an item up while talking can clear its name just as you speak, and a guard against capturing twice relied on a label the real call may leave blank. Now "use this one" counts for 8 seconds after an item was on screen, waits for a name if you say it just before one appears, and takes a single still (tech spec 1.19). 3c built: the camera. During a conversation, Camera (between Mute and End) explains itself first, then shows your camera: a tile on desktops, or on phones the whole stage with a frame guide while the stylist shrinks to a circle. "Camera on" and "Video isn't saved." show throughout. About every 2 seconds a small frame is read by Claude Haiku 5.5 and thrown away; once two frames agree, the item's name appears ("Navy wool blazer?" when unsure), she names it out loud, and Capture or saying "use this one" (your Q1) adds a still to the notebook, from your camera, read like any photo; the camera then turns off (your Q2). Switch camera, Done showing on phones, off after 2 minutes, at the end of the conversation and when you leave the page. Camera blocked or missing offers Upload photo, and she suggests it. The camera reader check: type right 18 of 20 and colors 20 of 20 at camera size, about 1.3 seconds a frame. Design 1.8, tech spec 1.18, mvp.md 1.15. 3b done: your iPhone check passed, and the details matched your own items (one item, Confirm, a spoken correction, It's mine, and choosing "the second one" from a two-item photo). A one-off check on the live site read a catalog blazer correctly in about 5 seconds, including cleaning the photo. 3b built: the photo reader. A kept photo shows Analyzing for about 2.5 seconds while Claude Opus 5.5 reads it (about 1.3 cents a photo). Then the label names the item and a list under the photo shows its type, colors, pattern and style, in ink when Claude is sure and To confirm otherwise; tap one to confirm it, or say a correction. "Is this yours or an inspiration?" with It's mine and Inspiration. With several items, a numbered list to tap or say "the first one". If the photo can't be read: "Couldn't recognize this item. Describe it instead.", and what you say fills it in. Once a photo is read, the stylist speaks up about it (your Q1). The photo eval (your Q2): 94% of details right (pass mark 85%), and every item found in the two-item photos. Your Q3: what you say about the photo goes through the notes reader; the notes eval, with 6 new photo cases, had 95 to 96% of notes within 2 seconds over three runs. Design 1.7, tech spec 1.17, mvp.md 1.14. 3a done: your iPhone check passed (Photo Library, Take Photo, Enlarge, switching the active photo, Replace, Remove, the thumbnail when the notes are hidden, and End), and every photo was the right way up. A one-off check on the live site also confirmed a HEIC photo is converted (about 2 seconds) and a renamed text file is turned away. 3a built: photo upload and the notebook photo. Once the conversation has started, Add a photo in My Styling Notes opens the phone's Photo Library, Take Photo or Choose File (your Q2). The photo shows at once, taped into the notebook under Style around this item with "Uploading", while the browser sends it straight to the private photo store with a one-time upload link (your Q1: Vercel refuses anything over 4.5 MB). The server then checks its real type and size, turns it the right way up, shrinks it, and saves it again without location or camera details; iPhone HEIC photos are converted first. Enlarge, Replace and Remove work, up to 5 photos show as thumbnails with Active (your Q3), a failed upload keeps the photo with Try again, and hidden notes keep a small thumbnail. Every photo has a version, so a late result never brings back a replaced photo. Photos are the app's own record, opened only through 30-minute links, and are deleted at End, or for a session that timed out on your next start or by the daily job (your Q4). Design 1.6, tech spec 1.16, mvp.md 1.13. Phase 2 done: your final iPhone check passed (a blocked microphone with Reload page, a quick session, and VoiceOver reading the budget change). 2f, the Phase 2 code review: 15 findings, all fixed. They include a way to reset the daily 10 minutes (two ends of one call), a failed reconnect that blocked every later one, fatal call errors leaving Reconnecting stuck, notes from an ended session reappearing, ink by voice after any stylist line, a removed note coming back reworded, a yes and a no merged, "below 40 degrees" read as a budget, "I may" read as May, the next question trusted from the browser, and no rate limit on note touches. Your decisions: A, the session screen's call code split into its own part; B, a left-behind call counted until the last activity plus 30 seconds. Also done: the Phase 0 test pages deleted, a pool of test guests, and GitHub's Node 24 update (tech spec 1.15, mvp.md 1.12). Your final iPhone check found Try again failing after you allowed a blocked microphone again, because Safari only applies that after a reload; a blocked microphone now offers Reload page (design 1.5). 2e done: your iPhone re-check passed (Reconnecting the whole time Wi-Fi was off, she came back with your notes, and End cleared them). 2e built: limits and session endings. The stage shows the time left in the last 2 minutes, then Time is up with which limit ran out; the notes stay. A weak connection shows Reconnecting, and a dropped call starts again by itself up to 3 times, then offers Try again. Your first iPhone check (Wi-Fi off for under a minute) found the 3 tries used up while still offline; a dropped call now waits up to 90 seconds for the connection first, and says Connection lost rather than Conversation ended (design 1.4). End deletes the session's notes, a database timer every 10 minutes ends idle sessions and deletes theirs (your Q1), a reading still running at End can't save, and a call a closed browser left behind is ended and deleted at Tavus on the next start or by the daily job. A real call confirmed Tavus no longer has an ended conversation. The fonts now come with the project's packages, because downloading them from Google had started failing every build (moved forward from 2f). Design 1.3, tech spec 1.14, mvp.md 1.11. 2d done: your iPhone check passed (the sample profile's Never: high heels, the wedding notes, Confirm, Remove and Undo, Hide and Show, the pinned bar and End), and the notes look right on the ruled lines. 2d built: the notebook. Notes sit on the ruled lines in pencil (a highlighter stroke, To confirm) or ink (Confirmed), new notes ink in, and a voice correction strikes the old words through first. Saved preferences sit at the top (not tappable until Phase 6, your Q1), and From your profile stays under the notebook (your Q2). Tapping a note shows Confirm and Remove, and a removed note has Undo for 5 seconds. Hide and Show fold the notebook to one line. On phones, a pinned bar with the stylist, Mute and the notes summary appears when she scrolls away. Screen readers hear note changes, grouped and held while anyone is talking. The browser tests caught a quick Undo then Remove bringing a note back; touches on a note are now sent in order (design 1.2, tech spec 1.13, mvp.md 1.10). 2c done: your iPhone check passed (the wedding notes, Dress or pantsuit, tapping Pantsuit and the $350 correction), and the notes felt quick. 2c built: the notes reader. Claude Haiku 5.5 jots notes in the stylist's words, plain code reads money and dates, notes are kept only by the server, the latest word wins, voice corrections work, and she gets the next question as quick replies and always knows the notes. You chose option 3 for speed (thinking off, overlapping readings, words sent twice a second): in the 30-sentence eval, 96 to 99% of notes were right and 97 to 99% arrived within 2 seconds (target 95%), at about 14 cents of notes a demo. Your plan answers: a clear voice correction keeps a note's status (Q1), and at most 12 notes a session (Q2) (tech spec 1.12, mvp.md 1.9). 2b done: your iPhone check passed, including interrupting her. 2b built: the stylist stage with her state in words, Mute and End (End asks first), the microphone card and Microphone needed, and three tap-to-try phrases (tech spec 1.11, design 1.1, mvp.md 1.8). 2a done: your iPhone check passed, and the stylist appeared in about 4 seconds (target 5). 2a built: the conversation connector (Tavus and a fake engine for tests), Start conversation, End, resume and the 30-minute idle rule, with the budget guard on every call and sessions only the server can change (tech spec 1.10). Phase 1 done: your five iPhone checks passed after the 1g fixes. 1g: the Phase 1 code review found 13 issues; 11 are fixed (a rate-limit reset trick, preferences that could be lost, GitHub skipping the signed-in browser tests, a stuck Try the demo button, rows pointing at another guest's session, and 6 smaller ones), and you made decisions A and B (tech spec 1.8, mvp.md 1.6). Your iPhone check then found setup saving old answers over the sample profile; fixed, with a test (tech spec 1.9). 1f done: the budget guard with your limits (10 minutes and $1 of AI per guest per day; 110 video minutes, $12 of Claude and $4 of OpenAI a month), the server key now also used for usage records, and a daily job at 08:00 UTC that deletes guests unused for 7 days, leftover test guests and old records, and closes idle sessions. Visits now count as activity (tech spec 1.7, mvp.md 1.5). 1e done: you picked OpenAI's generator at medium quality after comparing 10 test images, the other 130 photos were made with the half-price batch (about $3.50), and you approved all 140 photos. The catalog connector, its shared contract tests and the catalog check script are in place (tech spec 1.6, mvp.md 1.4). Set the OpenAI limit back to $5. 1d done: welcome, returning guests, setup and the sample profile, checked on your iPhone. 1c done: the design system, with design.md agreed as 1.0 and a /design-system page you reviewed. Every pull request's checks are now confirmed in the browser before merging. 1b done: guest sign-in with Cloudflare Turnstile (checked on your iPhone), profiles, rate limits and security headers; tests create test guests with the server key. 1a done. You chose one Supabase project in your Pro organization ($10 a month, shared until launch), which puts the running budget at about $50 a month.
- **Earlier (19 Oct 2026):** Phase 0 done: code review fixes (stale confirmed notes after a voice correction, duplicate budget notes, the demo summary, notes paused instead of crashing, slower wrong-passcode answers). 0g done: you approved the Phase 0 gate (video, voice only and cost passed; Haiku 5.5 for live notes and the camera), recorded in tech spec 1.3. 0f done: a full demo page, 3 test demos, a fix so confirmed notes never disappear. your scope change, product spec 1.4: no transcript or captions, no typing to the stylist in v1, a working microphone required, and a free-form notebook where the stylist jots down any relevant details. Design 0.7 and tech spec 1.2 match it, and the tasks in 2b to 2d, 5a and 6c are updated. 0e done: voice only passed, and quartz picked as the voice. The portfolio package (a recruiter README, an architecture diagram, an evaluation write-up, simple checks, a one-page case study and a private portfolio kit) was added to 7b, to be built once the app is (decision in docs/mvp.md). interview-notes.md is now private: kept on your Mac, no longer in the public repository.
- **Earlier (18 Oct 2026):** Android phones dropped from v1 testing, and each Tavus conversation is hard-deleted when the session ends (both in docs/mvp.md). 0f: the provider data handling review and an About page draft (docs/mvp.md section 8). 0e: the voice-only and camera test pages, and the camera test results. 0d done: notes speed test with a replay script (spikes/notes-speed). 0c done: Tavus stylist from a config file, passcode-locked test page, and a test that the session endpoint never returns a key. 0b done: public GitHub repository, bare Next.js 16.4 site deployed to Vercel, Vercel keys added. 0a done. You chose Tavus Starter now instead of Free (120 minutes a month), and adding keys to Vercel moved to 0b. Earlier the same day, the plan files moved into docs/. Added docs/mvp.md, CLAUDE.md, interview-notes.md and the Memory site. Split this plan into task groups, with a code review at the end of every phase.
- **What's left:** phases 3 to 7.
- **Known issues:** Supabase's connection limit can fill for a moment during bursts of test traffic ("Too many connections"), and the tests share the project with the live site, so the photo store now tries a busy request again and the tests run at most 2 files at once (your decision C in 3e). The browser tests' server log shows "Error: aborted" a few times, from tests that cut a connection short on purpose (a dropped photo answer, a reload). Notes sometimes repeat (about 1 test sentence in 6) when Claude edits a note so it matches another; the repeat rules only check new notes, so this is left for polish (Phase 7 or sooner). The notes eval's speed varies by a few points between runs (94 to 99% within 2 seconds). The notes eval times Claude and the merging, but not the phone's connection or the database. Each send makes about 10 database calls; the notes felt quick on your iPhone, so they stay as they are for now. Open risks are tracked in docs/mvp.md. A 10-minute session with styling changes costs about $1 of Claude (Opus judges up to three candidates per change, and every look again when heels are allowed or removed); cutting it is a question for the 6a plan.
- **Next action:** merge the 6b pull request, then the 6c plan for your approval.

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
| 0 | Prove the video stylist, live notes, voice only and phone browsers, and measure real costs | 0a to 0h | Done |
| 1 | Foundations: live link, guest sign-in, design system, database, sample catalog, budget guard | 1a to 1g | Done |
| 2 | Live session and My Styling Notes | 2a to 2f | Done |
| 3 | Photos, camera and wardrobe | 3a to 3e | Done |
| 4 | Looks and the preference check | 4a to 4e | Done |
| 5 | Feedback and refinement | 5a to 5d | In progress |
| 6 | Saving, demo bag, privacy and fallbacks | 6a to 6d | Not started |
| 7 | Polish, accessibility and launch | 7a to 7d | Not started |

---

## Phase 0: Prove the risky parts

**Goal:** Before building the real app, prove that the video stylist, live notes, voice only and phone browsers work well enough, and measure what a demo really costs. The code in this phase is a throwaway test page.

**Status:** Done (19 Oct 2026)

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
- [x] Try it on an iPhone with Safari and a laptop (Android was dropped for v1 on 18 Oct 2026): the microphone prompt, audio starting after a tap, video, and the back camera (risk 12). Done 19 Oct 2026: all worked.
- [x] Review how Tavus, OpenAI and Anthropic store data, and write a short plain summary for the About page (risk 10). Done 18 Oct 2026: findings and a draft summary are in docs/mvp.md section 8.
- [x] Run 3 test demos (10 minutes each on the Tavus Starter plan), and record Tavus minutes, OpenAI minutes and Claude spend. Compare them with the estimate of about $1.10 of AI use per 10-minute demo. Done 19 Oct 2026: about $0.05 of Claude per demo for notes and camera, 10.1 Tavus minutes each, no OpenAI.
- [x] Record the results in the spike results table in docs/mvp.md.

### 0g. Phase 0 decisions
- [x] **You:** make the decisions in the Phase 0 gate below, using the recorded results. Done 19 Oct 2026: you approved every recommendation on the decision sheet.
- [x] Record your decisions in docs/mvp.md, and in the specs if any agreed decision changes. Done: docs/mvp.md and tech spec 1.3.

### 0h. Code review
- [x] Code review of everything this phase changed, with fixes made, the automated tests re-run, and the findings explained to you. Done 19 Oct 2026: 10 findings, 7 fixed, 3 left on purpose (see docs/mvp.md).

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

**Status:** Done (20 Oct 2026)

### 1a. Project setup and database
- [x] Project setup: TypeScript, linting, Vitest, Playwright and axe-core, with GitHub Actions running every test on each pull request. Done 20 Oct 2026: phone and desktop browser tests with accessibility checks.
- [x] **You:** approve creating two Supabase projects on the free plan, one for production and one for previews and development. Changed 20 Oct 2026: one project, ai-personal-stylist, in your Pro organization ($10 a month), shared until launch.
- [x] Database tables from tech spec section 3 as migration files, with an access rule on every table. Done: all 16 tables in supabase/migrations, applied to ai-personal-stylist.
- [x] Private photo storage with one folder per guest. Done: the private guest-photos bucket, 10 MB per file.

### 1b. Guest sign-in and security basics
- [x] Guest sign-in with Turnstile, and a profile row for every new guest. Done 20 Oct 2026, checked on your iPhone: one tap, the same guest after reopening, and a new guest in a private tab.
- [x] Security basics: content security policy, camera and microphone allowed only on the session screen, and rate limits. Done: the limits are ready in the database and get switched on as each feature is built.

### 1c. Design system
- [x] Design tokens from design.md in Tailwind (colors, type, spacing, radius, shadows, motion), the Newsreader and Figtree fonts, and Lucide icons. Done 20 Oct 2026, from design.md 1.0 (agreed).
- [x] Base components: buttons, chips, status chips, sheets, dialogs, toasts and the permission card. Done: reviewed by you on /design-system.

### 1d. Welcome and setup
- [x] Welcome screen (R1, R2) and returning guests (R3). Done 20 Oct 2026, checked on your iPhone.
- [x] Setup with departments, style words, sizes, default budget and saved preferences (R4), and the sample profile (R5). Done: the sample profile shows Never: high heels.

### 1e. Sample catalog
- [x] **You:** compare 10 test images from 2 image generators, and pick one. Done 20 Oct 2026: you tested only OpenAI's generator, comparing its two quality settings, and picked medium (setting A).
- [x] Write about 150 products across womenswear and menswear, with every detail the checks need (R38). Done: 140 products (76 womenswear, 64 menswear) in catalog/products.json.
- [x] Generate every image. **You:** review them, and approve or reject each one (risk 13). Done: made with OpenAI's half-price batch, and you approved all 140.
- [x] Load products and images with their source recorded. Done: npm run catalog:load, with each photo's generator, prompt, date and your review; photos served from the site itself.
- [x] Catalog connector with the shared contract tests (PRD D02, D19). Done: connectors/catalog and tests/support/catalog-contract.ts; npm run catalog:check reports 140 products, all complete.

### 1f. Budget guard and daily job
- [x] Budget guard and usage table: daily and monthly limits are checked before every paid call (risk 4). Done 20 Oct 2026: lib/budget-guard.ts with your limits. Every paid call from Phase 2 on must go through it.
- [x] Daily scheduled job: delete guests unused for 7 days, including the access test's test guests, and close idle sessions. Keeping the database awake is no longer needed on Pro (risk 11). Done: /api/cron/daily at 08:00 UTC, protected by CRON_SECRET.

### 1g. Code review
- [x] Code review of everything this phase changed, with fixes made, the automated tests re-run, and the findings explained to you. Done 20 Oct 2026: 13 findings, 11 fixed, decisions A and B (see docs/mvp.md), plus the setup bug from your iPhone check, fixed. Your five iPhone checks then passed.

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

**Status:** Done (20 Oct 2026)

### 2a. Conversation connector and sessions
- [x] Conversation connector with the Tavus engine and a fake engine for tests. The voice-only engine (GPT-Live) comes in 6c (your answer to Q1 in the 2a plan; text only was removed on 19 Oct).
- [x] The app's own records (session state, and later looks, check results and the bag) are read-only for guests, and the server writes them with the server key after checking the session is theirs (your decision A in the Phase 1 code review). Each new table follows this rule as it's first used. Done for sessions in 2a.
- [x] Session start, End, the 30 minute idle timeout and resuming (R12), with the engine chosen by limits and availability. Done 20 Oct 2026: checked on your iPhone; the stylist appeared in about 4 seconds.

### 2b. Stylist stage
- [x] Stylist stage with its state in words (R8), and voice controls and interruption (R7). No captions, transcript or message box (R10, R11). Done 20 Oct 2026: checked on your iPhone; she stopped quickly when talked over.
- [x] Microphone permission card, and the Microphone needed state when the microphone is blocked, missing or not working (R6).
- [x] Sample phrases for visitors (R70).

### 2c. Notes reader
- [x] Notes reader that jots short notes in the stylist's words plus the hidden details looks need, with plain code for money and dates, receiving new words about twice a second (R15 to R17; your option 3 in 2c, changed from once a second).
- [x] "Latest word wins" and version numbers on every note (R22). From the Phase 0 code review: keep notes on the server (session_notes) and have the reader return changes by id (add, update, remove) that are merged in code, instead of rewriting the whole list each second.
- [x] Voice corrections (R21), and the next useful question with quick replies (R19).
- [x] Context updates, so the stylist always knows the confirmed notes. Done 20 Oct 2026: checked on your iPhone; the notes felt quick.

### 2d. Notebook
- [x] Notebook page with jotted notes in pencil and ink and no fixed fields (R15, R16), the ink-in motion, collapse and reopen (R23), saved preferences in view (R24), and the empty and paused states (R25). Also the phones' pinned bar with the notes count (moved here from 2b, your answer to Q3).
- [x] Confirm and Remove on each note, with Undo (R20).
- [x] Grouped screen reader announcements (R68). Done 20 Oct 2026: the notebook checked on your iPhone; the announcements are covered by the browser tests, and the VoiceOver check is in 2f.

### 2e. Limits and session endings
- [x] Time limits and time left (R13), and connection problems (R14).
- [x] Session-only data deleted when the session ends (R63), including a hard delete of the Tavus conversation (decided in 0f). Done 20 Oct 2026: checked on your iPhone, including a Wi-Fi drop after the reconnect fix.

### 2f. Code review
- [x] Code review of everything this phase changed, with fixes made, the automated tests re-run, and the findings explained to you. Done 20 Oct 2026: 15 findings fixed, your decisions A and B, and your final iPhone check passed (blocked microphone with Reload page, the session, and VoiceOver).

**Automated tests**
- Out-of-order replay: a late update never overwrites a newer spoken correction, or brings back a removed note.
- Budget parsing: "$500", "under 350", "around 400" and "between 200 and 300".
- Notes eval set of about 30 utterances, including R18: at least 90% correct (default), with 95% of updates within 2 seconds.
- End-to-end with the fake engine: the wedding sentence gives the R18 notes, a tapped Confirm turns a note to ink, collapsing and reopening keeps everything, and ending the session clears the notes.

**Manual verification**

| Step | Expected result |
|---|---|
| Start a conversation on your phone | The video stylist appears within about 5 seconds (S1) |
| Say the wedding sentence | Notes are jotted while you talk, nothing is jotted about the outfit type, and the stylist asks "dress or pantsuit?" (S4, S5) |
| Say "Actually, make my budget $350" | The budget changes to Up to $350 and the stylist acknowledges it (S6) |
| Tap a note in pencil, then Confirm | It turns to ink and reads Confirmed within 1 second (S7) |
| Collapse the notebook, then reopen it | Every value and status is still there |
| Turn on VoiceOver and correct a note | The change is announced and focus stays where it was (S18) |
| Deny the microphone | The app says the stylist needs it, and the conversation doesn't start (S17) |

---

## Phase 3: Photos, camera and wardrobe

**Goal:** Shoppers can add an item by photo or on camera, confirm what it is, and save items to their wardrobe.

**Status:** Done (20 Oct 2026)

### 3a. Photo upload and the notebook photo
- [x] Upload endpoint: check the real file type, a 10 MB limit, resizing, removing location and camera details, private storage and short-lived links (R26, FR-27).
- [x] Pasted photo under "Style around this item", with an instant preview, Enlarge, Replace and Remove (R27, R31).
- [x] Versions for the item to style around, so a late result never brings back an old photo (R31). Done 20 Oct 2026: checked on your iPhone (Photo Library, Take Photo, Enlarge, switching, Replace, Remove, Hide and End, every photo the right way up).

### 3b. Photo reader
- [x] Photo reader with To confirm details and corrections (R28), several items in one photo (R29), owned or inspiration (R30), and failure states (R32). Done 20 Oct 2026: the photo eval had 94% of details right, and your iPhone check passed (your own items read correctly, Confirm, a spoken correction, It's mine, and "the second one" in a two-item photo).

### 3c. Camera
- [x] Camera view: permission, back camera first, Switch camera, swapping places on phones, and the frame guide (R33).
- [x] Camera frames to the camera reader every 2 seconds, the item name with Capture, and the still moving into the notebook (R34).
- [x] The camera turns off after 2 minutes and when the session ends, no video is stored, and upload is offered as the fallback (R35). Done 20 Oct 2026: your iPhone checks passed (naming and Capture, "use this one" after the fix, Switch camera, off after 2 minutes, and a blocked camera offering Upload photo).

### 3d. Wardrobe
- [x] Wardrobe: photo storage permission, save, a list with filters, edit, delete, and select items to style with (R36, R37). Done 20 Oct 2026: your iPhone check passed (Save to wardrobe with the photo question once, Add item, rename, filters, Delete, and Style with these).

### 3e. Code review
- [x] Code review of everything this phase changed, with fixes made, the automated tests re-run, and the findings explained to you. Done 20 Oct 2026: 15 findings fixed, your decisions A to D, and your final iPhone check passed after two fixes ("use this one" made forgiving, D; the Wardrobe page starting again from what's saved).

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

**Status:** Done (21 Oct 2026)

### 4a. Preference rules and candidates
- [x] Preference rule maker: it turns "no high heels" into a rule the shopper confirms, for example heel height over 5 cm. Done 21 Oct 2026: your iPhone check passed, and the read-backs matched what you meant, including your own wordings ("Never: Arms exposed", "Never: Revealing clothing").
- [x] Candidate filter in code: department, categories, firm rules, sizes and budget. Done 21 Oct 2026, checked by automated tests on the real catalog (it has nothing on screen until 4b).
- [x] Totals in code, without owned items, compared with the budget (R42). Done 21 Oct 2026, checked by automated tests (shown on screen from 4c).

### 4b. Looks builder and the preference checker
- [x] Looks builder that proposes up to 5 candidates, each with a reason. Done 21 Oct 2026: your review of the sample looks passed, after the rules from your notes (colors in the main piece, shoes and bag that suit the outfit, burgundy as an earth tone, no missing coat, a different dress or top and bottom in each look).
- [x] Preference checker: rules in code first, unknown details fail, then the judgment step, with decision records (R54 to R56). Done 21 Oct 2026: the checker eval caught 16 of 16 rule breaks and judged 21 of 21 looks right.
- [x] The single publishing gate: the exact look, current versions and a passing check (R54, R55). Done 21 Oct 2026, checked by automated tests on the database (looks reach the screen in 4c).
- [x] Up to 3 retries, then a no-match explanation with choices (R59, R45). Done 21 Oct 2026, checked by automated tests and in the sample looks report (the wedding's 2 looks).

### 4c. Look panels
- [x] Look panels and item tiles with all their states (R39 to R41, R45). Done 21 Oct 2026: your iPhone check passed (what's needed before looks, placeholders, panels with totals, reasons and "Checked against your preferences").
- [x] Swap a piece (R43), refresh after a note changes (R44), and "Needs a new check" (R58). Done 21 Oct 2026: your iPhone check passed (five swaps by touch with no high heels, a swap by voice, the budget change to $350, and your own jacket labeled "You own this" and left out of totals), and Phase 4's end-to-end test passes (no high heels across 10 swaps).
- [x] The stylist presents new looks out loud. Done 21 Oct 2026: your iPhone check passed (she presented the looks briefly and said what changed).

### 4d. Behind the scenes
- [x] Behind the scenes panel (R72). Done 21 Oct 2026: your iPhone check passed (before a conversation, then captured notes, checks, swaps with their reasons, and checks again after a change), with the swap fix from it.

### 4e. Code review
- [x] Code review of everything this phase changed, with fixes made, the automated tests re-run, and the findings explained to you. Done 21 Oct 2026: 15 findings fixed, with your decisions Q1 (event_log deleted) and A (no-match choices that work until 5c); the automated tests and evals re-run; your final iPhone check passed, A to C.

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

**Status:** In progress (5a and 5b done, 5c built, and the full code review's five batches of fixes and 5d merged; your iPhone check next)

### 5a. Feedback capture
- [x] Feedback reader for likes, dislikes, requested changes and items to keep, sharing the notes reader (R46).
- [x] Keep and Change buttons on every item (R46).
- [x] Feedback jotted in the notebook under its look (R47). Done 21 Oct 2026: your iPhone check passed, A to C.

### 5b. Revisions
- [x] Revised looks with the Revising status, scoped rejections and kept items (R48, R49).
- [x] Change summary (R50).
- [x] Newest wins for revisions (R52), and no surprises (R53). Done 21 Oct 2026: your iPhone check passed A, C and D; B.1 failed while the Claude credit was out, and you chose not to redo it.

### 5c. Undo, compare and exceptions
- [x] Repeat, undo and compare, with a check before an earlier look is restored (R51).
- [x] Session exceptions: the conflict card, "This session only" and Save to my profile (R57).

### 5d. Code review
- [x] Code review of everything this phase changed, with fixes made, the automated tests re-run, and the findings explained to you. Done 25 Oct 2026: the full code review (58 findings, five batches) and the review of those fixes (15 findings, fixed).

The full code review of 24 Oct 2026 covers this for everything built so far: 58 findings, explained to you that day, fixed in five pull requests in order: 1 money and data (done 24 Oct 2026), 2 the stylist's behaviour (done 25 Oct 2026), 3 notes and wants (done 25 Oct 2026), 4 the looks engine (done 25 Oct 2026), 5 hardening (done 25 Oct 2026). Your iPhone check (5c's A again, with B, C and D) comes after batch 5, one check for everything (your decision, 25 Oct 2026). With the five batches merged, this task was a review of the fixes themselves, run with the code-review skill on 25 Oct 2026: 15 findings, fixed in one pull request.

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
- [ ] The fallback order: video, then voice only, then the conversation pausing or ending with notes and looks kept (R13, R14).
- [ ] The "demo is resting" welcome state when the monthly allowance is used up (R13, TQ4).
- [ ] Tavus webhook, so usage is recorded exactly.

### 6d. Code review
- [ ] Code review of everything this phase changed, with fixes made, the automated tests re-run, and the findings explained to you.

**Automated tests**
- Fallback order with fake engines: video, then voice only, then a paused or ended conversation, with notes and looks kept at every step.
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
| Let the day's conversation time run out | The stylist says time is up and the conversation ends. Notes and looks stay on screen (R13) |
| Delete all data | You land on the welcome screen, and starting again shows no old data (S19) |

---

## Phase 7: Polish, accessibility and launch

**Goal:** A polished, accessible demo that stays within budget and that you can share in job applications.

**Status:** Not started

### 7a. Accessibility and performance
- [ ] Accessibility pass: keyboard, screen reader, 200% text, reduced motion, contrast and touch targets (R67 to R69).
- [ ] Phone performance: a fast first load and a smooth notebook animation.
- [ ] The app bar and menu (the design's App bar and menu): Session, Wardrobe, Saved looks, Demo bag, Profile and privacy, About this project and Behind the scenes, replacing the interim Wardrobe links (added in 3d, your answer to Q3).

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

# Interview notes: AI Personal Stylist

## Who it's for and why

- I'm building an AI personal stylist as a portfolio project. I want to show product work end to end: from my own PRD to a live product that a hiring manager can try in a few minutes.
- It's for adults who need an outfit for an occasion, want to use what they already own, and have a budget. Shopping apps show endless products. A good stylist listens first.
- The core idea is a lifelike stylist you talk to on video. While you speak, it takes notes in a notebook on screen, called My Styling Notes, so you always see what it understood and can fix anything.
- I kept it retailer-independent on purpose. It uses sample products only, with no checkout, so I could build the experience without waiting for a retail partner. ASOS and FARFETCH are on the shortlist for later.

## Key decisions and trade-offs

1. **I kept the "wow" in v1.** Shipping text first, or voice without a face, would have been cheaper. I kept the video stylist and the live camera in v1, because the face-to-face experience is the product. To manage the risk, the first build phase is a throwaway test with clear pass marks. If the video doesn't pass, v1 launches with voice only.
2. **No sign-up.** I chose one-tap guest accounts over email sign-in, because a recruiter won't create an account to try a portfolio project. A ready-made sample profile includes "Never: high heels", so the preference check shows up in the first minute.
3. **I changed how the stylist is wired after checking the facts.** My PRD planned OpenAI's realtime voice with a Tavus face on top. When I checked the current docs, that pairing needed an always-on media server and added delay. I chose Tavus's full pipeline for video, with OpenAI's GPT-Live only as a cheaper voice-only fallback. The trade-off is that the voice changes if the fallback kicks in. I softened that with the closest-sounding voice and a line from the stylist: "I'm switching to voice only, so I'll sound a little different."
4. **Consistency over volume.** My first plan gave each visitor 5 minutes of video, then voice only, to save money. I changed it to video for the whole 10-minute conversation. A consistent experience mattered more to me than doubling the number of demos, so I get about 6 full demos a month on my budget instead of 12.
5. **A fixed budget with hard stops.** The demo runs on about $40 a month. The video plan has no overage charges, every provider has a spending limit, and each guest gets 10 minutes a day. When the money runs out, the app says the demo is resting until the 1st instead of breaking.
6. **Protecting the demo link.** I found that the free database plan pauses after a week without use. That would break my link the day a recruiter finally clicks it, so a daily job keeps it awake.
7. **The app decides; the AI services only talk.** The video and voice services just listen and speak. The notes, the outfits and the preference check live in our own code, so services can be swapped and every rule can be tested.
8. **Never contradict the shopper.** Every outfit passes a preference check before anyone sees it. Hard facts like budget and heel height are checked in plain code, AI only judges taste, and a missing detail counts as a fail.
9. **Privacy by design.** No raw audio, transcripts or camera video are kept. Camera frames are read and thrown away, and the video service never sees the camera.
10. **Planning discipline.** I wrote the product spec, design, tech spec and build plan in stages, and each one was agreed before the next began. Every requirement traces back to my PRD, and every requirement is covered by a build phase.

11. **I chose the AI for live notes with data, and put accuracy first.** Live notes have to appear within about 2 seconds while the shopper is still talking, so I tested before building. I replayed 11 test sentences, including my wedding example, at real speaking speed through a first notes reader on three Claude models:

    | | Opus 5.5 | Sonnet 5.5 | Haiku 5.5 |
    |---|---|---|---|
    | Notes within 2 seconds | 10% | 53% | 83% |
    | Accuracy | All right | All right | Two mistakes, including a missed budget correction |
    | Rough cost per 10-minute demo | $2.70 | $1.35 | $0.07 |

    None of them met the speed target. The biggest model was accurate but too slow, and would have cost more than four times my estimate. The smallest was fast and nearly free, but it got things wrong.
    - **I questioned the obvious fix first.** I asked whether simply letting Haiku think harder would close the gap. At medium effort it caught the correction, but it became as slow as Sonnet and still got the wedding notes wrong. More thinking wasn't the answer.
    - **I set the priority:** accuracy matters more than speed, because a wrong note breaks trust in the whole product. Sonnet was accurate but too expensive for my budget.
    - **Then I improved the cheap model instead of buying the expensive one.** I gave Haiku clearer instructions with examples, and moved budgets and dates out of AI into plain code, where exact rules beat a model. The improved Haiku got every note right in four runs, at the same $0.07 a demo, with 75 to 90% of notes within 2 seconds.
    - **I guarded against fooling myself.** Before tuning, I wrote five new test sentences the model was never tuned on. It got all of those right too. I still treat it as a small test, and a larger one is planned before launch.

## Major bugs and how I fixed them

None yet. The build starts with Phase 0.

## Significant improvements

- **I proved the riskiest part first.** Before building any real screens, I ran a throwaway test of the video stylist on my own devices. She appeared quickly, lip sync looked natural, I could interrupt her by talking over her, and my words streamed in while I was still speaking. That last one mattered most, because live notes depend on it. I also triggered a second call at the same time and recorded Tavus's exact refusal, so the voice-only fallback can be built against real behavior instead of a guess.
- **I protected the budget from day one.** The test page is behind a passcode, every call is capped at 10 minutes, and abandoned calls end after 30 seconds, so a public link can't quietly burn my video minutes.
- **I adjusted the plan to the facts.** My video plan turned out to include 120 minutes a month, not the 60 I'd planned around, so I moved to it straight away. Full-length test demos now match the real experience, and the same $22 covers about twice as many demos.

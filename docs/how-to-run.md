# How to run the AI Personal Stylist

Steps 1 to 3 need no coding: the live demo is a web page. Running your own copy (step 4 on) needs a terminal and a few accounts.

## See it working (3 minutes)

| Step | You do | What happens |
|---|---|---|
| 1 | Open the live site on a phone or laptop (the link is in the README) and tap **Try the demo** | A short setup, or **Use a sample profile** to skip it |
| 2 | Tap **Start conversation**, allow the microphone, and say what you're dressing for, your budget, and what you like | The stylist answers on video and jots notes in My Styling Notes as you speak |
| 3 | Confirm the notes with a tap | Three complete looks appear, each checked against your preferences. Keep, change, swap, undo or compare them; save one; put pieces in the demo bag |

The demo has limits so a public link can't run up a bill: 20 minutes of conversation and $3 of AI a day per visitor, and monthly stops for every paid service. When they're reached, the screens say so.

## Run your own copy

### Before you start

1. Node.js 24 and npm. A free GitHub account to clone the repository.
2. Accounts and keys: [Supabase](https://supabase.com) (a project on the free plan works for one person), [Tavus](https://www.tavus.io) (the video stylist; a paid plan with conversation minutes), [Anthropic](https://console.anthropic.com) (Claude, for notes, photos and looks), [OpenAI](https://platform.openai.com) (voice only; a paid account with a small prepaid credit) and [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) (the bot check on Try the demo).
3. Clone the repository and run `npm install`.
4. Copy `.env.example` to `.env.local` and fill in the names it lists. Never commit `.env.local`.
5. Create the database tables: apply the files in `supabase/migrations/` to your Supabase project, in order (the Supabase CLI's `supabase db push`, or paste each into the SQL editor).
6. Load the sample catalog: `npm run catalog:load` (about 140 products with their photos).

### Start it

```bash
npm run dev
```

Open http://localhost:3000. The fake stylist for tests isn't used here: this is a real call, so Tavus minutes and Claude cents are spent.

## Run the checks

The portfolio checks (Python 3 standard library, nothing to install):

```bash
python3 checks/run_all.py
```

It should end with `0 failed`. Then the project's own tests:

```bash
npm run lint
npm run typecheck
npm test
npm run e2e
```

`npm test` needs the Supabase keys (it reads and writes test guests' rows). `npm run e2e` builds the app and runs the browser tests on phone and desktop sizes with fake engines, so it spends nothing.

## Reproduce the evaluation

The headline numbers, from the saved results, for free:

```bash
node scripts/eval-summary.mjs
```

They should match the results table in [docs/evaluation.md](evaluation.md). To run an evaluation again against the real models (each costs between a third of a cent and 30 cents of Claude):

```bash
npm run eval:notes
npm run eval:notes:held-out
npm run eval:checker
npm run eval:photos
npm run eval:rules
npm run eval:camera
```

Each rewrites its file in `tests/evals/results/`. Scores vary a few points between runs; the write-up says what each number can and can't show.

## Troubleshooting

- **"The video stylist couldn't start"**: the Tavus key or plan. Check the key in `.env.local`, and that the plan has minutes left.
- **"You've reached today's limit"**: the budget guard. Raise `BUDGET_DAILY_AI_USD` or `BUDGET_DAILY_CONVERSATION_MINUTES` in `.env.local` for your own copy.
- **Browser tests fail on sign-in limits**: Supabase allows about 30 sign-ins every 5 minutes. Wait a few minutes and run again.
- **The checks say a headline number isn't in a file**: the README, the case study and the evaluation must quote the same number as `node scripts/eval-summary.mjs` prints.

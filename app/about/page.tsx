import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppBar } from "@/components/app-bar/app-bar";

// About this project (7b, R71, design 5.8): a readable article for product manager roles. The problem,
// the approach, the key decisions, how it was built, what was measured, and the links: the planning
// files (the product spec stands in for the private PRD, Sabine's answer to Q2 in 7b), the Memory site
// and the code. Lines of about 70 characters, Newsreader headings and Figtree body.
export const metadata: Metadata = {
  title: "About this project · AI Personal Stylist",
  description: "Why and how the AI Personal Stylist was built: the problem, the key decisions, how quality was measured, and the links to the plan and the code.",
};

const REPO = "https://github.com/sabinejoseph8/ai-personal-stylist";
const DOCS = `${REPO}/blob/main/docs`;
const MEMORY_SITE = "https://claude.ai/artifact/Ngtm5cTyekAP1cPikjmhuX";

function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="focus-ring rounded-control text-emerald underline underline-offset-2">
      {children}
    </a>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="type-heading m-0">{title}</h2>
      {children}
    </section>
  );
}

const P = ({ children }: { children: ReactNode }) => <p className="type-body m-0">{children}</p>;

export default function AboutPage() {
  return (
    <>
      <AppBar current="about" />
      <main className="mx-auto flex max-w-[70ch] flex-col gap-8 px-4 py-10 tablet:px-6">
        <header className="flex flex-col gap-3">
          <h1 className="type-title m-0">About this project</h1>
          <P>
            A portfolio project by Sabine Joseph for AI product manager roles: a lifelike video stylist that jots down what you want while you talk,
            then builds complete looks you refine by voice or touch. Sample products only. Nothing here is for sale.
          </P>
        </header>

        <Section title="The problem">
          <P>
            Online shopping gives you a search box and a thousand results. A good stylist in a shop does something else: listens, remembers what
            you said, looks at what you already own, and puts together a whole outfit that fits your budget and your rules. Chat assistants get the
            listening half, but they forget, they contradict you, and they show you what you said you never wanted.
          </P>
          <P>
            The question this project asks: can a conversation with an AI stylist feel understood, never contradict you, and get you to a look you
            love in a few minutes on your phone?
          </P>
        </Section>

        <Section title="What it does">
          <ul className="type-body m-0 flex list-disc flex-col gap-2 pl-5">
            <li>You talk to a video stylist, face to face, on your phone or laptop. She listens, answers and asks the next useful question.</li>
            <li>
              While you talk, she jots notes in a notebook on screen: the occasion, your budget, what you like. You confirm or remove a note with a
              tap, or correct it by voice. A note never becomes a rule until you have confirmed it.
            </li>
            <li>Show her something you own, from a photo or the live camera, and the looks are built around it.</li>
            <li>
              Three complete looks appear, each checked against your saved preferences and your confirmed notes before you see it. Keep a piece,
              change a piece, undo, compare.
            </li>
            <li>Save a look, put sample pieces in a demo bag that cannot check out, and download or delete everything you gave the app.</li>
          </ul>
        </Section>

        <Section title="Key decisions">
          <ul className="type-body m-0 flex list-disc flex-col gap-2 pl-5">
            <li>
              <strong>A notebook, not a form.</strong> The stylist writes free-form notes in her own words. Nothing is a requirement until you confirm
              it. That one rule is what keeps the looks from contradicting you.
            </li>
            <li>
              <strong>The stylist only speaks and listens.</strong> The video and voice come from outside services, plugged in through one swappable
              connector. Every decision, from what a note says to whether a look passes, is made by our own server, where the keys live.
            </li>
            <li>
              <strong>One gate for every look.</strong> A look reaches the screen only after it passes the preference check: rules in code first (a
              heel height, a budget, a size), then a judgment call by a large model for the rest. No pass, no look.
            </li>
            <li>
              <strong>Accuracy first, then speed, then cost.</strong> Phase 0 measured four models on the same sentences before any screen was
              built. The notes use a fast small model with plain code reading money and dates; the looks and checks use a larger one.
            </li>
            <li>
              <strong>Degrade, never break.</strong> If video is busy or out of minutes, the same stylist carries on by voice. If a check cannot run,
              the look is held, with a plain reason, rather than shown unchecked.
            </li>
            <li>
              <strong>Privacy as a feature.</strong> Calls are never recorded, your camera is never sent to the video service, session photos are
              deleted when the session ends, and you can download or delete everything.
            </li>
          </ul>
        </Section>

        <Section title="How it was built">
          <P>
            As a product, before any code: a product spec, a design spec, a tech spec and a phased plan, each agreed and kept up to date as the
            project went on. The riskiest parts were tested first in Phase 0, with pass marks written down before the tests ran. Every phase ended
            with automated tests, a check on a real iPhone, and a code review whose findings were fixed before the phase was called done.
          </P>
          <P>
            Quality was defined before it was measured. The notes reader has an evaluation of 63 sentences with expected answers, the preference
            checker is tested against planted looks that break a rule, and the photo reader against catalog photos with known answers. The
            headline numbers, and what they can and cannot show, are in the evaluation write-up linked below.
          </P>
          <P>
            The budget is real: a daily allowance per visitor and monthly stops for every paid service, checked before every call, so a public link
            can never run up a bill.
          </P>
        </Section>

        <Section title="Read more">
          <ul className="type-body m-0 flex list-disc flex-col gap-2 pl-5">
            <li>
              <A href={`${REPO}#readme`}>The README on GitHub</A>, written for recruiters: the problem, the architecture, how quality was measured, the
              results and their limits.
            </li>
            <li>
              <A href={`${DOCS}/evaluation.md`}>The evaluation write-up</A>: what good looks like, how it was measured, the results with their caveats,
              and what the results changed.
            </li>
            <li>
              <A href={`${DOCS}/case-study.pdf`}>The one-page case study</A> (PDF).
            </li>
            <li>
              The plan: the <A href={`${DOCS}/product-spec.md`}>product spec</A> (every requirement traces back to the original PRD),{" "}
              <A href={`${DOCS}/design.md`}>design</A>, <A href={`${DOCS}/tech-spec.md`}>tech spec</A>,{" "}
              <A href={`${DOCS}/progress.md`}>the phased plan with its progress</A> and{" "}
              <A href={`${DOCS}/mvp.md`}>the MVP scope, decisions and risks</A>, including how the plan changed from the PRD.
            </li>
            <li>
              <A href={MEMORY_SITE}>The Memory site</A>: the same four plan files as a website, with live ticks for every task.
            </li>
            <li>
              <A href={REPO}>The code</A>, with its tests, evaluations and checks.
            </li>
            <li>A two-minute demo video is coming.</li>
          </ul>
        </Section>

        <Section title="Your data in this demo">
          <P>
            Your voice goes to Tavus, which runs the video stylist, or to OpenAI if the stylist switches to voice only. Your words, photos and camera
            frames go to Anthropic&apos;s Claude, which writes your notes and builds your looks. None of these services train their AI on what you
            share here. OpenAI and Anthropic delete it within 30 days, and we ask Tavus to delete each conversation when it ends. Calls are never
            recorded, and your camera is never sent to the video service. This app keeps only your notes, your saved looks and the photos you choose
            to save, for 7 days without use, and you can download or delete everything at any time in Profile and privacy.
          </P>
        </Section>

        <p className="type-small m-0 text-graphite">Sample products only. Nothing here is for sale.</p>
      </main>
    </>
  );
}

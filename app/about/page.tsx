import type { Metadata } from "next";
import { AppBar } from "@/components/app-bar/app-bar";

// Placeholder until the About this project page in Phase 7 (R71).
export const metadata: Metadata = { title: "How it was built · AI Personal Stylist" };

const DOCS = "https://github.com/sabinejoseph8/ai-personal-stylist/blob/main/docs";

export default function AboutPage() {
  return (
    <>
    <AppBar current="about" />
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-10 tablet:px-6">
      <h1 className="type-title m-0">How it was built</h1>
      <p className="type-body m-0">
        A portfolio project: a lifelike video stylist that jots down what you want, then builds complete looks you can
        refine by voice or touch. The full story is coming soon. Until then, here is the plan behind it:
      </p>
      <ul className="type-body m-0 flex list-disc flex-col gap-1 pl-5">
        <li><a className="focus-ring inline-flex min-h-touch items-center rounded-control text-emerald underline" href={`${DOCS}/product-spec.md`}>Product spec</a></li>
        <li><a className="focus-ring inline-flex min-h-touch items-center rounded-control text-emerald underline" href={`${DOCS}/design.md`}>Design</a></li>
        <li><a className="focus-ring inline-flex min-h-touch items-center rounded-control text-emerald underline" href={`${DOCS}/tech-spec.md`}>Tech spec</a></li>
        <li><a className="focus-ring inline-flex min-h-touch items-center rounded-control text-emerald underline" href={`${DOCS}/progress.md`}>Build plan and progress</a></li>
      </ul>
    </main>
    </>
  );
}

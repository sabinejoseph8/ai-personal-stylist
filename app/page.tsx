import { headers } from "next/headers";
import TryTheDemo from "./TryTheDemo";

// Placeholder until the welcome screen arrives in 1d.
export default async function Home() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-10">
      <h1 className="type-display m-0">AI Personal Stylist</h1>
      <p className="type-body m-0">Coming soon. Sample products only. Nothing here is for sale.</p>
      <TryTheDemo nonce={nonce} />
    </main>
  );
}

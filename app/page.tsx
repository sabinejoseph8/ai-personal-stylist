import { headers } from "next/headers";
import TryTheDemo from "./TryTheDemo";

export default async function Home() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <main>
      <h1>AI Personal Stylist</h1>
      <p>Coming soon. Sample products only. Nothing here is for sale.</p>
      <TryTheDemo nonce={nonce} />
    </main>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Button } from "@/components/ui/button";
import { TURNSTILE_SITE_KEY } from "@/lib/public-config";

// Temporary "Try the demo" button for 1b, until the welcome screen arrives in 1d.
// Turnstile runs invisibly; the page never sees the guest's sign-in, only "you're a guest".

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  execute: (id: string) => void;
  reset: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export default function TryTheDemo({ nonce }: { nonce?: string }) {
  const [status, setStatus] = useState<"checking" | "none" | "starting" | "guest" | "error">("checking");
  const [since, setSince] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  async function whoAmI() {
    const res = await fetch("/api/guest", { cache: "no-store" });
    return (await res.json().catch(() => ({}))) as { guest?: boolean; since?: string };
  }

  function show(data: { guest?: boolean; since?: string }) {
    setSince(data.since ?? null);
    setStatus(data.guest ? "guest" : "none");
  }

  useEffect(() => {
    let live = true;
    whoAmI().then((data) => live && show(data));
    return () => {
      live = false;
    };
  }, []);

  async function onToken(token: string) {
    const res = await fetch("/api/guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turnstileToken: token }),
    });
    if (res.ok) show(await whoAmI());
    else setStatus("error");
    if (widget.current) window.turnstile?.reset(widget.current);
  }

  function start() {
    if (!window.turnstile || !box.current || !TURNSTILE_SITE_KEY) {
      setStatus("error");
      return;
    }
    setStatus("starting");
    if (!widget.current) {
      widget.current = window.turnstile.render(box.current, {
        sitekey: TURNSTILE_SITE_KEY,
        size: "invisible",
        execution: "execute",
        callback: onToken,
        "error-callback": () => setStatus("error"),
      });
    }
    window.turnstile.execute(widget.current);
  }

  return (
    <section aria-live="polite">
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" nonce={nonce} />
      {status === "guest" ? (
        <p className="type-body m-0">
          You&apos;re a guest in this browser{since ? ` (since ${new Date(since).toLocaleString()})` : ""}. No email or
          password needed.
        </p>
      ) : (
        <Button onClick={start} disabled={status === "checking" || status === "starting"}>
          {status === "starting" ? "Starting…" : "Try the demo"}
        </Button>
      )}
      {status === "error" && <p className="type-body m-0 text-red-pen">We couldn&apos;t start the demo. Please try again.</p>}
      <div ref={box} />
    </section>
  );
}

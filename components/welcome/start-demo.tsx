"use client";

import { useRef, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { TURNSTILE_SITE_KEY } from "@/lib/public-config";

// Try the demo (R2): an invisible bot check, then a guest is created on the server and setup opens.
// No email or password. The page never sees the guest's sign-in.

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

export function StartDemo({ nonce }: { nonce?: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "starting" | "failed">("idle");
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  async function onToken(token: string) {
    const res = await fetch("/api/guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turnstileToken: token }),
    });
    if (widget.current) window.turnstile?.reset(widget.current);
    if (res.ok) router.push("/setup");
    else setState("failed");
  }

  function start() {
    if (!window.turnstile || !box.current || !TURNSTILE_SITE_KEY) {
      setState("failed");
      return;
    }
    setState("starting");
    if (!widget.current) {
      widget.current = window.turnstile.render(box.current, {
        sitekey: TURNSTILE_SITE_KEY,
        execution: "execute",
        callback: onToken,
        "error-callback": () => setState("failed"),
      });
    }
    window.turnstile.execute(widget.current);
  }

  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" nonce={nonce} />
      {state === "failed" ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-control bg-red-wash p-4">
          <p className="type-subheading m-0 flex items-center gap-2 text-ink">
            <Icon name="error" className="text-red-pen" />
            We couldn&apos;t start your demo
          </p>
          <Button onClick={start}>Try again</Button>
        </div>
      ) : (
        <Button onClick={start} disabled={state === "starting"} className="w-full tablet:w-auto">
          {state === "starting" ? "Starting your demo…" : "Try the demo"}
        </Button>
      )}
      <div ref={box} />
    </div>
  );
}

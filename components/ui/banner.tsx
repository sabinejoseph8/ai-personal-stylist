import type { ReactNode } from "react";
import { Icon } from "./icons";

// Banners stay until the problem is solved: information on Page, success on Emerald wash, errors on Red wash.
type Tone = "info" | "success" | "error";

const TONES: Record<Tone, string> = {
  info: "bg-page border border-hairline text-ink",
  success: "bg-emerald-wash text-ink",
  error: "bg-red-wash text-ink",
};

export function Banner({ tone = "info", title, children }: { tone?: Tone; title: string; children?: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex gap-3 rounded-control p-4 ${TONES[tone]}`}>
      {tone !== "info" && (
        <Icon name={tone === "error" ? "error" : "confirmed"} className={tone === "error" ? "text-red-pen" : "text-emerald"} />
      )}
      <div className="flex flex-col gap-1">
        <p className="type-subheading m-0">{title}</p>
        {children && <div className="type-body">{children}</div>}
      </div>
    </div>
  );
}

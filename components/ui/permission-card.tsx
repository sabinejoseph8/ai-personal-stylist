import { Button } from "./button";
import { Icon } from "./icons";

// Explains one permission at a time, just before it's needed (design.md section 4.4).
export type Permission = "microphone" | "camera" | "wardrobePhotos" | "preferences";

const COPY: Record<Permission, { title: string; why: string; notNow: string; denied: string }> = {
  microphone: {
    title: "Talk with your stylist",
    why: "Your stylist needs your microphone to hear you. Only your words are used, to jot your notes, and no audio is kept.",
    notNow: "Without the microphone, the stylist can't hear you, so the conversation can't start.",
    denied: "The microphone is blocked. To talk with your stylist, allow it in your browser's settings for this site, then try again.",
  },
  camera: {
    title: "Show an item on camera",
    why: "Hold up something you own and your stylist will recognize it. Frames are read and thrown away. No video is kept, and the camera turns off after 2 minutes.",
    notNow: "No problem. You can upload a photo instead.",
    denied: "Camera blocked. Upload a photo instead, or allow the camera in your browser's settings for this site.",
  },
  wardrobePhotos: {
    title: "Save photos to your wardrobe",
    why: "Keep photos of your clothes so your stylist can use them again. They're private to you, and deleted after 7 days without use.",
    notNow: "Your photos will be used in this session only.",
    denied: "Wardrobe photos are off. You can turn them on in Profile and privacy.",
  },
  preferences: {
    title: "Remember your preferences",
    why: "Save things like \"Never: high heels\" so every look respects them next time.",
    notNow: "Your preferences will apply to this session only.",
    denied: "Saving preferences is off. You can turn it on in Profile and privacy.",
  },
};

export function PermissionCard({
  permission,
  state = "ask",
  onAllow,
  onNotNow,
}: {
  permission: Permission;
  state?: "ask" | "declined" | "denied";
  onAllow?: () => void;
  onNotNow?: () => void;
}) {
  const c = COPY[permission];
  return (
    <section aria-labelledby={`perm-${permission}`} className="flex flex-col gap-3 rounded-panel border border-hairline bg-page p-5">
      <h2 id={`perm-${permission}`} className="type-subheading m-0 text-ink">
        {c.title}
      </h2>
      {state === "ask" && (
        <>
          <p className="type-body m-0 text-graphite">{c.why}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onAllow}>Allow</Button>
            <Button variant="secondary" onClick={onNotNow}>
              Not now
            </Button>
          </div>
        </>
      )}
      {state === "declined" && <p className="type-body m-0 text-graphite">{c.notNow}</p>}
      {state === "denied" && (
        <p className="type-body m-0 flex gap-2 text-ink">
          <Icon name="error" className="mt-0.5 shrink-0 text-red-pen" />
          {c.denied}
        </p>
      )}
    </section>
  );
}

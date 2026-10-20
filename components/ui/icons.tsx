import {
  Bookmark,
  Check,
  CircleDot,
  CircleQuestionMark,
  Clock,
  Mic,
  MicOff,
  PhoneOff,
  RefreshCw,
  ShieldCheck,
  SwitchCamera,
  Tag,
  TriangleAlert,
  Undo2,
  Video,
  VideoOff,
  type LucideProps,
} from "lucide-react";
import type { ComponentType } from "react";

// Icons from design.md section 3.7: simple outlines, 1.5 px stroke, 20 or 24 px,
// and one meaning per icon everywhere in the app.

/** Lucide has no hanger, so this one is drawn to match: same grid, same stroke. */
function Hanger(props: LucideProps) {
  const { size = 24, strokeWidth = 1.5, ...rest } = props;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      <path d="M10 6a2 2 0 1 1 3 1.73c-.6.35-1 .93-1 1.62V10" />
      <path d="M12 10 3.2 16.2a1 1 0 0 0 .58 1.8h16.44a1 1 0 0 0 .58-1.8Z" />
    </svg>
  );
}

export const ICONS = {
  confirmed: Check,
  toConfirm: CircleQuestionMark,
  undo: Undo2,
  youOwnThis: Hanger,
  sampleProduct: Tag,
  savedPreference: Bookmark,
  thisSessionOnly: Clock,
  checked: ShieldCheck,
  needsNewCheck: RefreshCw,
  error: TriangleAlert,
  camera: Video,
  switchCamera: SwitchCamera,
  capture: CircleDot,
  voiceOnly: VideoOff,
  microphone: Mic,
  muted: MicOff,
  end: PhoneOff,
} satisfies Record<string, ComponentType<LucideProps>>;

export type IconName = keyof typeof ICONS;

/** A decorative icon. Whatever it sits next to must say the meaning in words. */
export function Icon({ name, size = 20, className }: { name: IconName; size?: 20 | 24; className?: string }) {
  const Glyph = ICONS[name];
  return <Glyph size={size} strokeWidth={1.5} aria-hidden="true" focusable="false" className={className} />;
}

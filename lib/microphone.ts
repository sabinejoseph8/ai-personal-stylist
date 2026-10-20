import type { MicrophoneProblem } from "@/lib/stage";

// The microphone check before a call (R6). It runs before the server starts the video call, so a
// blocked or missing microphone never uses Tavus minutes. Browser only.

/** Whether this site already has the microphone: if so, the explanation card isn't shown again. */
export async function microphoneAllowed(): Promise<boolean> {
  try {
    const status = await navigator.permissions?.query({ name: "microphone" as PermissionName });
    return status?.state === "granted";
  } catch {
    return false; // Some browsers can't say; the card is shown, and costs one tap.
  }
}

/** Asks for the microphone (the browser shows its prompt if needed), then lets it go again. */
export async function checkMicrophone(): Promise<MicrophoneProblem | null> {
  if (!navigator.mediaDevices?.getUserMedia) return "failed";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return null;
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") return "blocked";
    if (name === "NotFoundError" || name === "OverconstrainedError") return "missing";
    return "failed";
  }
}

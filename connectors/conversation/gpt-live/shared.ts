// GPT-Live voice only (6c; R9, tech spec 4.2): what the server and browser sides share.

/** A voice call id, as the session stores it: "voice:pending:<id>" until the browser's offer creates the call, then "voice:<OpenAI session id>". */
export const VOICE_PREFIX = "voice:";
export const PENDING_PREFIX = `${VOICE_PREFIX}pending:`;

export const isVoiceCall = (callId: string) => callId.startsWith(VOICE_PREFIX);
export const isPendingVoiceCall = (callId: string) => callId.startsWith(PENDING_PREFIX);
/** OpenAI's own session id, or null while the call is still pending. */
export const liveSessionId = (callId: string) => (isVoiceCall(callId) && !isPendingVoiceCall(callId) ? callId.slice(VOICE_PREFIX.length) : null);

/** The line said when the stylist switches to voice (R9, design 4.1). */
export const SWITCH_LINE = "I'm switching to voice only, so I'll sound a little different.";

/**
 * The only events the browser's data channel may send (Sabine's answer to Q3 in 6c): context, exact
 * lines, mute and closing. It can't change the session's instructions, voice or tools (session.update),
 * or start responses or decisions. The live site can't hold OpenAI's trusted server connection for a
 * whole call (Vercel functions are short), and the page composes the stylist's context as it does for Tavus.
 */
export const ALLOWED_CLIENT_EVENTS = ["session.thinking.append", "session.instructions.append", "session.input_audio.mute", "session.input_audio.unmute", "session.close"];

/** The only events the browser hears: the call starting and closing, the words, and errors. */
export const ALLOWED_SERVER_EVENTS = ["session.started", "session.closed", "session.input_transcript.delta", "session.output_transcript.delta", "error"].map((type) => ({ type }));

/** GPT-Live costs $0.05 a minute, billed per second (tech spec 2). */
export const VOICE_USD_PER_SECOND = 0.05 / 60;

// What the waitlist forms say, shared by the server-rendered result pages and the in-page
// script so the two can't drift. Errors say what failed and how to fix it (apps/outside/AGENTS.md).
export const WAITLIST_MESSAGES = {
  joined: 'almost there. check your email for a link to confirm your spot.',
  confirmed: "you're on the list. we'll email you when you can play.",
  invalid_link: 'that link has expired or was already used. join again for a fresh one.',
  left: 'done. that email is off the list.',
  invalid_email: "that email doesn't look right. check it and try again.",
  rate_limited: 'lots of people are signing up right now. try again in a minute.',
  server: "the waitlist couldn't save that right now. try again in a few minutes.",
  offline: "couldn't reach the waitlist. check your connection and try again.",
} as const;

export type WaitlistMessage = keyof typeof WAITLIST_MESSAGES;

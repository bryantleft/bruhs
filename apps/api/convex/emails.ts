import { Resend } from '@convex-dev/resend';
import { components } from './_generated/api';
import type { MutationCtx } from './_generated/server';
import { type Mail, mailHtml, mailText } from './mail';

// Waitlist mail goes out through Resend's Convex component: queued with the mutation that
// asked for it, retried, and sent with idempotency keys. bruhs.app is verified in Resend
// (DKIM, plus SPF on its send. return-path subdomain); it has no inbox, so nothing else uses it.
export const resend = new Resend(components.resend, { testMode: false });

export const FROM = 'outside <outside@bruhs.app>';

// Plain lowercase game voice, as on the site (apps/outside/AGENTS.md), dressed like the page
// (see mail.ts). `site` is the landing page origin the signup came from.
function message(mail: Mail) {
  return { text: mailText(mail), html: mailHtml(mail) };
}

// `key` dedupes retries of the same send (Resend keys max out at 256 characters, so callers
// pass a hash, never the address).
export async function sendConfirmation(
  ctx: MutationCtx,
  email: string,
  site: string,
  link: string,
  key: string,
): Promise<void> {
  await resend.sendEmail(ctx, {
    from: FROM,
    to: email,
    subject: 'confirm your spot on the outside waitlist',
    ...message({
      site,
      preview: 'one tap and your spot is saved. the link works for 7 days.',
      title: 'confirm your spot',
      lines: [
        'someone (hopefully you) asked to join the outside waitlist with this email.',
        'tap the button, then press confirm on the page, and your spot is saved. the link works for 7 days.',
        "didn't ask? ignore this email and nothing happens.",
      ],
      button: { href: link, label: 'confirm my spot' },
    }),
    idempotencyKey: `waitlist-confirm/${key}`,
  });
}

export async function sendAlreadyListed(
  ctx: MutationCtx,
  email: string,
  site: string,
  key: string,
): Promise<void> {
  await resend.sendEmail(ctx, {
    from: FROM,
    to: email,
    subject: "you're already on the outside waitlist",
    ...message({
      site,
      preview: "your spot is already saved. we'll email you when you can play.",
      title: "you're already in",
      lines: [
        "someone (hopefully you) asked to join the outside waitlist with this email, but it's already confirmed.",
        "nothing to do. we'll email you when you can play.",
      ],
    }),
    idempotencyKey: `waitlist-already/${key}`,
  });
}

// The early-testing invite: a TestFlight public link, sent in waves by inviteWave.
export async function sendInvite(
  ctx: MutationCtx,
  email: string,
  site: string,
  link: string,
  key: string,
): Promise<void> {
  await resend.sendEmail(ctx, {
    from: FROM,
    to: email,
    subject: "you're in: play outside early on iPhone",
    ...message({
      site,
      preview: 'your invite to play outside early, through TestFlight.',
      title: 'you can play now',
      lines: [
        'you joined the outside waitlist, and early testing is open on iPhone.',
        "get Apple's free TestFlight app from the App Store, then open this email on your iPhone and tap the button to join.",
        "it's an early build, so expect rough edges. take a screenshot in the game to send us feedback through TestFlight.",
        "on Android? we'll email you when it's ready there too.",
      ],
      button: { href: link, label: 'join on TestFlight' },
    }),
    idempotencyKey: `waitlist-invite/${key}`,
  });
}

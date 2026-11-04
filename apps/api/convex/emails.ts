import { Resend } from '@convex-dev/resend';
import { components } from './_generated/api';
import type { MutationCtx } from './_generated/server';

// Waitlist mail goes out through Resend's Convex component: queued with the mutation that
// asked for it, retried, and sent with idempotency keys. bruhs.app is verified in Resend
// (DKIM, plus SPF on its send. return-path subdomain); it has no inbox, so nothing else uses it.
export const resend = new Resend(components.resend, { testMode: false });

export const FROM = 'outside <outside@bruhs.app>';

// Plain lowercase game voice, as on the site (apps/outside/AGENTS.md). Text and HTML carry the
// same words; the HTML is only there so mail clients make the link tappable.
function message(lines: readonly string[], link?: Readonly<{ href: string; label: string }>) {
  const html = (value: string) => value.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);
  const text = [...lines, ...(link ? ['', link.href] : [])].join('\n');
  const body = [
    ...lines.map((line) => `<p>${html(line)}</p>`),
    ...(link ? [`<p><a href="${html(link.href)}">${html(link.label)}</a></p>`] : []),
  ].join('');
  return { text, html: body };
}

// `key` dedupes retries of the same send (Resend keys max out at 256 characters, so callers
// pass a hash, never the address).
export async function sendConfirmation(
  ctx: MutationCtx,
  email: string,
  link: string,
  key: string,
): Promise<void> {
  await resend.sendEmail(ctx, {
    from: FROM,
    to: email,
    subject: 'confirm your spot on the outside waitlist',
    ...message(
      [
        'someone (hopefully you) asked to join the outside waitlist with this email.',
        'tap the link and press confirm to keep your spot. it works for 7 days.',
        "didn't ask? ignore this email and nothing happens.",
      ],
      { href: link, label: 'confirm my spot' },
    ),
    idempotencyKey: `waitlist-confirm/${key}`,
  });
}

export async function sendAlreadyListed(ctx: MutationCtx, email: string, key: string): Promise<void> {
  await resend.sendEmail(ctx, {
    from: FROM,
    to: email,
    subject: "you're already on the outside waitlist",
    ...message([
      "someone (hopefully you) asked to join the outside waitlist with this email, but it's already confirmed.",
      "nothing to do. we'll email you when outside launches.",
    ]),
    idempotencyKey: `waitlist-already/${key}`,
  });
}

import { describe, expect, it } from 'vitest';
import { palette } from '../../outside/src/theme/palette';
import { COLORS, mailHtml, mailText } from '../convex/mail';

const SITE = 'https://outside.bruhs.app';
const mail = {
  site: SITE,
  preview: 'one tap and your spot is saved.',
  title: 'confirm your spot',
  lines: ['tap <the> button & "go".'],
  button: { href: `${SITE}/waitlist/confirm/?token=abc_DEF-123`, label: 'confirm my spot' },
} as const;

describe('waitlist mail', () => {
  it('uses the game palette, so the email matches the page', () => {
    for (const [name, hex] of Object.entries(COLORS)) {
      if (name === 'ink') continue;
      expect(hex, name).toBe(palette[name as keyof typeof palette]);
    }
  });

  it('links the button, the fallback url and the page-served header art', () => {
    const body = mailHtml(mail);
    expect(
      body.match(/href="https:\/\/outside\.bruhs\.app\/waitlist\/confirm\/\?token=abc_DEF-123"/g),
    ).toHaveLength(2);
    expect(body).toContain(`src="${SITE}/email/header.png"`);
    expect(body).toContain(`url(${SITE}/email/fonts/pixelify-sans-bold.ttf)`);
    expect(body).toContain(`href="${SITE}/privacy/#leave"`);
  });

  it('escapes copy, so a line can never inject markup', () => {
    const body = mailHtml(mail);
    expect(body).toContain('tap &#60;the&#62; button &#38; &#34;go&#34;.');
    expect(body).not.toContain('<the>');
  });

  it('leaves out the button block when there is nothing to tap', () => {
    const body = mailHtml({ ...mail, button: undefined });
    expect(body).not.toContain('button not working');
    expect(body).not.toContain('/waitlist/confirm/');
  });

  it('carries the same words and the link in the text part', () => {
    const text = mailText(mail);
    expect(text).toContain('confirm your spot');
    expect(text).toContain('tap <the> button & "go".');
    expect(text).toContain(`confirm my spot: ${mail.button.href}`);
    expect(text).toContain(`${SITE}/privacy/#leave`);
  });
});

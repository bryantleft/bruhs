// The waitlist emails' look: the landing page in email-safe HTML. Tables and inline styles, so
// Gmail and Outlook keep the layout; hex colors, because mail clients don't read OKLCH. The
// header image and fonts are served by the landing page (apps/outside-site/src/pages/email),
// so the email renders from the same art and type as the page and the game.

// From apps/outside/src/theme/palette.ts, generated from packages/ui. tests/mail.test.ts fails
// if they drift.
export const COLORS = {
  ink: '#0a0a0a',
  'longan-950': '#15110d',
  'longan-900': '#1e1a15',
  'longan-800': '#29241f',
  'longan-700': '#645b53',
  'longan-600': '#756a61',
  'rambutan-100': '#f5ede7',
  'rambutan-300': '#dfcfc3',
  'rambutan-500': '#ab998f',
  'durian-300': '#fcf2bb',
  'durian-400': '#f6e296',
  'persimmon-500': '#da7825',
  'persimmon-800': '#75391c',
  'blueberry-300': '#a1cbff',
  'blueberry-400': '#7eb3ff',
} as const;

const C = COLORS;
// The page's stacks; the pixel faces load where clients honour @font-face (Apple Mail, iOS).
const PIXEL = "'Pixelify Sans Outside', ui-monospace, Menlo, Consolas, monospace";
const WIDTH = 560;

export type Mail = Readonly<{
  site: string;
  // Shown in the inbox list after the subject, and hidden in the body.
  preview: string;
  title: string;
  lines: readonly string[];
  button?: Readonly<{ href: string; label: string }>;
}>;

export function html(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

// Text and HTML carry the same words, so the text part reads the same without images.
export function mailText({ site, title, lines, button }: Mail): string {
  return [
    title,
    '',
    ...lines.flatMap((line) => [line, '']),
    ...(button ? [`${button.label}: ${button.href}`, ''] : []),
    '--',
    `outside, a bruhs game · ${site}`,
    `leave the waitlist any time: ${site}/privacy/#leave`,
  ].join('\n');
}

// Pixel chrome, as on the page: a bevelled fill (light top-left edge, dark bottom-right) inside
// a 2px ink outline. The outline is an outer cell's border, since mail clients drop `outline`.
function bevel(light: string, dark: string): string {
  return `border-style:solid;border-width:2px;border-color:${light} ${dark} ${dark} ${light}`;
}

function button({ href, label }: NonNullable<Mail['button']>): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate">
<tr><td style="border:2px solid ${C.ink}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
<td bgcolor="${C['persimmon-500']}" style="background:${C['persimmon-500']};${bevel(C['durian-400'], C['persimmon-800'])}">
<a href="${html(href)}" target="_blank" style="display:block;padding:14px 22px;font-family:${PIXEL};font-weight:700;font-size:18px;line-height:22px;color:${C.ink};text-decoration:none;text-shadow:1px 1px 0 ${C['durian-300']}">${html(label)}</a>
</td></tr></table>
</td></tr></table>`;
}

export function mailHtml(mail: Mail): string {
  const { site, preview, title, lines } = mail;
  const asset = (path: string) => html(`${site}/email/${path}`);
  const paragraphs = lines
    .map(
      (line) =>
        `<p style="margin:0 0 16px;font-family:${PIXEL};font-size:17px;line-height:26px;color:${C['rambutan-300']}">${html(line)}</p>`,
    )
    .join('\n');
  // A link that can't be tapped still has to work: give it in full, in a well like the page's.
  const fallback = mail.button
    ? `<p style="margin:8px 0 8px;font-family:${PIXEL};font-size:14px;line-height:20px;color:${C['rambutan-500']}">button not working? paste this into your browser:</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
<td bgcolor="${C['longan-900']}" style="background:${C['longan-900']};${bevel(C['longan-950'], C['longan-700'])};padding:10px 12px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;line-height:18px;word-break:break-all">
<a href="${html(mail.button.href)}" target="_blank" style="color:${C['blueberry-300']};text-decoration:underline">${html(mail.button.href)}</a>
</td></tr></table>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${html(title)}</title>
<style>
@font-face{font-family:'Pixelify Sans Outside';font-weight:400;src:url(${asset('fonts/pixelify-sans-regular.ttf')}) format('truetype')}
@font-face{font-family:'Pixelify Sans Outside';font-weight:700;src:url(${asset('fonts/pixelify-sans-bold.ttf')}) format('truetype')}
:root{color-scheme:dark;supported-color-schemes:dark}
@media (max-width:600px){.pad{padding:20px !important}}
</style>
</head>
<body style="margin:0;padding:0;background:${C['longan-950']}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C['longan-950']}">${html(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C['longan-950']}" style="background:${C['longan-950']}">
<tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${WIDTH}px">
<tr><td style="padding:0 2px 14px;font-family:${PIXEL};font-weight:700;font-size:16px;line-height:20px">
<a href="${html(site)}" target="_blank" style="color:${C['durian-400']};text-decoration:none">bruhs / outside</a>
</td></tr>
<tr><td style="border:2px solid ${C.ink}">
<img src="${asset('header.png')}" width="${WIDTH - 4}" height="${Math.round((WIDTH - 4) / 3)}" alt="outside: touch grass. level up. a pixel bruh in a small town." style="display:block;width:100%;height:auto;border:0;background:${C['blueberry-400']};font-family:${PIXEL};font-size:16px;color:${C.ink}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="pad" bgcolor="${C['longan-800']}" style="background:${C['longan-800']};${bevel(C['longan-600'], C['longan-950'])};padding:28px">
<h1 style="margin:0 0 18px;font-family:${PIXEL};font-weight:700;font-size:28px;line-height:34px;color:${C['durian-400']};text-shadow:2px 2px 0 ${C.ink}">${html(title)}</h1>
${paragraphs}
${mail.button ? `<div style="padding:4px 0 20px">${button(mail.button)}</div>` : ''}
${fallback}
</td></tr></table>
</td></tr>
<tr><td style="padding:18px 2px 0;font-family:${PIXEL};font-size:13px;line-height:20px;color:${C['rambutan-500']}">
outside, a pixel adventure that runs on walking.<br>
<a href="${html(`${site}/privacy/#leave`)}" target="_blank" style="color:${C['rambutan-300']};text-decoration:underline">leave the waitlist</a> any time · <a href="${html(site)}" target="_blank" style="color:${C['rambutan-300']};text-decoration:underline">${html(new URL(site).host)}</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

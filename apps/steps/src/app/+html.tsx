import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';
import { MAP_MARKER_SIZE, WALK_MAP_PADDING } from '../explore/map';
import { color, font, layout, radius, space } from '../theme/theme';

const DESCRIPTION = "a pixel step adventure. your real steps pay for your bruh's travel, skills and quests.";
// Link previews use the landing page's build-time image (apps/outside-site/src/pages/og.png.ts),
// so the game and the site share one picture. Scrapers need an absolute URL.
const SHARE_IMAGE = 'https://outside.bruhs.app/og.png';
const SHARE_IMAGE_ALT =
  'A pixel bruh standing in Bruhbridge, a small town with two houses, an anvil and a tree.';

// Keep the recap camera's marker-sized fitting area above expanded credits.
const mapRecapSpace = MAP_MARKER_SIZE + WALK_MAP_PADDING.top * 2;

const mapInfoIcon = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="${color.text}" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7.5"/><path d="M10 9v5M10 6h.01"/></svg>`,
);

export default function Root({ children }: PropsWithChildren): React.JSX.Element {
  const { htmlAttributes, bodyAttributes, headNodes, bodyNodes } = useServerDocumentContext();
  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <title>bruhs / outside</title>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content={color.canvas} />
        <meta name="description" content={DESCRIPTION} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="bruhs" />
        <meta property="og:title" content="bruhs / outside" />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:image" content={SHARE_IMAGE} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content={SHARE_IMAGE_ALT} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={SHARE_IMAGE} />
        <meta name="twitter:image:alt" content={SHARE_IMAGE_ALT} />
        <ScrollViewStyleReset />
        {headNodes}
        <style>{`html,body{background:${color.canvas};color-scheme:dark}body{-webkit-font-smoothing:antialiased}svg{shape-rendering:crispEdges}*:focus-visible{outline:2px solid ${color.primary};outline-offset:3px}[data-focus-content]:focus-visible,[data-inset-focus]:focus-visible{outline-offset:${-space.micro}px}
          @supports selector(:has(*)) {
            [data-reward-card]:has([data-reward-scroll]:focus-visible){outline:2px solid ${color.primary};outline-offset:${-space.micro}px}
            [data-reward-scroll]:focus-visible{outline:none}
          }
          a{-webkit-tap-highlight-color:transparent}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:0.01ms!important;transition-duration:0s!important}}`}</style>
        <style>{`
          #outside-app-world {
            box-sizing: border-box;
            width: 100%;
            height: 100vh;
            height: 100dvh;
            flex: 0 0 auto;
            align-items: center;
            background: ${color.canvas};
          }
          #outside-app-frame {
            width: 100%;
            max-width: 480px;
            height: 100vh;
            height: 100dvh;
            flex: 0 0 auto;
            overflow: hidden;
            background: ${color.canvas};
          }
          @media (orientation: landscape) {
            #outside-app-frame { max-width: 100%; }
          }
          @media (min-width: 1000px) {
            #outside-app-world {
              flex-direction: row;
              justify-content: center;
              padding: ${space.chapter}px;
            }
            #outside-app-frame {
              width: 420px;
              height: min(calc(100vh - ${space.chapter * 2}px), 920px);
              height: min(calc(100dvh - ${space.chapter * 2}px), 920px);
              border: 1px solid ${color.strongBorder};
              border-radius: ${radius.pomelo}px;
            }
          }
        `}</style>
        <style>{`
          .outside-street-map .maplibregl-canvas:focus-visible {
            outline: 2px solid ${color.primary};
            outline-offset: calc(-${space.tight}px - 2px);
          }
          .outside-street-map .maplibregl-ctrl-bottom-right {
            inset: 0;
            display: flex;
            align-items: flex-end;
            justify-content: flex-end;
          }
          .outside-street-map .maplibregl-ctrl-attrib.maplibregl-compact {
            box-sizing: border-box;
            min-width: ${layout.touch + space.micro * 2 + 2}px;
            min-height: ${layout.touch + space.micro * 2 + 2}px;
            max-width: calc(100% - ${space.related * 2}px);
            max-height: calc(100% - ${space.related * 2}px);
            overflow: hidden;
            padding: ${space.micro}px;
            margin: ${space.related}px;
            background: ${color.panel};
            border: 1px solid ${color.strongBorder};
            border-radius: ${radius.lychee}px;
            color: ${color.muted};
            font-family: ${font.label};
            font-size: 12px;
            line-height: 18px;
          }
          .outside-street-map .maplibregl-ctrl-attrib.maplibregl-compact-show {
            padding: ${space.tight}px ${space.tight}px ${space.tight}px ${space.related}px;
          }
          .outside-street-map .maplibregl-ctrl-attrib .maplibregl-ctrl-attrib-button {
            position: relative;
            float: right;
            top: 0;
            right: auto;
            width: ${layout.touch}px;
            height: ${layout.touch}px;
            margin: 0;
            border-radius: 0;
            background: transparent;
          }
          .outside-street-map .maplibregl-ctrl-attrib-button::before {
            content: "";
            position: absolute;
            inset: 0;
            pointer-events: none;
            border-radius: ${radius.grape}px;
            background: transparent url("data:image/svg+xml,${mapInfoIcon}") center / 20px no-repeat;
          }
          .outside-street-map .maplibregl-compact-show .maplibregl-ctrl-attrib-button {
            margin: -${space.micro}px -${space.micro}px 0 ${space.tight}px;
          }
          .outside-street-map .maplibregl-ctrl-attrib-button:focus {
            box-shadow: none;
          }
          .outside-street-map .maplibregl-ctrl-attrib-button:focus-visible {
            outline: none;
          }
          .outside-street-map .maplibregl-ctrl-attrib-button:focus-visible::before {
            outline: 2px solid ${color.primary};
            outline-offset: -${space.micro}px;
          }
          .outside-street-map .maplibregl-ctrl-attrib-button:active::before {
            background-color: ${color.raised};
          }
          .outside-street-map .maplibregl-ctrl-attrib-inner {
            box-sizing: border-box;
            margin-right: ${layout.touch + space.tight}px;
            max-height: calc(var(--outside-map-height, 260px) - ${space.related * 2 + space.tight * 2 + 2}px);
            max-height: max(calc(1lh + ${space.tight * 2}px), calc(var(--outside-map-height, 260px) - ${mapRecapSpace + space.related + space.tight * 2 + 2}px));
            padding: ${space.tight}px;
            overflow: auto;
            overscroll-behavior: contain;
            scroll-padding: ${space.tight}px;
            overflow-wrap: anywhere;
          }
          .outside-street-map .maplibregl-ctrl-attrib-inner:focus-within {
            max-height: calc(var(--outside-map-height, 260px) - ${space.related * 2 + space.tight * 2 + 2}px);
          }
          .outside-street-map .maplibregl-ctrl-attrib a {
            color: ${color.text};
            text-decoration: underline;
            text-underline-offset: 3px;
          }
          @media (hover: hover) {
            .outside-street-map .maplibregl-ctrl-attrib-button:hover::before {
              background-color: ${color.raised};
            }
          }
          @media (forced-colors: active) {
            .outside-street-map .maplibregl-ctrl-attrib .maplibregl-ctrl-attrib-button {
              color: ButtonText;
            }
            .outside-street-map .maplibregl-ctrl-attrib-button::before {
              background: Canvas;
            }
            .outside-street-map .maplibregl-ctrl-attrib-button::after {
              content: "i";
              position: absolute;
              top: ${(layout.touch - 20) / 2}px;
              left: ${(layout.touch - 20) / 2}px;
              width: 20px;
              height: 20px;
              box-sizing: border-box;
              border: 1.35px solid currentColor;
              border-radius: 50%;
              font: 600 16px / 18px system-ui;
              text-align: center;
            }
            .outside-street-map .maplibregl-ctrl-attrib-button:focus-visible::before {
              outline-color: Highlight;
            }
          }
        `}</style>
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}

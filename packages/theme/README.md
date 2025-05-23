# @bruhs/theme

A tailwind theme system for bruhs, including CSS and font assets.

## Installation

```sh
pnpm add @bruhs/theme
```

## Usage

Import the CSS in your project:

```js
import '@bruhs/theme';
```

### Fonts

After installing, copy the font files to your app's `public/fonts` directory:

```sh
node node_modules/@bruhs/theme/scripts/copy-fonts.js
```

Font-face declarations are already included in `@bruhs/theme` import, so you do not need to add them manually. Just ensure the font files are available in `public/fonts`. 
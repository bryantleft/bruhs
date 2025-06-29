# Bruhs Design System

Developer documentation for the Bruhs Design System codebase.

## Development Setup

```bash
# Install dependencies from project root
pnpm install

# Start development server
cd apps/design
pnpm dev
```

The dev server runs on `http://localhost:4321` with hot reloading.

## Architecture

### Tech Stack
- **Astro 5** - Static site generator with component islands
- **Preact** - Interactive components (lightweight React alternative)
- **TailwindCSS 4** - Utility-first CSS with custom design tokens
- **TypeScript** - Type safety across components and data

### Design Token Architecture
Design tokens are centralized in `packages/theme/src/index.css` using CSS custom properties:

```css
--color-rambutan-500: oklch(0.589 0.173 25.0);
```

These tokens are consumed by:
- TailwindCSS utilities (`bg-rambutan-500`)
- Component styles (`var(--color-rambutan-500)`)
- Data files for documentation (`apps/design/src/data/colors.ts`)

### Component Structure
```
src/components/
├── Sidebar.tsx         # Fixed navigation with route highlighting
├── ColorCard.tsx       # Interactive color swatch with copy functionality
├── FontSample.tsx      # Typography specimen display
└── NeutralColorRow.tsx # Neutral color variant display
```

## Adding New Design Tokens

### Colors
1. Add CSS custom property in `packages/theme/src/index.css`
2. Update `apps/design/src/data/colors.ts` with new color data
3. TailwindCSS automatically generates utilities

### Fonts
1. Add font files to `apps/design/public/fonts/`
2. Add `@font-face` declaration in theme package
3. Update `apps/design/src/data/fonts.ts`

## Build & Deployment

```bash
# Type checking
pnpm check

# Production build
pnpm build

# Preview build locally
pnpm preview
```

Deployed to Vercel with automatic builds from main branch. Build output goes to `dist/`.

## File Organization

```
apps/design/
├── src/
│   ├── components/     # Preact components for interactivity
│   ├── data/          # Design token data for documentation
│   ├── hooks/         # Custom Preact hooks
│   ├── layouts/       # Astro layout components
│   ├── pages/         # Route-based pages (.astro files)
│   └── styles/        # Global CSS imports
├── public/            # Static assets (fonts, favicon)
└── astro.config.mjs   # Astro configuration
```

## Contributing

### Adding a New Page
1. Create `.astro` file in `src/pages/`
2. Add route to sidebar navigation in `src/components/Sidebar.tsx`
3. Update route descriptions object

### Modifying Color Palette
1. Update CSS custom properties in theme package
2. Update data files in `src/data/colors.ts`
3. Ensure proper contrast ratios for accessibility

### Component Development
- Use Preact for interactive components
- Follow existing naming conventions
- Maintain TypeScript strict mode compliance
- Use design tokens from theme package

## Performance Considerations

- Astro generates static HTML with minimal JavaScript
- Interactive components use Preact islands (`client:visible`)
- Fonts are self-hosted for performance and privacy
- CSS is scoped and optimized by Astro's build process

## Dependencies

Key dependencies and their purposes:
- `@bruhs/theme` - Centralized design tokens (workspace package)
- `@astrojs/preact` - Preact integration for Astro
- `@astrojs/vercel` - Vercel deployment adapter
- `@tailwindcss/vite` - TailwindCSS 4 integration

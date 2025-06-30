export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const downloadText = (content: string, filename: string, mimeType = 'text/plain') => {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(blob, filename);
};

export const downloadSVG = (svgContent: string, filename: string) => {
  downloadText(svgContent, filename, 'image/svg+xml');
};

// Function to get contrasting colors for eyes and mouth based on base color
export const getContrastingColors = (baseColor: string): { eyes: string; mouth: string } => {
  // For lighter/warm colors, use darker contrasts
  const warmColors = ['#FADA5E', '#f97316', '#eab308', '#84cc16'];
  const coolColors = ['#3b82f6', '#8b5cf6'];
  
  if (warmColors.includes(baseColor)) {
    return { eyes: '#1a1a1a', mouth: '#dc2626' }; // Dark eyes, red mouth
  } else if (coolColors.includes(baseColor)) {
    return { eyes: '#fbbf24', mouth: '#f97316' }; // Yellow eyes, orange mouth
  } else if (baseColor === '#ef4444') { // Rambutan (red)
    return { eyes: '#1a1a1a', mouth: '#fbbf24' }; // Dark eyes, yellow mouth
  } else if (baseColor === '#ec4899') { // Dragonfruit (pink)
    return { eyes: '#1e293b', mouth: '#6366f1' }; // Dark blue eyes, indigo mouth
  }
  
  // Default fallback
  return { eyes: '#2E2E29', mouth: '#FC4141' };
};

export const generateLogoSVG = (baseColor: string, eyeColor: string, mouthColor: string, variant: 'left' | 'original' | 'right'): string => {
  const eyePositions = {
    left: { left: { x: 97, y: 209 }, right: { x: 300, y: 209 } },
    original: { left: { x: 198, y: 223 }, right: { x: 401, y: 223 } },
    right: { left: { x: 300, y: 209 }, right: { x: 503, y: 209 } }
  };
  
  const mouthPositions = {
    left: { x: 191, y: 364 },
    original: { x: 307, y: 378 },
    right: { x: 409, y: 364 }
  };

  const eyes = eyePositions[variant];
  const mouth = mouthPositions[variant];

  return `<svg viewBox="0 0 600 600" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="300" cy="300" r="300" fill="${baseColor}"/>
  <ellipse cx="${eyes.left.x}" cy="${eyes.left.y}" rx="40" ry="10" fill="${eyeColor}"/>
  <ellipse cx="${eyes.right.x}" cy="${eyes.right.y}" rx="40" ry="10" fill="${eyeColor}"/>
  <ellipse cx="${mouth.x}" cy="${mouth.y}" rx="120" ry="10" fill="${mouthColor}"/>
</svg>`;
};

export const downloadAllLogos = async (colorSet: { base: string; eyes: string; mouth: string; name: string }) => {
  const variants = ['left', 'original', 'right'] as const;
  const downloads: Promise<void>[] = [];
  
  variants.forEach((variant) => {
    const svg = generateLogoSVG(colorSet.base, colorSet.eyes, colorSet.mouth, variant);
    const filename = `bruh-${variant}-${colorSet.name.toLowerCase().replace(/\s+/g, '-')}.svg`;
    downloadSVG(svg, filename);
  });
  
  await Promise.all(downloads);
};

export const createBrandPackage = () => {
  // Create a comprehensive brand guidelines document
  const brandGuidelinesContent = `# Bruh Brand Guidelines

## Logo Files
- left.svg - Left-looking variant
- original.svg - Original forward-facing variant  
- right.svg - Right-looking variant

## Color Specifications
- Base Yellow: #FADA5E (RGB: 250, 218, 94)
- Eyes Black: #2E2E29 (RGB: 46, 46, 41)
- Mouth Red: #FC4141 (RGB: 252, 65, 65)

## Usage Guidelines
- Minimum size: 32x32px
- Clear space: 50% of logo height on all sides
- Always maintain aspect ratio when scaling

## File Formats
- SVG for web and scalable applications
- PNG for raster needs (include at 1x, 2x, 3x)
- PDF for print applications

For questions, contact the design team.`;

  downloadText(brandGuidelinesContent, 'brand-guidelines.md', 'text/markdown');
};
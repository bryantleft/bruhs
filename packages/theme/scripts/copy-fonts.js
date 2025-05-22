const fs = require('fs');
const path = require('path');

const packageFontsDir = path.join(__dirname, '../fonts');
const consumerRoot = process.env.INIT_CWD;
const consumerPublicFontsDir = path.join(consumerRoot, 'public', 'fonts');

try {
  if (!fs.existsSync(packageFontsDir)) throw new Error(`Source fonts directory does not exist: ${packageFontsDir}`);

  fs.mkdirSync(consumerPublicFontsDir, { recursive: true });
  const fontFiles = fs.readdirSync(packageFontsDir);
  if (fontFiles.length === 0) throw new Error(`No font files found in: ${packageFontsDir}`);

  for (const file of fontFiles) {
    const src = path.join(packageFontsDir, file);
    const dest = path.join(consumerPublicFontsDir, file);
    fs.copyFileSync(src, dest);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
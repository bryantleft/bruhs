const fs = require('fs');
const path = require('path');

const packageFontsDir = path.join(__dirname, '../fonts');
const consumerRoot = process.env.INIT_CWD;
const consumerPublicFontsDir = path.join(consumerRoot, 'public', 'fonts');

if (!fs.existsSync(consumerPublicFontsDir)) {
  fs.mkdirSync(consumerPublicFontsDir, { recursive: true });
}

for (const file of fs.readdirSync(packageFontsDir)) {
  const src = path.join(packageFontsDir, file);
  const dest = path.join(consumerPublicFontsDir, file);
  fs.copyFileSync(src, dest);
}
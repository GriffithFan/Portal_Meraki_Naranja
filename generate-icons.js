/**
 * Genera iconos PWA mejorados:
 * - "any" icons: icono original con contorno blanco circular (visible sobre fondos oscuros)
 * - "maskable" icons: icono centrado sobre fondo naranja sólido con safe-zone padding
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const IMAGES_DIR = path.join(__dirname, 'public', 'images');
const SIZES = [192, 512];
const THEME_COLOR = '#f97316'; // naranja

async function generateIcons() {
  for (const size of SIZES) {
    const srcPath = path.join(IMAGES_DIR, `icon-${size}.png`);
    if (!fs.existsSync(srcPath)) {
      console.log(`⚠️  No existe ${srcPath}, saltando...`);
      continue;
    }

    const original = sharp(srcPath);
    const meta = await original.metadata();
    console.log(`📐 icon-${size}.png: ${meta.width}x${meta.height}, channels=${meta.channels}`);

    // ─── Icon "any": contorno blanco circular ───────────────────
    // Reducimos el icono un poco para dejar espacio al contorno
    const padding = Math.round(size * 0.06); // 6% padding
    const innerSize = size - padding * 2;
    const borderWidth = Math.round(size * 0.03); // 3% border
    const radius = Math.floor(size / 2);

    // Crear el fondo con círculo blanco (contorno)
    const circleBg = Buffer.from(`
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${radius}" cy="${radius}" r="${radius - 1}" fill="none" stroke="white" stroke-width="${borderWidth}"/>
      </svg>
    `);

    const resizedIcon = await sharp(srcPath)
      .resize(innerSize, innerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    await sharp(circleBg)
      .composite([{
        input: resizedIcon,
        left: padding,
        top: padding,
      }])
      .png()
      .toFile(path.join(IMAGES_DIR, `icon-${size}.png`));

    console.log(`✅ icon-${size}.png (any) — con contorno blanco`);

    // ─── Icon "maskable": fondo naranja sólido + safe zone ──────
    // Maskable icons necesitan 10% safe zone en cada lado = 80% del espacio para el icono
    const maskPadding = Math.round(size * 0.15); // 15% padding (dentro de safe zone)
    const maskInnerSize = size - maskPadding * 2;

    const maskBg = Buffer.from(`
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${size}" height="${size}" fill="${THEME_COLOR}"/>
      </svg>
    `);

    const maskIcon = await sharp(srcPath)
      .resize(maskInnerSize, maskInnerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    await sharp(maskBg)
      .composite([{
        input: maskIcon,
        left: maskPadding,
        top: maskPadding,
      }])
      .png()
      .toFile(path.join(IMAGES_DIR, `icon-${size}-maskable.png`));

    console.log(`✅ icon-${size}-maskable.png — fondo naranja con safe zone`);
  }

  console.log('\n🎉 Iconos generados. Recuerda actualizar manifest.json');
}

generateIcons().catch(console.error);

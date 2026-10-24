import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

// Run from the project root: npm run brand:assets.
// The SVG masters are hand-drawn paths. All PNG/ICO exports derive from them.
const mark = await readFile("public/brand/voyroo-mark.svg", "utf8");
const logo = await readFile("public/brand/voyroo-logo.svg", "utf8");
for (const [path, size] of [["public/icon-192.png", 192], ["public/icon-512.png", 512], ["public/apple-touch-icon.png", 180]]) {
  await sharp(Buffer.from(mark)).resize(size, size).png().toFile(path);
}
await sharp(Buffer.from(mark.replace('rx="18"', 'rx="0"'))).resize(512, 512).png().toFile("public/icon-maskable-512.png");
await sharp(Buffer.from(mark)).resize(1024, 1024).png().toFile("public/brand/voyroo-mark.png");
await sharp(Buffer.from(logo)).resize(1200).png().toFile("public/brand/voyroo-logo.png");
const lightLogo = logo.replaceAll('fill="#192F4D"', 'fill="#FFFFFF"').replace('<rect width="64" height="64" rx="18" fill="#FFFFFF"', '<rect width="64" height="64" rx="18" fill="#192F4D"');
await writeFile("public/brand/voyroo-logo-light.svg", lightLogo);
const logoContent = lightLogo.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const social = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#192F4D"/><circle cx="1080" cy="70" r="210" fill="#234260"/><path d="M800 630C880 450 1120 490 1200 340" fill="none" stroke="#91E2C3" stroke-width="4"/><circle cx="1080" cy="445" r="14" fill="#FFB66F"/><g transform="translate(100 150) scale(1.8)">${logoContent}</g><text x="108" y="400" font-family="Arial, sans-serif" font-size="42" fill="#91E2C3">A little further, together.</text><text x="108" y="468" font-family="Arial, sans-serif" font-size="25" fill="#FFFFFF">Good trips start with a conversation.</text></svg>`;
await sharp(Buffer.from(social)).png().toFile("public/brand/voyroo-social.png");

// ICO files can contain PNG payloads; package sizes for small and high-DPI tabs.
const sizes = [16, 32, 48, 64, 256];
const images = [];
for (const size of sizes) images.push(await sharp(Buffer.from(mark)).resize(size, size).png().toBuffer());
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (const [i, size] of sizes.entries()) {
  const entry = 6 + i * 16;
  header[entry] = header[entry + 1] = size === 256 ? 0 : size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[i].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += images[i].length;
}
await writeFile("src/app/favicon.ico", Buffer.concat([header, ...images]));
console.log("Voyroo logo, app icons, favicon and social card exported.");

import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const source = "public/logo-icon.png";
const markOutput = "public/loom-logo-mark.png";
const appIconOutput = "public/loom-app-icon.png";
const faviconOutput = "public/loom-favicon.png";

const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let left = info.width;
let top = info.height;
let right = 0;
let bottom = 0;

for (let y = 0; y < info.height; y += 1) {
  for (let x = 0; x < info.width; x += 1) {
    if (data[(y * info.width + x) * 4 + 3] > 8) {
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
}

const width = right - left + 1;
const height = bottom - top + 1;
const cropped = sharp(source).extract({ left, top, width, height });
const mark = await cropped
  .resize({ width: 512, height: 300, fit: "contain" })
  .png({ compressionLevel: 9 })
  .toBuffer();

const roundedTile = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect x="4" y="4" width="1016" height="1016" rx="224" fill="#0F2918" stroke="#26382B" stroke-width="8"/></svg>',
);
const appMark = await sharp(source)
  .extract({ left, top, width, height })
  .resize({ width: 820, height: 481, fit: "contain" })
  .png()
  .toBuffer();

await mkdir("public", { recursive: true });
await sharp({
  create: { width: 512, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([{ input: mark }])
  .png({ compressionLevel: 9 })
  .toFile(markOutput);
await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([{ input: roundedTile }, { input: appMark, gravity: "centre" }])
  .png({ compressionLevel: 9 })
  .toFile(appIconOutput);
await sharp(appIconOutput).resize(64, 64).png({ compressionLevel: 9 }).toFile(faviconOutput);

console.log(`Generated ${markOutput}, ${appIconOutput}, and ${faviconOutput} from ${source}.`);

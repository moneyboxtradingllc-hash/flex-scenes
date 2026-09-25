import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "tests", "fixtures", "development-only", "reel-playback-qa-5s.mp4");
const ffmpeg = process.env.FLEX_SCENES_FFMPEG ?? "C:\\Program Files\\Wondershare\\Wondershare UniConverter for Windows\\ffmpeg.exe";
const width = 360;
const height = 640;
const frameRate = 30;

await mkdir(path.dirname(output), { recursive: true });
const rowStride = Math.ceil(width * 3 / 4) * 4;
const bitmap = Buffer.alloc(54 + rowStride * height);
bitmap.write("BM", 0);
bitmap.writeUInt32LE(bitmap.length, 2);
bitmap.writeUInt32LE(54, 10);
bitmap.writeUInt32LE(40, 14);
bitmap.writeInt32LE(width, 18);
bitmap.writeInt32LE(height, 22);
bitmap.writeUInt16LE(1, 26);
bitmap.writeUInt16LE(24, 28);
bitmap.writeUInt32LE(rowStride * height, 34);

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const vignette = Math.max(0, 1 - Math.hypot((x - width / 2) / (width * 0.72), (y - height / 2) / (height * 0.72)));
    let red = 6 + Math.round(9 * (y / height) + 5 * vignette);
    let green = 8 + Math.round(5 * vignette);
    let blue = 17 + Math.round(15 * (1 - y / height) + 14 * vignette);
    const ellipse = ((x - width / 2) / 78) ** 2 + ((y - height / 2) / 138) ** 2;
    if (ellipse < 1) {
      const blend = Math.max(0, 1 - ellipse * 0.35);
      red = Math.round(red * (1 - blend) + 255 * blend);
      green = Math.round(green * (1 - blend) + 63 * blend);
      blue = Math.round(blue * (1 - blend) + 160 * blend);
    }
    const orb = ((x - width * 0.72) / 22) ** 2 + ((y - height * 0.35) / 22) ** 2;
    if (orb < 1) {
      const blend = (1 - orb) * 0.9;
      red = Math.round(red * (1 - blend) + 74 * blend);
      green = Math.round(green * (1 - blend) + 214 * blend);
      blue = Math.round(blue * (1 - blend) + 255 * blend);
    }
    const index = 54 + (height - 1 - y) * rowStride + x * 3;
    bitmap[index] = blue;
    bitmap[index + 1] = green;
    bitmap[index + 2] = red;
  }
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), "flex-scenes-reel-qa-"));
const stillPath = path.join(tempDir, "reel-qa-frame.bmp");
await writeFile(stillPath, bitmap);
try {
  await new Promise((resolve, reject) => {
    const encoder = spawn(ffmpeg, [
      "-y", "-loop", "1", "-framerate", String(frameRate), "-i", stillPath,
      "-t", "5", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "27",
      "-profile:v", "baseline", "-level", "3.0", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-f", "mp4", output,
    ], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    encoder.stderr.setEncoding("utf8");
    encoder.stderr.on("data", (chunk) => { stderr += chunk; });
    encoder.on("error", reject);
    encoder.on("close", (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg exited ${code}: ${stderr}`)));
  });
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
console.log(`Created ${output} (${width}x${height}, 5 seconds at ${frameRate} fps, silent H.264).`);

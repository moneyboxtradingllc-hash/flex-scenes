import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fixturePath = path.join(process.cwd(), "tests", "fixtures", "development-only", "reel-playback-qa-5s.mp4");
const localQaEnabled = process.env.FLEX_SCENES_LOCAL_QA === "1";

export async function GET(request: Request) {
  if (!localQaEnabled) return new Response(null, { status: 404 });

  const fileStat = await stat(fixturePath);
  const file = await readFile(fixturePath);
  const range = request.headers.get("range");
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "video/mp4",
  });

  if (!range) {
    headers.set("Content-Length", String(fileStat.size));
    return new Response(new Uint8Array(file), { headers });
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416 });
  const start = match[1] ? Number(match[1]) : Math.max(0, fileStat.size - Number(match[2]));
  const end = match[2] && match[1] ? Math.min(fileStat.size - 1, Number(match[2])) : fileStat.size - 1;
  if (start > end || start >= fileStat.size) return new Response(null, { status: 416 });

  const chunk = file.subarray(start, end + 1);
  headers.set("Content-Length", String(chunk.length));
  headers.set("Content-Range", `bytes ${start}-${end}/${fileStat.size}`);
  return new Response(new Uint8Array(chunk), { status: 206, headers });
}

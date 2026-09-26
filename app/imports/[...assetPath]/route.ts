import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { repository } from "@/lib/repository";

const publicRoot = path.join(process.cwd(), "public");
const importRoot = path.resolve(publicRoot, "imports");
const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

async function serve(request: Request, pathPromise: Promise<{ assetPath: string[] }>, headOnly = false) {
  const { assetPath } = await pathPromise;
  const relative = assetPath.join("/");
  const publicUrl = `/imports/${relative}`;
  const asset = repository.media().find((item) => item.url === publicUrl);
  if (!asset) return notFound();
  const diskPath = path.resolve(importRoot, relative);
  if (!diskPath.startsWith(`${importRoot}${path.sep}`)) return notFound();
  let size: number;
  try { size = fs.statSync(diskPath).size; } catch { return notFound(); }
  const requestedMime = (() => { try { return JSON.parse(asset.settingsJson).mime; } catch { return ""; } })();
  const extension = path.extname(diskPath).toLowerCase();
  const fallbackMime: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm" };
  const contentType = typeof requestedMime === "string" && /^(image|video)\//.test(requestedMime) ? requestedMime : fallbackMime[extension] ?? (asset.type === "video" ? "video/mp4" : "application/octet-stream");
  const headers = new Headers({ "Content-Type": contentType, "Accept-Ranges": "bytes", "Cache-Control": "private, no-store", "Content-Disposition": "inline" });
  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match) return new Response(null, { status: 416, headers: { ...Object.fromEntries(headers), "Content-Range": `bytes */${size}` } });
    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2] || 0));
    const end = match[2] && match[1] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { ...Object.fromEntries(headers), "Content-Range": `bytes */${size}` } });
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    const body = headOnly ? null : Readable.toWeb(fs.createReadStream(diskPath, { start, end })) as ReadableStream<Uint8Array>;
    return new Response(body, { status: 206, headers });
  }
  headers.set("Content-Length", String(size));
  const body = headOnly ? null : Readable.toWeb(fs.createReadStream(diskPath)) as ReadableStream<Uint8Array>;
  return new Response(body, { status: 200, headers });
}

export async function GET(request: Request, context: { params: Promise<{ assetPath: string[] }> }) { return serve(request, context.params); }
export async function HEAD(request: Request, context: { params: Promise<{ assetPath: string[] }> }) { return serve(request, context.params, true); }

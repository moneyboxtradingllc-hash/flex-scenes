import fs from "node:fs";
import path from "node:path";

export interface MediaStore { writeMockVisual(id: string, title: string, accent: string, label: string): string; saveUpload(id: string, filename: string, content: Buffer): string; removeUpload(url:string):void; }
const publicRoot = path.join(process.cwd(), "public");
const svg = (title: string, accent: string, label: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#11131a"/><stop offset="1" stop-color="${accent}"/></linearGradient></defs><rect width="900" height="1100" fill="url(#g)"/><circle cx="690" cy="205" r="190" fill="#ffffff" opacity=".08"/><circle cx="215" cy="840" r="260" fill="#000" opacity=".22"/><path d="M0 820 C250 660 560 1000 900 720 V1100H0Z" fill="#050609" opacity=".48"/><text x="64" y="82" fill="#fff" font-family="Arial,sans-serif" font-size="26" letter-spacing="6" opacity=".7">FLEX SCENES</text><text x="64" y="880" fill="#fff" font-family="Arial,sans-serif" font-size="68" font-weight="700">${title}</text><text x="68" y="930" fill="#f1d6ff" font-family="Arial,sans-serif" font-size="28">${label}</text><rect x="64" y="980" width="160" height="5" rx="2" fill="#fff" opacity=".75"/></svg>`;
export class LocalMediaStore implements MediaStore {
  private write(relative: string, title: string, accent: string, label: string) { const file = path.join(publicRoot, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); if (!fs.existsSync(file)) fs.writeFileSync(file, svg(title, accent, label)); return `/${relative.replaceAll("\\", "/")}`; }
  writeMockVisual(id: string, title: string, accent: string, label: string) { return this.write(`generated/${id}.svg`, title, accent, label); }
  saveUpload(id:string,filename:string,content:Buffer) { const safe=filename.replace(/[^a-zA-Z0-9._-]/g,"-").slice(-80)||"asset"; const relative=`imports/${id}-${safe}`; const file=path.join(publicRoot,relative); fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,content); return `/${relative}`; }
  removeUpload(url:string) { if(!url.startsWith("/imports/"))return; const file=path.resolve(publicRoot,url.slice(1)); if(file.startsWith(`${path.resolve(publicRoot,path.join("imports"))}${path.sep}`))fs.rmSync(file,{force:true}); }
}
export const localMediaStore = new LocalMediaStore();

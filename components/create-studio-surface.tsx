"use client";

import { useEffect, useMemo, useState } from "react";
import type { AppSnapshot, GenerationInput, GenerationJob, MediaAsset } from "@/lib/domain";

const asJson = <T,>(response: Response) => response.json() as Promise<T>;
const terminal = new Set(["completed", "failed", "cancelled"]);
type CreateContext = { parent?: MediaAsset; conversationId?: string; characterId?: string; mode?: "image" | "video" };

function ratioShape(ratio: string) {
  if (ratio === "9:16") return "h-7 w-4";
  if (ratio === "16:9") return "h-4 w-8";
  if (ratio === "3:4") return "h-6 w-5";
  if (ratio === "4:3") return "h-5 w-7";
  return "h-5 w-5";
}
function stageFor(status: GenerationJob["status"]) {
  const stages = ["Preparing", "Queued", "Generating", "Finalizing", "Saving"];
  return { stages, active: status === "queued" ? 1 : status === "generating" ? 2 : status === "finalizing" ? 3 : status === "completed" ? 4 : 0 };
}

export function PremiumCreateStudio({ data, context, onComplete }: { data: AppSnapshot; context: CreateContext; onComplete: () => void }) {
  const [mode, setMode] = useState<"image" | "video">(context.mode ?? "image");
  const [characterId, setCharacterId] = useState(context.characterId ?? data.characters[0]?.id);
  const [prompt, setPrompt] = useState(context.parent ? `Remix: ${context.parent.prompt}` : "");
  const [ratio, setRatio] = useState("4:5");
  const [duration, setDuration] = useState(5);
  const [refs, setRefs] = useState<string[]>(context.parent ? [context.parent.id] : []);
  const [useDefaults, setUseDefaults] = useState(true);
  const [advanced, setAdvanced] = useState(false);
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [uploading, setUploading] = useState(false);
  const [localAssets, setLocalAssets] = useState<MediaAsset[]>([]);
  const capabilities = data.capabilities.find((item) => item.mode === mode);
  const character = data.characters.find((item) => item.id === characterId);
  const canonicalIds = useMemo(() => data.characterReferences.filter((item) => item.characterId === characterId && item.canonical && item.active).map((item) => item.mediaId), [data.characterReferences, characterId]);
  const canonical = new Set(canonicalIds);
  const defaultReferenceIds = canonicalIds.slice(0, 3);
  const effectiveRefs = useDefaults ? Array.from(new Set([...refs, ...defaultReferenceIds])) : refs;
  const candidates = useMemo(() => {
    const source = [...localAssets, ...data.media];
    return source.filter((asset, index, list) => list.findIndex((other) => other.id === asset.id) === index && (asset.characterId === characterId || asset.isReference || asset.favorite || canonicalIds.includes(asset.id)));
  }, [canonicalIds, characterId, data.media, localAssets]);
  const selected = effectiveRefs.map((id) => candidates.find((asset) => asset.id === id) ?? data.media.find((asset) => asset.id === id)).filter(Boolean) as MediaAsset[];

  useEffect(() => {
    const timer = setTimeout(() => fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "draft-save", draft: { id: "current", characterId, mode, payloadJson: JSON.stringify({ prompt, ratio, duration, referenceAssetIds: refs, useDefaults }), updatedAt: new Date().toISOString() } }) }).catch(() => undefined), 350);
    return () => clearTimeout(timer);
  }, [characterId, mode, prompt, ratio, duration, refs, useDefaults]);
  useEffect(() => {
    if (!job || terminal.has(job.status)) return;
    const timer = setInterval(async () => {
      const next = await asJson<GenerationJob>(await fetch(`/api/jobs/${job.id}`, { cache: "no-store" }));
      setJob(next);
      if (next.status === "completed") setTimeout(onComplete, 450);
    }, 500);
    return () => clearInterval(timer);
  }, [job, onComplete]);

  const toggle = (id: string) => setRefs((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const chooseCharacter = (id: string) => { setCharacterId(id); if (!context.parent) setRefs([]); };
  const moveReference = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= refs.length) return;
    setRefs((current) => { const visible = useDefaults ? Array.from(new Set([...current, ...canonicalIds])) : current; const next = [...visible]; [next[index], next[target]] = [next[target], next[index]]; return next; });
    if (useDefaults) setUseDefaults(false);
  };
  const upload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData(); form.set("file", file); form.set("characterId", characterId ?? "");
      const asset = await asJson<MediaAsset>(await fetch("/api/media/upload", { method: "POST", body: form }));
      setLocalAssets((current) => [asset, ...current]); setRefs((current) => [...current, asset.id]);
    } finally { setUploading(false); }
  };
  const setDefaults = (enabled: boolean) => { setUseDefaults(enabled); if (!enabled) setRefs((current) => current.filter((id) => !canonical.has(id) || id === context.parent?.id)); };
  const generate = async () => {
    if (!capabilities || !prompt.trim()) return;
    const input: GenerationInput = { characterId, mode, prompt, aspectRatio: ratio, preset: mode === "image" ? "Hero" : `${duration} seconds`, count: mode === "image" ? 1 : undefined, duration: mode === "video" ? duration : undefined, simulation: "success", referenceAssetIds: effectiveRefs, parentMediaId: context.parent?.id ?? null, conversationId: context.conversationId ?? null };
    setJob(await asJson<GenerationJob>(await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })));
  };
  const jobStages = job ? stageFor(job.status) : null;

  return <div className="mx-auto max-w-[920px] pb-10">
    <header className="mb-6 flex items-end justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[.2em] text-fuchsia-300">Create</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Direct a new scene</h1><p className="mt-1 text-sm text-zinc-500">Your draft is saved quietly as you work.</p></div><span className="hidden rounded-full bg-white/[.05] px-3 py-1 text-xs text-zinc-400 sm:block">Mock studio · $0.00</span></header>
    <section className="overflow-hidden rounded-[30px] border border-white/[.07] bg-[#12151b] p-3 shadow-2xl shadow-black/25 sm:p-5">
      <div className="grid grid-cols-2 rounded-2xl bg-black/30 p-1">{(["image", "video"] as const).map((item) => <button key={item} onClick={() => setMode(item)} className={`rounded-xl px-3 py-3 text-sm font-bold transition ${mode === item ? "bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white shadow-lg shadow-fuchsia-950/40" : "text-zinc-400 hover:text-white"}`}>{item === "image" ? "Image · Seedream 5" : "Video · Seedance 2.5"}</button>)}</div>
      <div className="mt-5 flex items-center gap-3 rounded-2xl bg-white/[.045] p-3"><img src={character?.portraitUrl} alt="" className="h-12 w-12 rounded-full object-cover ring-2 ring-fuchsia-400/60" /><label className="min-w-0 flex-1"><span className="block text-[10px] font-bold uppercase tracking-[.16em] text-zinc-500">Character</span><select value={characterId} onChange={(event) => chooseCharacter(event.target.value)} className="mt-1 w-full bg-transparent text-sm font-semibold outline-none">{data.characters.map((item) => <option key={item.id} value={item.id}>{item.name} · Change character</option>)}</select></label><span className="text-xs text-zinc-500">Siray</span></div>
      {context.parent && <div className="mt-4 flex items-center gap-2 rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/10 p-2 text-xs text-fuchsia-100"><img src={context.parent.posterUrl ?? context.parent.url} alt="" className="h-9 w-9 rounded-lg object-cover" />Source image attached for {mode === "video" ? "animation" : "remix"}</div>}
      <label className="mt-5 block"><span className="text-sm font-semibold">Describe the scene</span><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Light, action, camera, mood…" rows={5} className="mt-2 w-full resize-none rounded-2xl border border-white/[.08] bg-black/20 p-4 text-base leading-relaxed outline-none transition focus:border-fuchsia-400/70" /></label>
      <div className="mt-5"><div className="flex items-center justify-between gap-3"><b className="text-sm">References</b><label className="cursor-pointer rounded-full bg-white/[.08] px-3 py-1.5 text-xs font-medium hover:bg-white/[.13]">{uploading ? "Importing…" : "Add media"}<input aria-label="Import local image or video" type="file" accept="image/*,video/*" className="hidden" disabled={uploading} onChange={(event) => event.target.files?.[0] && upload(event.target.files[0])} /></label></div><div className="mt-2 flex items-center justify-between gap-3 text-xs text-zinc-500"><span>{useDefaults ? `Using ${defaultReferenceIds.length} default character references${canonicalIds.length > defaultReferenceIds.length ? ` · ${canonicalIds.length - defaultReferenceIds.length} more available` : ""}` : "Character defaults excluded"}</span><button onClick={() => setDefaults(!useDefaults)} className="text-fuchsia-300 hover:text-fuchsia-100">{useDefaults ? "Review / exclude" : "Include defaults"}</button></div><div className="mt-3 flex gap-2 overflow-x-auto pb-1">{candidates.slice(0, 18).map((asset) => <button key={asset.id} type="button" onClick={() => toggle(asset.id)} className={`relative min-w-20 overflow-hidden rounded-xl border-2 transition ${effectiveRefs.includes(asset.id) ? "border-fuchsia-400 shadow-lg shadow-fuchsia-950/30" : "border-transparent opacity-75 hover:opacity-100"}`}><img src={asset.posterUrl ?? asset.url} alt={asset.title} className="h-20 w-20 object-cover" /><span className="absolute inset-x-0 bottom-0 bg-black/65 py-1 text-[9px]">{canonical.has(asset.id) ? "Face" : asset.type === "video" ? "Motion" : asset.favorite ? "Favorite" : "Scene"}</span></button>)}{!candidates.length && <p className="py-5 text-sm text-zinc-500">Choose a character reference, library asset, or import local media.</p>}</div>{!!selected.length && <div className="mt-3 rounded-2xl bg-black/20 p-2"><p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[.14em] text-zinc-500">Selected order · {selected.length}</p><div className="flex gap-2 overflow-x-auto">{selected.map((asset, index) => <div key={asset.id} className="relative min-w-16"><img src={asset.posterUrl ?? asset.url} alt={asset.title} className="h-14 w-14 rounded-lg object-cover" /><div className="mt-1 flex justify-between text-[10px]"><button aria-label={`Move ${asset.title} earlier`} disabled={index === 0} onClick={() => moveReference(index, -1)} className="disabled:opacity-25">←</button><button aria-label={`Move ${asset.title} later`} disabled={index === selected.length - 1} onClick={() => moveReference(index, 1)} className="disabled:opacity-25">→</button></div></div>)}</div></div>}</div>
      <div className="mt-5"><p className="mb-2 text-sm font-semibold">Frame</p><div className="flex gap-2 overflow-x-auto">{capabilities?.aspectRatios.map((item) => <button key={item} onClick={() => setRatio(item)} className={`grid min-w-16 place-items-center rounded-xl border px-3 py-2 text-xs transition ${ratio === item ? "border-fuchsia-400 bg-fuchsia-500/10 text-white" : "border-white/10 text-zinc-400"}`}><span className={`mb-1 border border-current ${ratioShape(item)}`} />{item}</button>)}</div></div>
      {mode === "video" && <div className="mt-5 rounded-2xl bg-white/[.04] p-3"><div className="flex items-center justify-between"><b className="text-sm">Motion</b><span className="text-xs text-zinc-500">Source image, motion, and video references are supported in this studio.</span></div><label className="mt-3 flex items-center gap-3 text-sm">Duration<select value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="rounded-lg bg-black/30 px-2 py-1.5 text-sm">{capabilities?.durations.map((item) => <option key={item} value={item}>{item} seconds</option>)}</select></label></div>}
      <button onClick={() => setAdvanced((value) => !value)} className="mt-5 text-sm font-medium text-zinc-400 hover:text-white">Advanced {advanced ? "−" : "+"}</button>{advanced && <div className="mt-3 rounded-2xl border border-white/[.06] bg-black/25 p-4 text-sm text-zinc-300"><div className="flex justify-between gap-4"><span>Provider route</span><b className="text-right text-xs text-zinc-400">{capabilities?.label ?? "Not connected"}</b></div><div className="mt-3 flex justify-between gap-4"><span>{mode === "image" ? "Resolution" : "Video settings"}</span><b className="text-right text-xs text-zinc-400">Capability-driven · mock provider</b></div><p className="mt-3 text-xs text-zinc-500">Provider details, live preview, and cost controls remain available without cluttering the scene composer.</p></div>}
      {job ? <div className="mt-5 rounded-2xl bg-black/25 p-4"><div className="flex items-center justify-between"><b className="capitalize">{job.status}</b><span className="text-xs text-zinc-500">You can keep working while this runs.</span></div><div className="mt-4 grid grid-cols-5 gap-1">{jobStages?.stages.map((stage, index) => <div key={stage}><div className={`h-1 rounded-full ${index <= (jobStages?.active ?? 0) ? "bg-fuchsia-400" : "bg-white/10"}`} /><span className="mt-2 block text-[9px] leading-tight text-zinc-500">{stage}</span></div>)}</div></div> : <button onClick={generate} disabled={!prompt.trim()} className="mt-6 w-full rounded-2xl bg-gradient-to-r from-fuchsia-500 to-pink-500 py-4 font-bold text-white shadow-xl shadow-fuchsia-950/40 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">Generate {mode === "image" ? "Image" : "Video"}<span className="ml-2 text-xs font-medium text-fuchsia-100">Estimated cost: $0.00 · Mock</span></button>}
    </section>
  </div>;
}

"use client";

import { useEffect, useState } from "react";
import type { AppSnapshot, GenerationJob, MediaAsset } from "@/lib/domain";

const terminal = (status: GenerationJob["status"]) => ["completed", "failed", "cancelled"].includes(status);
const stages = ["Preparing", "Publishing References", "Queued", "Generating", "Finalizing", "Saving to Library"];
function stageIndex(job: GenerationJob, refs: number) {
  if (job.status === "queued") return refs ? 2 : 1;
  if (job.status === "generating") return 3;
  if (job.status === "finalizing") return 4;
  if (job.status === "completed") return 5;
  return 0;
}
const age = (value: string) => {
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1000));
  return seconds < 60 ? `${seconds}s elapsed` : `${Math.floor(seconds / 60)}m ${seconds % 60}s elapsed`;
};

export function GenerationProgress({ data, job, connectionError, refresh, openJob, browse, jobs, edit, conversation, createResult, select }: {
  data: AppSnapshot; job?: GenerationJob; connectionError: boolean; refresh: () => Promise<void>;
  openJob: (job: GenerationJob) => void; browse: () => void; jobs: () => void; edit: (job: GenerationJob) => void; conversation: (id: string) => void;
  createResult: (media: MediaAsset, mode: "image" | "video") => void; select: (media: MediaAsset) => void;
}) {
  const [busy, setBusy] = useState(false);
  if (!job) return <section className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-[#12151b] p-8 text-center"><h1 className="text-2xl font-bold">We couldn’t find that generation</h1><p className="mt-2 text-sm text-zinc-400">Check Activity for the latest saved job status.</p><button onClick={() => void refresh()} className="mt-5 rounded-xl bg-fuchsia-500 px-4 py-2 font-semibold">Check Status</button></section>;
  const character = data.characters.find((item) => item.id === job.characterId);
  const refs = data.jobReferences.filter((ref) => ref.jobId === job.id).sort((a, b) => a.position - b.position).map((ref) => ({ ...ref, asset: data.media.find((asset) => asset.id === ref.mediaId) })).filter((ref) => ref.asset) as (typeof data.jobReferences[number] & {asset: MediaAsset})[];
  const output = data.media.find((asset) => asset.id === job.mediaId);
  const latestEvent = data.events.filter((event) => event.jobId === job.id).at(-1);
  const retryable = job.status === "failed" && !job.error?.toLowerCase().includes("cancel");
  const act = async (action: "cancel" | "retry") => {
    if (action === "cancel" && !window.confirm("Cancel this generation?")) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/jobs/${job.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const next = await response.json() as GenerationJob;
      await refresh();
      if (action === "retry" && next?.id) openJob(next);
    } finally { setBusy(false); }
  };
  const index = stageIndex(job, refs.length);
  const statusText = job.status === "failed" ? "This generation couldn’t be completed." : job.status === "cancelled" ? "Generation cancelled." : job.status === "completed" ? "Your scene is ready." : job.status === "queued" ? "Your scene is safely in the queue." : "Your scene is coming together.";
  const failureReason = job.error?.toLowerCase() ?? "";
  const safeFailure = failureReason.includes("timeout") || failureReason.includes("timed out") ? "The service took too long to finish this request." : failureReason.includes("authoriz") ? "This request could not be authorized." : failureReason.includes("unsupported") || failureReason.includes("invalid") ? "This request needs an adjustment before it can run." : "The generation service returned an error.";
  const modelLabel = data.capabilities.find((item) => item.mode === job.mode)?.label ?? (job.mode === "image" ? "Image model" : "Video model");
  return <div className="mx-auto max-w-[1180px] pb-10">
    <div className="mb-5 flex items-center justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-fuchsia-300">{output ? "Result" : "Generation"}</p><h1 className="mt-1 text-2xl font-bold sm:text-3xl">{output ? "Your scene is ready" : job.status === "failed" ? "Let’s get this back on track" : "Creating your scene"}</h1></div><span className="rounded-full bg-white/[.06] px-3 py-1.5 text-xs text-zinc-400">{job.mode === "image" ? "Image" : "Video"} · Mock</span></div>
    {!output ? <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,.85fr)]">
      <section className="relative grid min-h-[340px] place-items-center overflow-hidden rounded-[28px] border border-white/[.07] bg-[radial-gradient(ellipse_at_50%_40%,rgba(192,38,211,.18),transparent_60%),#101116] p-7 sm:min-h-[520px]">
        {refs[0]?.asset ? <img src={refs[0].asset.posterUrl ?? refs[0].asset.url} alt="Generation source preview" className="absolute inset-0 h-full w-full object-contain opacity-55" /> : null}
        <div className="absolute inset-0 bg-gradient-to-t from-[#090a0f] via-[#090a0f]/45 to-[#090a0f]/20" />
        <div className="relative z-10 max-w-md text-center"><img src={character?.portraitUrl} alt="" className="mx-auto h-16 w-16 rounded-full object-cover ring-2 ring-fuchsia-300/70" /><p className="mt-4 text-sm font-semibold">{character?.name ?? "Your character"}</p><p className="mt-1 text-xs uppercase tracking-[.16em] text-fuchsia-200">{job.mode === "image" ? "Image scene" : "Video scene"}</p><p className="mt-5 line-clamp-3 text-lg leading-relaxed text-zinc-100">{job.prompt}</p><p className="mt-5 text-xs text-zinc-500">{modelLabel}</p></div>
      </section>
      <section className="rounded-[28px] border border-white/[.07] bg-[#12151b] p-5 sm:p-7">
        <div role="status" aria-live="polite" className="flex items-start gap-3"><span className={`mt-1 h-2.5 w-2.5 rounded-full ${job.status === "failed" ? "bg-rose-400" : job.status === "completed" ? "bg-emerald-400" : "animate-pulse bg-fuchsia-400 motion-reduce:animate-none"}`} /><div><h2 className="font-semibold">{statusText}</h2><p className="mt-1 text-sm text-zinc-400">{age(job.createdAt)} · {job.status === "failed" ? "You can retry or edit this request." : latestEvent?.message ?? "Waiting for status update"}</p></div></div>
        {connectionError && <div role="alert" className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[.07] p-3 text-sm text-amber-100">Connection interrupted. Your saved job is still here; check its status when you’re ready.<button onClick={() => void (async () => { await fetch(`/api/jobs/${job.id}`, {cache:"no-store"}); await refresh(); })()} className="ml-2 underline">Check Status</button></div>}
        {job.status === "failed" && <div className="mt-5 rounded-2xl bg-white/[.04] p-4"><p className="font-medium">{safeFailure}</p><p className="mt-1 text-xs text-zinc-400">{retryable ? "You can retry this request. No automatic duplicate was submitted." : "This job cannot be retried."}</p>{job.error && <details className="mt-3 text-xs text-zinc-500"><summary className="cursor-pointer">Technical details</summary><pre className="mt-2 whitespace-pre-wrap break-words">{job.error}</pre></details>}</div>}
        {!terminal(job.status) && <div className="mt-7 space-y-3">{stages.map((stage, i) => <div key={stage} className="flex items-center gap-3"><span className={`grid h-6 w-6 place-items-center rounded-full text-[10px] ${i < index ? "bg-fuchsia-500/20 text-fuchsia-200" : i === index ? "bg-fuchsia-500 text-white" : "border border-white/10 text-zinc-600"}`}>{i < index ? "✓" : i + 1}</span><span className={`text-sm ${i === index ? "font-semibold text-white" : "text-zinc-500"}`}>{stage}</span>{i === index && <span className="ml-auto text-xs text-fuchsia-200">In progress</span>}</div>)}</div>}
        {!!refs.length && <div className="mt-7"><p className="mb-2 text-[10px] font-bold uppercase tracking-[.15em] text-zinc-500">References · {refs.length}</p><div className="flex gap-2 overflow-x-auto">{refs.map((ref) => <div key={`${ref.mediaId}-${ref.position}`} className="relative shrink-0"><img src={ref.asset.posterUrl ?? ref.asset.url} alt={ref.asset.title} className="h-16 w-16 rounded-xl object-cover" loading="lazy" /><span className="absolute inset-x-0 bottom-0 rounded-b-xl bg-black/70 px-1 py-1 text-center text-[9px] capitalize">{ref.role}</span></div>)}</div></div>}
        <div className="mt-8 flex flex-wrap gap-2">{!terminal(job.status) && <button disabled={busy} onClick={() => void act("cancel")} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm hover:bg-white/[.06] disabled:opacity-50">Cancel Generation</button>}{retryable && <button disabled={busy} onClick={() => void act("retry")} className="rounded-xl bg-fuchsia-500 px-4 py-2.5 text-sm font-semibold disabled:opacity-50">Retry</button>}{job.status === "failed" && <button onClick={() => edit(job)} className="rounded-xl bg-white/[.08] px-4 py-2.5 text-sm">Edit Request</button>}{job.conversationId && <button onClick={() => conversation(job.conversationId!)} className="rounded-xl bg-white/[.08] px-4 py-2.5 text-sm">Back to Conversation</button>}<button onClick={browse} className="rounded-xl bg-white/[.08] px-4 py-2.5 text-sm">Continue Browsing</button><button onClick={jobs} className="rounded-xl bg-white/[.08] px-4 py-2.5 text-sm">View Job Center</button></div>
      </section>
    </div> : <GenerationResult data={data} job={job} media={output} favorite={async (id) => { await fetch("/api/actions", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({action:"favorite",mediaId:id}) }); await refresh(); }} reference={async (id) => { await fetch("/api/actions", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({action:"reference",mediaId:id}) }); await refresh(); }} addToCollection={async (collectionId) => { await fetch("/api/actions", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({action:"collection-add",collectionId,mediaId:output.id}) }); await refresh(); }} create={createResult} openDetails={select} conversation={conversation} />}
  </div>;
}

export function GenerationResult({ data, job, media, favorite, reference, addToCollection, create, openDetails, conversation }: {
  data: AppSnapshot; job: GenerationJob; media: MediaAsset; favorite: (id: string) => Promise<void>; reference: (id: string) => Promise<void>;
  addToCollection: (collectionId: string) => Promise<void>;
  create: (media: MediaAsset, mode: "image" | "video") => void; openDetails: (media: MediaAsset) => void; conversation: (id: string) => void;
}) {
  const character = data.characters.find((item) => item.id === media.characterId);
  const parent = media.parentId ? data.media.find((item) => item.id === media.parentId) : undefined;
  const playable = media.type === "video" && /\.(mp4|webm|ogg|mov)(\?|$)/i.test(media.url);
  const [loaded, setLoaded] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  const source = media.posterUrl ?? media.url;
  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
    <section className="relative grid min-h-[380px] place-items-center overflow-hidden rounded-[28px] border border-white/[.07] bg-black sm:min-h-[620px]">
      {!loaded && <div className="absolute inset-0 grid place-items-center text-sm text-zinc-500" role="status">Loading your {media.type}…</div>}
      {playable ? <video src={media.url} poster={media.posterUrl ?? undefined} autoPlay={!reducedMotion} muted playsInline controls preload="metadata" onLoadedData={() => setLoaded(true)} onError={() => setLoaded(true)} className="relative z-10 max-h-[78vh] max-w-full object-contain" aria-label={media.title} /> : <div className="relative z-10"><img src={source} alt={media.title} onLoad={() => setLoaded(true)} onError={() => setLoaded(true)} className="max-h-[78vh] max-w-full object-contain" />{media.type === "video" && <span className="absolute bottom-3 left-3 rounded-full bg-black/75 px-3 py-1 text-xs">Video preview · no playable file</span>}</div>}
    </section>
    <aside className="rounded-[28px] border border-white/[.07] bg-[#12151b] p-5 sm:p-6">
      <div className="flex items-center gap-3"><img src={character?.portraitUrl} alt="" className="h-12 w-12 rounded-full object-cover ring-2 ring-fuchsia-300/50" /><div className="min-w-0"><h2 className="truncate font-bold">{character?.name ?? "Scene"}</h2><p className="text-xs text-zinc-500">{new Date(media.createdAt).toLocaleString()}</p></div></div>
      <p className="mt-4 text-lg font-semibold">{media.title}</p><p className="mt-1 text-sm text-zinc-400">{media.caption}</p>
      {parent && <button onClick={() => openDetails(parent)} className="mt-4 flex w-full items-center gap-3 rounded-xl bg-white/[.05] p-2 text-left"><img src={parent.posterUrl ?? parent.url} alt="" className="h-12 w-12 rounded-lg object-cover" /><span className="text-xs text-zinc-300">{media.type === "video" ? "Animated from" : "Remix of"} {parent.title}</span></button>}
      {job.conversationId && <button onClick={() => conversation(job.conversationId!)} className="mt-3 w-full rounded-xl bg-white/[.05] px-3 py-2 text-left text-xs text-zinc-300">Created from conversation with {character?.name} · Back to Conversation</button>}
      <div className="mt-6 grid grid-cols-2 gap-2">{media.type === "image" ? <button onClick={() => create(media, "video")} className="col-span-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-500 px-4 py-3 font-bold">Animate</button> : <button onClick={() => create(media, "video")} className="col-span-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-500 px-4 py-3 font-bold">Remix Video</button>}<button onClick={() => void favorite(media.id)} className="rounded-xl bg-white/[.08] px-3 py-2.5 text-sm">{media.favorite ? "♥ Favorited" : "♡ Favorite"}</button><button onClick={() => void reference(media.id)} className="rounded-xl bg-white/[.08] px-3 py-2.5 text-sm">Use as Reference</button><button onClick={() => openDetails(media)} className="rounded-xl bg-white/[.08] px-3 py-2.5 text-sm">Open Details</button><a href={media.url} download className="rounded-xl bg-white/[.08] px-3 py-2.5 text-center text-sm">Export</a><button onClick={() => setCollectionOpen((value) => !value)} className="rounded-xl bg-white/[.08] px-3 py-2.5 text-sm">Add to Collection</button><button onClick={() => openDetails(media)} className="rounded-xl bg-white/[.08] px-3 py-2.5 text-sm">Notes</button></div>
      {collectionOpen && <div className="mt-2 rounded-xl border border-white/10 bg-black/25 p-2"><p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Choose a collection</p>{data.collections.length ? data.collections.map((collection) => <button key={collection.id} onClick={async () => { await addToCollection(collection.id); setCollectionOpen(false); }} className="block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-white/[.07]">{collection.name}<span className="float-right text-xs text-zinc-500">{collection.mediaIds.includes(media.id) ? "Added" : "Add"}</span></button>) : <p className="px-2 py-2 text-xs text-zinc-400">Create a collection in Library first.</p>}</div>}
      <div className="mt-5 flex items-center justify-between border-t border-white/[.07] pt-4 text-xs text-zinc-500"><span>Cost: $0.00 · Mock</span><span>{job.status === "completed" ? "Saved to Library" : "Saved"}</span></div>
    </aside>
  </div>;
}

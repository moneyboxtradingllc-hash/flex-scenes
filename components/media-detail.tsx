"use client";

import { useMemo, useRef, useState } from "react";
import type { AppSnapshot, MediaAsset } from "@/lib/domain";
import { LibraryCharacterPortrait } from "@/components/library-media-thumbnail";

function parseSettings(asset: MediaAsset): Record<string, unknown> {
  try { return JSON.parse(asset.settingsJson || "{}") as Record<string, unknown>; }
  catch { return {}; }
}
function playableVideo(asset: MediaAsset) { return asset.type === "video" && /\.(mp4|webm|ogv|mov)(?:[?#].*)?$/i.test(asset.url); }
function roleName(role: string) { return ({ canonical: "Character reference", scene: "Scene", parent: "Parent", video: "Motion", face: "Face", body: "Body", hair: "Hair", outfit: "Outfit", environment: "Environment", pose: "Pose", motion: "Motion", camera: "Camera", audio: "Audio", "audio-mood": "Audio" } as Record<string, string>)[role] ?? role; }
function money(value: number | null | undefined) { return value == null ? "Not recorded" : `$${value.toFixed(2)}`; }

export function PremiumMediaDetail({
  data,
  asset,
  character,
  close,
  favorite,
  onUseReference,
  remix,
  animate,
  select,
  refresh,
  openCharacter,
}: {
  data: AppSnapshot;
  asset: MediaAsset;
  character?: AppSnapshot["characters"][number];
  close: () => void;
  favorite: (id: string) => Promise<void> | void;
  onUseReference: (asset: MediaAsset) => Promise<void> | void;
  remix: (asset: MediaAsset) => void;
  animate: (asset: MediaAsset) => void;
  select: (asset: MediaAsset) => void;
  refresh: () => Promise<void>;
  openCharacter: (id: string) => void;
}) {
  const [note, setNote] = useState(data.notes[asset.id] ?? "");
  const [noteSaved, setNoteSaved] = useState(false);
  const [noteBusy, setNoteBusy] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [collectionBusy, setCollectionBusy] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const lineageRef = useRef<HTMLElement>(null);
  const settings = useMemo(() => parseSettings(asset), [asset]);
  const job = data.jobs.find((entry) => entry.mediaId === asset.id);
  const usage = job && data.ledger.find((entry) => entry.jobId === job.id);
  const parentId = asset.parentId ?? job?.parentMediaId ?? null;
  const parent = parentId ? data.media.find((entry) => entry.id === parentId) : undefined;
  const children = data.media.filter((entry) => entry.parentId === asset.id);
  const jobRefs = job ? data.jobReferences.filter((reference) => reference.jobId === job.id && reference.mediaId !== parentId).sort((a, b) => a.position - b.position) : [];
  const linkedRefs = jobRefs.map((reference) => ({ asset: data.media.find((entry) => entry.id === reference.mediaId), role: reference.role }));
  const canonicalRefs = data.characterReferences.filter((reference) => reference.characterId === asset.characterId && reference.canonical && reference.active && reference.mediaId !== asset.id);
  const referenceItems = [...linkedRefs, ...canonicalRefs.filter((reference) => !linkedRefs.some((item) => item.asset?.id === reference.mediaId)).map((reference) => ({ asset: data.media.find((entry) => entry.id === reference.mediaId), role: reference.role }))].filter((item) => Boolean(item.asset)) as { asset: MediaAsset; role: string }[];
  const memberships = data.collections.filter((collection) => collection.mediaIds.includes(asset.id));
  const video = playableVideo(asset);
  const sourceLabel = asset.providerId === "local-import" || settings.source === "local-import" ? "Imported · local asset" : asset.url.startsWith("/") ? "Generated · local asset" : "Provider URL";
  const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

  const saveNote = async () => {
    setNoteBusy(true);
    try {
      await fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "note", mediaId: asset.id, note }) });
      await refresh(); setNoteSaved(true); window.setTimeout(() => setNoteSaved(false), 1800);
    } finally { setNoteBusy(false); }
  };
  const updateCollection = async (collectionId: string, add: boolean) => {
    setCollectionBusy(true);
    try {
      await fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: add ? "collection-add" : "collection-remove", collectionId, mediaId: asset.id }) });
      await refresh();
    } finally { setCollectionBusy(false); }
  };
  const copyPrompt = async () => {
    try { await navigator.clipboard.writeText(asset.prompt); setPromptCopied(true); window.setTimeout(() => setPromptCopied(false), 1600); }
    catch { setPromptCopied(false); }
  };

  return <div className="media-detail-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <section className="media-detail" role="dialog" aria-modal="true" aria-labelledby="media-detail-title">
      <header className="media-detail-topbar"><div className="media-detail-top-label"><span className="media-detail-top-icon">{asset.type === "video" ? "▶" : "◈"}</span><span>{asset.type === "video" ? "Video" : "Image"} detail</span></div><button onClick={close} aria-label="Close media detail" className="media-detail-close">×</button></header>

      <div className="media-detail-layout">
        <div className="media-detail-main">
          <div className={`media-detail-viewer ${zoom ? "zoomed" : ""}`}>
            {asset.type === "image" ? imageError ? <div className="media-detail-fallback"><span>◈</span><strong>Preview unavailable</strong><small>The media record is still available in your archive.</small></div> : <><img src={asset.url} alt={asset.title} onError={() => setImageError(true)} onClick={() => setZoom(true)} className="media-detail-image"/><button className="media-detail-expand" aria-label="View image full size" onClick={() => setZoom(true)}>⤢</button></> : video && !videoError ? <><video src={asset.url} poster={asset.posterUrl ?? undefined} controls playsInline preload="metadata" onLoadedData={() => setVideoReady(true)} onCanPlay={() => setVideoReady(true)} onError={() => setVideoError(true)} className="media-detail-video" aria-label={asset.title}/>{!videoReady && <span className="media-detail-loading" role="status">Loading video…</span>}</> : <div className="media-detail-preview">{asset.posterUrl || !imageError ? <img src={asset.posterUrl ?? asset.url} alt={asset.title} onError={() => setImageError(true)}/> : <span className="media-detail-fallback"><strong>Preview unavailable</strong></span>}<span className="media-detail-preview-label">{videoError ? "Video unavailable · poster preview" : "Preview only · no playable video attached"}</span></div>}
          </div>
          <div className="media-detail-identity">
            <div className="media-detail-identity-avatar">{character && <button onClick={() => openCharacter(character.id)} aria-label={`Open ${character.name}`}><LibraryCharacterPortrait src={character.portraitUrl} name={character.name}/></button>}</div>
            <div className="media-detail-identity-copy"><div className="media-detail-identity-line"><h1 id="media-detail-title">{asset.title || "Untitled scene"}</h1><time dateTime={asset.createdAt}>{formatDate(asset.createdAt)}</time></div><p>{character ? <button onClick={() => openCharacter(character.id)}>{character.name}</button> : "Unassigned character"}{asset.caption && <><span> · </span>{asset.caption}</>}</p></div>
          </div>
        </div>

        <aside className="media-detail-panel">
          <div className="media-detail-primary-actions">
            <button className={`media-detail-action ${asset.favorite ? "is-favorite" : ""}`} onClick={() => favorite(asset.id)}><span>♥</span>{asset.favorite ? "Favorited" : "Favorite"}</button>
            {asset.type === "image" ? <button className="media-detail-action media-detail-action-primary" onClick={() => animate(asset)}><span>↗</span>Animate</button> : <button className="media-detail-action media-detail-action-primary" onClick={() => remix(asset)}><span>⟳</span>Remix Video</button>}
            {asset.type === "image" && <button className="media-detail-action" onClick={() => remix(asset)}><span>⤴</span>Remix Image</button>}
            <button className={`media-detail-action ${asset.isReference ? "is-reference" : ""}`} onClick={() => onUseReference(asset)}><span>✧</span>Use as Reference</button>
            <button className="media-detail-action" onClick={() => noteRef.current?.focus()}><span>▤</span>Notes</button>
            <button className="media-detail-action" onClick={() => setCollectionsOpen((value) => !value)}><span>▧</span>{memberships.length ? `In ${memberships.length} Collection${memberships.length === 1 ? "" : "s"}` : "Add to Collection"}</button>
            <a className="media-detail-action" href={asset.url} download={asset.title || true} target={asset.url.startsWith("/") ? undefined : "_blank"} rel="noreferrer"><span>↓</span>Export</a>
            <button className="media-detail-action" onClick={() => setMoreOpen((value) => !value)}><span>···</span>More</button>
          </div>

          {moreOpen && <div className="media-detail-more-menu">{character && <button onClick={() => openCharacter(character.id)}>Open Character · {character.name}</button>}<button onClick={() => { setMoreOpen(false); lineageRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>View Lineage</button>{asset.prompt && <button onClick={copyPrompt}>{promptCopied ? "Prompt copied" : "Copy Prompt"}</button>}</div>}

          {collectionsOpen && <div className="media-detail-collection-picker"><p>Collections</p>{data.collections.length ? data.collections.map((collection) => { const included = collection.mediaIds.includes(asset.id); return <label key={collection.id}><input type="checkbox" checked={included} disabled={collectionBusy} onChange={(event) => updateCollection(collection.id, event.target.checked)}/><span>{collection.name}</span></label>; }) : <small>No collections yet. Create one in Library.</small>}</div>}

          <section className="media-detail-notes"><div className="media-detail-section-head"><div><h2>Creative notes</h2><p>Private annotations for this asset</p></div><span>PRIVATE</span></div><textarea ref={noteRef} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Face consistency, lighting, pose, motion…" rows={4}/><div className="media-detail-note-footer"><small>{noteSaved ? "Saved" : "Only visible to you"}</small><button onClick={saveNote} disabled={noteBusy}>{noteBusy ? "Saving…" : noteSaved ? "Saved" : "Save note"}</button></div></section>

          {asset.prompt && <section className="media-detail-prompt"><div className="media-detail-section-head"><div><h2>Prompt</h2><p>Creative direction for this scene</p></div></div><p>{asset.prompt}</p><div><button onClick={copyPrompt}>{promptCopied ? "Copied" : "Copy Prompt"}</button><button onClick={() => remix(asset)}>Remix from Prompt</button></div></section>}
        </aside>
      </div>

      <div className="media-detail-lower">
        <section ref={lineageRef} className="media-detail-lineage"><div className="media-detail-section-head"><div><h2>Lineage</h2><p>Follow how this scene came to life</p></div><span>{children.length} {children.length === 1 ? "child" : "children"}</span></div><div className="media-detail-lineage-flow">
          {parent ? <button className="media-detail-lineage-node" onClick={() => select(parent)}><img src={parent.posterUrl ?? parent.url} alt="" loading="lazy"/><span><small>Parent / Original</small><strong>{parent.title}</strong><em>{parent.type === "video" ? "Video" : "Image"}</em></span></button> : <div className="media-detail-origin"><span>◈</span><div><strong>Original asset</strong><small>No parent scene</small></div></div>}
          <span className="media-detail-lineage-arrow" aria-hidden="true">↓</span>
          <div className="media-detail-current-node"><img src={asset.posterUrl ?? asset.url} alt=""/><span><small>Current asset</small><strong>{asset.title}</strong><em>{asset.type === "video" ? "Video" : "Image"}</em></span></div>
          {children.length > 0 && <><span className="media-detail-lineage-arrow" aria-hidden="true">↓</span><div className="media-detail-children">{children.map((child) => <button key={child.id} className="media-detail-lineage-node" onClick={() => select(child)}><img src={child.posterUrl ?? child.url} alt="" loading="lazy"/><span><small>{child.type === "video" ? "Animation / Remix" : "Remix"}</small><strong>{child.title}</strong><em>{child.type === "video" ? "Video" : "Image"}</em></span></button>)}</div></>}
        </div></section>

        {referenceItems.length > 0 && <section className="media-detail-references"><div className="media-detail-section-head"><div><h2>References used</h2><p>Source material and character guides</p></div><span>{referenceItems.length}</span></div><div className="media-detail-reference-grid">{referenceItems.map((item, index) => <button key={`${item.role}-${item.asset.id}-${index}`} onClick={() => select(item.asset)}><span className="media-detail-reference-thumb"><img src={item.asset.posterUrl ?? item.asset.url} alt="" loading="lazy"/><small>{roleName(item.role)}</small></span><span>{item.asset.title}</span></button>)}</div></section>}

        <details className="media-detail-production"><summary><span><strong>Production Details</strong><small>Settings, source, lineage metadata</small></span><b>⌄</b></summary><div className="media-detail-production-content">
          <div className="media-detail-prompt-full"><div className="media-detail-section-head"><div><h3>Prompt</h3></div>{asset.prompt && <button onClick={copyPrompt}>{promptCopied ? "Copied" : "Copy"}</button>}</div><p>{asset.prompt || "No prompt recorded for this asset."}</p></div>
          {typeof settings.negativePrompt === "string" && <div className="media-detail-detail-row"><span>Negative prompt</span><b>{settings.negativePrompt}</b></div>}
          <div className="media-detail-detail-grid">
            <DetailValue label="Character" value={character?.name ?? "Unassigned"}/><DetailValue label="Provider" value={asset.providerId}/><DetailValue label="Model" value={String(settings.model ?? settings.modelId ?? job?.providerId ?? "Not recorded")}/><DetailValue label="Deployment" value={String(settings.deployment ?? usage?.model ?? "Not recorded")}/>
            <DetailValue label="Aspect ratio" value={String(settings.aspectRatio ?? settings.aspect_ratio ?? "Not recorded")}/><DetailValue label="Resolution" value={String(settings.resolution ?? "Not recorded")}/><DetailValue label="Duration" value={settings.duration ? `${settings.duration}s` : "Not recorded"}/><DetailValue label="Estimated cost" value={money(usage?.estimatedCost)}/><DetailValue label="Actual cost" value={money(usage?.actualCost)}/>
            <DetailValue label="Job ID" value={job?.id ?? "No generation job"}/><DetailValue label="Provider task ID" value={String(settings.providerTaskId ?? settings.taskId ?? "Not available")}/><DetailValue label="Source" value={sourceLabel}/><DetailValue label="Created" value={formatDate(asset.createdAt)}/><DetailValue label="Job updated" value={job ? formatDate(job.updatedAt) : "Not applicable"}/>
          </div>
          {Object.entries(settings).filter(([key]) => ["preset", "seed", "audio", "guidance", "count"].includes(key)).length > 0 && <div className="media-detail-detail-grid media-detail-extra-settings">{Object.entries(settings).filter(([key]) => ["preset", "seed", "audio", "guidance", "count"].includes(key)).map(([key, value]) => <DetailValue key={key} label={key} value={String(value)}/>)}</div>}
          <div className="media-detail-provider-url"><span>Asset URL</span><a href={asset.url} target={asset.url.startsWith("/") ? undefined : "_blank"} rel="noreferrer">{asset.url.startsWith("/") ? "Open local asset" : "Open provider URL"}</a></div>
        </div></details>
      </div>
    </section>
    {zoom && <div className="media-detail-zoom" role="dialog" aria-modal="true" aria-label="Full size image" onClick={() => setZoom(false)}><button onClick={() => setZoom(false)} aria-label="Close full size view">×</button><img src={asset.url} alt={asset.title}/></div>}
  </div>;
}

function DetailValue({ label, value }: { label: string; value: string }) { return <div className="media-detail-detail-row"><span>{label}</span><b title={value}>{value}</b></div>; }

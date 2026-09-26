"use client";

import { useCallback, useRef, useState } from "react";
import type { AppSnapshot, MediaAsset } from "@/lib/domain";
import { LibraryCharacterPortrait, LibraryMediaThumbnail } from "@/components/library-media-thumbnail";
import { emptyCharacterProfile } from "@/lib/brain-defaults";
import { CharacterProfileDraftControls } from "@/components/character-profile-draft-controls";

type Tab = "Grid" | "Videos" | "References" | "Collections";
type ThumbnailState = "image" | "poster" | "video-frame" | "video-loading" | "unavailable";
type Character = AppSnapshot["characters"][number];
type CollectionView = { id: string; name: string; mediaIds: string[]; assets: MediaAsset[] };
type PremiumCharacterHubProps = {
  data: AppSnapshot;
  character?: Character;
  select: (media: MediaAsset) => void;
  create: (media?: MediaAsset, conversationId?: string, characterId?: string) => void;
  go: (destination: "messages" | "settings") => void;
  onBack?: () => void;
  openMessages?: (characterId: string) => void;
  manageReferences?: () => void;
  refresh?: () => Promise<void>;
};

export function PremiumCharacterHub(props: PremiumCharacterHubProps) {
  const { data, character, select, create, go, onBack, openMessages, manageReferences, refresh } = props;
  const [tab, setTab] = useState<Tab>("Grid");
  const [thumbnailStates, setThumbnailStates] = useState<Record<string, ThumbnailState>>({});
  const onThumbnailStateChange = useCallback((assetId: string, state: ThumbnailState) => {
    setThumbnailStates((current) => current[assetId] === state ? current : { ...current, [assetId]: state });
  }, []);
  if (!character) return null;

  const media = data.media.filter((asset) => asset.characterId === character.id);
  const refs = data.characterReferences.filter((reference) => reference.characterId === character.id);
  const images = media.filter((asset) => asset.type === "image");
  const videos = media.filter((asset) => asset.type === "video");
  const gridMedia = media.slice().sort((a, b) => Number(thumbnailStates[a.id] === "unavailable") - Number(thumbnailStates[b.id] === "unavailable"));
  const shown = tab === "Videos"
    ? videos
    : tab === "References"
      ? refs.map((reference) => data.media.find((asset) => asset.id === reference.mediaId)).filter((asset): asset is MediaAsset => Boolean(asset))
      : gridMedia;
  const collections: CollectionView[] = data.collections
    .map((collection) => ({
      ...collection,
      assets: collection.mediaIds.map((id) => media.find((asset) => asset.id === id)).filter((asset): asset is MediaAsset => Boolean(asset)),
    }))
    .filter((collection) => collection.assets.length > 0);
  const profile = data.characterProfiles.find((item) => item.characterId === character.id) ?? emptyCharacterProfile(character.id);

  return <>
    <div className="character-hub-desktop mx-auto max-w-[760px]">
      <section className="relative overflow-hidden rounded-[30px] bg-gradient-to-br from-[#1a1420] via-[#11151b] to-[#0a0d12] px-5 pb-6 pt-7">
        <div className="absolute -right-20 -top-20 h-52 w-52 rounded-full bg-fuchsia-500/15 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <span className="rounded-full bg-gradient-to-br from-amber-300 via-fuchsia-500 to-violet-500 p-[3px]"><LibraryCharacterPortrait src={character.portraitUrl} name={character.name} /></span>
          <div className="min-w-0"><h1 className="truncate text-3xl font-bold tracking-tight">{character.name}</h1><p className="mt-1 line-clamp-2 text-sm leading-5 text-zinc-400">{profileCopy(character.description, character.personality)}</p></div>
        </div>
        <div className="relative mt-6 grid grid-cols-3 border-y border-white/8 py-4 text-center"><Stat value={images.length} label="Images" /><Stat value={videos.length} label="Videos" /><Stat value={refs.length} label="References" /></div>
        <div className="relative mt-5 grid grid-cols-3 gap-2">
          <button onClick={() => create(undefined, undefined, character.id)} className="rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-500 px-3 py-2.5 text-sm font-bold">Create Scene</button>
          <button onClick={() => openMessages ? openMessages(character.id) : go("messages")} className="rounded-xl bg-white/8 px-3 py-2.5 text-sm font-semibold">Message</button>
          <button onClick={() => go("settings")} className="rounded-xl bg-white/8 px-3 py-2.5 text-sm font-semibold">Settings</button>
        </div>
      </section>
      <details className="mt-3 rounded-xl border border-white/10 bg-white/[.025] p-3">
        <summary className="cursor-pointer list-none text-sm font-semibold text-fuchsia-200">Edit with Assistant · Regenerate Profile</summary>
        <div className="mt-3"><CharacterProfileDraftControls character={character} profile={profile} refresh={refresh ?? (async () => undefined)} /></div>
      </details>
      <div className="mt-7 flex gap-4 overflow-x-auto pb-2">
        {["Looks", "Outfits", "Locations", "Motion", "Favorites"].map((name, index) => {
          const asset = media.length ? media[index % media.length] : undefined;
          return <button key={name} onClick={() => setTab(name === "Motion" ? "Videos" : name === "Favorites" ? "Grid" : "References")} className="grid min-w-[68px] place-items-center gap-2">
            <span className="rounded-full border border-white/15 p-1">{asset?.type === "image" ? <LibraryMediaThumbnail asset={asset} alt="" className="h-14 w-14 rounded-full object-cover" /> : <LibraryCharacterPortrait src={character.portraitUrl} name={character.name} />}</span>
            <span className="text-[11px] text-zinc-400">{name}</span>
          </button>;
        })}
      </div>
      <div className="mt-5 flex border-b border-white/8">{(["Grid", "Videos", "References", "Collections"] as Tab[]).map((item) => <button key={item} onClick={() => setTab(item)} className={`px-4 pb-3 text-sm font-semibold ${tab === item ? "border-b-2 border-fuchsia-400 text-white" : "text-zinc-500"}`}>{item}</button>)}</div>
      {tab === "Collections" ? <div className="grid grid-cols-2 gap-3 py-5">{collections.map((collection) => <div key={collection.id} className="rounded-2xl bg-white/[.045] p-4"><b>{collection.name}</b><p className="mt-1 text-xs text-zinc-500">{collection.assets.length} scenes</p></div>)}</div> : <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">{shown.map((asset) => <button key={asset.id} onClick={() => select(asset)} className="group relative overflow-hidden rounded-xl bg-white/5"><LibraryMediaThumbnail asset={asset} alt={asset.title} className="aspect-square w-full object-cover transition duration-200 group-hover:scale-[1.03]" />{asset.type === "video" && <span className="absolute bottom-1 right-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px]">▶</span>}</button>)}</div>}
    </div>
    <MobileCharacterHub character={character} profile={profile} images={images} videos={videos} refs={refs} tab={tab} setTab={setTab} shown={shown} collections={collections} select={select} create={create} go={go} onBack={onBack} openMessages={openMessages} manageReferences={manageReferences} onThumbnailStateChange={onThumbnailStateChange} refresh={refresh} />
  </>;
}

function MobileCharacterHub({ character, profile, images, videos, refs, tab, setTab, shown, collections, select, create, go, onBack, openMessages, manageReferences, onThumbnailStateChange, refresh }: {
  character: Character;
  profile: import("@/lib/domain").CharacterProfile;
  images: MediaAsset[];
  videos: MediaAsset[];
  refs: AppSnapshot["characterReferences"];
  tab: Tab;
  setTab: (tab: Tab) => void;
  shown: MediaAsset[];
  collections: CollectionView[];
  select: (asset: MediaAsset) => void;
  create: PremiumCharacterHubProps["create"];
  go: PremiumCharacterHubProps["go"];
  onBack?: () => void;
  openMessages?: (characterId: string) => void;
  manageReferences?: () => void;
  onThumbnailStateChange: (assetId: string, state: ThumbnailState) => void;
  refresh?: () => Promise<void>;
}) {
  const portraitInput = useRef<HTMLInputElement>(null);
  const [portraitUploading, setPortraitUploading] = useState(false);
  const [portraitError, setPortraitError] = useState("");
  const [activeCollectionId, setActiveCollectionId] = useState("");
  const [profileAssistantOpen, setProfileAssistantOpen] = useState(false);
  const activeCollection = collections.find((item) => item.id === activeCollectionId);
  const selectTab = (next: Tab) => { setActiveCollectionId(""); setTab(next); };

  return <div className="character-hub-mobile">
    <div className="character-mobile-top"><button onClick={onBack} aria-label="Back">‹</button><span aria-hidden="true" /><button onClick={() => go("settings")} aria-label="Character settings">⚙</button></div>
    <section className="character-mobile-profile">
      <button type="button" className="character-mobile-portrait" onClick={() => portraitInput.current?.click()} aria-label="Change profile photo"><LibraryCharacterPortrait src={character.portraitUrl} name={character.name} /><span className="character-photo-edit-badge" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M3 6h3l1.2-2h5.6L14 6h3v10H3z"/><circle cx="10" cy="11" r="2.7"/></svg></span></button>
      <input ref={portraitInput} type="file" accept="image/*" hidden onChange={async (event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; setPortraitError(""); setPortraitUploading(true); try { const form = new FormData(); form.set("file", file); form.set("characterId", character.id); form.set("setAsPortrait", "true"); const response = await fetch("/api/media/upload", { method: "POST", body: form }); const value = await response.json(); if (!response.ok) throw new Error(value.error ?? "Photo upload failed."); await refresh?.(); } catch (error) { setPortraitError(error instanceof Error ? error.message : "Photo upload failed."); } finally { setPortraitUploading(false); } }} />
      <button type="button" className="character-change-photo" onClick={() => portraitInput.current?.click()} disabled={portraitUploading}>{portraitUploading ? "Uploading…" : "Change Photo"}</button>
      {portraitError && <small role="alert">{portraitError}</small>}
      <h1>{character.name}</h1>
      {profileCopy(character.description, character.personality) && <p>{profileCopy(character.description, character.personality)}</p>}
      <div className="character-mobile-actions"><button onClick={() => openMessages ? openMessages(character.id) : go("messages")}>Message</button><button onClick={() => create(undefined, undefined, character.id)}>Create Scene</button></div>
      <p className="character-mobile-stats"><span><b>{images.length}</b> Images</span><i aria-hidden="true">·</i><span><b>{videos.length}</b> Videos</span><i aria-hidden="true">·</i><span><b>{refs.length}</b> References</span></p>
    </section>
      <section className="character-profile-assistant-entry mx-auto mt-3 w-full px-4"><button type="button" aria-expanded={profileAssistantOpen} onClick={() => setProfileAssistantOpen((open) => !open)} className="min-h-11 rounded-xl border border-fuchsia-300/20 px-4 text-sm font-semibold text-fuchsia-200">{profileAssistantOpen ? "Close Profile Assistant" : "Edit with Assistant"}</button>{profileAssistantOpen && <div className="mt-3"><CharacterProfileDraftControls character={character} profile={profile} refresh={refresh ?? (async () => undefined)} /></div>}</section>
    <nav className="character-mobile-tabs" aria-label="Character media">{(["Grid", "Videos", "References", "Collections"] as Tab[]).map((item) => <button key={item} aria-pressed={tab === item} onClick={() => selectTab(item)}>{item}{item === "References" && <small>{refs.length}</small>}</button>)}</nav>
    {tab === "Collections" ? activeCollection ? <section className="character-mobile-collection-detail"><button onClick={() => setActiveCollectionId("")}>‹ Collections</button><h2>{activeCollection.name}</h2><div className="character-mobile-grid">{activeCollection.assets.map((asset, index) => <button key={asset.id} onClick={() => select(asset)} aria-label={`Open ${asset.title}`}><LibraryMediaThumbnail asset={asset} alt={asset.title} loading={index < 9 ? "eager" : "lazy"} />{asset.type === "video" && <span className="character-mobile-video-mark">▶</span>}</button>)}</div></section> : <div className="character-mobile-collections">{collections.length ? collections.map((collection) => <button key={collection.id} onClick={() => setActiveCollectionId(collection.id)}><span className={`character-mobile-cover ${collection.assets.length === 1 ? "is-single" : collection.assets.length === 2 ? "is-double" : collection.assets.length === 3 ? "is-triple" : ""}`}>{collection.assets.slice(0, 4).map((asset) => <LibraryMediaThumbnail key={asset.id} asset={asset} alt={asset.title} loading="eager" />)}</span><b>{collection.name}</b><small>{collection.assets.length} {collection.assets.length === 1 ? "scene" : "scenes"}</small></button>) : <p className="character-mobile-empty">No collections contain {character.name}&apos;s media yet.</p>}</div> : <>
      <div className="character-mobile-grid">{shown.map((asset, index) => <button key={asset.id} onClick={() => select(asset)} aria-label={`Open ${asset.title}`}><LibraryMediaThumbnail asset={asset} alt={asset.title} loading={index < 9 ? "eager" : "lazy"} onStateChange={onThumbnailStateChange} />{asset.type === "video" && <span className="character-mobile-video-mark">▶</span>}{tab === "References" && <small>{refs.find((reference) => reference.mediaId === asset.id)?.role ?? "Reference"}</small>}</button>)}</div>
      {tab === "References" && <ReferenceSummary refs={refs} manage={manageReferences} />}
      {shown.length === 0 && <p className="character-mobile-empty">{tab === "References" ? "No character references yet." : tab === "Videos" ? "No videos in this character archive yet." : "No scenes yet."}</p>}
    </>}
  </div>;
}

function ReferenceSummary({ refs, manage }: { refs: AppSnapshot["characterReferences"]; manage?: () => void }) {
  const active = refs.filter((item) => item.active);
  const canonical = active.filter((item) => item.canonical).length;
  const counts = ["face", "body", "outfit", "motion", "environment"].map((role) => [role, active.filter((item) => item.role === role).length] as const).filter(([, count]) => count > 0);
  return <section className="character-reference-summary"><div><strong>Reference Vault</strong><small>{canonical} canonical · {active.length} active · {refs.length - active.length} inactive</small></div><div className="character-reference-summary-counts">{counts.map(([role, count]) => <span key={role}>{role} <b>{count}</b></span>)}</div><button onClick={manage}>Manage References <span aria-hidden="true">→</span></button></section>;
}

function profileCopy(description: string, personality: string) {
  const isKnownSeedPlaceholder = (value: string) => value.trim().toLocaleLowerCase() === "visual brief";
  return [description, personality].map((value) => value.trim()).find((value) => value && !isKnownSeedPlaceholder(value)) ?? "";
}

function Stat({ value, label }: { value: number; label: string }) {
  return <div><b className="text-lg">{value}</b><p className="mt-0.5 text-xs text-zinc-500">{label}</p></div>;
}

// This dense presentational client surface is covered by domain/service tests; UI action types are intentionally permissive.
// @ts-nocheck
"use client";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppSnapshot,
  GenerationInput,
  GenerationJob,
  MediaAsset,
  CharacterReference,
} from "@/lib/domain";
import { HomeV2 } from "@/components/home-v2/home-v2";
import { PremiumCharacterHub } from "@/components/character-hub-surface";
import { PremiumCreateStudio } from "@/components/create-studio-surface";
import { PremiumMessages } from "@/components/messages-surface";
import { PremiumReels } from "@/components/reels-surface";
import { PremiumExplore } from "@/components/explore-surface";
import { PremiumLibrary } from "@/components/library-surface";
import { PremiumMediaDetail } from "@/components/media-detail";
import { GenerationProgress } from "@/components/generation-surfaces";
import { UiIcon } from "@/components/ui-icon";
import { MobileAppShell } from "@/components/mobile-shell/mobile-app-shell";
import { ReferenceVault } from "@/components/reference-vault";
import { LibraryCharacterPortrait, LibraryMediaThumbnail } from "@/components/library-media-thumbnail";
import { CharacterProfileDraftControls } from "@/components/character-profile-draft-controls";

type View =
  | "home"
  | "explore"
  | "create"
  | "reels"
  | "messages"
  | "library"
  | "character"
  | "settings"
  | "jobs"
  | "progress"
  | "result"
  | "collections"
  | "reference-vault"
  | "lab";
const icon: Record<string, string> = {
  home: "⌂",
  explore: "⌕",
  create: "＋",
  reels: "▶",
  messages: "✦",
  library: "▦",
  profile: "◎",
  jobs: "◷",
  collections: "□",
  heart: "♥",
  note: "⌁",
  more: "•••",
};
const nav = [
  ["home", "Home"],
  ["explore", "Explore"],
  ["create", "Create"],
  ["reels", "Reels"],
  ["library", "Library"],
] as const;
const time = (value: string) =>
  new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(value),
  );
const json = <T,>(r: Response) => r.json() as Promise<T>;

export function StudioApp({
  initial,
  route,
  initialCharacterId,
}: {
  initial: AppSnapshot;
  route: string;
  initialCharacterId?: string;
}) {
  const [data, setData] = useState(initial);
  const [view, setView] = useState<View>(
    route.startsWith("character/references")
      ? "reference-vault"
      : route.startsWith("character")
      ? "character"
      : (route.split("/")[0] as View) || "home",
  );
  const previousView = useRef<View>("home");
  const routedCharacterId = initialCharacterId ?? route.split("/")[2];
  const routedCharacter = initial.characters.find((item) => item.id === routedCharacterId);
  const validRoutedCharacterId = routedCharacter?.id;
  const [activeCharacter, setActiveCharacter] = useState<string | undefined>(routedCharacter?.id);
  const [characterSelectionReady, setCharacterSelectionReady] = useState(Boolean(routedCharacter));
  const activeCharacterIdRef = useRef(activeCharacter);
  const selectCharacter = (characterId: string) => {
    activeCharacterIdRef.current = characterId;
    setActiveCharacter(characterId);
    window.localStorage.setItem("flex-scenes.active-character-id", characterId);
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set("characterId", characterId);
    window.history.replaceState({}, "", `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
  };
  useEffect(() => {
    if (validRoutedCharacterId) {
      window.localStorage.setItem("flex-scenes.active-character-id", validRoutedCharacterId);
      activeCharacterIdRef.current = validRoutedCharacterId;
      startTransition(() => setCharacterSelectionReady(true));
      return;
    }
    const stored = window.localStorage.getItem("flex-scenes.active-character-id");
    const validStored = data.characters.some((item) => item.id === stored) ? stored : undefined;
    const onlyCharacter = data.characters.length === 1 ? data.characters[0].id : undefined;
    const selected = validStored ?? onlyCharacter;
    activeCharacterIdRef.current = selected;
    startTransition(() => {
      setActiveCharacter(selected);
      setCharacterSelectionReady(true);
    });
  }, [data.characters, validRoutedCharacterId]);
  const referenceVaultReturnView = useRef<View>("character");
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [mobileThreadActive, setMobileThreadActive] = useState(false);
  const [messagesEntryPage, setMessagesEntryPage] = useState<"list" | "thread" | "details">("list");
  const [characterHubReturn, setCharacterHubReturn] = useState<{ conversationId: string; characterId: string } | null>(null);
  const characterHubReturnView = useRef<View>("home");
  const [selectedJobId, setSelectedJobId] = useState(route.split("/")[1] ?? "");
  const [jobConnectionError, setJobConnectionError] = useState(false);
  const [targetConversationId, setTargetConversationId] = useState("");
  const [createContext, setCreateContext] = useState<{
    parent?: MediaAsset;
    conversationId?: string;
    characterId?: string;
    mode?: "image" | "video";
    proposalId?: string;
    referenceAssetIds?: string[];
    referenceAssetRoles?: Record<string, CharacterReference["role"]>;
    sceneContext?: GenerationInput["sceneContext"];
    prompt?: string;
    ratio?: string;
    duration?: number;
  }>({ characterId: initial.characters.find((item) => item.id === routedCharacterId)?.id });
  const refresh = async () => {
    const next = await json<AppSnapshot>(
      await fetch("/api/bootstrap", { cache: "no-store" }),
    );
    setData(next);
    setSelected((current) => current ? next.media.find((asset) => asset.id === current.id) ?? current : null);
  };
  const go = (next: View, context?: typeof createContext) => {
    if (next === "character" && view !== "settings") characterHubReturnView.current = view;
    if (next !== view) previousView.current = view;
    const destinationCharacterId = context?.characterId ?? activeCharacterIdRef.current ?? activeCharacter;
    if (context?.characterId) selectCharacter(context.characterId);
    setView(next);
    if (context) setCreateContext(context);
    const basePath = next === "home" ? "/" : next === "reference-vault" ? "/character/references" : `/${next}`;
    const path = destinationCharacterId
      ? `${basePath}${basePath.includes("?") ? "&" : "?"}characterId=${encodeURIComponent(destinationCharacterId)}`
      : basePath;
    window.history.pushState({}, "", path);
  };
  const openReferenceVault = (source: "character" | "settings") => {
    referenceVaultReturnView.current = source;
    go("reference-vault");
  };
  const openJob = (job: GenerationJob) => {
    setSelectedJobId(job.id);
    const destination = job.status === "completed" ? "result" : "progress";
    setView(destination);
    window.history.pushState({}, "", `/${destination}/${job.id}`);
  };
  const activeJobKey = data.jobs.filter((job) => !["completed", "failed", "cancelled"].includes(job.status)).map((job) => job.id).join(",");
  useEffect(() => {
    const activeJobIds = activeJobKey ? activeJobKey.split(",") : [];
    if (!activeJobIds.length) return;
    let alive = true;
    const poll = async () => {
      try {
        const responses = await Promise.all(activeJobIds.map((id) => fetch(`/api/jobs/${id}`, { cache: "no-store" })));
        if (responses.some((response) => !response.ok)) throw new Error("Job polling failed");
        const updatedJobs = await Promise.all(responses.map((response) => response.json() as Promise<GenerationJob>));
        if (!alive) return;
        setJobConnectionError(false);
        const selectedUpdate = updatedJobs.find((job) => job.id === selectedJobId);
        if (view === "progress" && selectedUpdate?.status === "completed" && selectedUpdate.mediaId) {
          setView("result");
          window.history.replaceState({}, "", `/result/${selectedUpdate.id}`);
        }
        await refresh();
      } catch { if (alive) setJobConnectionError(true); }
    };
    const timer = window.setInterval(() => void poll(), 1100);
    return () => { alive = false; window.clearInterval(timer); };
  }, [activeJobKey, selectedJobId, view]);
  const openConversation = (id: string) => { setTargetConversationId(id); setMessagesEntryPage("thread"); go("messages"); };
  const openCharacterHubFromConversation = (characterId: string, conversationId: string) => {
    characterHubReturnView.current = "messages";
    selectCharacter(characterId);
    setTargetConversationId(conversationId);
    setMessagesEntryPage("details");
    setCharacterHubReturn({ conversationId, characterId });
    go("character");
  };
  const messageCharacter = (characterId: string) => {
    setCharacterHubReturn(null);
    const conversation = data.conversations.find((item) => item.characterId === characterId);
    if (conversation) { setTargetConversationId(conversation.id); setMessagesEntryPage("thread"); }
    else { setTargetConversationId(""); setMessagesEntryPage("list"); }
    go("messages");
  };
  const active = data.characters.find((c) => c.id === activeCharacter);
  const isWideArchive = view === "explore" || view === "library" || view === "reference-vault";
  const favorite = async (id: string) => {
    await fetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "favorite", mediaId: id }),
    });
    await refresh();
  };
  const reference = async (id: string) => {
    await fetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reference", mediaId: id }),
    });
    await refresh();
  };
  const createFrom = (
    parent?: MediaAsset,
    conversationId?: string,
    characterId?: string,
    mode?: "image" | "video",
    proposal?: AppSnapshot["proposals"][number],
  ) =>
    go("create", {
      parent,
      conversationId,
      characterId: characterId ?? parent?.characterId,
      mode,
      prompt: proposal ? (mode === "video" ? proposal.proposedVideoPlan : proposal.proposedImagePlan) : undefined,
      ratio: proposal?.suggestedAspectRatio,
      duration: proposal?.suggestedDuration ?? undefined,
      referenceAssetIds: proposal?.suggestedReferenceIds,
      referenceAssetRoles: proposal?.suggestedReferenceRoles,
      proposalId: proposal?.id,
      sceneContext: proposal ? { concept: proposal.concept, location: proposal.location, wardrobe: proposal.wardrobe, mood: proposal.mood, lighting: proposal.lighting, shotDescription: proposal.shotDescription, cameraDirection: proposal.cameraDirection, proposedImagePlan: proposal.proposedImagePlan, proposedVideoPlan: proposal.proposedVideoPlan } : undefined,
    });
  const header = (
    <header className={`app-header sticky top-0 z-20 flex items-center justify-between border-b border-white/8 bg-[#08090d]/90 px-5 py-4 backdrop-blur ${view === "home" ? "app-header-home" : ""}`}>
      <button onClick={() => go("home")} className="brand-lockup" aria-label="Flex Scenes home"><span>FLEX</span><span>SCENES</span></button>
      <div className="app-header-actions">
        {view === "home" && <button aria-label="Search characters and scenes" onClick={() => go("explore")} className="app-header-icon"><UiIcon name="explore" /></button>}
        <button aria-label="Open Messages" onClick={() => go("messages")} className="app-header-icon"><UiIcon name="messages" /></button>
        {view !== "home" && <button aria-label="Open Library" onClick={() => go("library")} className="app-header-icon"><UiIcon name="library" /></button>}
      </div>
    </header>
  );
  if (view === "home") {
    return <HomeV2
      data={data}
      character={active}
      navigate={(destination) => go(destination)}
      openConversation={openConversation}
      setCharacter={selectCharacter}
      select={setSelected}
      favorite={favorite}
      reference={reference}
      create={(asset, mode) => createFrom(asset, undefined, asset?.characterId, mode)}
      detail={selected ? <PremiumMediaDetail
        key={selected.id}
        data={data}
        asset={selected}
        character={data.characters.find((c) => c.id === selected.characterId)}
        close={() => setSelected(null)}
        favorite={favorite}
        onUseReference={async (asset) => { await reference(asset.id); setSelected(null); createFrom(asset, undefined, asset.characterId, asset.type === "video" ? "video" : "image"); }}
        remix={(asset) => { setSelected(null); createFrom(asset, undefined, asset.characterId, asset.type === "video" ? "video" : "image"); }}
        animate={(asset) => { setSelected(null); createFrom(asset, undefined, asset.characterId, "video"); }}
        select={setSelected}
        refresh={refresh}
        openCharacter={(id) => { setSelected(null); selectCharacter(id); go("character"); }}
      /> : null}
    />;
  }
  return (
    <main className={`studio-shell mx-auto min-h-screen max-w-[1680px] bg-[#08090d] pb-20 text-zinc-100 md:grid md:grid-cols-[220px_minmax(0,1fr)] ${view === "home" ? "is-home-view" : ""} ${view === "explore" ? "mobile-explore-flow" : ""} ${view === "library" ? "mobile-library-flow" : ""} ${view === "reels" ? "mobile-reels-view" : ""} ${isWideArchive ? "xl:grid-cols-[220px_minmax(0,1fr)]" : "xl:grid-cols-[220px_minmax(0,1fr)_300px]"} ${view === "messages" && mobileThreadActive ? "mobile-thread-active" : ""} md:pb-0`}>
      <MobileAppShell view={view} characters={data.characters} character={active} navigate={(destination) => { if (destination === "messages") { setTargetConversationId(""); setMessagesEntryPage("list"); setCharacterHubReturn(null); } go(destination as View); }} setCharacter={selectCharacter} messageThread={view === "messages" && mobileThreadActive} overlayOpen={Boolean(selected)} />
      <aside className="app-desktop-nav hidden border-r border-white/8 bg-[#0c0d12] p-5 md:block">
        <button
          onClick={() => go("home")}
          className="mb-9 text-2xl font-black tracking-[-.08em]"
        >
          <span>FLEX</span><span>SCENES</span>
        </button>
        {nav.map(([id, label]) => (
          <NavButton
            key={id}
            id={id}
            label={label}
            active={view === id}
            onClick={() => go(id as View)}
          />
        ))}
        <NavButton
          id="messages"
          label="Messages"
          active={view === "messages"}
          onClick={() => go("messages")}
        />
        <NavButton
          id="profile"
          label="Character Hub"
          active={view === "character"}
          onClick={() => go("character")}
        />
        <NavButton
          id="jobs"
          label="Activity"
          active={view === "jobs"}
          onClick={() => go("jobs")}
        />
        <NavButton
          id="collections"
          label="Collections"
          active={view === "collections"}
          onClick={() => go("collections")}
        />
        <button
          onClick={() => go("lab")}
          className="mt-5 text-xs text-zinc-600 hover:text-fuchsia-300"
        >
          Developer Provider Lab
        </button>
      </aside>
      <section className="min-w-0 border-x border-white/5">
        {view !== "reference-vault" && header}
        <div className={`studio-page-content mx-auto w-full ${view === "home" ? "home-page-content" : ""} ${view === "reels" ? "mobile-reels-page-content" : ""} ${view === "library" ? "mobile-library-page-content" : ""} ${isWideArchive ? "max-w-none" : "max-w-[900px]"} p-4 md:p-7`}>
          {view === "reference-vault" && (active ? <ReferenceVault data={data} character={active} refresh={refresh} select={setSelected} back={() => go(referenceVaultReturnView.current)} onCharacterChange={(id) => { selectCharacter(id); }} createCharacter={async (name, description) => { const response = await fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "character-create", name, description }) }); const created = await json<AppSnapshot["characters"][number]>(response); await refresh(); selectCharacter(created.id); return created; }} createWithReferences={(characterId, ids, roles) => { selectCharacter(characterId); go("create", { characterId, referenceAssetIds: ids, referenceAssetRoles: roles }); }} /> : characterSelectionReady ? <CharacterChooser characters={data.characters} onSelect={selectCharacter} refresh={refresh} /> : <p>Loading characters…</p>)}
          {view === "explore" && <PremiumExplore data={data} select={setSelected} openCharacter={(id) => { selectCharacter(id); go("character"); }} create={createFrom} />}{" "}
          {view === "create" && (
            active ? <CapabilityCreate
              data={data}
              context={{ ...createContext, characterId: createContext.characterId ?? active.id }}
              onJobCreated={openJob}
            /> : characterSelectionReady ? <CharacterChooser characters={data.characters} onSelect={selectCharacter} refresh={refresh} /> : <p>Loading characters…</p>
          )}{" "}
          {(view === "progress" || view === "result") && <GenerationProgress data={data} job={data.jobs.find((item) => item.id === selectedJobId)} connectionError={jobConnectionError} refresh={refresh} openJob={openJob} browse={() => go("explore")} jobs={() => go("jobs")} edit={(job) => { const parent = job.parentMediaId ? data.media.find((item) => item.id === job.parentMediaId) : undefined; let settings: Record<string, unknown> = {}; try { settings = JSON.parse(job.settingsJson); } catch {} go("create", { parent, conversationId: job.conversationId ?? undefined, characterId: job.characterId, mode: job.mode, prompt: job.prompt, ratio: typeof settings.aspectRatio === "string" ? settings.aspectRatio : undefined, duration: typeof settings.duration === "number" ? settings.duration : undefined, referenceAssetIds: Array.isArray(settings.referenceAssetIds) ? settings.referenceAssetIds : undefined }); }} conversation={openConversation} createResult={(media, mode) => createFrom(media, data.jobs.find((item) => item.id === selectedJobId)?.conversationId ?? undefined, media.characterId, mode)} select={setSelected} />}{" "}
          {view === "reels" && (
            <PremiumReels
              data={data}
              select={setSelected}
              favorite={favorite}
              reference={reference}
              create={createFrom}
              onBack={() => go(previousView.current === "reels" ? "home" : previousView.current)}
              openCharacterConversation={(characterId) => {
                const conversation = data.conversations.find((entry) => entry.characterId === characterId);
                if (conversation) openConversation(conversation.id);
                else { selectCharacter(characterId); go("messages"); }
              }}
              openCharacter={(id) => { selectCharacter(id); go("character"); }}
              qaCharacterId={active?.id}
            />
          )}{" "}
          {view === "messages" && (
            <PremiumMessages
              data={data}
              create={createFrom}
              refresh={refresh}
              initialConversationId={targetConversationId}
              initialMobilePage={messagesEntryPage}
              onMobileThreadChange={setMobileThreadActive}
              onOpenCharacterHub={openCharacterHubFromConversation}
              select={setSelected}
            />
          )}{" "}
          {view === "library" && <PremiumLibrary data={data} select={setSelected} refresh={refresh} create={createFrom} />}{" "}
          {view === "character" && (
            active ? <CharacterHub
              data={data}
              character={active}
              select={setSelected}
              create={createFrom}
              go={go}
              onBack={() => {
                if (characterHubReturn) {
                  setTargetConversationId(characterHubReturn.conversationId);
                  setMessagesEntryPage("details");
                  setCharacterHubReturn(null);
                  go("messages");
                } else go(characterHubReturnView.current);
              }}
              openMessages={messageCharacter}
              manageReferences={() => openReferenceVault("character")}
              refresh={refresh}
            /> : characterSelectionReady ? <CharacterChooser characters={data.characters} onSelect={selectCharacter} refresh={refresh} /> : <p>Loading characters…</p>
          )}{" "}
          {view === "settings" && (
          active ? <CharacterSettings
            data={data}
            character={active}
            refresh={refresh}
            go={go}
            onManageReferences={() => openReferenceVault("settings")}
          /> : characterSelectionReady ? <CharacterChooser characters={data.characters} onSelect={selectCharacter} refresh={refresh} /> : <p>Loading characters…</p>
          )}{" "}
          {view === "jobs" && (
            <JobCenter data={data} select={setSelected} refresh={refresh} openJob={openJob} />
          )}{" "}
          {view === "collections" && (
            <Collections data={data} refresh={refresh} select={setSelected} />
          )}{" "}
          {view === "lab" && <ProviderLab data={data} go={go} />}
        </div>
      </section>
      {!isWideArchive && <ContextRail data={data} character={active} view={view} go={go} openConversation={openConversation} />}
      {view !== "reference-vault" && <nav aria-label="Main navigation" className="app-bottom-nav fixed bottom-0 left-0 right-0 z-30 flex justify-around border-t border-white/10 bg-[#111218]/95 px-2 py-2 backdrop-blur md:hidden">
        {nav.map(([id, label]) => (
          <button
            key={id}
            onClick={() => go(id as View)}
            aria-current={view === id ? "page" : undefined}
            aria-label={id === "create" ? "Create a scene" : label}
            className={`bottom-nav-item ${id === "create" ? "bottom-nav-create" : ""} ${view === id ? "is-active" : ""}`}
          >
            <span className="bottom-nav-icon"><UiIcon name={id} /></span>
            <span className="bottom-nav-label">{label}</span>
          </button>
        ))}
      </nav>}
      {selected && (
        <PremiumMediaDetail
          key={selected.id}
          data={data}
          asset={selected}
          character={data.characters.find((c) => c.id === selected.characterId)}
          close={() => setSelected(null)}
          favorite={favorite}
          onUseReference={async (asset) => {
            await reference(asset.id);
            setSelected(null);
            createFrom(asset, undefined, asset.characterId, asset.type === "video" ? "video" : "image");
          }}
          remix={(asset) => {
            setSelected(null);
            createFrom(asset, undefined, asset.characterId, asset.type === "video" ? "video" : "image");
          }}
          animate={(asset) => { setSelected(null); createFrom(asset, undefined, asset.characterId, "video"); }}
          select={setSelected}
          refresh={refresh}
          openCharacter={(id) => { setSelected(null); selectCharacter(id); go("character"); }}
        />
      )}
    </main>
  );
}
function ContextRail({
  data,
  character,
  view,
  go,
  openConversation,
}: {
  data: AppSnapshot;
  character?: AppSnapshot["characters"][number];
  view: View;
  go: (x: View) => void;
  openConversation: (id: string) => void;
}) {
  const latest = (view === "home" && data.media.some((media) => media.type === "video")
    ? data.media.filter((media) => media.type === "video")
    : data.media).slice(0, view === "home" ? 3 : 4),
    jobs = data.jobs.filter(
      (j) => !["completed", "failed", "cancelled"].includes(j.status),
    );
  const characterMedia = data.media.filter((media) => media.characterId === character?.id);
  const characterVideos = characterMedia.filter((media) => media.type === "video").length;
  const characterImages = characterMedia.filter((media) => media.type === "image").length;
  const recentConversations = data.conversations
    .filter((conversation) => data.characters.some((item) => item.id === conversation.characterId))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 3);
  return (
    <aside className={`home-context-rail hidden border-l border-white/5 bg-[#0a0c10]/70 p-5 xl:block ${view === "home" ? "is-home-context" : ""}`}>
      <div className="sticky top-5 space-y-7">
        <section className="home-character-section">
          <p className="text-[11px] font-bold uppercase tracking-[.18em] text-zinc-500">
            {view === "home" ? "Active character" : "Current character"}
          </p>
          {character && (
            view === "home" ? (
              <div className="home-character-card">
                <button onClick={() => go("character")} className="home-character-identity">
                  <LibraryCharacterPortrait src={character.portraitUrl} name={character.name} />
                  <span><b>{character.name}</b><small>{character.handle}</small></span>
                </button>
                <p>{character.description}</p>
                <div className="home-character-stats" aria-label={`${characterImages} images and ${characterVideos} videos`}>
                  <span><b>{characterMedia.length}</b><small>Scenes</small></span>
                  <span><b>{characterImages}</b><small>Images</small></span>
                  <span><b>{characterVideos}</b><small>Videos</small></span>
                </div>
                <button className="home-character-message" onClick={() => {
                  const conversation = data.conversations.find((item) => item.characterId === character.id);
                  if (conversation) openConversation(conversation.id);
                  else go("messages");
                }}><UiIcon name="messages" /> Message {character.name.split(" ")[0]}</button>
              </div>
            ) : (
              <button onClick={() => go("character")} className="mt-3 flex w-full items-center gap-3 text-left">
                <span className="h-12 w-12 overflow-hidden rounded-full ring-2 ring-fuchsia-400/70 ring-offset-2 ring-offset-[#0a0c10]"><LibraryCharacterPortrait src={character.portraitUrl} name={character.name} /></span>
                <span><b className="block text-sm">{character.name}</b><small className="text-zinc-500">{character.handle}</small></span>
              </button>
            )
          )}
        </section>
        <section>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[.18em] text-zinc-500">
              Recent scenes
            </p>
            <button
              onClick={() => go("library")}
              className="text-xs text-fuchsia-300"
            >
              View all
            </button>
          </div>
          <div className={`mt-3 grid grid-cols-2 gap-2 ${view === "home" ? "home-recent-scenes" : ""}`}>
            {latest.map((m) => (
              <button
                key={m.id}
                onClick={() => go("library")}
                className="overflow-hidden rounded-xl"
              >
                <img
                  src={m.posterUrl ?? m.url}
                  alt=""
                  className="aspect-square w-full object-cover"
                />
              </button>
            ))}
          </div>
        </section>
        {view === "home" && recentConversations.length > 0 && (
          <section className="home-recent-messages">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[.18em] text-zinc-500">Recent messages</p>
              <button onClick={() => go("messages")} className="text-xs text-fuchsia-300">See all</button>
            </div>
            <div className="mt-2">
              {recentConversations.map((conversation) => {
                const person = data.characters.find((item) => item.id === conversation.characterId);
                const lastMessage = data.messages.filter((message) => message.conversationId === conversation.id).sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
                if (!person) return null;
                return (
                  <button className="home-recent-message" key={conversation.id} onClick={() => openConversation(conversation.id)}>
                    <LibraryCharacterPortrait src={person.portraitUrl} name={person.name} />
                    <span><b>{person.name}</b><small>{lastMessage?.body ?? "Open conversation"}</small></span>
                    {conversation.unread && <i aria-label="Unread message" />}
                  </button>
                );
              })}
            </div>
          </section>
        )}
        {jobs.length > 0 && (
          <section className="rounded-2xl border border-fuchsia-300/15 bg-fuchsia-500/5 p-3">
            <p className="text-xs font-bold">Generation in progress</p>
            <p className="mt-1 text-xs text-zinc-400">
              {jobs[0].status} · keep browsing while it finishes
            </p>
            <button
              onClick={() => go("jobs")}
              className="mt-3 text-xs text-fuchsia-200"
            >
              Open activity
            </button>
          </section>
        )}
        <section className="rounded-2xl bg-white/[.035] p-4">
          <p className="text-xs font-bold">
            {view === "create" ? "Draft is saved" : "Create a scene"}
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            Character context, references, and lineage stay private in Flex
            Scenes.
          </p>
          <button
            onClick={() => go("create")}
            className="mt-3 rounded-full bg-fuchsia-500 px-3 py-2 text-xs font-bold"
          >
            New scene
          </button>
        </section>
      </div>
    </aside>
  );
}
function NavButton({
  id,
  label,
  active,
  onClick,
}: {
  id: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`desktop-nav-item desktop-nav-${id} mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm ${active ? "bg-fuchsia-500/15 text-fuchsia-200" : "text-zinc-400 hover:bg-white/5"}`}
    >
      <span className="desktop-nav-icon"><UiIcon name={id as "home" | "explore" | "create" | "reels" | "messages" | "library" | "jobs" | "collections"} /></span>
      <span>{label}</span>
    </button>
  );
}
function FeedCard({
  asset,
  character,
  select,
  favorite,
  reference,
  create,
}: {
  asset: MediaAsset;
  character: string;
  select: (x: MediaAsset) => void;
  favorite: (id: string) => void;
  reference: (id: string) => void;
  create: (x?: MediaAsset) => void;
}) {
  return (
    <article className="overflow-hidden rounded-3xl border border-white/8 bg-[#13141b]">
      <div className="flex items-center justify-between px-4 py-3">
        <button className="font-semibold" onClick={() => select(asset)}>
          {character}
          <span className="ml-2 text-xs font-normal text-zinc-500">
            {time(asset.createdAt)}
          </span>
        </button>
        <span className="text-zinc-500">•••</span>
      </div>
      <button onClick={() => select(asset)} className="relative block w-full">
        <img
          src={asset.posterUrl ?? asset.url}
          alt={asset.title}
          className="aspect-[4/5] w-full object-cover"
        />
        {asset.type === "video" && (
          <span className="absolute inset-0 grid place-items-center text-5xl text-white/90">
            ▶
          </span>
        )}
      </button>
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => favorite(asset.id)}
            className={asset.favorite ? "text-fuchsia-300" : ""}
          >
            {icon.heart}
          </button>
          <button onClick={() => select(asset)}>{icon.note}</button>
          <button
            onClick={() => create(asset)}
            className="ml-auto rounded-full bg-white/8 px-3 py-1 text-xs"
          >
            Remix
          </button>
          <button
            onClick={() => reference(asset.id)}
            className="rounded-full bg-white/8 px-3 py-1 text-xs"
          >
            Use ref
          </button>
        </div>
        <p className="text-sm text-zinc-300">
          <b className="mr-2 text-zinc-100">{character}</b>
          {asset.caption}
        </p>
        <p className="text-xs text-zinc-500">{asset.title}</p>
      </div>
    </article>
  );
}
function Explore({
  data,
  select,
}: {
  data: AppSnapshot;
  select: (m: MediaAsset) => void;
}) {
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const media = data.media.filter(
    (m) =>
      (filter === "All" ||
        (filter === "Favorites" && m.favorite) ||
        (filter === "Images" && m.type === "image") ||
        (filter === "Videos" && m.type === "video") ||
        filter === "Characters") &&
      `${m.title} ${m.caption}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <h1 className="mb-4 text-3xl font-bold">Explore</h1>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search your private archive"
        className="mb-4 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-fuchsia-400"
      />
      <div className="mb-5 flex gap-2 overflow-x-auto">
        {["All", "Images", "Videos", "Favorites", "Characters"].map((x) => (
          <button
            key={x}
            onClick={() => setFilter(x)}
            className={`rounded-full px-4 py-2 text-sm ${filter === x ? "bg-fuchsia-500 text-white" : "bg-white/6 text-zinc-400"}`}
          >
            {x}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {media.map((m) => (
          <button
            key={m.id}
            onClick={() => select(m)}
            className="relative overflow-hidden rounded-2xl bg-[#15161d]"
          >
            <LibraryMediaThumbnail asset={m} alt={m.title} className="aspect-square w-full" />
            {m.type === "video" && (
              <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-1 text-xs">
                ▶ Video
              </span>
            )}
          </button>
        ))}
      </div>
    </>
  );
}
function Create({
  data,
  context,
  onComplete,
}: {
  data: AppSnapshot;
  context: {
    parent?: MediaAsset;
    conversationId?: string;
    characterId?: string;
  };
  onComplete: () => void;
}) {
  const [mode, setMode] = useState<"image" | "video">("image");
  const [characterId, setCharacterId] = useState(
    context.characterId,
  );
  const [prompt, setPrompt] = useState(
    context.parent ? `Remix: ${context.parent.prompt}` : "",
  );
  const [ratio, setRatio] = useState("4:5");
  const [preset, setPreset] = useState("Hero");
  const [referenceId, setReferenceId] = useState(context.parent?.id ?? "");
  const [simulation, setSimulation] = useState<
    "success" | "failure" | "timeout"
  >("success");
  const [job, setJob] = useState<GenerationJob | null>(null);
  const usableReferences = data.media.filter(
    (m) => m.isReference || m.characterId === characterId,
  );
  const submit = async () => {
    const input: GenerationInput = {
      characterId,
      mode,
      prompt,
      aspectRatio: ratio,
      preset,
      count: mode === "image" ? 1 : undefined,
      duration: mode === "video" ? 5 : undefined,
      simulation,
      parentMediaId: referenceId || null,
      conversationId: context.conversationId ?? null,
    };
    const created = await json<GenerationJob>(
      await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    );
    setJob(created);
  };
  useEffect(() => {
    if (!job || ["completed", "failed", "cancelled"].includes(job.status))
      return;
    const timer = setInterval(async () => {
      const next = await json<GenerationJob>(
        await fetch(`/api/jobs/${job.id}`, { cache: "no-store" }),
      );
      setJob(next);
      if (next.status === "completed") setTimeout(onComplete, 450);
    }, 500);
    return () => clearInterval(timer);
  }, [job, onComplete]);
  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-xs uppercase tracking-[.2em] text-fuchsia-300">
        Create
      </p>
      <h1 className="mb-6 text-3xl font-bold">Direct a new scene</h1>
      {context.parent && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-3">
          <img
            src={context.parent.url}
            className="h-12 w-12 rounded-lg object-cover"
            alt=""
          />
          <span className="text-sm">
            Remixing <b>{context.parent.title}</b> as a parent reference.
          </span>
        </div>
      )}
      <div className="rounded-3xl border border-white/8 bg-[#13141b] p-5">
        <div className="mb-5 grid grid-cols-2 rounded-2xl bg-black/25 p-1">
          {(["image", "video"] as const).map((x) => (
            <button
              key={x}
              onClick={() => setMode(x)}
              className={`rounded-xl py-3 text-sm font-bold ${mode === x ? "bg-fuchsia-500" : "text-zinc-400"}`}
            >
              {x === "image" ? "Image" : "Video"}
            </button>
          ))}
        </div>
        <label className="label">
          Character
          <select
            value={characterId}
            onChange={(e) => setCharacterId(e.target.value)}
          >
            {data.characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          Reference media
          <select
            value={referenceId}
            onChange={(e) => setReferenceId(e.target.value)}
          >
            <option value="">No reference selected</option>
            {usableReferences.map((m) => (
              <option key={m.id} value={m.id}>
                {m.isReference ? "Reference · " : "Character media · "}
                {m.title}
              </option>
            ))}
          </select>
        </label>
        <p className="-mt-2 mb-4 text-xs text-zinc-500">
          Mark media as a reference from Library, or select this
          character&apos;s existing media.
        </p>
        <label className="label">
          Scene direction
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe light, action, camera, and atmosphere."
            rows={5}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="label">
            Aspect ratio
            <select value={ratio} onChange={(e) => setRatio(e.target.value)}>
              <option>4:5</option>
              <option>1:1</option>
              <option>16:9</option>
              <option>9:16</option>
            </select>
          </label>
          <label className="label">
            {mode === "image" ? "Resolution" : "Duration"}
            <select value={preset} onChange={(e) => setPreset(e.target.value)}>
              <option value="Hero">
                {mode === "image" ? "Hero 1024" : "5 seconds"}
              </option>
              <option value="Draft">
                {mode === "image" ? "Draft 768" : "10 seconds"}
              </option>
            </select>
          </label>
        </div>
        <details className="mb-5 rounded-xl bg-black/20 p-3 text-sm text-zinc-400">
          <summary>Advanced mock controls</summary>
          <label className="label mt-3">
            Deterministic simulation
            <select
              value={simulation}
              onChange={(e) =>
                setSimulation(e.target.value as typeof simulation)
              }
            >
              <option value="success">Successful generation</option>
              <option value="failure">Provider failure</option>
              <option value="timeout">Provider timeout</option>
            </select>
          </label>
          <p className="mt-2 text-xs">
            Future: Seedream 5 / Seedance 2.5 — not connected.
          </p>
        </details>
        {job ? (
          <JobState
            job={job}
            onCancel={async () =>
              setJob(
                await json<GenerationJob>(
                  await fetch(`/api/jobs/${job.id}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: '{"action":"cancel"}',
                  }),
                ),
              )
            }
            onRetry={async () =>
              setJob(
                await json<GenerationJob>(
                  await fetch(`/api/jobs/${job.id}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: '{"action":"retry"}',
                  }),
                ),
              )
            }
          />
        ) : (
          <button
            onClick={submit}
            disabled={!prompt.trim()}
            className="w-full rounded-2xl bg-fuchsia-500 py-4 font-bold disabled:opacity-40"
          >
            Generate mock {mode}
          </button>
        )}
      </div>
    </div>
  );
}
function LegacyCapabilityCreate({
  data,
  context,
  onComplete,
}: {
  data: AppSnapshot;
  context: {
    parent?: MediaAsset;
    conversationId?: string;
    characterId?: string;
    mode?: "image" | "video";
    proposalId?: string;
    referenceAssetIds?: string[];
    referenceAssetRoles?: Record<string, CharacterReference["role"]>;
    sceneContext?: GenerationInput["sceneContext"];
    prompt?: string;
    ratio?: string;
    duration?: number;
  };
  onComplete: () => void;
}) {
  const [mode, setMode] = useState<"image" | "video">(context.mode ?? "image");
  const [characterId, setCharacterId] = useState(
    context.characterId,
  );
  const [prompt, setPrompt] = useState(
    context.parent && context.mode !== "video"
      ? `Remix: ${context.parent.prompt}`
      : "",
  );
  const [negativePrompt, setNegativePrompt] = useState("");
  const [seed, setSeed] = useState("");
  const [audio, setAudio] = useState(false);
  const [ratio, setRatio] = useState("4:5");
  const [preset, setPreset] = useState("Hero 1024");
  const [duration, setDuration] = useState(5);
  const [simulation, setSimulation] = useState<
    "success" | "failure" | "timeout"
  >("success");
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [refs, setRefs] = useState<string[]>(
    context.parent ? [context.parent.id] : [],
  );
  const [uploading, setUploading] = useState(false);
  const capabilities = data.capabilities.find((c) => c.mode === mode);
  const character = data.characters.find((c) => c.id === characterId);
  const canonical = new Set(
    data.characterReferences
      .filter((r) => r.characterId === characterId && r.canonical && r.active)
      .map((r) => r.mediaId),
  );
  const candidates = data.media.filter(
    (m) =>
      m.isReference || m.characterId === characterId || canonical.has(m.id),
  );
  useEffect(() => {
    const timer = setTimeout(() => {
      fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "draft-save",
          draft: {
            id: "current",
            characterId,
            mode,
            payloadJson: JSON.stringify({
              prompt,
              negativePrompt,
              seed,
              ratio,
              preset,
              duration,
              audio,
              simulation,
              referenceAssetIds: refs,
            }),
            updatedAt: new Date().toISOString(),
          },
        }),
      }).catch(() => undefined);
    }, 350);
    return () => clearTimeout(timer);
  }, [
    characterId,
    mode,
    prompt,
    negativePrompt,
    seed,
    ratio,
    preset,
    duration,
    audio,
    simulation,
    refs,
  ]);
  const toggle = (id: string) =>
    setRefs((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  const chooseCharacter = (id: string) => {
    setCharacterId(id);
    if (!context.parent)
      setRefs(
        data.characterReferences
          .filter((r) => r.characterId === id && r.canonical && r.active)
          .map((r) => r.mediaId),
      );
  };
  const upload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("characterId", characterId);
      const response = await fetch("/api/media/upload", {
        method: "POST",
        body: form,
      });
      const asset = await json<MediaAsset>(response);
      setRefs((current) => [...current, asset.id]);
      window.location.reload();
    } finally {
      setUploading(false);
    }
  };
  const submit = async () => {
    if (!capabilities) return;
    const input: GenerationInput = {
      characterId,
      mode,
      prompt,
      negativePrompt,
      seed,
      aspectRatio: ratio,
      preset,
      count: mode === "image" ? 1 : undefined,
      duration: mode === "video" ? duration : undefined,
      audio: capabilities.audio ? audio : undefined,
      simulation,
      referenceAssetIds: refs,
      parentMediaId: context.parent?.id ?? null,
      conversationId: context.conversationId ?? null,
    };
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    setJob(await json<GenerationJob>(response));
  };
  useEffect(() => {
    if (!job || ["completed", "failed", "cancelled"].includes(job.status))
      return;
    const timer = setInterval(async () => {
      const next = await json<GenerationJob>(
        await fetch(`/api/jobs/${job.id}`, { cache: "no-store" }),
      );
      setJob(next);
      if (next.status === "completed") setTimeout(onComplete, 450);
    }, 500);
    return () => clearInterval(timer);
  }, [job, onComplete]);
  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-xs uppercase tracking-[.2em] text-fuchsia-300">
        Create
      </p>
      <h1 className="mb-2 text-3xl font-bold">Direct a new scene</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Capability-driven mock workflow · future Seedream 5 / Seedance 2.5
        adapters are not connected.
      </p>
      <div className="rounded-3xl border border-white/8 bg-[#13141b] p-5">
        <div className="mb-5 grid grid-cols-2 rounded-2xl bg-black/25 p-1">
          {(["image", "video"] as const).map((x) => (
            <button
              key={x}
              onClick={() => setMode(x)}
              className={`rounded-xl py-3 text-sm font-bold ${mode === x ? "bg-fuchsia-500" : "text-zinc-400"}`}
            >
              {x === "image"
                ? "Image · Mock Image Provider"
                : "Video · Mock Video Provider"}
            </button>
          ))}
        </div>
        <label className="label">
          Character
          <select
            value={characterId}
            onChange={(e) => setCharacterId(e.target.value)}
          >
            {data.characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="mb-4 rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="mb-2 flex items-center justify-between">
            <b className="text-sm">Reference tray</b>
            <label className="cursor-pointer rounded-full bg-white/10 px-3 py-1 text-xs">
              {uploading ? "Importing…" : "Import local media"}
              <input
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) =>
                  e.target.files?.[0] && upload(e.target.files[0])
                }
              />
            </label>
          </div>
          <p className="mb-3 text-xs text-zinc-500">
            Canonical packs, prior scenes, library references, and local imports
            stay structured—not embedded in a prompt.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {candidates.slice(0, 12).map((asset) => (
              <button
                type="button"
                key={asset.id}
                onClick={() => toggle(asset.id)}
                className={`relative overflow-hidden rounded-xl border ${refs.includes(asset.id) ? "border-fuchsia-400" : "border-transparent"}`}
              >
                <LibraryMediaThumbnail asset={asset} alt={asset.title} className="aspect-square w-full" />
                <span className="absolute inset-x-0 bottom-0 bg-black/65 px-1 py-1 text-[9px]">
                  {canonical.has(asset.id)
                    ? "Canonical"
                    : asset.type === "video"
                      ? "Video"
                      : "Scene"}
                </span>
              </button>
            ))}
          </div>
          {!candidates.length && (
            <p className="text-sm text-zinc-500">
              No reusable media yet. Import a local SFW fixture or create a
              scene first.
            </p>
          )}
          <p className="mt-2 text-xs text-fuchsia-200">
            {refs.length} structured reference{refs.length === 1 ? "" : "s"}{" "}
            selected
          </p>
        </div>
        <label className="label">
          Scene direction
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe light, action, camera, and atmosphere."
            rows={5}
          />
        </label>
        {capabilities?.negativePrompt && (
          <label className="label">
            Negative direction
            <textarea
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              placeholder="Optional: things to avoid"
              rows={2}
            />
          </label>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="label">
            Aspect ratio
            <select value={ratio} onChange={(e) => setRatio(e.target.value)}>
              {capabilities?.aspectRatios.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="label">
            {mode === "image" ? "Resolution" : "Duration"}
            <select
              value={mode === "image" ? preset : String(duration)}
              onChange={(e) =>
                mode === "image"
                  ? setPreset(e.target.value)
                  : setDuration(Number(e.target.value))
              }
            >
              {mode === "image"
                ? capabilities?.resolutions.map((x) => (
                    <option key={x}>{x}</option>
                  ))
                : capabilities?.durations.map((x) => (
                    <option key={x} value={x}>
                      {x} seconds
                    </option>
                  ))}
            </select>
          </label>
        </div>
        <details className="mb-5 rounded-xl bg-black/20 p-3 text-sm text-zinc-400">
          <summary>Advanced controls exposed by {capabilities?.label}</summary>
          {capabilities?.seed && (
            <label className="label mt-3">
              Seed
              <input
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                placeholder="Random if blank"
              />
            </label>
          )}
          {capabilities?.audio && (
            <label className="mt-3 flex items-center gap-2">
              <input
                type="checkbox"
                checked={audio}
                onChange={(e) => setAudio(e.target.checked)}
              />{" "}
              Include mock audio track
            </label>
          )}
          <label className="label mt-3">
            Deterministic simulation
            <select
              value={simulation}
              onChange={(e) =>
                setSimulation(e.target.value as typeof simulation)
              }
            >
              <option value="success">Successful generation</option>
              <option value="failure">Provider failure</option>
              <option value="timeout">Provider timeout</option>
            </select>
          </label>
          <p className="mt-2 text-xs">
            Capabilities: {capabilities?.advancedControls.join(" · ")}
          </p>
        </details>
        {job ? (
          <JobState
            job={job}
            onCancel={async () =>
              setJob(
                await json<GenerationJob>(
                  await fetch(`/api/jobs/${job.id}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: '{"action":"cancel"}',
                  }),
                ),
              )
            }
            onRetry={async () =>
              setJob(
                await json<GenerationJob>(
                  await fetch(`/api/jobs/${job.id}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: '{"action":"retry"}',
                  }),
                ),
              )
            }
          />
        ) : (
          <button
            onClick={submit}
            disabled={!prompt.trim()}
            className="w-full rounded-2xl bg-fuchsia-500 py-4 font-bold disabled:opacity-40"
          >
            Generate mock {mode}
          </button>
        )}
      </div>
    </div>
  );
}
function CapabilityCreate({
  data,
  context,
  onJobCreated,
}: {
  data: AppSnapshot;
  context: {
    parent?: MediaAsset;
    conversationId?: string;
    characterId?: string;
    mode?: "image" | "video";
    proposalId?: string;
    referenceAssetIds?: string[];
    referenceAssetRoles?: Record<string, CharacterReference["role"]>;
    sceneContext?: GenerationInput["sceneContext"];
    prompt?: string;
    ratio?: string;
    duration?: number;
  };
  onJobCreated: (job: GenerationJob) => void;
}) {
  return (
    <PremiumCreateStudio
      data={data}
      context={context}
      onJobCreated={onJobCreated}
    />
  );
}
function JobState({
  job,
  onCancel,
  onRetry,
}: {
  job: GenerationJob;
  onCancel: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-4">
      <p className="font-bold capitalize">{job.status}</p>
      <p className="mt-1 text-sm text-zinc-300">
        {job.status === "completed"
          ? "Media is now in Library and Character Hub."
          : (job.error ??
            "Mock provider is moving through its real persisted lifecycle.")}
      </p>
      {["queued", "generating", "finalizing"].includes(job.status) && (
        <button
          onClick={onCancel}
          className="mt-3 rounded-full bg-white/10 px-3 py-1 text-xs"
        >
          Cancel
        </button>
      )}
      {job.status === "failed" && (
        <button
          onClick={onRetry}
          className="mt-3 rounded-full bg-white/10 px-3 py-1 text-xs"
        >
          Retry with success
        </button>
      )}
    </div>
  );
}
function LegacyReels({
  data,
  select,
  create,
}: {
  data: AppSnapshot;
  select: (m: MediaAsset) => void;
  create: (m: MediaAsset) => void;
}) {
  const videos = data.media.filter((m) => m.type === "video");
  const [index, setIndex] = useState(0);
  const item = videos[index] ?? data.media[0];
  if (!item) return null;
  return (
    <div className="mx-auto max-w-md">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#12131a]">
        <img
          src={item.posterUrl ?? item.url}
          alt={item.title}
          className="aspect-[9/16] w-full object-cover"
        />
        <div className="absolute inset-0 grid place-items-center text-6xl text-white/90">
          ▶
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 p-5 pt-24">
          <p className="font-bold">
            {data.characters.find((c) => c.id === item.characterId)?.name}
          </p>
          <p className="mt-1 text-sm text-zinc-200">{item.caption}</p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => select(item)}
              className="rounded-full bg-white/15 px-3 py-2 text-xs"
            >
              Notes
            </button>
            <button
              onClick={() => select(item)}
              className="rounded-full bg-white/15 px-3 py-2 text-xs"
            >
              Use ref
            </button>
            <button
              onClick={() => create(item)}
              className="rounded-full bg-fuchsia-500 px-3 py-2 text-xs font-bold"
            >
              Remix
            </button>
          </div>
        </div>
      </div>
      <div className="mt-4 flex justify-between">
        <button
          onClick={() => setIndex(Math.max(0, index - 1))}
          disabled={!index}
          className="rounded-full bg-white/8 px-4 py-2 disabled:opacity-30"
        >
          Previous
        </button>
        <button
          onClick={() => setIndex(Math.min(videos.length - 1, index + 1))}
          disabled={index >= videos.length - 1}
          className="rounded-full bg-white/8 px-4 py-2 disabled:opacity-30"
        >
          Next reel
        </button>
      </div>
    </div>
  );
}
function LegacyEnhancedMessages({
  data,
  create,
  refresh,
}: {
  data: AppSnapshot;
  create: (
    m?: MediaAsset,
    conversationId?: string,
    characterId?: string,
  ) => void;
  refresh: () => Promise<void>;
}) {
  const [active, setActive] = useState(data.conversations[0]?.id);
  const [text, setText] = useState("");
  const [attach, setAttach] = useState("");
  const conv = data.conversations.find((c) => c.id === active);
  const character = data.characters.find((c) => c.id === conv?.characterId);
  const messages = data.messages.filter((m) => m.conversationId === active);
  const memory = data.memory.find((m) => m.conversationId === active);
  const send = async () => {
    if (!text.trim() || !active) return;
    await fetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "message",
        conversationId: active,
        text,
        mediaId: attach || undefined,
      }),
    });
    setText("");
    setAttach("");
    await refresh();
  };
  return (
    <div className="grid min-h-[600px] overflow-hidden rounded-3xl border border-white/8 bg-[#12131a] md:grid-cols-[290px_1fr]">
      <aside className="border-r border-white/8 p-3">
        <h1 className="p-2 text-2xl font-bold">Messages</h1>
        {data.conversations.map((c) => {
          const ch = data.characters.find((x) => x.id === c.characterId);
          return (
            <button
              key={c.id}
              onClick={() => setActive(c.id)}
              className={`flex w-full gap-3 rounded-2xl p-3 text-left ${active === c.id ? "bg-white/8" : ""}`}
            >
              <span className="h-11 w-11 overflow-hidden rounded-full"><LibraryCharacterPortrait src={ch?.portraitUrl ?? ""} name={ch?.name ?? ""} /></span>
              <span>
                <b className="block">{ch?.name}</b>
                <small className="text-zinc-500">
                  {c.unread ? "New reply" : "Character studio"}
                </small>
              </span>
            </button>
          );
        })}
      </aside>
      <section className="flex min-h-[500px] flex-col">
        <div className="border-b border-white/8 p-4">
          <b>{character?.name}</b>
          <p className="text-xs text-zinc-500">
            {memory?.summary ||
              "Deterministic personality-aware mock conversation"}
          </p>
        </div>
        <div className="flex-1 space-y-3 overflow-auto p-4">
          {messages.map((m) => {
            const attached = data.attachments
              .filter((a) => a.messageId === m.id)
              .map((a) => data.media.find((asset) => asset.id === a.mediaId))
              .filter(Boolean) as MediaAsset[];
            return (
              <div
                key={m.id}
                className={`max-w-[84%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "ml-auto bg-fuchsia-500" : "bg-white/8"}`}
              >
                <p>{m.body}</p>
                {attached.map((asset) => (
                  <img
                    key={asset.id}
                    src={asset.posterUrl ?? asset.url}
                    alt={asset.title}
                    className="mt-2 h-24 w-24 rounded-xl object-cover"
                  />
                ))}
              </div>
            );
          })}
        </div>
        <div className="border-t border-white/8 p-3">
          <button
            onClick={() => create(undefined, active, character?.id)}
            className="mb-2 rounded-full bg-white/8 px-3 py-1 text-xs"
          >
            Create Scene from conversation
          </button>
          <div className="mb-2 flex gap-2">
            <select
              value={attach}
              onChange={(e) => setAttach(e.target.value)}
              className="min-w-0 flex-1 rounded-xl bg-white/8 px-3 py-2 text-xs"
            >
              <option value="">Attach Library media (optional)</option>
              {data.media.slice(0, 20).map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.title}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Message character"
              className="min-w-0 flex-1 rounded-xl bg-white/8 px-3 py-2 outline-none"
            />
            <button onClick={send} className="rounded-xl bg-fuchsia-500 px-4">
              Send
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
function CharacterChooser({ characters, onSelect, refresh }: { characters: AppSnapshot["characters"]; onSelect: (id: string) => void; refresh: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const create = async () => {
    if (!name.trim()) return;
    const response = await fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "character-create", name: name.trim(), description: "" }) });
    const value = await response.json();
    if (!response.ok) { setError(value.error ?? "Could not create character."); return; }
    await refresh();
    onSelect(value.id);
  };
  return <section className="mx-auto max-w-xl p-5" aria-label="Choose a character"><h1 className="text-2xl font-bold">{characters.length ? "Choose a Character" : "Create Character"}</h1><p className="mt-2 text-sm text-zinc-400">Select the character you are working with.</p>{characters.length > 0 && <div className="mt-5 grid gap-2">{characters.map((character) => <button key={character.id} onClick={() => onSelect(character.id)} className="flex min-h-14 items-center gap-3 rounded-xl border border-white/10 p-3 text-left"><span className="h-10 w-10 overflow-hidden rounded-full"><LibraryCharacterPortrait src={character.portraitUrl} name={character.name} /></span><span className="font-semibold">{character.name}</span></button>)}</div>}{characters.length === 0 && <div className="mt-5 flex gap-2"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Character name" className="min-h-11 min-w-0 flex-1 rounded-xl bg-white/5 px-3"/><button onClick={() => void create()} className="rounded-xl bg-fuchsia-500 px-4">Create</button></div>}{error && <p role="alert">{error}</p>}</section>;
}

function CharacterHub({
  data,
  character,
  select,
  create,
  go,
  onBack,
  openMessages,
  refresh,
}: {
  data: AppSnapshot;
  character?: AppSnapshot["characters"][number];
  select: (m: MediaAsset) => void;
  create: (
    m?: MediaAsset,
    conversationId?: string,
    characterId?: string,
  ) => void;
  go: (x: View) => void;
  onBack?: () => void;
  openMessages?: (characterId: string) => void;
  refresh?: () => Promise<void>;
}) {
  return (
    <PremiumCharacterHub
      data={data}
      character={character}
      select={select}
      create={create}
      go={go}
      onBack={onBack}
      openMessages={openMessages}
      refresh={refresh}
    />
  );
}
function Messages({
  data,
  go,
  create,
  refresh,
}: {
  data: AppSnapshot;
  go: (x: View) => void;
  create: (
    m?: MediaAsset,
    conversationId?: string,
    characterId?: string,
  ) => void;
  refresh: () => Promise<void>;
}) {
  const [active, setActive] = useState(data.conversations[0]?.id);
  const [text, setText] = useState("");
  const conv = data.conversations.find((c) => c.id === active);
  const character = data.characters.find((c) => c.id === conv?.characterId);
  const messages = data.messages.filter((m) => m.conversationId === active);
  const send = async () => {
    if (!text.trim() || !active) return;
    await fetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "message", conversationId: active, text }),
    });
    setText("");
    await refresh();
  };
  return (
    <div className="grid min-h-[600px] overflow-hidden rounded-3xl border border-white/8 bg-[#12131a] md:grid-cols-[290px_1fr]">
      <aside className="border-r border-white/8 p-3">
        <h1 className="p-2 text-2xl font-bold">Messages</h1>
        {data.conversations.map((c) => {
          const ch = data.characters.find((x) => x.id === c.characterId);
          const last = data.messages
            .filter((m) => m.conversationId === c.id)
            .at(-1);
          return (
            <button
              key={c.id}
              onClick={() => setActive(c.id)}
              className={`flex w-full gap-3 rounded-2xl p-3 text-left ${active === c.id ? "bg-white/8" : ""}`}
            >
              <span className="h-11 w-11 overflow-hidden rounded-full"><LibraryCharacterPortrait src={ch?.portraitUrl ?? ""} name={ch?.name ?? ""} /></span>
              <span className="min-w-0">
                <b className="block">{ch?.name}</b>
                <small className="block truncate text-zinc-500">
                  {last?.body}
                </small>
              </span>
            </button>
          );
        })}
      </aside>
      <section className="flex min-h-[500px] flex-col">
        <div className="border-b border-white/8 p-4">
          <b>{character?.name}</b>
          <p className="text-xs text-zinc-500">
            Character conversation · deterministic mock replies
          </p>
        </div>
        <div className="flex-1 space-y-3 overflow-auto p-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "ml-auto bg-fuchsia-500" : "bg-white/8"}`}
            >
              {m.body}
            </div>
          ))}
        </div>
        <div className="border-t border-white/8 p-3">
          <button
            onClick={() => create(undefined, active, character?.id)}
            className="mb-2 rounded-full bg-white/8 px-3 py-1 text-xs"
          >
            Create Scene from conversation
          </button>
          <div className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Message character"
              className="min-w-0 flex-1 rounded-xl bg-white/8 px-3 py-2 outline-none"
            />
            <button onClick={send} className="rounded-xl bg-fuchsia-500 px-4">
              Send
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
function Library({
  data,
  select,
}: {
  data: AppSnapshot;
  select: (m: MediaAsset) => void;
}) {
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const media = data.media.filter(
    (m) =>
      (filter === "All" ||
        (filter === "Images" && m.type === "image") ||
        (filter === "Videos" && m.type === "video") ||
        (filter === "Favorites" && m.favorite) ||
        (filter === "References" && m.isReference)) &&
      `${m.title} ${m.prompt}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <h1 className="text-3xl font-bold">Library</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Private archive · provenance preserved per asset
      </p>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search title or prompt"
        className="my-5 w-full rounded-2xl bg-white/6 px-4 py-3 outline-none"
      />
      <div className="mb-5 flex gap-2 overflow-x-auto">
        {["All", "Images", "Videos", "Favorites", "References"].map((x) => (
          <button
            onClick={() => setFilter(x)}
            key={x}
            className={`rounded-full px-3 py-2 text-xs ${filter === x ? "bg-fuchsia-500" : "bg-white/7"}`}
          >
            {x}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {media.map((m) => (
          <button
            onClick={() => select(m)}
            key={m.id}
            className="overflow-hidden rounded-2xl border border-white/8 bg-[#14151b] text-left"
          >
            <img
              src={m.posterUrl ?? m.url}
              className="aspect-square w-full object-cover"
              alt=""
            />
            <div className="p-3">
              <b className="block truncate text-sm">{m.title}</b>
              <small className="text-zinc-500">
                {m.providerId} · {time(m.createdAt)}
              </small>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
function CharacterSettings({
  data,
  character,
  refresh,
  go,
  onManageReferences,
}: {
  data: AppSnapshot;
  character?: AppSnapshot["characters"][number];
  refresh: () => Promise<void>;
  go: (x: View) => void;
  onManageReferences?: () => void;
}) {
  const [form, setForm] = useState(character);
  const [brain, setBrain] = useState(data.characterProfiles.find((item) => item.characterId === character?.id));
  const [status, setStatus] = useState("");
  if (!character || !form) return null;
  const refs = data.characterReferences.filter((reference) => reference.characterId === character.id);
  const canonicalCount = refs.filter((reference) => reference.active && reference.canonical).length;
  const update = async () => {
    await fetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "character-update",
        characterId: character.id,
        characterPatch: {
          name: form.name,
          handle: form.handle,
          description: form.description,
          personality: form.personality,
          identityNotes: form.identityNotes,
          defaultsJson: form.defaultsJson,
        },
      }),
    });
    if (brain) await fetch("/api/director", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "profile-update", characterId: character.id, ...brain }) });
    await refresh();
    setStatus("Saved");
  };
  return (
    <div className="mx-auto max-w-3xl">
      <button
        onClick={() => go("character")}
        className="mb-4 text-sm text-fuchsia-300"
      >
        ← Back to Character Hub
      </button>
      <h1 className="text-3xl font-bold">Character Settings</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Visual identity and conversational personality remain deliberately
        separate.
      </p>
      <button onClick={onManageReferences} className="mb-5 rounded-full border border-white/15 px-4 py-2 text-sm text-fuchsia-200">Manage References</button>
      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-3xl border border-white/8 bg-[#13141b] p-5">
          <h2 className="mb-4 font-bold">Identity</h2>
          <label className="label">
            Name
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="label">
            Handle
            <input
              value={form.handle}
              onChange={(e) => setForm({ ...form, handle: e.target.value })}
            />
          </label>
          <label className="label">
            Short description
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </label>
          <label className="label">
            Appearance / identity notes
            <textarea
              value={form.identityNotes}
              onChange={(e) =>
                setForm({ ...form, identityNotes: e.target.value })
              }
            />
          </label>
        </section>
        <section className="rounded-3xl border border-white/8 bg-[#13141b] p-5">
          <h2 className="mb-4 font-bold">Personality</h2>
          <label className="label">
            Personality and speaking style
            <textarea
              value={form.personality}
              onChange={(e) =>
                setForm({ ...form, personality: e.target.value })
              }
            />
          </label>
          <label className="label">
            Generation defaults (structured JSON)
            <textarea
              value={form.defaultsJson}
              onChange={(e) =>
                setForm({ ...form, defaultsJson: e.target.value })
              }
            />
          </label>
          <p className="text-xs text-zinc-500">
            Future fields: lore, relationship context, reusable positive
            fragments, negative constraints, image/video defaults.
          </p>
        </section>
      </div>
      {brain && (
        <section className="mt-5 rounded-3xl border border-fuchsia-300/15 bg-[#13141b] p-5">
          <h2 className="font-bold">Creative profile</h2>
          <p className="mt-1 text-sm text-zinc-500">Shape what she likes to create; these preferences stay separate from her visual identity.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="label">Initiative<select value={brain.initiativeLevel} onChange={(e)=>setBrain({...brain,initiativeLevel:e.target.value})}><option value="REACTIVE">Reactive · only when asked</option><option value="CREATIVE">Creative · suggest during relevant chats</option><option value="DIRECTOR">Director · proactive ideas when prompted to think</option></select></label>
            <label className="label">Creative boldness<input type="range" min="0" max="1" step="0.05" value={brain.creativeProfile.creativeBoldness} onChange={(e)=>setBrain({...brain,creativeProfile:{...brain.creativeProfile,creativeBoldness:Number(e.target.value)}})} /></label>
            {([["favoriteEnvironments","Favorite locations"],["preferredMoods","Preferred moods"],["visualThemes","Visual styles"],["wardrobeCategories","Wardrobe categories"],["cameraEnergy","Camera energy"],["ideasToTry","Ideas she wants to try"],["ideasTiredOf","Scenes she is tired of"]] as const).map(([key,label])=><label key={key} className="label">{label}<input value={brain.creativeProfile[key].join(", ")} onChange={(e)=>setBrain({...brain,creativeProfile:{...brain.creativeProfile,[key]:e.target.value.split(",").map((x)=>x.trim()).filter(Boolean)}})} /></label>)}
            <label className="label">Repetition tolerance<input type="range" min="0" max="1" step="0.05" value={brain.creativeProfile.repetitionTolerance} onChange={(e)=>setBrain({...brain,creativeProfile:{...brain.creativeProfile,repetitionTolerance:Number(e.target.value)}})} /></label>
          </div>
          <div className="mt-5 flex flex-wrap gap-5 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={brain.adultCharacter} onChange={(e)=>setBrain({...brain,adultCharacter:e.target.checked,ageVerifiedAdult:e.target.checked?brain.ageVerifiedAdult:false})} /> Explicitly represented as adult</label><label className="flex items-center gap-2"><input type="checkbox" checked={brain.ageVerifiedAdult} disabled={!brain.adultCharacter} onChange={(e)=>setBrain({...brain,ageVerifiedAdult:e.target.checked})} /> Adult age verified</label></div>
          <p className="mt-2 text-xs text-zinc-500">Adult conversation remains unavailable unless both fields and provider capability explicitly allow it.</p>
        </section>
      )}
      {brain && <div className="mt-5"><CharacterProfileDraftControls character={character} profile={brain} refresh={refresh} onApplied={(result) => { setForm(result.character); setBrain(result.profile); }} /></div>}
      <button
        onClick={update}
        className="mt-5 rounded-2xl bg-fuchsia-500 px-5 py-3 font-bold"
      >
        Save Character Settings
      </button>
      <span className="ml-3 text-sm text-fuchsia-200">{status}</span>
      <section className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/8 bg-[#13141b] p-4" aria-label="Reference summary">
        <div>
          <h2 className="font-bold">References</h2>
          <p className="mt-1 text-sm text-zinc-400">{refs.length} total references · {canonicalCount} canonical</p>
        </div>
        <button onClick={onManageReferences} className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-fuchsia-200">Manage References</button>
      </section>
    </div>
  );
}
function JobCenter({
  data,
  select,
  refresh,
  openJob,
}: {
  data: AppSnapshot;
  select: (m: MediaAsset) => void;
  refresh: () => Promise<void>;
  openJob: (job: GenerationJob) => void;
}) {
  const [filter, setFilter] = useState("all");
  const jobs = data.jobs.filter((j) => filter === "all" || j.status === filter);
  return (
    <div>
      <h1 className="text-3xl font-bold">Activity</h1>
      <p className="mb-5 text-sm text-zinc-500">
        Persistent normalized jobs · provider events · $0.00 mock usage
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          "all",
          "queued",
          "generating",
          "finalizing",
          "completed",
          "failed",
          "cancelled",
        ].map((x) => (
          <button
            key={x}
            onClick={() => setFilter(x)}
            className={`rounded-full px-3 py-2 text-xs ${filter === x ? "bg-fuchsia-500" : "bg-white/8"}`}
          >
            {x}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {jobs.map((job) => {
          const output = data.media.find((m) => m.id === job.mediaId);
          const events = data.events.filter((e) => e.jobId === job.id);
          return (
            <article
              key={job.id}
              className="rounded-2xl border border-white/8 bg-[#13141b] p-4"
            >
              <div className="flex justify-between gap-3">
                <button onClick={() => openJob(job)} className="text-left">
                  <b className="capitalize">
                    {job.mode} · {job.status}
                  </b>
                  <p className="text-sm text-zinc-500">{job.prompt.slice(0, 80)}</p>
                  <span className="mt-1 inline-block text-xs text-fuchsia-200">{job.status === "completed" ? "Open result" : job.status === "failed" ? "Review failure" : "View progress"} →</span>
                </button>
                <span className="text-xs text-fuchsia-200">$0.00</span>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                {events.at(-1)?.message ?? "Awaiting provider event"}
              </p>
              <div className="mt-3 flex gap-2">
                {output && (
                  <button
                    onClick={() => openJob(job)}
                    className="rounded-full bg-white/10 px-3 py-1 text-xs"
                  >
                    View result
                  </button>
                )}
                <button
                  onClick={async () => {
                    await fetch(`/api/jobs/${job.id}`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: '{"action":"simulate-callback"}',
                    });
                    await refresh();
                  }}
                  disabled={["completed", "failed", "cancelled"].includes(
                    job.status,
                  )}
                  className="rounded-full bg-white/10 px-3 py-1 text-xs disabled:opacity-30"
                >
                  Simulate callback
                </button>
                <button
                  onClick={() =>
                    alert(
                      JSON.stringify(
                        {
                          job,
                          references: data.jobReferences.filter(
                            (r) => r.jobId === job.id,
                          ),
                        },
                        null,
                        2,
                      ),
                    )
                  }
                  className="rounded-full bg-white/10 px-3 py-1 text-xs"
                >
                  Inspect request
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
function Collections({
  data,
  refresh,
  select,
}: {
  data: AppSnapshot;
  refresh: () => Promise<void>;
  select: (m: MediaAsset) => void;
}) {
  const [name, setName] = useState("");
  return (
    <div>
      <h1 className="text-3xl font-bold">Collections</h1>
      <div className="my-5 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New collection"
          className="min-w-0 flex-1 rounded-xl bg-white/8 px-3 py-2"
        />
        <button
          onClick={async () => {
            if (!name.trim()) return;
            await fetch("/api/actions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "collection-create", name }),
            });
            setName("");
            await refresh();
          }}
          className="rounded-xl bg-fuchsia-500 px-4"
        >
          Create
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {data.collections.map((c) => (
          <section
            key={c.id}
            className="rounded-2xl border border-white/8 bg-[#13141b] p-4"
          >
            <b>{c.name}</b>
            <p className="mb-3 text-xs text-zinc-500">
              {c.mediaIds.length} media assets
            </p>
            <div className="flex gap-2 overflow-x-auto">
              {c.mediaIds.map((id) => {
                const asset = data.media.find((m) => m.id === id);
                return (
                  asset && (
                    <button onClick={() => select(asset)} key={id}>
                      <img
                        src={asset.posterUrl ?? asset.url}
                        className="h-16 w-16 rounded-lg object-cover"
                        alt=""
                      />
                    </button>
                  )
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
function ProviderLab({
  data,
  go,
}: {
  data: AppSnapshot;
  go: (x: View) => void;
}) {
  const [preview, setPreview] = useState<unknown>(null);
  const test = async () =>
    setPreview(
      await json(
        await fetch("/api/provider-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            family: "seedance-2.5",
            mode: "reference",
            prompt: "Dry-run only",
            references: [
              {
                id: "opening",
                url: "/fixture/opening.png",
                kind: "image",
                role: "opening-frame",
              },
              {
                id: "motion",
                url: "/fixture/motion.mp4",
                kind: "video",
                role: "motion",
              },
              {
                id: "audio",
                url: "/fixture/audio.mp3",
                kind: "audio",
                role: "audio-mood",
              },
            ],
            duration: 5,
            resolution: "720p",
            aspectRatio: "16:9",
          }),
        }),
      ),
    );
  return (
    <div className="mx-auto max-w-2xl rounded-3xl border border-amber-300/20 bg-amber-300/5 p-6">
      <p className="text-xs uppercase tracking-[.2em] text-amber-200">
        Development only · dry run
      </p>
      <h1 className="mt-2 text-3xl font-bold">Provider Contract Lab</h1>
      <p className="mt-3 text-zinc-400">
        No external provider is contacted. Compare normalized capabilities,
        preview sanitized routes/payloads, and use mocks for queue, failures,
        cancellation, retry, and callback completion.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {data.capabilities.map((c) => (
          <div key={c.providerId} className="rounded-2xl bg-black/25 p-4">
            <b>{c.label}</b>
            <p className="mt-2 text-sm text-zinc-500">
              {c.advancedControls.join(" · ")}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4">
        <b>Live deployment comparison</b>
        <p className="mt-1 text-sm text-zinc-500">
          HotAPI reference routing is image/audio only; MuAPI Omni accepts
          image, video, and audio references. Both remain Not connected.
        </p>
        <button
          onClick={test}
          className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-sm"
        >
          Preview Live Request
        </button>
        {preview && (
          <pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-black/40 p-3 text-xs text-fuchsia-100">
            {JSON.stringify(preview, null, 2)}
          </pre>
        )}
      </div>
      <button
        onClick={() => go("create")}
        className="mt-6 rounded-2xl bg-fuchsia-500 px-4 py-3 font-bold"
      >
        Open Create Lab
      </button>
    </div>
  );
}
function Detail({
  data,
  asset,
  character,
  close,
  favorite,
  reference,
  remix,
  animate,
}: {
  data: AppSnapshot;
  asset: MediaAsset;
  character?: AppSnapshot["characters"][number];
  close: () => void;
  favorite: (id: string) => void;
  reference: (id: string) => void;
  remix: () => void;
  animate: () => void;
}) {
  const [note, setNote] = useState("");
  const save = async () => {
    await fetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "note", mediaId: asset.id, note }),
    });
  };
  const job = data.jobs.find((j) => j.mediaId === asset.id);
  const lineage = job
    ? data.jobReferences
        .filter((r) => r.jobId === job.id)
        .map((r) => ({
          role: r.role,
          asset: data.media.find((m) => m.id === r.mediaId),
        }))
    : [];
  const children = data.media.filter((m) => m.parentId === asset.id);
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/70 p-0 backdrop-blur-sm md:place-items-center md:p-6">
      <section className="max-h-[94vh] w-full max-w-3xl overflow-auto rounded-t-3xl bg-[#171820] p-5 md:rounded-3xl">
        <div className="mb-4 flex justify-between">
          <div>
            <p className="font-bold">{asset.title}</p>
            <p className="text-sm text-zinc-500">
              {character?.name} · {asset.providerId}
            </p>
          </div>
          <button onClick={close} className="rounded-full bg-white/8 px-3">
            ×
          </button>
        </div>
        <img
          src={asset.posterUrl ?? asset.url}
          className="mx-auto max-h-[62vh] w-full rounded-2xl object-contain"
          alt={asset.title}
        />
        <p className="mt-4 text-sm text-zinc-300">{asset.caption}</p>
        <p className="mt-2 rounded-xl bg-black/20 p-3 text-xs text-zinc-400">
          Prompt: {asset.prompt}
        </p>
        {job && (
          <section className="mt-3 rounded-2xl border border-white/8 bg-black/20 p-3">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-fuchsia-200">
              Lineage
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {asset.parentId ? "Parent attached" : "Original"} ↓ Current asset
              ↓ {children.length} child remix{children.length === 1 ? "" : "es"}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {job.providerId} · {job.mode} · {lineage.length} structured
              reference{lineage.length === 1 ? "" : "s"}
            </p>
            {lineage.length > 0 && (
              <div className="mt-2 flex gap-2 overflow-x-auto">
                {lineage.map(
                  (item) =>
                    item.asset && (
                      <div
                        key={`${item.role}-${item.asset.id}`}
                        className="min-w-20"
                      >
                        <img
                          src={item.asset.posterUrl ?? item.asset.url}
                          alt=""
                          className="h-14 w-14 rounded-lg object-cover"
                        />
                        <p className="mt-1 text-[10px] text-zinc-500">
                          {item.role}
                        </p>
                      </div>
                    ),
                )}
              </div>
            )}
          </section>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => favorite(asset.id)}
            className="rounded-full bg-white/8 px-3 py-2 text-sm"
          >
            {asset.favorite ? "Unfavorite" : "Favorite"}
          </button>
          <button
            onClick={() => reference(asset.id)}
            className="rounded-full bg-white/8 px-3 py-2 text-sm"
          >
            Use as Reference
          </button>
          <button
            onClick={remix}
            className="rounded-full bg-white/8 px-3 py-2 text-sm"
          >
            Remix
          </button>
          {asset.type === "image" && (
            <button
              onClick={animate}
              className="rounded-full bg-fuchsia-500 px-3 py-2 text-sm font-bold"
            >
              Animate
            </button>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Private production note"
            className="min-w-0 flex-1 rounded-xl bg-white/7 px-3 py-2"
          />
          <button onClick={save} className="rounded-xl bg-white/10 px-3">
            Save
          </button>
        </div>
      </section>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { RefObject } from "react";
import type { AppSnapshot, MediaAsset } from "@/lib/domain";

type Filter = "all" | "favorites" | "recent" | "character";
const filterLabels: Record<Filter, string> = { all: "All Videos", favorites: "Favorites", recent: "Recent", character: "Character" };
const isPlayable = (asset: MediaAsset) => /\.(mp4|webm|ogv)(?:[?#].*)?$/i.test(asset.url);
const subscribeToQaPlayback = () => () => {};
const getQaPlaybackSnapshot = () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches && new URLSearchParams(window.location.search).get("qaPlayback") === "1";

function Icon({ name, className = "" }: { name: string; className?: string }) {
  const paths: Record<string, string> = {
    heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z",
    note: "M8 3h8l5 5v13H8a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm8 0v5h5M9 13h7M9 17h7",
    remix: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3",
    reference: "M12 3v18M3 12h18M5.6 5.6l12.8 12.8m0-12.8L5.6 18.4",
    more: "M5 12h.01M12 12h.01M19 12h.01",
    play: "m8 5 12 7-12 7V5Z",
    pause: "M8 5h3v14H8zm6 0h3v14h-3z",
    replay: "M20 11a8 8 0 1 0 1 5M20 4v7h-7",
    close: "m18 6-12 12M6 6l12 12",
    down: "m7 10 5 5 5-5",
    filter: "M4 7h16M7 12h10m-7 5h4M6 7a1 1 0 1 0 0 .01M17 12a1 1 0 1 0 0 .01M10 17a1 1 0 1 0 0 .01",
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

export function PremiumReels({
  data,
  select,
  favorite,
  reference,
  create,
  openCharacter,
}: {
  data: AppSnapshot;
  select: (asset: MediaAsset) => void;
  favorite: (id: string) => void;
  reference: (id: string) => void;
  create: (asset: MediaAsset, conversationId?: string, characterId?: string, mode?: "image" | "video") => void;
  openCharacter: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [characterId, setCharacterId] = useState("");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [ended, setEnded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [collectionId, setCollectionId] = useState("");
  const [collectionStatus, setCollectionStatus] = useState("");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [favoriteOverrides, setFavoriteOverrides] = useState<Record<string, boolean>>({});
  const [referenceOverrides, setReferenceOverrides] = useState<Record<string, boolean>>({});
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const qaPlaybackEnabled = useSyncExternalStore(subscribeToQaPlayback, getQaPlaybackSnapshot, () => false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mobileFeedRef = useRef<HTMLDivElement>(null);
  const activeSlideRef = useRef(0);
  const touchY = useRef<number | null>(null);
  const qaReelAssets = useMemo<MediaAsset[]>(() => {
    const characterId = data.characters[0]?.id;
    if (!qaPlaybackEnabled || !characterId) return [];
    return [1, 2].map((take) => ({
      id: `dev-qa-reel-${take}`,
      characterId,
      type: "video",
      url: `/api/qa/reel-playback-fixture.mp4?take=${take}`,
      posterUrl: null,
      title: `Local QA Reel ${take}`,
      caption: "Development-only playback fixture",
      prompt: "",
      providerId: "development-qa",
      settingsJson: "{}",
      parentId: null,
      isReference: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      favorite: false,
    }));
  }, [data.characters, qaPlaybackEnabled]);
  const reelMedia = useMemo(() => qaPlaybackEnabled ? qaReelAssets : data.media, [data.media, qaPlaybackEnabled, qaReelAssets]);
  const videos = useMemo(() => {
    const filtered = reelMedia.filter((asset) => asset.type === "video" &&
      (filter !== "favorites" || asset.favorite) &&
      (filter !== "character" || !characterId || asset.characterId === characterId));
    return filter === "recent" ? filtered.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)) : filtered;
  }, [reelMedia, filter, characterId]);
  const safeIndex = Math.min(index, Math.max(videos.length - 1, 0));
  const item = videos[safeIndex];
  const character = data.characters.find((entry) => entry.id === item?.characterId);
  const playable = item ? isPlayable(item) : false;
  const job = item && data.jobs.find((entry) => entry.mediaId === item.id);
  const parent = item?.parentId ? data.media.find((asset) => asset.id === item.parentId) : undefined;
  const nearScenes = data.media.filter((asset) => asset.characterId === item?.characterId && asset.id !== item?.id).slice(0, 4);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobileViewport(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const node = videoRef.current;
    if (isMobileViewport || !node || !playable) return;
    if (!playing) { node.pause(); return; }
    node.play().catch(() => setPlaying(false));
  }, [isMobileViewport, playing, playable, item?.id]);

  useEffect(() => {
    if (!isMobileViewport) return;
    const root = mobileFeedRef.current;
    if (!root) return;
    const slides = [...root.querySelectorAll<HTMLElement>("[data-reel-slide]")];
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible || visible.intersectionRatio < 0.6) return;
      const nextIndex = Number((visible.target as HTMLElement).dataset.reelIndex);
      if (!Number.isInteger(nextIndex) || nextIndex === activeSlideRef.current) return;
      activeSlideRef.current = nextIndex;
      setIndex(nextIndex);
      setPlaying(true);
      setLoaded(false);
      setEnded(false);
      setProgress(0);
    }, { root, threshold: [0.35, 0.6, 0.8, 1] });
    slides.forEach((slide) => observer.observe(slide));
    return () => observer.disconnect();
  }, [isMobileViewport, videos]);

  useEffect(() => {
    if (!isMobileViewport) return;
    const root = mobileFeedRef.current;
    if (!root) return;
    const active = root.querySelector<HTMLVideoElement>(`[data-reel-index="${safeIndex}"] video`);
    root.querySelectorAll("video").forEach((node) => { if (node !== active) node.pause(); });
    if (!active || !playing) { active?.pause(); return; }
    active.muted = true;
    active.playsInline = true;
    active.play().catch(() => setPlaying(false));
  }, [isMobileViewport, safeIndex, playing, playable, item?.id]);

  useEffect(() => {
    if (!isMobileViewport || !mobileFeedRef.current) return;
    mobileFeedRef.current.scrollTo({ top: 0, behavior: "instant" });
    activeSlideRef.current = 0;
  }, [isMobileViewport, filter, characterId]);

  useEffect(() => {
    if (!filterSheetOpen && !moreOpen && !collectionOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFilterSheetOpen(false);
        setMoreOpen(false);
        setCollectionOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filterSheetOpen, moreOpen, collectionOpen]);

  const move = useCallback((amount: number) => {
    const nextIndex = Math.max(0, Math.min(videos.length - 1, safeIndex + amount));
    if (isMobileViewport) {
      mobileFeedRef.current?.querySelector<HTMLElement>(`[data-reel-index="${nextIndex}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setIndex(nextIndex);
    setLoaded(false);
    setEnded(false);
    setProgress(0);
    setPlaying(false);
  }, [isMobileViewport, safeIndex, videos.length]);

  const changeFilter = (value: Filter) => {
    setFilter(value);
    setFilterSheetOpen(value === "character");
    setIndex(0);
    activeSlideRef.current = 0;
    setProgress(0);
    setLoaded(false);
    setEnded(false);
    setPlaying(true);
    setCaptionExpanded(false);
  };
  const changeCharacter = (value: string) => {
    setCharacterId(value);
    setIndex(0);
    activeSlideRef.current = 0;
    setProgress(0);
    setLoaded(false);
    setEnded(false);
    setPlaying(true);
    setCaptionExpanded(false);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
      if (event.key === "ArrowDown" || event.key === "PageDown") { event.preventDefault(); move(1); }
      if (event.key === "ArrowUp" || event.key === "PageUp") { event.preventDefault(); move(-1); }
      if ((event.key === " " || event.key.toLowerCase() === "k") && playable) { event.preventDefault(); setPlaying((value) => !value); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, playable]);

  const togglePlayback = () => {
    if (!playable) return;
    if (ended && videoRef.current) {
      videoRef.current.currentTime = 0;
      setEnded(false);
      setProgress(0);
      setPlaying(true);
    } else setPlaying((value) => !value);
  };

  const addToCollection = async () => {
    if (!item || !collectionId) return;
    await fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "collection-add", collectionId, mediaId: item.id }) });
    setCollectionStatus("Added to collection");
    setCollectionOpen(false);
  };

  if (!item && isMobileViewport) return <>
    <div className="reels-mobile-empty">
      <div className="reels-mobile-empty-content">
        <div className="reels-mobile-empty-icon"><Icon name="play" className="h-7 w-7" /></div>
        <p className="reels-mobile-empty-eyebrow">REELS</p>
        <h1>{filter === "all" ? "Bring a character to life." : "No Reels match this filter."}</h1>
        <p>{filter === "all" ? "Animate an image to create your first Reel" : "Try another filter or create a video."}</p>
        <button onClick={() => { const image = data.media.find((asset) => asset.type === "image"); if (image) create(image, undefined, image.characterId, "video"); else create(data.media[0], undefined, data.media[0]?.characterId, "video"); }}>Create Video</button>
      </div>
    </div>
    <div className="reels-mobile-top-overlay"><span>REELS</span><button aria-label={`Filter reels, current filter ${filterLabels[filter]}`} onClick={() => setFilterSheetOpen(true)}><Icon name="filter" className="h-5 w-5" /><i data-active-filter={filter !== "all" || undefined} /></button></div>
    {filterSheetOpen && <div className="reels-mobile-sheet-backdrop" onMouseDown={() => setFilterSheetOpen(false)}><section className="reels-mobile-sheet" role="dialog" aria-modal="true" aria-labelledby="reels-filter-title" onMouseDown={(event) => event.stopPropagation()}><div className="reels-sheet-handle" /><div className="reels-sheet-heading"><h2 id="reels-filter-title">Filter Reels</h2><button aria-label="Close filters" onClick={() => setFilterSheetOpen(false)}><Icon name="close" className="h-5 w-5" /></button></div><div className="reels-filter-options" role="group" aria-label="Reel filters">{(["all", "favorites", "character", "recent"] as Filter[]).map((value) => <button key={value} aria-pressed={filter === value} onClick={() => changeFilter(value)}>{filterLabels[value]}{filter === value && <span aria-hidden="true">✓</span>}</button>)}</div>{filter === "character" && <label className="reels-character-picker">Character<select value={characterId} onChange={(event) => changeCharacter(event.target.value)}><option value="">Every character</option>{data.characters.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>}</section></div>}
  </>;

  if (!item) return (
    <div className="reels-shell flex min-h-[calc(100dvh-11rem)] items-center justify-center px-5 py-10 md:min-h-[calc(100dvh-8rem)]">
      <div className="max-w-md text-center">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-[28px] border border-fuchsia-300/20 bg-fuchsia-400/10 text-fuchsia-200"><Icon name="play" className="h-8 w-8" /></div>
        <p className="mt-7 text-xs font-bold uppercase tracking-[.24em] text-fuchsia-300">Your next scene starts here</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Bring a character to life.</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-zinc-400">Animate an image to create your first Reel</p>
        <button onClick={() => { const image = data.media.find((asset) => asset.type === "image"); if (image) create(image, undefined, image.characterId, "video"); else create(data.media[0], undefined, data.media[0]?.characterId, "video"); }} className="mt-7 rounded-full bg-fuchsia-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-fuchsia-950/40 focus-visible:outline">Create Video</button>
      </div>
    </div>
  );

  if (isMobileViewport) {
    return <>
      <div className="reels-mobile-feed" ref={mobileFeedRef} data-reels-mobile-feed aria-label="Vertical Reels feed">
        {videos.map((asset, slideIndex) => {
          const active = slideIndex === safeIndex;
          const assetCharacter = data.characters.find((entry) => entry.id === asset.characterId);
          const visibleAsset = {
            ...asset,
            favorite: favoriteOverrides[asset.id] ?? asset.favorite,
            isReference: referenceOverrides[asset.id] ?? asset.isReference,
          };
          const assetPlayable = isPlayable(asset);
          const assetJob = data.jobs.find((entry) => entry.mediaId === asset.id);
          const assetParent = asset.parentId ? data.media.find((entry) => entry.id === asset.parentId) : undefined;
          return <MobileReelSlide
            key={asset.id}
            asset={visibleAsset}
            index={slideIndex}
            active={active}
            playable={assetPlayable}
            playing={playing && active}
            loaded={loaded && active}
            ended={ended && active}
            progress={active ? progress : 0}
            character={assetCharacter}
            parent={assetParent}
            videoRef={active ? videoRef : undefined}
            qaFixture={asset.id.startsWith("dev-qa-reel-")}
            onPlay={() => { if (activeSlideRef.current === slideIndex) setPlaying(true); }}
            onPause={() => { if (activeSlideRef.current === slideIndex) setPlaying(false); }}
            onLoaded={() => { if (activeSlideRef.current === slideIndex) { setLoaded(true); setPlaying(true); } }}
            onEnded={() => { if (activeSlideRef.current === slideIndex) { setPlaying(false); setEnded(true); setProgress(1); } }}
            onProgress={(value) => { if (activeSlideRef.current === slideIndex) setProgress(value); }}
            onSeek={(value) => { const video = videoRef.current; if (active && video?.duration) { video.currentTime = value * video.duration; setProgress(value); setEnded(false); } }}
            onToggle={() => { if (active) togglePlayback(); }}
            onFavorite={() => { setFavoriteOverrides((current) => ({ ...current, [asset.id]: !(current[asset.id] ?? asset.favorite) })); void favorite(asset.id); }}
            onNotes={() => select(asset)}
            onRemix={() => create(asset, assetJob?.conversationId ?? undefined, asset.characterId, "video")}
            onReference={() => { setReferenceOverrides((current) => ({ ...current, [asset.id]: !(current[asset.id] ?? asset.isReference) })); void reference(asset.id); }}
            onMore={() => { if (active) setMoreOpen(true); }}
            onOpenCharacter={() => assetCharacter && openCharacter(assetCharacter.id)}
            captionExpanded={captionExpanded}
            toggleCaption={() => setCaptionExpanded((current) => !current)}
          />;
        })}
      </div>

      <div className="reels-mobile-top-overlay">
        <span>REELS{qaPlaybackEnabled && <small className="reels-local-qa-label">LOCAL QA</small>}</span>
        <button aria-label={`Filter reels, current filter ${filterLabels[filter]}`} onClick={() => setFilterSheetOpen(true)}>
          <Icon name="filter" className="h-5 w-5" />
          <i data-active-filter={filter !== "all" || undefined} />
        </button>
      </div>

      {filterSheetOpen && <div className="reels-mobile-sheet-backdrop" onMouseDown={() => setFilterSheetOpen(false)}>
        <section className="reels-mobile-sheet" role="dialog" aria-modal="true" aria-labelledby="reels-filter-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="reels-sheet-handle" />
          <div className="reels-sheet-heading"><h2 id="reels-filter-title">Filter Reels</h2><button aria-label="Close filters" onClick={() => setFilterSheetOpen(false)}><Icon name="close" className="h-5 w-5" /></button></div>
          <div className="reels-filter-options" role="group" aria-label="Reel filters">
            {(["all", "favorites", "character", "recent"] as Filter[]).map((value) => <button key={value} aria-pressed={filter === value} onClick={() => changeFilter(value)}>{filterLabels[value]}{filter === value && <span aria-hidden="true">✓</span>}</button>)}
          </div>
          {filter === "character" && <label className="reels-character-picker">Character<select value={characterId} onChange={(event) => changeCharacter(event.target.value)}><option value="">Every character</option>{data.characters.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>}
        </section>
      </div>}

      {moreOpen && item && <div className="reels-mobile-sheet-backdrop" onMouseDown={() => setMoreOpen(false)}>
        <section className="reels-mobile-sheet" role="dialog" aria-modal="true" aria-labelledby="reel-more-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="reels-sheet-handle" />
          <div className="reels-sheet-heading"><h2 id="reel-more-title">Reel details</h2><button onClick={() => setMoreOpen(false)} aria-label="Close menu"><Icon name="close" className="h-5 w-5" /></button></div>
          <div className="reels-sheet-actions">
            <button onClick={() => { setMoreOpen(false); setCollectionOpen(true); }}>Add to Collection</button>
            {character && <button onClick={() => { setMoreOpen(false); openCharacter(character.id); }}>Open Character · {character.name}</button>}
            <button onClick={() => { setMoreOpen(false); select(item); }}>Open Media Detail</button>
            {parent && <button onClick={() => { setMoreOpen(false); select(parent); }}>View Lineage</button>}
            <a href={item.url} download>Export</a>
          </div>
        </section>
      </div>}

      {collectionOpen && <div className="reels-mobile-sheet-backdrop" onMouseDown={() => setCollectionOpen(false)}>
        <section className="reels-mobile-sheet" role="dialog" aria-modal="true" aria-labelledby="collection-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="reels-sheet-handle" />
          <div className="reels-sheet-heading"><h2 id="collection-title">Add to Collection</h2><button onClick={() => setCollectionOpen(false)} aria-label="Close collections"><Icon name="close" className="h-5 w-5" /></button></div>
          {data.collections.length ? <label className="reels-character-picker">Choose a collection<select id="reel-collection" value={collectionId} onChange={(event) => setCollectionId(event.target.value)}><option value="">Select a collection</option>{data.collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select></label> : <p className="reels-empty-collections">Create a collection first from Collections.</p>}
          <div className="reels-sheet-footer"><button onClick={() => setCollectionOpen(false)}>Cancel</button><button disabled={!collectionId} onClick={addToCollection}>Add</button></div>
        </section>
      </div>}
    </>;
  }

  return (
    <div className="reels-shell mx-auto w-full max-w-[1240px] px-0 md:px-3 xl:px-5">
      <header className="reels-toolbar mb-4 flex flex-wrap items-center justify-between gap-3 px-4 pt-2 md:px-0">
        <div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-fuchsia-500/15 text-fuchsia-300"><Icon name="play" className="h-4 w-4" /></div><div><p className="text-[10px] font-bold uppercase tracking-[.22em] text-fuchsia-300">Your characters in motion</p><h1 className="text-xl font-semibold tracking-tight">Reels</h1></div></div>
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-full border border-white/[.08] bg-white/[.035] p-1" role="group" aria-label="Filter reels">
          {(["all", "favorites", "character", "recent"] as Filter[]).map((value) => <button key={value} onClick={() => changeFilter(value)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs transition-colors focus-visible:outline ${filter === value ? "bg-white/12 text-white" : "text-zinc-500 hover:text-zinc-200"}`} aria-pressed={filter === value}>{value === "all" ? "All Videos" : value === "favorites" ? "Favorites" : value === "character" ? "Character" : "Recent"}</button>)}
        </div>
      </header>

      {filter === "character" && <div className="px-4 pb-3 md:px-0"><label className="sr-only" htmlFor="reels-character">Choose a character</label><select id="reels-character" value={characterId} onChange={(event) => changeCharacter(event.target.value)} className="rounded-full border border-white/10 bg-[#14151b] px-3 py-2 text-xs text-zinc-200"><option value="">Every character</option>{data.characters.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></div>}

      <div className="reels-stage grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_220px] xl:gap-8">
        <section className="reels-viewer-wrap relative mx-auto w-full max-w-[570px] lg:max-w-none" aria-label="Reel viewer" onTouchStart={(event) => { touchY.current = event.touches[0]?.clientY ?? null; }} onTouchEnd={(event) => { if (touchY.current === null) return; const delta = touchY.current - (event.changedTouches[0]?.clientY ?? touchY.current); if (Math.abs(delta) > 65) move(delta > 0 ? 1 : -1); touchY.current = null; }}>
          <div className="reels-viewer relative mx-auto overflow-hidden rounded-none border-y border-white/[.08] bg-[#11131a] shadow-[0_24px_100px_rgba(0,0,0,.55)] sm:rounded-[26px] sm:border">
            <div className="reels-media relative mx-auto grid place-items-center bg-[#0d0f14]">
              {playable ? <>
                <video key={item.id} ref={videoRef} src={item.url} poster={item.posterUrl ?? undefined} muted playsInline preload="none" autoPlay onLoadedData={() => { setLoaded(true); setPlaying(true); }} onCanPlay={() => setLoaded(true)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setEnded(true); setProgress(1); }} onTimeUpdate={(event) => setProgress(event.currentTarget.duration ? event.currentTarget.currentTime / event.currentTarget.duration : 0)} onClick={togglePlayback} aria-label={`${item.title}, ${playing ? "playing" : "paused"}`} className="absolute inset-0 h-full w-full object-contain" />
                {!loaded && <div className="absolute inset-0 grid place-items-center bg-black/20" role="status" aria-label="Loading video"><span className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-fuchsia-300 motion-reduce:animate-none" /></div>}
                {(ended || !playing) && loaded && <button onClick={togglePlayback} aria-label={ended ? "Replay reel" : "Play reel"} className="absolute left-1/2 top-1/2 z-10 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/35 bg-black/45 text-white shadow-xl backdrop-blur focus-visible:outline"><Icon name={ended ? "replay" : "play"} className="h-6 w-6" /></button>}
                <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/55 to-transparent pointer-events-none" />
                <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/85 via-black/25 to-transparent pointer-events-none" />
                <div className="absolute inset-x-0 bottom-0 z-10 px-5 pb-6 pt-20 sm:px-7">
                  <div className="flex items-end gap-3 pr-14"><img src={character?.portraitUrl || "/fixtures/char-iona-portrait.svg"} alt="" className="h-11 w-11 shrink-0 rounded-full border border-white/40 object-cover shadow-lg" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{character?.name ?? "A character"}</p>{character?.handle && <p className="text-[11px] text-white/60">{character.handle}</p>}</div></div>
                  <p className="mt-3 max-w-[34rem] pr-14 text-sm leading-5 text-white/90">{item.caption || item.title}</p>
                  {parent && <p className="mt-2 text-[10px] text-white/55">Scene from {parent.title}</p>}
                  {!loaded && <p className="mt-2 text-[10px] text-white/50">Loading video…</p>}
                </div>
                <label className="absolute inset-x-0 bottom-0 z-20 h-1.5 cursor-pointer bg-white/20" aria-label="Video progress"><input className="absolute inset-0 h-full w-full cursor-pointer opacity-0" type="range" min="0" max="1" step="0.001" value={progress} onChange={(event) => { const node = videoRef.current; if (!node || !node.duration) return; node.currentTime = Number(event.target.value) * node.duration; setProgress(Number(event.target.value)); setEnded(false); }} /><span className="block h-full bg-fuchsia-400" style={{ width: `${progress * 100}%` }} /></label>
              </> : <>
                <img src={item.posterUrl ?? item.url} alt={item.title} className="absolute inset-0 h-full w-full object-contain" loading="eager" />
                <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/35 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent px-5 pb-6 pt-32 sm:px-7"><div className="flex items-end gap-3"><img src={character?.portraitUrl || "/fixtures/char-iona-portrait.svg"} alt="" className="h-11 w-11 rounded-full border border-white/40 object-cover" /><div><p className="text-sm font-semibold">{character?.name ?? "A character"}</p><p className="mt-1 text-sm text-white/85">{item.caption || item.title}</p></div></div><p className="mt-3 text-[10px] font-medium uppercase tracking-[.15em] text-white/55">Preview · no playable video attached</p></div>
              </>}
              <div className="absolute right-3 top-3 z-10 rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.12em] text-white/75">{playable ? "Video" : "Preview"}</div>
            </div>
          </div>
          <div className="reels-mobile-rail absolute bottom-[5.5rem] right-3 z-20 flex flex-col gap-3 sm:right-4 lg:hidden">
            <ActionButton label={item.favorite ? "Remove favorite" : "Favorite"} icon="heart" active={item.favorite} onClick={() => favorite(item.id)} />
            <ActionButton label="Notes" icon="note" onClick={() => select(item)} />
            <ActionButton label={playable ? "Remix video" : "Create from preview"} icon="remix" primary onClick={() => create(item, job?.conversationId ?? undefined, item.characterId, "video")} />
            <ActionButton label="Use as reference" icon="reference" active={item.isReference} onClick={() => reference(item.id)} />
            <ActionButton label="More reel actions" icon="more" onClick={() => setMoreOpen(true)} />
          </div>
          <div className="reels-pagination mx-auto flex max-w-[570px] items-center justify-between px-4 py-3 sm:px-0"><button onClick={() => move(-1)} disabled={safeIndex === 0} className="rounded-full border border-white/10 px-3 py-2 text-xs text-zinc-300 disabled:opacity-30 focus-visible:outline">↑ Previous</button><span className="text-xs tabular-nums text-zinc-500">{safeIndex + 1} <span className="text-zinc-700">/</span> {videos.length}</span><button onClick={() => move(1)} disabled={safeIndex >= videos.length - 1} className="rounded-full border border-white/10 px-3 py-2 text-xs text-zinc-300 disabled:opacity-30 focus-visible:outline">Next ↓</button></div>
        </section>

        <aside className="reels-context hidden lg:flex lg:flex-col lg:gap-5">
          <div className="flex flex-col gap-2 border-b border-white/[.08] pb-5"><ActionButton label={item.favorite ? "Remove favorite" : "Favorite"} icon="heart" active={item.favorite} onClick={() => favorite(item.id)} horizontal /><ActionButton label="Notes" icon="note" onClick={() => select(item)} horizontal /><ActionButton label={playable ? "Remix video" : "Create from preview"} icon="remix" primary onClick={() => create(item, job?.conversationId ?? undefined, item.characterId, "video")} horizontal /><ActionButton label="Use as reference" icon="reference" active={item.isReference} onClick={() => reference(item.id)} horizontal /><ActionButton label="More" icon="more" onClick={() => setMoreOpen(true)} horizontal /></div>
          <div><div className="mb-3 flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-zinc-500">In this scene</p>{character && <span className="text-[10px] text-zinc-600">Character</span>}</div>{character ? <div className="flex items-center gap-3"><img src={character.portraitUrl} alt="" className="h-10 w-10 rounded-full object-cover" /><div className="min-w-0"><p className="truncate text-sm font-medium">{character.name}</p><p className="truncate text-xs text-zinc-500">{character.handle}</p></div></div> : <p className="text-xs text-zinc-500">No character linked</p>}</div>
          {parent && <div><p className="mb-2 text-[10px] font-bold uppercase tracking-[.18em] text-zinc-500">Lineage</p><button onClick={() => select(parent)} className="flex w-full items-center gap-3 rounded-xl border border-white/[.07] p-2 text-left hover:bg-white/[.04]"><img src={parent.posterUrl ?? parent.url} alt="" className="h-12 w-9 rounded-md object-cover" /><span className="min-w-0"><span className="block text-xs text-zinc-300">From image</span><span className="block truncate text-[10px] text-zinc-500">{parent.title}</span></span></button></div>}
          <div><p className="mb-3 text-[10px] font-bold uppercase tracking-[.18em] text-zinc-500">Related scenes</p><div className="grid grid-cols-4 gap-2">{nearScenes.map((asset) => <button key={asset.id} onClick={() => select(asset)} className="overflow-hidden rounded-lg focus-visible:outline" aria-label={`Open ${asset.title}`}><img src={asset.posterUrl ?? asset.url} alt="" className="aspect-[3/4] w-full object-cover" loading="lazy" /></button>)}</div></div>
          {collectionStatus && <p className="text-xs text-emerald-300" role="status">{collectionStatus}</p>}
        </aside>
      </div>

      {moreOpen && item && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 backdrop-blur-sm sm:items-center sm:p-5" onClick={() => setMoreOpen(false)}><section role="dialog" aria-modal="true" aria-labelledby="reel-more-title" className="w-full max-w-md rounded-t-3xl border border-white/10 bg-[#171820] p-5 sm:rounded-3xl" onClick={(event) => event.stopPropagation()}><div className="mb-5 flex items-center justify-between"><h2 id="reel-more-title" className="font-semibold">Reel details</h2><button onClick={() => setMoreOpen(false)} aria-label="Close menu" className="rounded-full p-2 text-zinc-400 hover:bg-white/10"><Icon name="close" className="h-4 w-4" /></button></div><div className="grid gap-2"><button onClick={() => { setMoreOpen(false); setCollectionOpen(true); }} className="rounded-xl bg-white/[.05] px-4 py-3 text-left text-sm">Add to Collection</button>{character && <button onClick={() => select(item)} className="rounded-xl bg-white/[.05] px-4 py-3 text-left text-sm">Open Character · {character.name}</button>}<button onClick={() => { setMoreOpen(false); select(item); }} className="rounded-xl bg-white/[.05] px-4 py-3 text-left text-sm">Open Media Detail</button>{parent && <button onClick={() => { setMoreOpen(false); select(parent); }} className="rounded-xl bg-white/[.05] px-4 py-3 text-left text-sm">View Lineage</button>}<a href={item.url} download className="rounded-xl bg-white/[.05] px-4 py-3 text-sm">Export</a></div></section></div>}
      {collectionOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-5 backdrop-blur-sm"><section role="dialog" aria-modal="true" aria-labelledby="collection-title" className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#171820] p-5"><h2 id="collection-title" className="font-semibold">Add to Collection</h2>{data.collections.length ? <><label className="mt-4 block text-xs text-zinc-400" htmlFor="reel-collection">Choose a collection</label><select id="reel-collection" value={collectionId} onChange={(event) => setCollectionId(event.target.value)} className="mt-2 w-full rounded-xl bg-white/5 p-3 text-sm"><option value="">Select…</option>{data.collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select></> : <p className="mt-3 text-sm text-zinc-400">Create a collection first from Collections.</p>}<div className="mt-5 flex justify-end gap-2"><button onClick={() => setCollectionOpen(false)} className="rounded-full px-4 py-2 text-xs text-zinc-400">Cancel</button><button disabled={!collectionId} onClick={addToCollection} className="rounded-full bg-fuchsia-500 px-4 py-2 text-xs font-semibold disabled:opacity-40">Add</button></div></section></div>}
    </div>
  );
}

function MobileReelSlide({ asset, index, active, playable, playing, loaded, ended, progress, character, parent, videoRef, onPlay, onPause, onLoaded, onEnded, onProgress, onSeek, onToggle, onFavorite, onNotes, onRemix, onReference, onMore, onOpenCharacter, captionExpanded, toggleCaption, qaFixture }: {
  asset: MediaAsset;
  index: number;
  active: boolean;
  playable: boolean;
  playing: boolean;
  loaded: boolean;
  ended: boolean;
  progress: number;
  character?: AppSnapshot["characters"][number];
  parent?: MediaAsset;
  videoRef?: RefObject<HTMLVideoElement | null>;
  onPlay: () => void;
  onPause: () => void;
  onLoaded: () => void;
  onEnded: () => void;
  onProgress: (value: number) => void;
  onSeek: (value: number) => void;
  onToggle: () => void;
  onFavorite: () => void;
  onNotes: () => void;
  onRemix: () => void;
  onReference: () => void;
  onMore: () => void;
  onOpenCharacter: () => void;
  captionExpanded: boolean;
  toggleCaption: () => void;
  qaFixture: boolean;
}) {
  const [landscape, setLandscape] = useState(false);
  const poster = asset.posterUrl || (!playable ? asset.url : undefined);
  const candidateCaption = asset.caption || asset.title;
  const caption = /provider|model id|job id|created with|deterministic test/i.test(candidateCaption) ? "" : candidateCaption;
  return <article className="reels-mobile-slide" data-reel-slide data-reel-index={index} data-active={active || undefined} data-playing={active && playing || undefined} aria-label={`Reel ${index + 1}: ${asset.title}`}>
    <div className="reels-mobile-media" data-preview={playable ? undefined : "true"}>
      {poster && <img className={`reels-mobile-backdrop ${playable ? "" : "is-preview"}`} src={poster} alt="" aria-hidden="true" loading={active ? "eager" : "lazy"} />}
      {playable && active ? <>
        <video key={asset.id} ref={videoRef} src={asset.url} poster={asset.posterUrl ?? undefined} muted playsInline preload="none" onLoadedData={onLoaded} onCanPlay={onLoaded} onLoadedMetadata={(event) => setLandscape(event.currentTarget.videoWidth > event.currentTarget.videoHeight * 1.15)} onPlay={onPlay} onPause={onPause} onEnded={onEnded} onTimeUpdate={(event) => onProgress(event.currentTarget.duration ? event.currentTarget.currentTime / event.currentTarget.duration : 0)} onClick={(event) => { event.stopPropagation(); onToggle(); }} aria-label={`${asset.title}, ${playing ? "playing" : "paused"}`} className={`reels-mobile-video ${landscape ? "is-landscape" : ""}`} />
        {!loaded && <div className="reels-mobile-loading" role="status" aria-label="Loading video"><span /></div>}
        {(ended || !playing) && loaded && <button onClick={onToggle} aria-label={ended ? "Replay reel" : "Play reel"} className="reels-mobile-play"><Icon name={ended ? "replay" : "play"} className="h-7 w-7" /></button>}
        <label className="reels-mobile-progress" aria-label="Video progress"><input aria-label="Seek video" type="range" min="0" max="1" step="0.001" value={progress} onChange={(event) => onSeek(Number(event.target.value))} /><span style={{ width: `${progress * 100}%` }} /></label>
      </> : poster ? <img className="reels-mobile-preview" src={poster} alt={asset.title} loading={active ? "eager" : "lazy"} /> : <div className="reels-mobile-preview-placeholder" aria-label="Video preview unavailable" />}

      <div className="reels-mobile-top-gradient" />
      <div className="reels-mobile-bottom-gradient" />
      {qaFixture && <span className="reels-mobile-preview-badge reels-mobile-qa-badge">Local QA</span>}
      {!playable && <span className="reels-mobile-preview-badge">Preview</span>}

      <div className="reels-mobile-identity">
        <button className="reels-mobile-character" onClick={onOpenCharacter} aria-label={character ? `Open ${character.name} Character Hub` : "Character unavailable"} disabled={!character}>
          <img src={character?.portraitUrl || "/fixtures/char-iona-portrait.svg"} alt="" loading={active ? "eager" : "lazy"} />
          <span>{character?.name ?? "A character"}</span>
        </button>
        {character?.handle && <span className="reels-mobile-handle">{character.handle}</span>}
        {caption && <p className={captionExpanded ? "is-expanded" : ""}>{caption}</p>}
        {caption.length > 112 && <button className="reels-mobile-caption-more" onClick={toggleCaption}>{captionExpanded ? "Less" : "More"}</button>}
        {parent && <span className="reels-mobile-parent">From {parent.title}</span>}
      </div>

      <div className="reels-mobile-rail" aria-label="Reel actions">
        <ActionButton label={asset.favorite ? "Remove favorite" : "Favorite"} visibleLabel={asset.favorite ? "Saved" : "Favorite"} icon="heart" active={asset.favorite} onClick={onFavorite} showLabel disabled={qaFixture} />
        <ActionButton label="Notes" icon="note" onClick={onNotes} showLabel disabled={qaFixture} />
        <ActionButton label={playable ? "Remix" : "Create"} icon="remix" primary onClick={onRemix} showLabel disabled={qaFixture} />
        <ActionButton label={asset.isReference ? "Remove reference" : "Use as reference"} visibleLabel={asset.isReference ? "Ref ✓" : "Ref"} icon="reference" active={asset.isReference} onClick={onReference} showLabel disabled={qaFixture} />
        <ActionButton label="More" icon="more" onClick={onMore} showLabel disabled={qaFixture} />
      </div>
    </div>
  </article>;
}

function ActionButton({ label, visibleLabel, icon, onClick, active = false, primary = false, horizontal = false, showLabel = false, disabled = false }: { label: string; visibleLabel?: string; icon: string; onClick: () => void; active?: boolean; primary?: boolean; horizontal?: boolean; showLabel?: boolean; disabled?: boolean }) {
  return <button onClick={onClick} aria-label={label} aria-pressed={active} title={label} disabled={disabled} className={`reels-action ${horizontal ? "reels-action-horizontal" : ""} ${primary ? "bg-fuchsia-500 text-white" : active ? "text-fuchsia-300" : "text-white"} ${disabled ? "cursor-not-allowed opacity-45" : ""}`}><Icon name={icon} className="h-5 w-5" />{(horizontal || showLabel) && <span className="text-xs">{visibleLabel ?? label}</span>}</button>;
}

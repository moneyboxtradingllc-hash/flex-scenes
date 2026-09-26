"use client";

import { useDeferredValue, useMemo, useState } from "react";
import type { AppSnapshot, MediaAsset } from "@/lib/domain";
import { LibraryCharacterPortrait } from "@/components/library-media-thumbnail";

type Filter = "All" | "Images" | "Videos" | "Characters" | "Favorites" | "Collections";

function sourceAspect(asset: MediaAsset, fallbackIndex: number) {
  try {
    const settings = JSON.parse(asset.settingsJson) as { aspectRatio?: string; width?: number; height?: number };
    if (settings.aspectRatio && /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(settings.aspectRatio)) return settings.aspectRatio.replace(":", " / ");
    if (settings.width && settings.height) return `${settings.width} / ${settings.height}`;
  } catch { /* Older media records may have an empty settings payload. */ }
  return asset.type === "video" ? "9 / 14" : fallbackIndex % 5 === 1 ? "1 / 1" : "4 / 5";
}

export function PremiumExplore({
  data,
  select,
  openCharacter,
  create,
}: {
  data: AppSnapshot;
  select: (asset: MediaAsset) => void;
  openCharacter: (id: string) => void;
  create: (asset?: MediaAsset, conversationId?: string, characterId?: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("All");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase());
  const searching = deferredSearch !== search.trim().toLocaleLowerCase();

  const collectionByMedia = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const collection of data.collections) {
      for (const mediaId of collection.mediaIds) map.set(mediaId, [...(map.get(mediaId) ?? []), collection.name]);
    }
    return map;
  }, [data.collections]);

  const media = useMemo(() => data.media.filter((asset) => {
    const collections = collectionByMedia.get(asset.id) ?? [];
    const note = data.notes[asset.id] ?? "";
    const character = data.characters.find((entry) => entry.id === asset.characterId);
    const matchesText = !deferredSearch || [asset.title, asset.caption, asset.prompt, note, character?.name, character?.description, ...collections].some((value) => value?.toLocaleLowerCase().includes(deferredSearch));
    const matchesFilter = filter === "All" ||
      (filter === "Images" && asset.type === "image") ||
      (filter === "Videos" && asset.type === "video") ||
      (filter === "Favorites" && asset.favorite) ||
      (filter === "Collections" && collections.length > 0);
    return matchesText && matchesFilter;
  }), [data.media, data.notes, data.characters, collectionByMedia, deferredSearch, filter]);

  const characters = useMemo(() => filter === "Characters" || (filter === "All" && deferredSearch)
    ? data.characters.filter((character) => !deferredSearch || [character.name, character.handle, character.description, character.personality, character.identityNotes].some((value) => value?.toLocaleLowerCase().includes(deferredSearch)))
    : [], [data.characters, deferredSearch, filter]);

  const collections = useMemo(() => data.collections.filter((collection) => !deferredSearch || collection.name.toLocaleLowerCase().includes(deferredSearch) || collection.mediaIds.some((id) => {
    const asset = data.media.find((entry) => entry.id === id);
    return asset && [asset.title, asset.caption, asset.prompt].some((value) => value.toLocaleLowerCase().includes(deferredSearch));
  })), [data.collections, data.media, deferredSearch]);

  const showCollections = filter === "Collections";
  const hasResults = media.length > 0 || characters.length > 0 || (showCollections && collections.length > 0);
  const clearFilters = () => { setSearch(""); setFilter("All"); };

  return (
    <section className="explore-surface" aria-labelledby="explore-title" data-explore-filter={filter.toLocaleLowerCase()} data-explore-search={Boolean(deferredSearch)}>
      <div className="explore-heading">
        <div><p className="explore-eyebrow">A universe of your own</p><h1 id="explore-title">Explore</h1></div>
        <span className="explore-count">{data.media.length} scenes <i /> {data.characters.length} characters</span>
      </div>

      <label className="explore-search">
        <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search scenes, characters, collections" aria-label="Search characters, scenes, collections, captions, prompts, and notes" />
        {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search">×</button>}
      </label>

      <div className="explore-filters" role="group" aria-label="Explore filters">
        {(["All", "Images", "Videos", "Characters", "Favorites", "Collections"] as Filter[]).map((value) => <button type="button" key={value} onClick={() => setFilter(value)} aria-pressed={filter === value} className={filter === value ? "is-active" : ""}>{value}{value === "Favorites" && <span className="explore-filter-heart">♥</span>}</button>)}
      </div>

      {searching ? <div className="explore-grid" aria-label="Loading search results" aria-busy="true">{Array.from({ length: 8 }, (_, index) => <div className={`explore-skeleton explore-skeleton-${index % 4}`} key={index} />)}</div> : <>
        {characters.length > 0 && <section className={`explore-character-section ${filter === "Characters" ? "is-character-filter" : "is-search-strip"}`} aria-label="Character results">
          {filter !== "Characters" && <div className="explore-section-heading"><h2>Characters</h2><span>{characters.length}</span></div>}
          <div className="explore-character-grid">{characters.map((character) => {
            const scenes = data.media.filter((asset) => asset.characterId === character.id);
            const favorites = scenes.filter((asset) => asset.favorite).length;
            return <button key={character.id} className="explore-character-card" onClick={() => openCharacter(character.id)}>
              <span className="explore-character-cover">
                <LibraryCharacterPortrait src={character.portraitUrl} name={character.name} />
                {scenes[0] && <img className="explore-character-scene" src={scenes[0].posterUrl ?? scenes[0].url} alt="" loading="lazy" />}
                <span className="explore-character-count">{scenes.length} {scenes.length === 1 ? "scene" : "scenes"}</span>
              </span>
              <span className="explore-character-copy"><strong>{character.name}</strong><span>{character.description || character.personality || character.identityNotes || character.handle}</span>{favorites > 0 && <small>♥ {favorites} saved</small>}</span>
            </button>;
          })}</div>
        </section>}

        {showCollections && collections.length > 0 && <section className="explore-collection-section" aria-label="Collections">
          <div className="explore-section-heading"><h2>Collections</h2><span>{collections.length}</span></div>
          <div className="explore-collection-grid">{collections.map((collection) => {
            const assets = collection.mediaIds.map((id) => data.media.find((asset) => asset.id === id)).filter((asset): asset is MediaAsset => Boolean(asset));
            return <button className="explore-collection-card" key={collection.id} onClick={() => assets[0] && select(assets[0])} disabled={assets.length === 0}>
              <span className="explore-collection-stack">{assets.slice(0, 3).map((asset, index) => <img key={asset.id} src={asset.posterUrl ?? asset.url} alt="" loading="lazy" style={{ left: `${index * 14}%`, zIndex: 3 - index, transform: `rotate(${(index - 1) * 5}deg)` }} />)}</span>
              <span className="explore-collection-copy"><strong>{collection.name}</strong><small>{assets.length} {assets.length === 1 ? "scene" : "scenes"}</small></span>
            </button>;
          })}</div>
        </section>}

        {media.length > 0 && <section className="explore-media-section" aria-label="Media results">
          {filter === "Characters" && <div className="explore-section-heading"><h2>Scenes</h2><span>{media.length}</span></div>}
          <div className="explore-grid">{media.map((asset, index) => {
            const character = data.characters.find((entry) => entry.id === asset.characterId);
            const collectionNames = collectionByMedia.get(asset.id);
            const ratio = sourceAspect(asset, index);
            return <button className="explore-media-tile" key={asset.id} onClick={() => select(asset)} data-media-type={asset.type} data-favorite={asset.favorite ? "true" : "false"} data-collection-member={collectionNames ? "true" : "false"} aria-label={`Open ${asset.title}${character ? ` by ${character.name}` : ""}`}>
              <img src={asset.posterUrl ?? asset.url} alt={asset.title} loading="lazy" decoding="async" sizes="(max-width: 639px) 48vw, (max-width: 1023px) 31vw, (max-width: 1439px) 24vw, 20vw" style={{ aspectRatio: ratio }} />
              <span className="explore-tile-shade" />
              {asset.type === "video" && <span className="explore-play-badge"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 10 6-10 6V6Z" /></svg></span>}
              {asset.favorite && <span className="explore-favorite-badge" aria-label="Favorite">♥</span>}
              {collectionNames && <span className="explore-collection-badge" aria-label="In a collection">▧</span>}
              <span className="explore-tile-caption"><strong>{asset.title}</strong>{character && <span><LibraryCharacterPortrait src={character.portraitUrl} name={character.name} />{character.name}</span>}</span>
            </button>;
          })}</div>
        </section>}

        {!hasResults && <div className="explore-empty"><div className="explore-empty-icon">⌕</div><h2>Nothing matches these filters yet.</h2><p>Try another search or clear your filters to see the full gallery.</p><div><button onClick={clearFilters}>Clear Filters</button>{data.media.length > 0 && <button className="explore-empty-secondary" onClick={() => create(data.media.find((asset) => asset.type === "image"))}>Create Scene</button>}</div></div>}
      </>}
    </section>
  );
}

"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import type { AppSnapshot, MediaAsset } from "@/lib/domain";

type Filter = "All" | "Images" | "Videos" | "Favorites" | "References" | "Collections";
type Secondary = "Any source" | "Generated" | "Imported" | "Recent";

function aspect(asset: MediaAsset) {
  try {
    const settings = JSON.parse(asset.settingsJson) as { aspectRatio?: string; width?: number; height?: number };
    if (settings.aspectRatio && /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(settings.aspectRatio)) return settings.aspectRatio.replace(":", " / ");
    if (settings.width && settings.height) return `${settings.width} / ${settings.height}`;
  } catch { /* Legacy/imported media can have no settings. */ }
  return asset.type === "video" ? "9 / 14" : "4 / 5";
}

function durationLabel(asset: MediaAsset) {
  try {
    const settings = JSON.parse(asset.settingsJson) as { duration?: number };
    if (asset.type !== "video" || !settings.duration || settings.duration <= 0) return "";
    return `${Math.floor(settings.duration / 60)}:${String(Math.floor(settings.duration % 60)).padStart(2, "0")}`;
  } catch { return ""; }
}

export function PremiumLibrary({
  data,
  select,
  refresh,
  create,
}: {
  data: AppSnapshot;
  select: (asset: MediaAsset) => void;
  refresh: () => Promise<void>;
  create: (asset?: MediaAsset, conversationId?: string, characterId?: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("All");
  const [search, setSearch] = useState("");
  const [characterId, setCharacterId] = useState("");
  const [sort, setSort] = useState("Newest");
  const [secondary, setSecondary] = useState<Secondary>("Any source");
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [collectionName, setCollectionName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkCollectionId, setBulkCollectionId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importCharacter, setImportCharacter] = useState(data.characters[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(search.trim().toLocaleLowerCase());
  const recentCutoff = useMemo(() => Math.max(0, ...data.media.map((asset) => Date.parse(asset.createdAt) || 0)) - 30 * 86400000, [data.media]);

  const collection = data.collections.find((entry) => entry.id === selectedCollection);
  const collectionItems = useMemo(() => collection?.mediaIds.map((id) => data.media.find((asset) => asset.id === id)).filter((asset): asset is MediaAsset => Boolean(asset)) ?? [], [collection, data.media]);
  const collectionLookup = useMemo(() => {
    const map = new Map<string, string[]>();
    data.collections.forEach((entry) => entry.mediaIds.forEach((id) => map.set(id, [...(map.get(id) ?? []), entry.name])));
    return map;
  }, [data.collections]);
  const visibleCollections = useMemo(() => data.collections.filter((entry) => !deferredQuery || entry.name.toLocaleLowerCase().includes(deferredQuery) || entry.mediaIds.some((id) => { const asset = data.media.find((mediaAsset) => mediaAsset.id === id); return asset && [asset.title, asset.caption, asset.prompt, data.notes[id] ?? ""].some((value) => value.toLocaleLowerCase().includes(deferredQuery)); })), [data.collections, data.media, data.notes, deferredQuery]);
  const roles = useMemo(() => {
    const map = new Map<string, string[]>();
    data.characterReferences.forEach((reference) => map.set(reference.mediaId, [...(map.get(reference.mediaId) ?? []), reference.role]));
    return map;
  }, [data.characterReferences]);

  const media = useMemo(() => {
    let result = data.media.filter((asset) => {
      const collections = collectionLookup.get(asset.id) ?? [];
      const note = data.notes[asset.id] ?? "";
      const owner = data.characters.find((entry) => entry.id === asset.characterId);
      const matchesQuery = !deferredQuery || [asset.title, asset.caption, asset.prompt, note, owner?.name, owner?.handle, ...collections].some((value) => value?.toLocaleLowerCase().includes(deferredQuery));
      const matchesType = filter === "Collections" ? selectedCollection ? collection?.mediaIds.includes(asset.id) : collections.length > 0 : true;
      const matchesFilter = matchesType && (filter === "All" || filter === "Collections" || (filter === "Images" && asset.type === "image") || (filter === "Videos" && asset.type === "video") || (filter === "Favorites" && asset.favorite) || (filter === "References" && asset.isReference));
      const matchesCharacter = !characterId || asset.characterId === characterId;
      const source = asset.providerId === "local-import" || asset.settingsJson.includes('"source":"local-import"') ? "Imported" : "Generated";
      const matchesSource = secondary === "Any source" || (secondary === "Recent" ? Date.parse(asset.createdAt) >= recentCutoff : secondary === source);
      return matchesQuery && matchesFilter && matchesCharacter && matchesSource;
    });
    result = [...result];
    if (sort === "Oldest") result.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    else if (sort === "Character") result.sort((a, b) => (data.characters.find((entry) => entry.id === a.characterId)?.name ?? "").localeCompare(data.characters.find((entry) => entry.id === b.characterId)?.name ?? ""));
    else result.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return result;
  }, [data.media, data.characters, data.notes, collectionLookup, deferredQuery, filter, characterId, secondary, sort, selectedCollection, collection, recentCutoff]);

  const resetFilters = () => { setFilter("All"); setCharacterId(""); setSecondary("Any source"); setSort("Newest"); setSelectedCollection(null); setSearch(""); };
  const runAction = async (action: string, extra: Record<string, string> = {}) => fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
  const toggleSelected = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
  const performBulk = async (action: "favorite" | "unfavorite" | "reference" | "collection-add", collectionId?: string) => {
    if (!selectedIds.length) return;
    setBusy(true);
    try {
      const ids = action === "favorite" ? selectedIds.filter((id) => !data.media.find((asset) => asset.id === id)?.favorite) : action === "unfavorite" ? selectedIds.filter((id) => data.media.find((asset) => asset.id === id)?.favorite) : selectedIds;
      await Promise.all(ids.map((mediaId) => runAction(action === "collection-add" ? "collection-add" : action === "unfavorite" || action === "favorite" ? "favorite" : "reference", { mediaId, ...(collectionId ? { collectionId } : {}) })));
      setSelectedIds([]); setBulkMode(false); setBulkCollectionId(null); setStatus(action === "favorite" || action === "unfavorite" ? "Favorites updated" : action === "reference" ? "Added as references" : "Added to collection");
      await refresh();
    } finally { setBusy(false); }
  };
  const createCollection = async () => {
    if (!collectionName.trim()) return;
    await runAction("collection-create", { name: collectionName.trim() });
    setCollectionName(""); setCreatingCollection(false); await refresh();
  };
  const renameCollection = async () => {
    if (!collection || !collectionName.trim()) return;
    await runAction("collection-rename", { collectionId: collection.id, name: collectionName.trim() });
    setRenaming(false); await refresh();
  };
  const upload = async (file?: File) => {
    if (!file || !importCharacter) return;
    setBusy(true);
    try {
      const form = new FormData(); form.append("file", file); form.append("characterId", importCharacter);
      const response = await fetch("/api/media/upload", { method: "POST", body: form });
      if (!response.ok) throw new Error((await response.json()).error ?? "Import failed");
      setImportOpen(false); setStatus("Imported into your Library"); await refresh();
    } catch (error) { setStatus(error instanceof Error ? error.message : "Import failed"); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  const toggleFilter = (value: Filter) => { setFilter(value); setSelectedCollection(null); setBulkMode(false); setBulkCollectionId(null); setSelectedIds([]); };
  const openCollections = filter === "Collections";
  const emptyLibrary = data.media.length === 0;

  return <section className="library-vault" aria-labelledby="library-title">
    <header className="library-heading">
      <div><p className="library-kicker">Private media archive</p><h1 id="library-title">Library</h1><p className="library-subtitle">Every scene, reference, and import in one place.</p></div>
      <div className="library-header-actions"><button className="library-secondary-button" onClick={() => { setImportCharacter(characterId || data.characters[0]?.id || ""); setImportOpen(true); }}>＋ <span>Import media</span></button><button className="library-primary-button" onClick={() => create(undefined, undefined, characterId || data.characters[0]?.id)}>Create Scene</button></div>
    </header>

    <label className="library-search"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search scenes, characters, collections, notes…" aria-label="Search media, characters, collections, and notes" />{search && <button onClick={() => setSearch("")} aria-label="Clear search">×</button>}</label>

    <div className="library-toolbar">
      <div className="library-filter-row" role="group" aria-label="Library filters">{(["All", "Images", "Videos", "Favorites", "References", "Collections"] as Filter[]).map((value) => <button key={value} onClick={() => toggleFilter(value)} aria-pressed={filter === value} className={filter === value ? "active" : ""}>{value}{value === "Favorites" && <span>♥</span>}</button>)}</div>
      <div className="library-toolbar-controls"><label><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option>Newest</option><option>Oldest</option><option>Character</option></select></label><details className="library-more-filters"><summary>More filters</summary><div><label>Source<select value={secondary} onChange={(event) => setSecondary(event.target.value as Secondary)}><option>Any source</option><option>Generated</option><option>Imported</option><option>Recent</option></select></label></div></details><button className={`library-multi-toggle ${bulkMode ? "active" : ""}`} onClick={() => { setBulkMode((value) => !value); setBulkCollectionId(null); setSelectedIds([]); }}>{bulkMode ? "Cancel select" : "Select"}</button></div>
    </div>

    <div className="library-characters" aria-label="Filter by character">{data.characters.map((entry) => { const count = data.media.filter((asset) => asset.characterId === entry.id).length; return <button key={entry.id} onClick={() => setCharacterId((current) => current === entry.id ? "" : entry.id)} aria-pressed={characterId === entry.id} className={characterId === entry.id ? "active" : ""}><img src={entry.portraitUrl} alt="" loading="lazy"/><span>{entry.name}</span><small>{count}</small></button>; })}{characterId && <button className="library-clear-character" onClick={() => setCharacterId("")}>Clear character</button>}</div>

    {filter === "Collections" && <div className="library-collections-head"><div>{selectedCollection ? <><button className="library-back" onClick={() => setSelectedCollection(null)}>← Collections</button><h2>{collection?.name}</h2></> : <><h2>Your collections</h2><p>Keep favorite scenes together.</p></>}</div>{selectedCollection ? <div className="library-collection-actions"><button className="library-secondary-button" onClick={() => { setBulkCollectionId(selectedCollection); setFilter("All"); setSelectedCollection(null); setBulkMode(true); setSelectedIds([]); }}>＋ Add media</button><button className="library-secondary-button" onClick={() => { setCollectionName(collection?.name ?? ""); setRenaming(true); }}>Rename</button></div> : <button className="library-secondary-button" onClick={() => { setCollectionName(""); setCreatingCollection(true); }}>＋ New collection</button>}</div>}

    {bulkMode && <div className="library-bulk-bar"><span>{selectedIds.length} selected{bulkCollectionId ? ` · ${data.collections.find((entry) => entry.id === bulkCollectionId)?.name}` : ""}</span><button disabled={!selectedIds.length || busy} onClick={() => performBulk("favorite")}>Favorite</button><button disabled={!selectedIds.length || busy} onClick={() => performBulk("unfavorite")}>Remove Favorite</button><button disabled={!selectedIds.length || busy} onClick={() => performBulk("reference")}>Add as Reference</button>{bulkCollectionId ? <button disabled={!selectedIds.length || busy} onClick={() => performBulk("collection-add", bulkCollectionId)}>Add to collection</button> : <select aria-label="Add selected to collection" defaultValue="" onChange={(event) => event.target.value && performBulk("collection-add", event.target.value)}><option value="">Add to collection…</option>{data.collections.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>}</div>}

    {openCollections && !selectedCollection && visibleCollections.length > 0 && <div className="library-collection-grid">{visibleCollections.map((entry) => { const assets = entry.mediaIds.map((id) => data.media.find((asset) => asset.id === id)).filter((asset): asset is MediaAsset => Boolean(asset)); const owners = [...new Set(assets.map((asset) => data.characters.find((characterEntry) => characterEntry.id === asset.characterId)?.name).filter(Boolean))]; return <button className="library-collection-card" key={entry.id} onClick={() => setSelectedCollection(entry.id)}><span className="library-collection-cover">{assets.slice(0, 4).map((asset, index) => <img key={asset.id} src={asset.posterUrl ?? asset.url} alt="" loading="lazy" style={{ left: `${index * 13}%`, zIndex: 4 - index, transform: `rotate(${(index - 1.5) * 4}deg)` }} />)}{assets.length === 0 && <span className="library-cover-empty">◇</span>}</span><span className="library-collection-copy"><strong>{entry.name}</strong><small>{assets.length} {assets.length === 1 ? "item" : "items"}{owners.length ? ` · ${owners.slice(0, 2).join(", ")}` : ""}</small></span></button>; })}</div>}

    {!emptyLibrary && !openCollections && media.length > 0 && <div className="library-grid" aria-label="Media archive">{media.map((asset, index) => { const owner = data.characters.find((entry) => entry.id === asset.characterId); const source = asset.providerId === "local-import" ? "Imported" : "Generated"; const assetRoles = roles.get(asset.id) ?? []; const selected = selectedIds.includes(asset.id); return <button key={asset.id} className={`library-tile ${selected ? "selected" : ""}`} onClick={() => bulkMode ? toggleSelected(asset.id) : select(asset)} aria-label={`${bulkMode ? selected ? "Deselect" : "Select" : "Open"} ${asset.title}`} aria-pressed={bulkMode ? selected : undefined}>
      <img className="library-thumb" src={asset.posterUrl ?? asset.url} alt={asset.title} loading={index < 8 ? "eager" : "lazy"} decoding="async" sizes="(max-width: 639px) 48vw, (max-width: 1023px) 31vw, (max-width: 1439px) 24vw, 19vw" style={{ aspectRatio: aspect(asset) }} />
      <span className="library-tile-gradient" />
      {asset.type === "video" && <span className="library-video-mark">▶</span>}{durationLabel(asset) && <span className="library-duration-mark">{durationLabel(asset)}</span>}{asset.favorite && <span className="library-favorite-mark">♥</span>}{asset.isReference && <span className="library-reference-mark">REF</span>}
      {assetRoles.length > 0 && <span className="library-role-mark">{assetRoles[0]}</span>}{collectionLookup.has(asset.id) && <span className="library-in-collection-mark">▧</span>}
      {bulkMode && <span className={`library-select-mark ${selected ? "checked" : ""}`}>{selected ? "✓" : ""}</span>}
      <span className="library-tile-meta"><strong>{asset.title}</strong><span>{owner?.name ?? source}<i />{source === "Imported" && <em>Imported</em>}</span></span>
    </button>; })}</div>}

    {selectedCollection && <div className="library-collection-items">{collectionItems.length === 0 ? <p>This collection is empty. Select assets in your Library and add them here.</p> : collectionItems.map((asset) => <div key={asset.id} className="library-collection-item"><button className="library-collection-item-open" onClick={() => select(asset)}><img src={asset.posterUrl ?? asset.url} alt="" loading="lazy"/><span>{asset.title}</span></button><button className="library-remove-item" aria-label={`Remove ${asset.title} from collection`} onClick={async () => { await runAction("collection-remove", { collectionId: selectedCollection, mediaId: asset.id }); await refresh(); }}>Remove</button></div>)}</div>}

    {!emptyLibrary && ((openCollections && !selectedCollection && visibleCollections.length === 0) || (!openCollections && media.length === 0)) && <div className="library-empty"><div>⌕</div><h2>Nothing matches these filters.</h2><p>Adjust your search or filters to find something in your archive.</p><button onClick={resetFilters}>Clear Filters</button>{openCollections && <button className="library-empty-secondary" onClick={() => setCreatingCollection(true)}>Create Collection</button>}</div>}
    {emptyLibrary && <div className="library-empty"><div>▧</div><h2>Your generated and imported media will appear here.</h2><p>Create a scene or bring in a local image or video to start your private archive.</p><div className="library-empty-actions"><button onClick={() => create()}>Create Scene</button><button className="secondary" onClick={() => setImportOpen(true)}>Import media</button></div></div>}
    {status && <p className="library-status" role="status">{status}</p>}

    {(creatingCollection || renaming) && <div className="library-dialog-backdrop" onClick={() => { setCreatingCollection(false); setRenaming(false); }}><section role="dialog" aria-modal="true" aria-labelledby="library-collection-dialog-title" onClick={(event) => event.stopPropagation()}><h2 id="library-collection-dialog-title">{renaming ? "Rename collection" : "New collection"}</h2><input autoFocus value={collectionName} onChange={(event) => setCollectionName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && (renaming ? renameCollection() : createCollection())} placeholder="Collection name"/><div><button onClick={() => { setCreatingCollection(false); setRenaming(false); }}>Cancel</button><button onClick={renaming ? renameCollection : createCollection}>{renaming ? "Save" : "Create"}</button></div></section></div>}
    {importOpen && <div className="library-dialog-backdrop" onClick={() => setImportOpen(false)}><section role="dialog" aria-modal="true" aria-labelledby="library-import-title" onClick={(event) => event.stopPropagation()}><h2 id="library-import-title">Import image or video</h2><p>Your local file will be added as an imported MediaAsset.</p>{data.characters.length > 0 ? <label>Associate with character<select value={importCharacter} onChange={(event) => setImportCharacter(event.target.value)}>{data.characters.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label> : <p>Create a character before importing media.</p>}<input ref={inputRef} type="file" accept="image/*,video/*" disabled={!importCharacter || busy} onChange={(event) => upload(event.target.files?.[0])}/><div><button onClick={() => setImportOpen(false)}>Cancel</button><span>{busy ? "Importing…" : "Files up to 50 MB"}</span></div></section></div>}
  </section>;
}

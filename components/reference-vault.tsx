"use client";

import { useState, type ChangeEvent } from "react";
import type { AppSnapshot, Character, CharacterReference, CharacterReferenceMeta, MediaAsset } from "@/lib/domain";
import { LibraryCharacterPortrait, LibraryMediaThumbnail } from "@/components/library-media-thumbnail";
import { referenceCategories, type ReferenceCategoryKey } from "@/lib/reference-resolver";

const roles: CharacterReference["role"][] = ["face", "body", "hair", "look", "outfit", "pose", "motion", "environment", "video", "other"];
const categoryRole: Record<ReferenceCategoryKey, CharacterReference["role"]> = { face: "face", body: "body", looks: "look", outfits: "outfit", poses: "pose", motion: "motion", scenes: "environment", favorites: "face", all: "face" };
const post = async (body: Record<string, unknown>) => {
  const response = await fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? "The reference action failed.");
  return value;
};

export function ReferenceVault({ data, character, refresh, select, back, createCharacter, createWithReferences, onCharacterChange }: {
  data: AppSnapshot; character: Character; refresh: () => Promise<void>; select: (asset: MediaAsset) => void; back: () => void;
  createCharacter: (name: string, description: string) => Promise<Character>;
  createWithReferences: (characterId: string, ids: string[], roles: Record<string, CharacterReference["role"]>) => void;
  onCharacterChange: (characterId: string) => void;
}) {
  const [characterId, setCharacterId] = useState(character.id);
  const currentCharacter = data.characters.find((item) => item.id === characterId) ?? character;
  const [category, setCategory] = useState<ReferenceCategoryKey>("face");
  const [assignmentRole, setAssignmentRole] = useState<CharacterReference["role"]>("face");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [existingOpen, setExistingOpen] = useState(false);
  const [includeOtherCharacters, setIncludeOtherCharacters] = useState(false);
  const [crossConfirm, setCrossConfirm] = useState<string[]>([]);
  const [detail, setDetail] = useState<CharacterReferenceMeta | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [bulkRole, setBulkRole] = useState<CharacterReference["role"]>("face");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0, success: 0, failures: [] as string[] });
  const [error, setError] = useState("");
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");

  const refs = data.characterReferences.filter((item) => item.characterId === currentCharacter.id);
  const referenceMedia = refs.map((ref) => ({ ref, asset: data.media.find((asset) => asset.id === ref.mediaId) })).filter((item): item is { ref: CharacterReferenceMeta; asset: MediaAsset } => Boolean(item.asset));
  const filtered = referenceMedia.filter(({ ref, asset }) => {
    if (category === "all") return true;
    if (category === "favorites") return asset.favorite;
    const entry = referenceCategories.find((item) => item.key === category);
    return Boolean(entry?.roles.includes(ref.role as never));
  });
  const activeCanonical = refs.filter((ref) => ref.active && ref.canonical);
  const identityReady = activeCanonical.some((ref) => ref.role === "face") && activeCanonical.some((ref) => ["body", "look", "hair"].includes(ref.role));
  const roleSummary = roles.map((role) => [role, refs.filter((ref) => ref.role === role).length] as const).filter(([, count]) => count);
  const mediaForPicker = data.media.filter((asset) => includeOtherCharacters || asset.characterId === currentCharacter.id);

  const uploadFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []); event.target.value = "";
    if (!files.length) return;
    const targetRole = assignmentRole;
    const progress = { done: 0, total: files.length, success: 0, failures: [] as string[] };
    setUploadProgress(progress); setUploading(true); setError("");
    for (const file of files) {
      try {
        const form = new FormData(); form.set("file", file); form.set("characterId", currentCharacter.id); form.set("referenceRole", targetRole); form.set("canonical", "false");
        const response = await fetch("/api/media/upload", { method: "POST", body: form });
        const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Upload failed");
        progress.success++;
      } catch { progress.failures.push(file.name); }
      progress.done++; setUploadProgress({ ...progress, failures: [...progress.failures] });
    }
    setUploading(false); await refresh();
  };

  const mutate = async (body: Record<string, unknown>) => { setError(""); try { await post(body); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Action failed."); } };
  const saveDetail = async () => {
    if (!detail) return;
    await mutate({ action: "character-reference-update", characterId: currentCharacter.id, mediaId: detail.mediaId, role: detail.role, referencePatch: { label, notes, active: detail.active, canonical: detail.canonical, priority: detail.priority } });
    setDetail(null);
  };
  const openDetail = (ref: CharacterReferenceMeta) => { setDetail(ref); setLabel(ref.label); setNotes(ref.notes); };
  const chooseExisting = async (asset: MediaAsset, confirmed = false) => {
    if (asset.characterId !== currentCharacter.id && !confirmed) { setCrossConfirm((current) => current.includes(asset.id) ? current : [...current, asset.id]); return; }
    await mutate({ action: "character-reference-add-existing", characterId: currentCharacter.id, mediaId: asset.id, role: assignmentRole, canonical: false, confirmCrossCharacter: confirmed });
    setCrossConfirm((current) => current.filter((id) => id !== asset.id));
  };
  const bulkPatch = async (patch: Record<string, unknown>) => { await mutate({ action: "character-reference-bulk", characterId: currentCharacter.id, mediaIds: selected, referencePatch: patch }); setSelected([]); };
  const removeSelected = async () => { for (const id of selected) { const ref = refs.find((item) => item.mediaId === id); if (ref) await mutate({ action: "character-reference-remove", characterId: currentCharacter.id, mediaId: id, role: ref.role }); } setSelected([]); };
  const createSelected = () => { const roleMap = Object.fromEntries(refs.filter((ref) => selected.includes(ref.mediaId)).map((ref) => [ref.mediaId, ref.role])); createWithReferences(currentCharacter.id, selected, roleMap); };

  return <main className="reference-vault" data-testid="reference-vault">
    <header className="reference-vault-header"><button onClick={back} aria-label="Back to Character Hub">‹</button><span className="reference-vault-portrait"><LibraryCharacterPortrait src={currentCharacter.portraitUrl} name={currentCharacter.name} /></span><div><strong>{currentCharacter.name}</strong><small>Reference Vault</small></div><select aria-label="Choose character" value={currentCharacter.id} onChange={(event) => { setCharacterId(event.target.value); setSelected([]); onCharacterChange(event.target.value); }}><option value={currentCharacter.id}>{currentCharacter.name}</option>{data.characters.filter((item) => item.id !== currentCharacter.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></header>
    <div className="reference-vault-onboarding">{!data.characters.some((item) => item.name.trim().toLocaleLowerCase() === "valeria") && <button onClick={async () => { const created = await createCharacter("Valeria", ""); setCharacterId(created.id); }}>Create character · Valeria</button>}{!data.characters.some((item) => item.name.trim().toLocaleLowerCase() === "valeria") && <span>No identity details are prefilled.</span>}</div>
    <nav className="reference-vault-categories" aria-label="Reference categories">{referenceCategories.map((item) => <button key={item.key} aria-pressed={category === item.key} onClick={() => { setCategory(item.key); if (item.key !== "all" && item.key !== "favorites") setAssignmentRole(categoryRole[item.key]); }}>{item.label}</button>)}</nav>
    <section className="reference-vault-toolbar"><button className="reference-primary" onClick={() => setUploadOpen(true)}>＋ Add References</button><button onClick={() => setExistingOpen(true)}>Add Existing Media</button><button aria-pressed={selectMode} onClick={() => { setSelectMode(!selectMode); setSelected([]); }}>{selectMode ? "Done" : "Select"}</button></section>
    <section className="reference-vault-readiness"><div><b>{identityReady ? "Identity Ready" : "Identity incomplete"}</b><small>{identityReady ? "Active canonical face and body/look references are set." : `${activeCanonical.some((ref) => ref.role === "face") ? "Add an active canonical Body or Look." : "Add an active canonical Face reference."}`}</small></div><button onClick={() => createWithReferences(currentCharacter.id, [], {})}>Open Create</button></section>
    <section className="reference-vault-summary" aria-label="Reference counts">{roleSummary.map(([role, count]) => <span key={role}>{role} <b>{count}</b></span>)}<span>Active <b>{refs.filter((ref) => ref.active).length}</b></span><span>Canonical <b>{refs.filter((ref) => ref.canonical).length}</b></span></section>
    {error && <p className="reference-vault-error" role="alert">{error}</p>}
    {uploadProgress.total > 0 && <section className="reference-upload-progress" aria-live="polite"><b>{uploading ? `Uploading ${uploadProgress.done}/${uploadProgress.total}` : `Upload complete · ${uploadProgress.success} succeeded · ${uploadProgress.failures.length} failed`}</b>{uploadProgress.failures.map((name) => <small key={name}>{name} failed. Retry by selecting it again; successful uploads remain saved.</small>)}<progress max={uploadProgress.total} value={uploadProgress.done} /></section>}
    {selected.length > 0 && <section className="reference-vault-bulk"><b>{selected.length} selected</b><select aria-label="Bulk reference role" value={bulkRole} onChange={(event) => setBulkRole(event.target.value as CharacterReference["role"])}>{roles.map((role) => <option key={role}>{role}</option>)}</select><button onClick={() => void bulkPatch({ role: bulkRole })}>Set Role</button><button onClick={() => void bulkPatch({ canonical: true })}>Canonical</button><button onClick={() => void bulkPatch({ canonical: false })}>Standard</button><button onClick={() => void bulkPatch({ active: true })}>Activate</button><button onClick={() => void bulkPatch({ active: false })}>Deactivate</button><button onClick={async () => { for (const id of selected) await mutate({ action: "favorite", mediaId: id }); }}>Favorite</button><button onClick={() => void removeSelected()}>Remove from Vault</button><button onClick={createSelected}>Create with Selected</button></section>}
    {filtered.length === 0 ? <section className="reference-vault-empty"><h2>No {referenceCategories.find((item) => item.key === category)?.label ?? "Face"} references yet</h2><p>Add identity images or choose existing character media, then mark the strongest references canonical.</p><button onClick={() => setUploadOpen(true)}>Add References</button><button onClick={() => setExistingOpen(true)}>Add Existing Media</button></section> : <section className="reference-vault-grid" aria-label={`${currentCharacter.name} ${category} references`}>{filtered.map(({ ref, asset }) => <article key={`${ref.mediaId}:${ref.role}`} className={!ref.active ? "is-inactive" : ""}>
      {selectMode && <button className="reference-select-toggle" aria-pressed={selected.includes(asset.id)} onClick={() => setSelected((current) => current.includes(asset.id) ? current.filter((id) => id !== asset.id) : [...current, asset.id])}>{selected.includes(asset.id) ? "✓" : "○"}</button>}
      <button className="reference-vault-thumb" onClick={() => select(asset)} aria-label={`Open ${asset.title}`}><LibraryMediaThumbnail asset={asset} alt={asset.title} loading="eager" />{asset.favorite && <span className="reference-favorite-mark">♥</span>}{ref.canonical && <span className="reference-canonical-mark">★ Canonical</span>}{!ref.active && <span className="reference-inactive-mark">Inactive</span>}</button>
      <div className="reference-vault-card-meta"><button onClick={() => openDetail(ref)}>{ref.label || asset.title || ref.role}<small>{ref.role}{ref.priority >= 2 ? " · High" : ref.priority === 1 ? " · Normal" : " · Low"}</small></button><button aria-label={`Edit ${asset.title}`} onClick={() => openDetail(ref)}>•••</button></div>
    </article>)}</section>}

    {uploadOpen && <div className="reference-vault-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setUploadOpen(false); }}><section className="reference-vault-sheet" role="dialog" aria-modal="true" aria-labelledby="reference-upload-title"><button className="reference-sheet-close" onClick={() => setUploadOpen(false)} aria-label="Close">×</button><h2 id="reference-upload-title">Add References</h2><label>Add to<select value={assignmentRole} onChange={(event) => setAssignmentRole(event.target.value as CharacterReference["role"])}><option value="face">Face</option><option value="body">Body</option><option value="hair">Hair</option><option value="look">Look</option><option value="outfit">Outfit</option><option value="pose">Pose</option><option value="motion">Motion</option><option value="environment">Scenes / Environments</option></select></label><label className="reference-file-picker">Choose Photos or Files<input type="file" multiple accept="image/*,video/*" onChange={(event) => void uploadFiles(event)} disabled={uploading} /></label><small>Images and videos · up to 50 MB per file · files stay in this local app.</small></section></div>}
    {existingOpen && <div className="reference-vault-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setExistingOpen(false); }}><section className="reference-vault-sheet reference-existing-sheet" role="dialog" aria-modal="true" aria-labelledby="reference-existing-title"><button className="reference-sheet-close" onClick={() => setExistingOpen(false)} aria-label="Close">×</button><h2 id="reference-existing-title">Add Existing Media</h2><label>Add to<select value={assignmentRole} onChange={(event) => setAssignmentRole(event.target.value as CharacterReference["role"])}>{roles.map((role) => <option key={role}>{role}</option>)}</select></label><label className="reference-cross-toggle"><input type="checkbox" checked={includeOtherCharacters} onChange={(event) => setIncludeOtherCharacters(event.target.checked)} /> Include other characters’ media</label><div className="reference-existing-grid">{mediaForPicker.map((asset) => <div key={asset.id} className="reference-existing-item"><button onClick={() => void chooseExisting(asset)}><LibraryMediaThumbnail asset={asset} alt={asset.title} loading="eager"/><small>{asset.title}</small>{asset.characterId !== currentCharacter.id && <small>{data.characters.find((item) => item.id === asset.characterId)?.name} · confirm required</small>}</button>{crossConfirm.includes(asset.id) && <div className="reference-cross-confirm"><small>Assign this media to {currentCharacter.name}?</small><button onClick={() => void chooseExisting(asset, true)}>Confirm</button><button onClick={() => setCrossConfirm((items) => items.filter((id) => id !== asset.id))}>Cancel</button></div>}</div>)}</div></section></div>}
    {detail && <div className="reference-vault-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null); }}><section className="reference-vault-sheet" role="dialog" aria-modal="true" aria-labelledby="reference-detail-title"><button className="reference-sheet-close" onClick={() => setDetail(null)} aria-label="Close">×</button><h2 id="reference-detail-title">Reference settings</h2><label>Category<select value={detail.role} onChange={(event) => setDetail({ ...detail, role: event.target.value as CharacterReference["role"] })}>{roles.map((role) => <option key={role}>{role}</option>)}</select></label><label>Label<input value={label} onChange={(event) => setLabel(event.target.value)} /></label><label>Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3}/></label><label>Priority<select value={detail.priority >= 2 ? 2 : detail.priority === 1 ? 1 : 0} onChange={(event) => setDetail({ ...detail, priority: Number(event.target.value) })}><option value={2}>High</option><option value={1}>Normal</option><option value={0}>Low</option></select></label><label className="reference-check"><input type="checkbox" checked={detail.canonical} onChange={(event) => setDetail({ ...detail, canonical: event.target.checked })}/> Canonical · eligible for Create defaults</label><label className="reference-check"><input type="checkbox" checked={detail.active} onChange={(event) => setDetail({ ...detail, active: event.target.checked })}/> Active · available for automatic selection</label><div className="reference-sheet-actions"><button onClick={() => void mutate({ action: "favorite", mediaId: detail.mediaId })}>Favorite</button><button disabled={data.media.find((item) => item.id === detail.mediaId)?.type !== "image" || data.media.find((item) => item.id === detail.mediaId)?.characterId !== currentCharacter.id} onClick={() => void mutate({ action: "character-set-portrait", characterId: currentCharacter.id, mediaId: detail.mediaId })}>Set as Character Portrait</button><button onClick={() => { const asset=data.media.find((item)=>item.id===detail.mediaId); if(asset) select(asset); }}>Open Media Detail</button><button className="reference-danger" onClick={async () => { await mutate({ action: "character-reference-remove", characterId: currentCharacter.id, mediaId: detail.mediaId, role: detail.role }); setDetail(null); }}>Remove from Vault</button><button className="reference-primary" onClick={() => void saveDetail()}>Save</button></div><small>Remove from Vault removes only this character mapping. The media remains in Library.</small></section></div>}
  </main>;
}

"use client";

import { useState } from "react";
import type { Character, CharacterProfile } from "@/lib/domain";
import { characterProfileHasMeaningfulContent, profileDraftForCharacter } from "@/lib/character-profile-drafts";

const labels: Record<string, string> = {
  speakingStyle: "Messaging style", attitude: "Tone", humorStyle: "Humor", seductionStyle: "Seduction style",
  flirtIntensity: "Flirt intensity", naughtiness: "Naughtiness", provocationStyle: "Provocation style",
  dirtyHumor: "Suggestive humor", possessiveness: "Possessiveness", approvalSeeking: "Approval seeking",
  initiativeStyle: "Initiative style", favoriteTeasingPatterns: "Favorite teasing patterns",
  privateRelationshipDynamic: "Private relationship dynamic", escalationStyle: "Escalation style",
  spicyScenePreferences: "Suggestive scene preferences", permissionStyle: "Permission style",
  approvalReaction: "Positive reaction", rejectionReaction: "Negative reaction", boundaries: "Boundaries",
  visualBrief: "Visual brief", wardrobeCategories: "Wardrobe", favoriteSceneTypes: "Favorite scene types",
  favoriteEnvironments: "Favorite settings", preferredLighting: "Lighting", preferredMoods: "Mood",
  preferredShotTypes: "Shot types", visualThemes: "Visual themes", ideasToTry: "Ideas to try",
};

function display(value: unknown) {
  if (Array.isArray(value)) return value.join(" · ");
  if (typeof value === "number") return `${Math.round(value * 100)} / 100`;
  return String(value ?? "");
}

export function CharacterProfileDraftControls({ character, profile, refresh, onApplied }: {
  character: Character;
  profile: CharacterProfile;
  refresh: () => Promise<void>;
  onApplied?: (result: { character: Character; profile: CharacterProfile }) => void;
}) {
  const [draft, setDraft] = useState<ReturnType<typeof profileDraftForCharacter>>(undefined);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const existingContent = characterProfileHasMeaningfulContent(character, profile);
  const fields = draft ? [
    ["Identity", [["Identity summary", draft.characterPatch.description], ["Personality", draft.characterPatch.personality], ["Visual identity", draft.characterPatch.identityNotes], [labels.visualBrief, draft.profile.creativeProfile.visualBrief], [labels.wardrobeCategories, draft.profile.creativeProfile.wardrobeCategories], [labels.favoriteSceneTypes, draft.profile.creativeProfile.favoriteSceneTypes]]],
    ["Character behavior", Object.entries(draft.profile.conversationalProfile).filter(([key]) => key in labels).map(([key, value]) => [labels[key], display(value)])],
  ] as const : [];
  const apply = async () => {
    if (!draft) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "character-profile-apply-draft", characterId: character.id, confirmed: confirmReplace }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not apply profile draft.");
      onApplied?.(result);
      await refresh();
      setDraft(undefined); setConfirmReplace(false); setMessage("Profile draft applied.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not apply profile draft.");
    } finally { setBusy(false); }
  };
  return <section className="rounded-2xl border border-fuchsia-300/15 bg-fuchsia-950/10 p-4" aria-label="Assistant profile draft">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-semibold">Profile assistant</h2><p className="mt-1 text-xs text-zinc-400">Local draft · review before applying · no provider calls</p></div>
      <button type="button" onClick={() => { const next = profileDraftForCharacter(character); setDraft(next); setConfirmReplace(false); setMessage(next ? "Review the complete draft before applying it." : "No canonical draft is defined for this character yet."); }} className="min-h-11 rounded-xl border border-fuchsia-300/25 px-4 text-sm font-semibold text-fuchsia-100">Generate Profile Draft</button>
    </div>
    {draft && <div className="mt-4 space-y-4">
      <p className="text-xs text-zinc-400">Adult character · age verified · initiative: {draft.profile.initiativeLevel.toLocaleLowerCase()}</p>
      {fields.map(([title, entries]) => <section key={title} className="rounded-xl bg-black/20 p-3"><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-300">{title}</h3><dl className="space-y-2">{entries.map(([label, value]) => <div key={label}><dt className="text-[11px] text-zinc-500">{label}</dt><dd className="text-sm text-zinc-200">{display(value)}</dd></div>)}</dl></section>)}
      <section className="rounded-xl bg-black/20 p-3"><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-300">Character behavior controls</h3><dl className="grid gap-2 sm:grid-cols-2">{(["flirtIntensity", "naughtiness", "possessiveness", "approvalSeeking"] as const).map((key) => <div key={key}><dt className="text-[11px] text-zinc-500">{labels[key]}</dt><dd className="text-sm text-zinc-200">{display(draft.profile.conversationalProfile[key])}</dd></div>)}</dl></section>
      <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={busy} onClick={() => existingContent ? setConfirmReplace(true) : void apply()} className="min-h-11 rounded-xl bg-fuchsia-500 px-4 text-sm font-bold disabled:opacity-50">Apply Draft</button><button type="button" onClick={() => setDraft(undefined)} className="min-h-11 rounded-xl px-3 text-sm text-zinc-400">Discard</button></div>
      {confirmReplace && <div role="alertdialog" aria-modal="true" aria-labelledby="profile-replace-title" className="rounded-xl border border-amber-300/25 bg-amber-950/20 p-3"><h3 id="profile-replace-title" className="font-semibold">Replace existing profile content?</h3><p className="mt-1 text-sm text-zinc-300">Applying this draft replaces the current description, personality, visual notes, and structured profile. The character name, handle, portrait, media, and references remain unchanged.</p><div className="mt-3 flex gap-2"><button type="button" disabled={busy} onClick={() => void apply()} className="min-h-11 rounded-lg bg-amber-500 px-3 text-sm font-bold text-black">Confirm and Apply</button><button type="button" onClick={() => setConfirmReplace(false)} className="min-h-11 rounded-lg px-3 text-sm">Cancel</button></div></div>}
    </div>}
    {message && <p role="status" className="mt-3 text-xs text-zinc-400">{message}</p>}
  </section>;
}

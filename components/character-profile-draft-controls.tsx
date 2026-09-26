"use client";

import { useMemo, useState } from "react";
import type { Character, CharacterProfile } from "@/lib/domain";
import { adjustProfileWithAssistant, characterProfileHasMeaningfulContent, profileDraftForCharacter, type ProfileAssistantCommand } from "@/lib/character-profile-drafts";

const edits: { id: ProfileAssistantCommand; title: string }[] = [
  { id: "seductive", title: "More seductive" }, { id: "funny", title: "Funnier" },
  { id: "possessive", title: "More possessive" }, { id: "gentle", title: "Less aggressive" },
  { id: "playful", title: "More playful" }, { id: "confident", title: "More dominant" },
  { id: "visual", title: "Change visual vibe" }, { id: "wardrobe", title: "Change wardrobe energy" },
];

export function CharacterProfileDraftControls({ character, profile, refresh, onApplied, initialMode }: {
  character: Character; profile: CharacterProfile; refresh: () => Promise<void>;
  onApplied?: (result: { character: Character; profile: CharacterProfile }) => void;
  initialMode?: "edit" | "regenerate";
}) {
  const [mode, setMode] = useState<"edit" | "regenerate" | null>(initialMode ?? null);
  const [command, setCommand] = useState<ProfileAssistantCommand | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const draft = useMemo(() => profileDraftForCharacter(character), [character]);
  const hasContent = characterProfileHasMeaningfulContent(character, profile);
  const applyRegeneration = async () => {
    if (!draft) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "character-profile-apply-draft", characterId: character.id, confirmed: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not refresh the profile.");
      onApplied?.(result); await refresh(); setMode(null); setConfirmReplace(false); setMessage("Profile updated.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update the profile."); }
    finally { setBusy(false); }
  };
  const applyEdit = async () => {
    if (!command) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "character-profile-assistant-adjust", characterId: character.id, command }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not update the profile.");
      await refresh(); setCommand(null); setMode(null); setMessage("Profile adjustment applied.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update the profile."); }
    finally { setBusy(false); }
  };
  const preview = command ? adjustProfileWithAssistant(profile, command) : null;
  return <section className="rounded-2xl border border-fuchsia-300/15 bg-[#121015] p-4" aria-label="Profile assistant">
    {!initialMode && <div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setMode(mode === "edit" ? null : "edit"); setCommand(null); }} className="min-h-11 rounded-xl bg-fuchsia-500 px-4 text-sm font-semibold text-white">Edit with Assistant</button><button type="button" onClick={() => { setMode(mode === "regenerate" ? null : "regenerate"); setCommand(null); setConfirmReplace(false); }} className="min-h-11 rounded-xl border border-white/15 px-4 text-sm text-zinc-200">Regenerate Profile</button></div>}
    {mode === "edit" && <div className="mt-3"><p className="text-sm text-zinc-300">Choose a direction. The assistant keeps her identity and boundaries intact.</p><div className="mt-3 flex flex-wrap gap-2">{edits.map((item) => <button key={item.id} type="button" aria-pressed={command === item.id} onClick={() => setCommand(item.id)} className={`min-h-10 rounded-full border px-3 text-xs ${command === item.id ? "border-fuchsia-300 bg-fuchsia-500/20 text-fuchsia-100" : "border-white/10 text-zinc-300"}`}>{item.title}</button>)}</div>{preview && <div className="mt-3 rounded-xl bg-black/25 p-3 text-sm text-zinc-300"><p className="font-semibold text-white">Preview</p><p className="mt-1">{preview.conversationalProfile.seductionStyle}</p><p className="mt-1 text-xs text-zinc-400">Flirt {Math.round(preview.conversationalProfile.flirtIntensity * 100)} · playful edge {Math.round(preview.conversationalProfile.naughtiness * 100)}</p><button type="button" disabled={busy} onClick={() => void applyEdit()} className="mt-3 min-h-11 rounded-lg bg-fuchsia-500 px-4 text-sm font-bold">Apply adjustment</button></div>}</div>}
    {mode === "regenerate" && <div className="mt-3 rounded-xl bg-black/25 p-3"><p className="text-sm text-zinc-300">Review the canonical assistant profile for {character.name}. Your portrait, handle, media, references, and conversations stay untouched.</p>{draft ? <><p className="mt-2 text-sm text-white">{draft.characterPatch.description}</p><p className="mt-1 text-xs text-zinc-400">{draft.profile.conversationalProfile.seductionStyle} · {draft.profile.initiativeLevel.toLowerCase()} initiative · age verification remains separate.</p>{hasContent && !confirmReplace ? <button type="button" onClick={() => setConfirmReplace(true)} className="mt-3 min-h-11 rounded-lg border border-amber-300/30 px-4 text-sm text-amber-100">Review replacement</button> : <div className="mt-3 flex gap-2"><button type="button" disabled={busy} onClick={() => void applyRegeneration()} className="min-h-11 rounded-lg bg-fuchsia-500 px-4 text-sm font-bold">{confirmReplace ? "Confirm and Apply" : "Apply Profile"}</button>{confirmReplace && <button type="button" onClick={() => setConfirmReplace(false)} className="min-h-11 px-3 text-sm text-zinc-300">Cancel</button>}</div>}</> : <p className="mt-2 text-sm text-zinc-500">No canonical profile is available for this character yet.</p>}</div>}
    {message && <p role="status" className="mt-3 text-xs text-zinc-400">{message}</p>}
  </section>;
}

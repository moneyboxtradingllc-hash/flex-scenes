import type { CharacterReference, CharacterReferenceMeta, GenerationMode, MediaAsset, ProviderCapabilities } from "./domain";

const roleOrder: CharacterReference["role"][] = ["face", "body", "hair", "look", "outfit", "pose", "motion", "environment", "video", "other"];

export function resolveCanonicalReferences(characterId: string, mode: GenerationMode, references: CharacterReferenceMeta[], media: MediaAsset[], limit = 3, capabilities?: ProviderCapabilities) {
  const assets = new Map(media.map((asset) => [asset.id, asset]));
  const eligible = references
    .filter((reference) => reference.characterId === characterId && reference.active && reference.canonical && assets.has(reference.mediaId))
    .filter((reference) => mode === "video" ? assets.get(reference.mediaId)?.type !== "video" || (capabilities?.referenceVideos ?? true) : assets.get(reference.mediaId)?.type === "image")
    .sort((a, b) => (roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role)) || b.priority - a.priority || a.createdAt.localeCompare(b.createdAt) || a.mediaId.localeCompare(b.mediaId));
  const chosen = new Map<string, CharacterReferenceMeta>();
  const firstByRole = new Set<CharacterReference["role"]>();
  for (const reference of eligible) {
    if (firstByRole.has(reference.role) || chosen.has(reference.mediaId)) continue;
    firstByRole.add(reference.role); chosen.set(reference.mediaId, reference);
  }
  for (const reference of eligible) if (!chosen.has(reference.mediaId)) chosen.set(reference.mediaId, reference);
  const ordered = [...chosen.values()].slice(0, limit);
  return { assetIds: ordered.map((item) => item.mediaId), roles: Object.fromEntries(ordered.map((item) => [item.mediaId, item.role])) as Record<string, CharacterReference["role"]> };
}

export const referenceCategories = [
  { key: "face", label: "Face", roles: ["face"] },
  { key: "body", label: "Body", roles: ["body"] },
  { key: "looks", label: "Looks", roles: ["hair", "look"] },
  { key: "outfits", label: "Outfits", roles: ["outfit"] },
  { key: "poses", label: "Poses", roles: ["pose"] },
  { key: "motion", label: "Motion", roles: ["motion", "video"] },
  { key: "scenes", label: "Scenes", roles: ["environment"] },
  { key: "favorites", label: "Favorites", roles: [] },
  { key: "all", label: "All", roles: [] },
] as const;

export type ReferenceCategoryKey = typeof referenceCategories[number]["key"];

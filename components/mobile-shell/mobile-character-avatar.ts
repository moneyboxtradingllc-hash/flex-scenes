import type { AppSnapshot } from "@/lib/domain";

export function mobileCharacterAvatar(characterId: string, characters: AppSnapshot["characters"]) {
  return characters.find((character) => character.id === characterId)?.portraitUrl ?? "";
}

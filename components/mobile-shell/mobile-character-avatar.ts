import type { AppSnapshot } from "@/lib/domain";

const safeAvatars = [
  "/fixtures/story-avatar-1.svg",
  "/fixtures/story-avatar-2.svg",
  "/fixtures/story-avatar-3.svg",
];

export function mobileCharacterAvatar(characterId: string, characters: AppSnapshot["characters"]) {
  const index = characters.findIndex((character) => character.id === characterId);
  return safeAvatars[(Math.max(index, 0)) % safeAvatars.length];
}

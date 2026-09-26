"use client";

import type { AppSnapshot } from "@/lib/domain";
import { UiIcon } from "@/components/ui-icon";
import { LibraryCharacterPortrait } from "@/components/library-media-thumbnail";

export function HomeStoryRail({ characters, onCreate, onCharacter }: {
  characters: AppSnapshot["characters"];
  onCreate: () => void;
  onCharacter: (id: string) => void;
}) {
  return (
    <section className="home-v2-stories" aria-label="Your characters">
      <button className="home-v2-story" onClick={onCreate} aria-label="Create a new scene">
        <span className="home-v2-story-ring is-add"><UiIcon name="create" /></span><span>New Scene</span>
      </button>
      {characters.map((character) => (
        <button className="home-v2-story" key={character.id} onClick={() => onCharacter(character.id)} aria-label={`Open ${character.name}`}>
          <span className="home-v2-story-ring"><LibraryCharacterPortrait src={character.portraitUrl} name={character.name} /></span><span>{character.name.split(" ")[0]}</span>
        </button>
      ))}
    </section>
  );
}

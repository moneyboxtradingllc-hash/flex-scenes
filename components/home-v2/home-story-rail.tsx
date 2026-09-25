"use client";

import type { AppSnapshot } from "@/lib/domain";
import { UiIcon } from "@/components/ui-icon";

export function HomeStoryRail({ characters, onCreate, onCharacter }: {
  characters: AppSnapshot["characters"];
  onCreate: () => void;
  onCharacter: (id: string) => void;
}) {
  return (
    <section className="home-v2-stories" aria-label="Your characters">
      <button className="home-v2-story" onClick={onCreate} aria-label="Create a new scene">
        <span className="home-v2-story-ring is-add"><UiIcon name="create" /></span><span>Your Story</span>
      </button>
      {characters.map((character) => (
        <button className="home-v2-story" key={character.id} onClick={() => onCharacter(character.id)} aria-label={`Open ${character.name}`}>
          <span className="home-v2-story-ring"><img src={character.portraitUrl} alt="" loading="lazy" /></span><span>{character.name.split(" ")[0]}</span>
        </button>
      ))}
    </section>
  );
}

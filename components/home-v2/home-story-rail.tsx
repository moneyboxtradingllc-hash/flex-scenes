"use client";

import type { AppSnapshot } from "@/lib/domain";
import { UiIcon } from "@/components/ui-icon";

const storyPortraits = [
  "/fixtures/story-avatar-1.svg",
  "/fixtures/story-avatar-2.svg",
  "/fixtures/story-avatar-3.svg",
];

const developmentStories = [
  { name: "Aria", portrait: "/fixtures/story-avatar-4.svg" },
  { name: "Luna", portrait: "/fixtures/story-avatar-5.svg" },
  { name: "Chloe", portrait: "/fixtures/story-avatar-6.svg" },
  { name: "Mia", portrait: "/fixtures/story-avatar-7.svg" },
];

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
      {characters.map((character, index) => (
        <button className="home-v2-story" key={character.id} onClick={() => onCharacter(character.id)} aria-label={`Open ${character.name}`}>
          <span className="home-v2-story-ring"><img src={storyPortraits[index % storyPortraits.length]} alt="" loading="eager" /></span><span>{character.name.split(" ")[0]}</span>
        </button>
      ))}
      {process.env.NODE_ENV === "development" && developmentStories.map((story) => (
        <div className="home-v2-story is-demo" key={story.name}>
          <span className="home-v2-story-ring"><img src={story.portrait} alt="" loading="eager" /></span><span>{story.name}</span>
        </div>
      ))}
    </section>
  );
}

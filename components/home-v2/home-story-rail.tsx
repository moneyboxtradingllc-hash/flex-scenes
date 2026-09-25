"use client";

import type { AppSnapshot } from "@/lib/domain";
import { UiIcon } from "@/components/ui-icon";

const storyPortraits = [
  "/fixtures/story-avatar-1.svg",
  "/fixtures/story-avatar-2.svg",
  "/fixtures/story-avatar-3.svg",
  "/fixtures/story-avatar-4.svg",
  "/fixtures/story-avatar-5.svg",
  "/fixtures/story-avatar-6.svg",
  "/fixtures/story-avatar-7.svg",
];

const demoStories = ["Demo · Aria", "Demo · Luna", "Demo · Chloe", "Demo · Mia"];

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
          <span className="home-v2-story-ring"><img src={storyPortraits[index % 3]} alt="" loading="lazy" /></span><span>{character.name.split(" ")[0]}</span>
        </button>
      ))}
      {process.env.NODE_ENV === "development" && demoStories.map((label, index) => (
        <div className="home-v2-story is-demo" key={label} aria-label={`${label}, development-only layout fixture`}>
          <span className="home-v2-story-ring"><img src={storyPortraits[index + 3]} alt="" loading="lazy" /></span><span>{label}</span>
        </div>
      ))}
    </section>
  );
}

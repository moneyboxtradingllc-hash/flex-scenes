"use client";

import { useEffect, useState } from "react";
import type { AppSnapshot, MediaAsset } from "@/lib/domain";
import { UiIcon } from "@/components/ui-icon";

function relativeTime(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

function RelativeTime({ value }: { value: string }) {
  const [label, setLabel] = useState("Recent");
  useEffect(() => {
    const update = () => setLabel(relativeTime(value));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [value]);
  return <span>{label}</span>;
}

export function PremiumHome({
  data,
  select,
  favorite,
  reference,
  create,
  setCharacter,
  openCharacter,
}: {
  data: AppSnapshot;
  select: (media: MediaAsset) => void;
  favorite: (id: string) => void;
  reference: (id: string) => void;
  create: (media?: MediaAsset, mode?: "image" | "video") => void;
  setCharacter: (id: string) => void;
  openCharacter: () => void;
}) {
  const characters = data.characters;
  const media = [...data.media].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)).slice(0, 8);

  return (
    <div className="home-surface" data-ui-v2="home">
      <h1 className="sr-only">Flex Scenes home</h1>
      <section className="home-stories" aria-label="Your characters">
        <button className="home-story" onClick={() => create()} aria-label="Create a new scene">
          <span className="home-story-ring home-story-add"><span>+</span></span>
          <span>Your Story</span>
        </button>
          {characters.map((character) => (
          <button
            className="home-story"
            key={character.id}
            onClick={() => { setCharacter(character.id); openCharacter(); }}
            aria-label={`Open ${character.name}'s character profile`}
          >
            <span className="home-story-ring">
              <img src={character.portraitUrl} alt="" />
            </span>
            <span>{character.name.split(" ")[0]}</span>
          </button>
        ))}
      </section>

      {media.length ? (
        <div className="home-feed" aria-label="Recent scenes">
          {media.map((asset) => {
            const character = characters.find((entry) => entry.id === asset.characterId);
            const caption = /provider|mock image|mock video|created with/i.test(asset.caption)
              ? asset.title === "Deterministic test frame" ? "" : asset.title
              : asset.caption || asset.title;
            return (
              <article className="home-post" key={asset.id}>
                <header className="home-post-header">
                  <button className="home-post-identity" onClick={() => { setCharacter(asset.characterId); openCharacter(); }}>
                    <span className="home-avatar-ring"><img src={character?.portraitUrl ?? "/fixtures/char-nova-portrait.svg"} alt="" /></span>
                    <span className="home-post-byline">
                      <strong>{character?.name ?? "Flex Scenes"}</strong>
                      <RelativeTime value={asset.createdAt} />
                    </span>
                  </button>
                  <button className="home-icon-button" aria-label={`More actions for ${asset.title}`} onClick={() => select(asset)}>
                    <UiIcon name="more" />
                  </button>
                </header>

                <button className="home-post-media" onClick={() => select(asset)} aria-label={`Open ${asset.title} in Media Detail`}>
                  <img src={asset.posterUrl ?? asset.url} alt={asset.title} />
                  {asset.type === "video" && <span className="home-video-badge"><span className="home-video-play">▶</span> Video preview</span>}
                </button>

                <div className="home-post-actions">
                  <div className="home-action-group">
                    <button className={`home-icon-button home-favorite ${asset.favorite ? "is-favorite" : ""}`} aria-label={asset.favorite ? "Remove from favorites" : "Add to favorites"} aria-pressed={asset.favorite} onClick={() => favorite(asset.id)}>
                      <UiIcon name="heart" />
                    </button>
                    <button className="home-icon-button" aria-label="Open notes and details" onClick={() => select(asset)}><UiIcon name="notes" /></button>
                    <button className="home-icon-button" aria-label={asset.type === "video" ? "Remix video" : "Remix image"} onClick={() => create(asset, asset.type === "video" ? "video" : "image")}><UiIcon name="remix" /></button>
                    <button className="home-icon-button" aria-label="Use as reference" onClick={() => reference(asset.id)}><UiIcon name="reference" /></button>
                  </div>
                  <button className="home-icon-button" aria-label="Open collections and media details" onClick={() => select(asset)}><UiIcon name="library" /></button>
                </div>

                <div className="home-post-caption">
                  <p><strong>{character?.name ?? "Scene"}</strong>{caption && <span>{caption}</span>}</p>
                  <span className="sr-only">{asset.type === "video" ? "Video preview" : "Image creation"}</span>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="home-empty">
          <span className="home-empty-mark"><UiIcon name="create" /></span>
          <h1>Your next scene starts here</h1>
          <p>Make something new with your characters. Your private creations will live here.</p>
          <button onClick={() => create()}>Create a scene</button>
        </section>
      )}
    </div>
  );
}

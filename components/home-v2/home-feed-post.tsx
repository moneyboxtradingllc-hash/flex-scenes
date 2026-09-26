"use client";

import type { AppSnapshot, MediaAsset } from "@/lib/domain";
import { UiIcon } from "@/components/ui-icon";
import { HomeRelativeTime } from "./home-relative-time";
import { LibraryCharacterPortrait } from "@/components/library-media-thumbnail";

export function HomeFeedPost({ asset, character, onOpen, onFavorite, onReference, onRemix, onCharacter, priority = false }: {
  asset: MediaAsset;
  character?: AppSnapshot["characters"][number];
  onOpen: (asset: MediaAsset) => void;
  onFavorite: (id: string) => void;
  onReference: (id: string) => void;
  onRemix: (asset: MediaAsset) => void;
  onCharacter: (id: string) => void;
  priority?: boolean;
}) {
  const caption = /provider|mock image|mock video|created with/i.test(asset.caption)
    ? (asset.title === "Deterministic test frame" ? "" : asset.title)
    : (asset.caption || asset.title);
  return (
    <article className="home-v2-post">
      <header className="home-v2-post-header">
        <button className="home-v2-post-person" onClick={() => character && onCharacter(character.id)} aria-label={character ? `Open ${character.name}` : "Open character"}>
          <span className="home-v2-avatar-ring"><LibraryCharacterPortrait src={character?.portraitUrl ?? ""} name={character?.name ?? ""} /></span>
          <span><b>{character?.name ?? "Flex Scenes"}</b><HomeRelativeTime value={asset.createdAt} className="home-v2-time" /></span>
        </button>
        <button className="home-v2-icon-button" aria-label={`More about ${asset.title}`} onClick={() => onOpen(asset)}><UiIcon name="more" /></button>
      </header>
      <button className={`home-v2-media ${asset.type === "video" ? "is-video-preview" : ""}`} onClick={() => onOpen(asset)} aria-label={`Open ${asset.title} in Media Detail`}>
        <img src={asset.posterUrl ?? asset.url} alt={asset.title} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} />
        {asset.type === "video" && <span className="home-v2-media-label"><span>▶</span> Video preview</span>}
      </button>
      <div className="home-v2-post-actions">
        <div className="home-v2-post-action-group">
          <button className={`home-v2-icon-button home-v2-like ${asset.favorite ? "is-favorite" : ""}`} aria-label={asset.favorite ? "Remove favorite" : "Add favorite"} aria-pressed={asset.favorite} onClick={() => onFavorite(asset.id)}><UiIcon name="heart" /></button>
          <button className="home-v2-icon-button" aria-label="Open notes" onClick={() => onOpen(asset)}><UiIcon name="notes" /></button>
          <button className="home-v2-icon-button" aria-label={asset.type === "video" ? "Remix video" : "Remix image"} onClick={() => onRemix(asset)}><UiIcon name="remix" /></button>
          <button className="home-v2-icon-button" aria-label="Use as reference" onClick={() => onReference(asset.id)}><UiIcon name="reference" /></button>
        </div>
        <button className="home-v2-icon-button" aria-label="Open collections and media details" onClick={() => onOpen(asset)}><UiIcon name="bookmark" /></button>
      </div>
      <div className="home-v2-caption"><b>{character?.name ?? "Scene"}</b>{caption && <span>{caption}</span>}</div>
    </article>
  );
}

"use client";

import type { AppSnapshot, MediaAsset } from "@/lib/domain";
import { UiIcon } from "@/components/ui-icon";
import { HomeRelativeTime } from "./home-relative-time";
import { LibraryCharacterPortrait } from "@/components/library-media-thumbnail";

export function HomeDesktopFeatureCard({ asset, character, data, onOpen, onFavorite, onReference, onRemix, onCharacter, onMessage, onCreate }: {
  asset: MediaAsset;
  character?: AppSnapshot["characters"][number];
  data: AppSnapshot;
  onOpen: (asset: MediaAsset) => void;
  onFavorite: (id: string) => void;
  onReference: (id: string) => void;
  onRemix: (asset: MediaAsset) => void;
  onCharacter: (id: string) => void;
  onMessage: (id: string) => void;
  onCreate: () => void;
}) {
  const refs = data.characterReferences.filter((reference) => reference.characterId === character?.id && reference.active).slice(0, 3);
  const mediaReaction = data.mediaReactions.find((item) => item.mediaId === asset.id);
  const reaction = mediaReaction && data.messages.find((message) => message.id === mediaReaction.messageId);
  const conversation = reaction && data.conversations.find((item) => item.id === reaction.conversationId);
  const parent = asset.parentId ? data.media.find((item) => item.id === asset.parentId) : undefined;
  const children = data.media.filter((item) => item.parentId === asset.id).length;
  const caption = /provider|mock image|mock video|created with/i.test(asset.caption) ? asset.title : asset.caption || asset.title;

  return <article className="home-v2-feature-card">
    <div className="home-v2-feature-media-column">
      <button className={`home-v2-feature-media ${asset.type === "video" ? "is-video" : ""}`} onClick={() => onOpen(asset)} aria-label={`Open ${asset.title} in Media Detail`}>
        <img src={asset.posterUrl ?? asset.url} alt={asset.title} fetchPriority="high" />
        {asset.type === "video" && <span className="home-v2-feature-video-label">Video preview</span>}
      </button>
      <div className="home-v2-feature-actions" aria-label="Scene actions">
        <button aria-label={asset.favorite ? "Remove favorite" : "Add favorite"} aria-pressed={asset.favorite} className={asset.favorite ? "is-favorite" : ""} onClick={() => onFavorite(asset.id)}><UiIcon name="heart" /></button>
        <button aria-label="Open private notes and details" onClick={() => onOpen(asset)}><UiIcon name="notes" /></button>
        <button aria-label={asset.type === "video" ? "Remix video" : "Remix image"} onClick={() => onRemix(asset)}><UiIcon name="remix" /></button>
        {asset.type === "image" && <button aria-label="Animate this image" onClick={onCreate}><UiIcon name="reels" /></button>}
        <button aria-label="Use as reference" onClick={() => onReference(asset.id)}><UiIcon name="reference" /></button>
        <button aria-label="Open collections" onClick={() => onOpen(asset)}><UiIcon name="bookmark" /></button>
      </div>
      <p className="home-v2-feature-caption"><b>{character?.name ?? "Scene"}</b><span>{caption}</span></p>
    </div>
    <aside className="home-v2-feature-context" aria-label="Scene context">
      <header className="home-v2-feature-identity">
        <button onClick={() => character && onCharacter(character.id)} aria-label={character ? `Open ${character.name}` : "Open character"}>
          <LibraryCharacterPortrait src={character?.portraitUrl ?? ""} name={character?.name ?? ""} />
        </button>
        <div><button onClick={() => character && onCharacter(character.id)}>{character?.name ?? "Flex Scenes"}</button><small><HomeRelativeTime value={asset.createdAt} /></small></div>
        <button className="home-v2-feature-more" aria-label="Open Media Detail" onClick={() => onOpen(asset)}><UiIcon name="more" /></button>
      </header>
      <div className="home-v2-feature-context-body">
        <h1>{asset.title}</h1>
        {caption && <p>{caption}</p>}
        {reaction && <button className="home-v2-character-reaction" onClick={() => onMessage(conversation!.id)}>
          <span className="home-v2-reaction-label">From {character?.name ?? "your character"}</span>
          <span>“{reaction.body}”</span>
          <small>Open conversation <span aria-hidden="true">→</span></small>
        </button>}
        {refs.length > 0 && <section className="home-v2-context-section">
          <h2>References</h2>
          <div className="home-v2-context-refs">{refs.map((reference) => {
            const media = data.media.find((item) => item.id === reference.mediaId);
            if (!media) return null;
            return <button key={reference.mediaId} onClick={() => onOpen(media)} aria-label={`Open ${reference.label}`}><img src={media.posterUrl ?? media.url} alt="" /><span>{reference.label}</span></button>;
          })}</div>
        </section>}
        {data.notes[asset.id] && <section className="home-v2-context-section"><h2>Private note</h2><p className="home-v2-private-note">{data.notes[asset.id]}</p></section>}
        {(parent || children > 0) && <section className="home-v2-context-section">
          <h2>Lineage</h2>
          <button className="home-v2-lineage-summary" onClick={() => onOpen(parent ?? asset)}>
            <span>{parent ? parent.title : "Original scene"}</span><span aria-hidden="true">→</span><span>{asset.title}</span>
            {children > 0 && <small>{children} {children === 1 ? "remix or animation" : "remixes or animations"}</small>}
          </button>
        </section>}
      </div>
      <footer className="home-v2-feature-footer">
        <button onClick={() => onOpen(asset)}>Open details</button>
        {conversation && <button onClick={() => onMessage(conversation.id)}>Reply</button>}
        {asset.type === "image" ? <button className="is-primary" onClick={onCreate}>Animate this</button> : <button className="is-primary" onClick={() => onRemix(asset)}>Remix video</button>}
      </footer>
    </aside>
  </article>;
}

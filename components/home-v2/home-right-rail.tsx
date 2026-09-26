"use client";

import type { HomeActions } from "./home-v2";
import { UiIcon } from "@/components/ui-icon";
import { HomeRelativeTime } from "./home-relative-time";
import { LibraryCharacterPortrait } from "@/components/library-media-thumbnail";

export function HomeRightRail({ data, character, navigate, openConversation, select }: Pick<HomeActions, "data" | "character" | "navigate" | "openConversation" | "select">) {
  const characterMedia = data.media.filter((asset) => asset.characterId === character?.id);
  const images = characterMedia.filter((asset) => asset.type === "image").length;
  const videos = characterMedia.filter((asset) => asset.type === "video").length;
  const scenes = [...data.media].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 3);
  const conversations = data.conversations
    .filter((conversation) => data.characters.some((item) => item.id === conversation.characterId))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 3);

  return (
    <aside className="home-v2-right-rail" aria-label="Home context">
      <div className="home-v2-top-actions">
        <button aria-label="Search characters and scenes" onClick={() => navigate("explore")}><UiIcon name="explore" /></button>
        <button aria-label="Open activity" onClick={() => navigate("jobs")}><UiIcon name="notification" /></button>
        {character && <button className="home-v2-user-avatar" aria-label={`Open ${character.name}`} onClick={() => navigate("character")}><LibraryCharacterPortrait src={character.portraitUrl} name={character.name} /></button>}
      </div>

      {character && <section className="home-v2-character-section" aria-label="Active character">
        <div className="home-v2-character-card">
          <button className="home-v2-character-identity" onClick={() => navigate("character")}>
            <LibraryCharacterPortrait src={character.portraitUrl} name={character.name} />
          <span><b>{character.name}</b><small>{character.handle}</small><p className="home-v2-character-bio">{character.description}</p></span>
          </button>
        <div className="home-v2-character-stats" aria-label={`${characterMedia.length} scenes, ${images} images, ${videos} videos`}>
          <span><b>{characterMedia.length}</b><small>Scenes</small></span>
          <span><b>{images}</b><small>Images</small></span>
          <span><b>{videos}</b><small>Videos</small></span>
        </div>
        <button className="home-v2-message-cta" onClick={() => {
          const conversation = data.conversations.find((item) => item.characterId === character.id);
          if (conversation) openConversation(conversation.id); else navigate("messages");
        }}><UiIcon name="messages" /> Chat with {character.name.split(" ")[0]}</button>
        </div>
      </section>}

      <section className="home-v2-rail-section">
        <header><h2>Recent Scenes</h2><button onClick={() => navigate("library")}>See all</button></header>
        <div className="home-v2-recent-scenes">
          {scenes.map((asset) => <button key={asset.id} onClick={() => select(asset)} aria-label={`Open ${asset.title}`}>
            <img src={asset.posterUrl ?? asset.url} alt="" loading="lazy" />
            {asset.type === "video" && <span className="home-v2-scene-duration">▶&nbsp; Video</span>}
          </button>)}
        </div>
      </section>

      <section className="home-v2-rail-section home-v2-recent-messages">
        <header><h2>Recent Messages</h2><button onClick={() => navigate("messages")}>See all</button></header>
        <div className="home-v2-message-list">
          {conversations.map((conversation) => {
            const person = data.characters.find((item) => item.id === conversation.characterId);
            const last = data.messages.filter((message) => message.conversationId === conversation.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
            if (!person) return null;
            return <button key={conversation.id} className="home-v2-message-row" onClick={() => openConversation(conversation.id)}>
              <LibraryCharacterPortrait src={person.portraitUrl} name={person.name} />
              <span><b>{person.name.split(" ")[0]}</b><small>{last?.body ?? "Open conversation"}</small></span>
              <HomeRelativeTime value={conversation.updatedAt} className="home-v2-time" />
              {conversation.unread && <i aria-label="Unread" />}
            </button>;
          })}
        </div>
      </section>
    </aside>
  );
}

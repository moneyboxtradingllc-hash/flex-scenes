"use client";

import { UiIcon } from "@/components/ui-icon";
import { LibraryCharacterPortrait } from "@/components/library-media-thumbnail";
import type { HomeActions, HomeDestination } from "./home-v2";

const mainItems: Array<[HomeDestination, string]> = [
  ["home", "Home"], ["explore", "Explore"], ["create", "Create"],
  ["reels", "Reels"], ["library", "Library"], ["messages", "Messages"], ["character", "Character Hub"],
];

export function HomeLeftNav({ data, character, navigate }: Pick<HomeActions, "data" | "character" | "navigate">) {
  const related = data.media.filter((asset) => asset.characterId === character?.id);
  const images = related.filter((asset) => asset.type === "image").length;
  const videos = related.length - images;
  return (
    <aside className="home-v2-left-nav" aria-label="Application navigation">
      <button className="home-v2-brand" onClick={() => navigate("home")} aria-label="Flex Scenes home"><span>FLEX</span><span>SCENES</span></button>
      {character && <section className="home-v2-left-character" aria-label="Active character">
        <button className="home-v2-left-character-portrait" onClick={() => navigate("character")} aria-label={`Open ${character.name}`}><LibraryCharacterPortrait src={character.portraitUrl} name={character.name} /></button>
        <button className="home-v2-left-character-name" onClick={() => navigate("character")}><b>{character.name}</b><span>{character.handle}</span></button>
        <p>{character.description}</p>
        <div className="home-v2-left-stats"><span><b>{related.length}</b><small>Scenes</small></span><span><b>{images}</b><small>Images</small></span><span><b>{videos}</b><small>Videos</small></span></div>
      </section>}
      <nav className="home-v2-nav-main" aria-label="Main navigation">
        {mainItems.map(([destination, label]) => (
          <button key={destination} className={`home-v2-nav-item ${destination === "home" ? "is-active" : ""} ${destination === "create" ? "is-create" : ""}`} aria-current={destination === "home" ? "page" : undefined} onClick={() => navigate(destination)}>
            <UiIcon name={destination === "character" ? "profile" : destination as "home" | "explore" | "create" | "reels" | "library" | "messages"} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="home-v2-quick-access">
        <p>Quick Access</p>
        <button onClick={() => navigate("library")}><UiIcon name="heart"/><span>Favorites</span></button>
        <button onClick={() => navigate("collections")}><UiIcon name="collections"/><span>Collections</span></button>
        <button onClick={() => navigate("jobs")}><UiIcon name="jobs"/><span>Activity</span></button>
      </div>
      <button className="home-v2-settings-link" onClick={() => navigate("settings")}><UiIcon name="profile"/><span>Settings</span></button>
    </aside>
  );
}

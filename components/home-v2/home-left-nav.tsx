"use client";

import { UiIcon } from "@/components/ui-icon";
import type { HomeActions, HomeDestination } from "./home-v2";

const mainItems: Array<[HomeDestination, string]> = [
  ["home", "Home"], ["explore", "Explore"], ["create", "Create"],
  ["reels", "Reels"], ["library", "Library"], ["messages", "Messages"], ["character", "Character Hub"],
];

export function HomeLeftNav({ navigate }: Pick<HomeActions, "navigate">) {
  return (
    <aside className="home-v2-left-nav" aria-label="Application navigation">
      <button className="home-v2-brand" onClick={() => navigate("home")} aria-label="Flex Scenes home"><span>FLEX</span><span>SCENES</span></button>
      <nav className="home-v2-nav-main" aria-label="Main navigation">
        {mainItems.map(([destination, label]) => (
          <button key={destination} className={`home-v2-nav-item ${destination === "home" ? "is-active" : ""} ${destination === "create" ? "is-create" : ""}`} aria-current={destination === "home" ? "page" : undefined} onClick={() => navigate(destination)}>
            <UiIcon name={destination === "character" ? "profile" : destination as Exclude<HomeDestination, "character" | "lab">} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="home-v2-quick-access">
        <p>Quick Access</p>
        <button onClick={() => navigate("library")}><UiIcon name="heart"/><span>Liked</span></button>
        <button onClick={() => navigate("library")}><UiIcon name="library"/><span>Saved</span></button>
        <button onClick={() => navigate("library")}><UiIcon name="jobs"/><span>History</span></button>
      </div>
    </aside>
  );
}

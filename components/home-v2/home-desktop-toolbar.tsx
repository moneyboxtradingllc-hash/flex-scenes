"use client";

import { UiIcon } from "@/components/ui-icon";
import type { HomeActions, HomeDestination } from "./home-v2";

const links: Array<[HomeDestination, string]> = [["home", "Home"], ["explore", "Explore"], ["reels", "Reels"], ["library", "Library"]];

export function HomeDesktopToolbar({ navigate }: Pick<HomeActions, "navigate">) {
  return <header className="home-v2-workspace-toolbar">
    <button className="home-v2-search-trigger" aria-label="Search characters, scenes, or prompts" onClick={() => navigate("explore")}>
      <UiIcon name="explore" /><span>Search characters, scenes, prompts...</span><kbd>⌘ K</kbd>
    </button>
    <nav aria-label="Workspace shortcuts">
      {links.map(([destination, label]) => <button key={destination} onClick={() => navigate(destination)} aria-current={destination === "home" ? "page" : undefined}>{label}</button>)}
    </nav>
    <div className="home-v2-toolbar-actions">
      <button aria-label="Open Messages" onClick={() => navigate("messages")}><UiIcon name="messages" /></button>
      <button aria-label="Open Activity" onClick={() => navigate("jobs")}><UiIcon name="notification" /></button>
      <button className="is-create" onClick={() => navigate("create")}><UiIcon name="create" /><span>Create</span></button>
    </div>
  </header>;
}

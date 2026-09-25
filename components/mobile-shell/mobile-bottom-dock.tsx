"use client";

import type { MobilePrimaryDestination } from "./mobile-route-chrome";
import { UiIcon } from "@/components/ui-icon";

const items: Array<[Extract<MobilePrimaryDestination, "home" | "explore" | "create" | "reels" | "library">, string]> = [["home", "Home"], ["explore", "Explore"], ["create", "Create"], ["reels", "Reels"], ["library", "Library"]];

export function MobileBottomDock({ view, navigate }: { view: string; navigate: (destination: MobilePrimaryDestination) => void }) {
  return <nav className="mobile-bottom-dock" aria-label="Main navigation">
    {items.map(([destination, label]) => <button key={destination} className={`mobile-dock-item ${destination === "create" ? "is-create" : ""} ${view === destination ? "is-active" : ""}`} onClick={() => navigate(destination)} aria-current={view === destination ? "page" : undefined} aria-label={destination === "create" ? "Create a scene" : label}>
      <span className="mobile-dock-icon"><UiIcon name={destination} /></span><small>{label}</small>
    </button>)}
  </nav>;
}

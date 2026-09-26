"use client";

import { useState } from "react";
import type { AppSnapshot } from "@/lib/domain";
import type { MobilePrimaryDestination } from "./mobile-route-chrome";
import { UiIcon } from "@/components/ui-icon";
import { mobileCharacterAvatar } from "./mobile-character-avatar";
import { LibraryCharacterPortrait } from "@/components/library-media-thumbnail";

const entries: Array<[MobilePrimaryDestination, string, "home" | "messages" | "profile" | "collections" | "jobs"]> = [
  ["home", "Home", "home"],
  ["messages", "Messages", "messages"],
  ["character", "Character Hub", "profile"],
  ["collections", "Collections", "collections"],
  ["jobs", "Activity", "jobs"],
  ["settings", "Settings", "profile"],
];

export function MobileAppMenu({ characters, character, navigate, setCharacter, close }: {
  characters: AppSnapshot["characters"];
  character?: AppSnapshot["characters"][number];
  navigate: (destination: MobilePrimaryDestination) => void;
  setCharacter: (id: string) => void;
  close: () => void;
}) {
  const [switching, setSwitching] = useState(false);
  return <section className="mobile-app-menu" id="mobile-app-menu" aria-label="Flex Scenes menu">
    {character && <div className="mobile-menu-active-character">
      <button className="mobile-menu-character-link" onClick={() => { close(); navigate("character"); }}>
        <LibraryCharacterPortrait src={mobileCharacterAvatar(character.id, characters)} name={character.name} />
        <span><small>ACTIVE CHARACTER</small><b>{character.name}</b></span>
      </button>
      <button className="mobile-menu-switch" aria-expanded={switching} onClick={() => setSwitching((value) => !value)}>{switching ? "Done" : "Switch"}</button>
    </div>}
    {switching && <div className="mobile-menu-character-list" aria-label="Choose character">
      {characters.map((item) => <button key={item.id} aria-current={item.id === character?.id ? "true" : undefined} onClick={() => { setCharacter(item.id); close(); }}>
        <LibraryCharacterPortrait src={mobileCharacterAvatar(item.id, characters)} name={item.name} /><span>{item.name}</span>{item.id === character?.id && <span className="mobile-menu-check" aria-hidden="true">✓</span>}
      </button>)}
    </div>}
    <nav aria-label="Application menu">
      {entries.map(([destination, label, icon]) => <button key={destination} onClick={() => { close(); navigate(destination); }}>
        <UiIcon name={icon} /><span>{label}</span><span className="mobile-menu-chevron" aria-hidden="true">›</span>
      </button>)}
    </nav>
  </section>;
}

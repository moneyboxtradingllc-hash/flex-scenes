"use client";

import type { AppSnapshot } from "@/lib/domain";
import type { MobilePrimaryDestination } from "./mobile-route-chrome";
import { mobileRouteChrome } from "./mobile-route-chrome";
import { MobileTopBar } from "./mobile-top-bar";
import { MobileBottomDock } from "./mobile-bottom-dock";
import "./mobile-shell.css";

export function MobileAppShell({ view, characters, character, navigate, setCharacter, messageThread = false, overlayOpen = false }: {
  view: string;
  characters: AppSnapshot["characters"];
  character?: AppSnapshot["characters"][number];
  navigate: (destination: MobilePrimaryDestination) => void;
  setCharacter: (id: string) => void;
  messageThread?: boolean;
  overlayOpen?: boolean;
}) {
  const chrome = mobileRouteChrome(view, { messageThread, overlayOpen });
  if (!chrome.topBar && !chrome.bottomDock) return null;
  return <div className="mobile-app-shell" data-mobile-shell data-route={view} data-message-thread={messageThread || undefined}>
    {chrome.topBar && <MobileTopBar view={view} character={character} characters={characters} navigate={navigate} setCharacter={setCharacter} minimal={chrome.minimalTopBar} />}
    {chrome.bottomDock && <MobileBottomDock view={view} navigate={navigate} />}
  </div>;
}

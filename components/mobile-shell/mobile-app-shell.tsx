"use client";

import type { AppSnapshot } from "@/lib/domain";
import { useEffect, useState } from "react";
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
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    if (view !== "explore") return;
    const update = () => {
      const active = document.activeElement;
      const searchFocused = active instanceof HTMLInputElement && active.type === "search";
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      setKeyboardOpen(searchFocused && window.innerHeight - viewportHeight > 120);
    };
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    update();
    return () => {
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, [view]);
  if (!chrome.topBar && !chrome.bottomDock) return null;
  return <div className="mobile-app-shell" data-mobile-shell data-route={view} data-message-thread={messageThread || undefined} data-keyboard-open={view === "explore" && keyboardOpen || undefined}>
    {chrome.topBar && <MobileTopBar view={view} character={character} characters={characters} navigate={navigate} setCharacter={setCharacter} minimal={chrome.minimalTopBar} flow={chrome.flowTopBar} />}
    {chrome.bottomDock && <MobileBottomDock view={view} navigate={navigate} />}
  </div>;
}

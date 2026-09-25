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
    const viewportHeight = () => window.visualViewport?.height ?? window.innerHeight;
    let baselineHeight = viewportHeight();
    let viewportWidth = window.innerWidth;
    let orientation = window.screen.orientation?.angle ?? (window.matchMedia("(orientation: portrait)").matches ? 0 : 90);
    let keyboardIsOpen = false;
    const setOpen = (open: boolean) => {
      if (keyboardIsOpen === open) return;
      keyboardIsOpen = open;
      setKeyboardOpen(open);
    };
    const update = () => {
      const active = document.activeElement;
      const searchFocused = active instanceof HTMLInputElement && active.type === "search";
      const height = viewportHeight();
      const currentOrientation = window.screen.orientation?.angle ?? (window.matchMedia("(orientation: portrait)").matches ? 0 : 90);
      if (currentOrientation !== orientation || Math.abs(window.innerWidth - viewportWidth) > 80) {
        orientation = currentOrientation;
        viewportWidth = window.innerWidth;
        baselineHeight = height;
        setOpen(false);
        return;
      }

      // Browser toolbars can move the visual viewport by several dozen pixels.
      // A keyboard causes a much larger drop relative to this orientation's
      // largest observed no-keyboard viewport. Keep the baseline while open so
      // dismissal is recognized even if the search field remains focused.
      const keyboardThreshold = Math.max(140, baselineHeight * 0.18);
      if (keyboardIsOpen) {
        if (!searchFocused || height >= baselineHeight - keyboardThreshold) {
          setOpen(false);
          baselineHeight = Math.max(baselineHeight, height);
        }
        return;
      }

      if (searchFocused && baselineHeight - height > keyboardThreshold) {
        setOpen(true);
        return;
      }
      baselineHeight = Math.max(baselineHeight, height);
    };
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    update();
    return () => {
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
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

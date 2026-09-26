"use client";

import { useEffect, useRef, useState } from "react";
import type { AppSnapshot } from "@/lib/domain";
import type { MobilePrimaryDestination } from "./mobile-route-chrome";
import { UiIcon } from "@/components/ui-icon";
import { MobileAppMenu } from "./mobile-app-menu";
import { mobileCharacterAvatar } from "./mobile-character-avatar";
import { LibraryCharacterPortrait } from "@/components/library-media-thumbnail";

export function MobileTopBar({ view, character, characters, navigate, setCharacter, minimal = false, flow = false }: {
  view: string;
  character?: AppSnapshot["characters"][number];
  characters: AppSnapshot["characters"];
  navigate: (destination: MobilePrimaryDestination) => void;
  setCharacter: (id: string) => void;
  minimal?: boolean;
  flow?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const focusFirstItem = window.requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>("#mobile-app-menu nav button")?.focus());
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        titleRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFirstItem);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !flow || !barRef.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) setOpen(false);
    });
    observer.observe(barRef.current);
    return () => observer.disconnect();
  }, [flow, open]);

  const title = view === "create" ? "Create" : view === "progress" ? "Progress" : view === "result" ? "Result" : "FLEX SCENES";
  const searchAction = ["home", "explore", "library"].includes(view);
  const showMessages = ["home", "explore", "reels", "library", "character", "collections", "jobs", "settings"].includes(view);
  const showActivity = view === "home";
  return <div className={`mobile-top-layer ${view === "home" ? "is-home" : ""} ${flow ? "is-flow" : ""} ${minimal ? "is-minimal" : ""}`}>
    <div className="mobile-top-cluster" ref={rootRef}>
      <div className="mobile-top-bar" ref={barRef}>
      <button ref={titleRef} className="mobile-top-title" aria-label="Open Flex Scenes menu" aria-expanded={open} aria-controls="mobile-app-menu" onClick={() => setOpen((value) => !value)}>
        <span className={title === "FLEX SCENES" ? "mobile-brand-wordmark" : ""}>{title === "FLEX SCENES" ? <>FLEX <b>SCENES</b></> : title}</span>
        <span className="mobile-title-chevron" aria-hidden="true">⌄</span>
      </button>
      <div className="mobile-top-actions">
        {searchAction && <button aria-label="Search characters and scenes" onClick={() => navigate("explore")}><UiIcon name="explore" /></button>}
        {showActivity && <button aria-label="Open Activity" onClick={() => navigate("jobs")}><UiIcon name="notification" /><i aria-hidden="true" /></button>}
        {showMessages && <button aria-label="Open Messages" onClick={() => navigate("messages")}><UiIcon name="messages" /></button>}
        {character && <button className="mobile-top-character" aria-label={`Open ${character.name}`} onClick={() => navigate("character")}><LibraryCharacterPortrait src={mobileCharacterAvatar(character.id, characters)} name={character.name} /></button>}
      </div>
      </div>
      {open && <MobileAppMenu characters={characters} character={character} navigate={navigate} setCharacter={setCharacter} close={() => setOpen(false)} />}
    </div>
  </div>;
}

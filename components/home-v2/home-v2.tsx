"use client";

import type { ReactNode } from "react";
import type { AppSnapshot, MediaAsset } from "@/lib/domain";
import { HomeDesktop, HomeMobile } from "./home-desktop";
import "./home-v2.css";

export type HomeDestination = "home" | "explore" | "create" | "reels" | "library" | "messages" | "character" | "jobs" | "collections" | "settings" | "lab";

export type HomeActions = {
  data: AppSnapshot;
  character?: AppSnapshot["characters"][number];
  detail: ReactNode;
  navigate: (destination: HomeDestination) => void;
  openConversation: (id: string) => void;
  setCharacter: (id: string) => void;
  select: (asset: MediaAsset) => void;
  favorite: (id: string) => void;
  reference: (id: string) => void;
  create: (asset?: MediaAsset, mode?: "image" | "video") => void;
};

export function HomeV2(props: HomeActions) {
  return (
    <div className="home-v2" data-ui-v2="home" data-home-architecture="dedicated">
      <HomeDesktop {...props} />
      <HomeMobile {...props} />
      {props.detail}
    </div>
  );
}

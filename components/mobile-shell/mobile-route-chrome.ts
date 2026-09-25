import type { HomeDestination } from "@/components/home-v2/home-v2";

export type MobilePrimaryDestination = Extract<HomeDestination, "home" | "explore" | "create" | "reels" | "library" | "messages" | "character" | "jobs" | "collections" | "settings">;

export function mobileRouteChrome(view: string, options: { messageThread?: boolean; overlayOpen?: boolean } = {}) {
  const focused = ["create", "progress", "result"].includes(view) || options.overlayOpen === true;
  const thread = view === "messages" && options.messageThread === true;
  const hidden = view === "lab";
  return {
    topBar: !hidden && !thread && view !== "reels",
    flowTopBar: ["home", "explore"].includes(view),
    bottomDock: !hidden && !focused && !thread && view !== "messages" && view !== "reels",
    minimalTopBar: ["reels", "create", "progress", "result"].includes(view),
  };
}

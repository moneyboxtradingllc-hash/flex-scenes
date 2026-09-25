type IconName = "home" | "explore" | "create" | "reels" | "messages" | "library" | "profile" | "jobs" | "collections" | "heart" | "notes" | "more" | "reference" | "remix" | "notification" | "bookmark";

export function UiIcon({ name, className }: { name: IconName; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  let shape;
  switch (name) {
    case "home": shape = <><path d="m3.5 10 8.5-7 8.5 7"/><path d="M5.5 9v11h13V9M9.5 20v-6h5v6"/></>; break;
    case "explore": shape = <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.2 4.2"/></>; break;
    case "create": shape = <><path d="M12 5v14M5 12h14"/></>; break;
    case "reels": shape = <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 8 6 4-6 4z"/></>; break;
    case "messages": shape = <><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-6.5A7.5 7.5 0 1 1 20 11.5Z"/><path d="M8 11h8M8 14h5"/></>; break;
    case "library": shape = <><rect x="3.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.2"/></>; break;
    case "profile": shape = <><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></>; break;
    case "jobs": shape = <><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/></>; break;
    case "collections": shape = <><path d="M4 4h16v16H4z"/><path d="M8 4v16M12 4v16M16 4v16M4 8h16M4 12h16M4 16h16"/></>; break;
    case "heart": shape = <path d="M20.4 8.7c0 4.6-8.4 10-8.4 10s-8.4-5.4-8.4-10A4.2 4.2 0 0 1 12 6.1a4.2 4.2 0 0 1 8.4 2.6Z"/>; break;
    case "notes": shape = <><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-6.5A7.5 7.5 0 1 1 20 11.5Z"/><path d="M8 10h8M8 14h6"/></>; break;
    case "more": shape = <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>; break;
    case "reference": shape = <><path d="M12 4v16M4 12h16"/><path d="M5 5h5M14 19h5"/></>; break;
    case "remix": shape = <><path d="M4 7h9a4 4 0 0 1 4 4v1"/><path d="m14 9 3 3 3-3"/><path d="M20 17h-9a4 4 0 0 1-4-4v-1"/><path d="m10 15-3-3-3 3"/></>; break;
    case "notification": shape = <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>; break;
    case "bookmark": shape = <path d="M6 4.5h12v16l-6-4-6 4z"/>; break;
  }
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" {...common}>{shape}</svg>;
}

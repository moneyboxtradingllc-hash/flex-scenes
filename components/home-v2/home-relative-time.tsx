"use client";

import { useEffect, useState } from "react";

export function HomeRelativeTime({ value, className }: { value: string; className?: string }) {
  const [label, setLabel] = useState("Recent");
  useEffect(() => {
    const update = () => setLabel(relativeTime(value));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [value]);
  return <span className={className}>{label}</span>;
}

function relativeTime(value: string) {
  const minutes = Math.floor(Math.max(0, Date.now() - Date.parse(value)) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

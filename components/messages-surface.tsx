"use client";

import { useMemo, useState } from "react";
import type { AppSnapshot, MediaAsset } from "@/lib/domain";

type CreateScene = (
  media?: MediaAsset,
  conversationId?: string,
  characterId?: string,
  mode?: "image" | "video",
) => void;

function relativeTime(value: string) {
  const minutes = Math.max(
    1,
    Math.round((Date.now() - new Date(value).getTime()) / 60000),
  );
  return minutes < 60
    ? `${minutes}m`
    : minutes < 1440
      ? `${Math.round(minutes / 60)}h`
      : `${Math.round(minutes / 1440)}d`;
}

export function SceneProposalCard({
  character,
  onCreate,
}: {
  character?: AppSnapshot["characters"][number];
  onCreate: () => void;
}) {
  if (!character) return null;
  return (
    <section className="my-5 overflow-hidden rounded-3xl border border-fuchsia-400/20 bg-gradient-to-br from-fuchsia-500/15 via-[#18151e] to-[#111218] p-4 shadow-xl shadow-fuchsia-950/10">
      <div className="flex items-center gap-3">
        <img
          src={character.portraitUrl}
          alt=""
          className="h-10 w-10 rounded-full object-cover ring-2 ring-fuchsia-300/70"
        />
        <div>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-fuchsia-200">
            {character.name} has an idea
          </p>
          <h3 className="font-semibold">Neon after-hours portrait</h3>
        </div>
        <span className="ml-auto rounded-full bg-fuchsia-400/15 px-2 py-1 text-[10px] text-fuchsia-100">
          Fixture
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-zinc-300">
        A quiet late-night scene with city reflections, a confident look, and
        cinematic camera movement.
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
        <span className="rounded-full bg-white/[.08] px-2 py-1">City loft</span>
        <span className="rounded-full bg-white/[.08] px-2 py-1">
          Editorial look
        </span>
        <span className="rounded-full bg-white/[.08] px-2 py-1">
          Moody light
        </span>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          onClick={onCreate}
          className="rounded-xl bg-fuchsia-500 px-3 py-2 text-xs font-bold"
        >
          Create this scene
        </button>
        <button className="rounded-xl bg-white/[.08] px-3 py-2 text-xs">
          Remix idea
        </button>
        <button className="ml-auto rounded-xl px-2 py-2 text-xs text-zinc-400">
          Save
        </button>
      </div>
    </section>
  );
}

export function PremiumMessages({
  data,
  create,
  refresh,
}: {
  data: AppSnapshot;
  create: CreateScene;
  refresh: () => Promise<void>;
}) {
  const [activeId, setActiveId] = useState(data.conversations[0]?.id);
  const [mobileThread, setMobileThread] = useState(false);
  const [text, setText] = useState("");
  const [attachmentId, setAttachmentId] = useState("");
  const [details, setDetails] = useState(false);
  const conversation = data.conversations.find((item) => item.id === activeId);
  const character = data.characters.find(
    (item) => item.id === conversation?.characterId,
  );
  const messages = data.messages
    .filter((item) => item.conversationId === activeId)
    .slice(-16);
  const memory = data.memory.find((item) => item.conversationId === activeId);
  const sharedMedia = useMemo(
    () =>
      data.attachments
        .filter((item) =>
          messages.some((message) => message.id === item.messageId),
        )
        .map((item) => data.media.find((asset) => asset.id === item.mediaId))
        .filter(Boolean) as MediaAsset[],
    [data.attachments, data.media, messages],
  );
  const conversationAssets = Array.from(
    new Map(
      [
        ...sharedMedia,
        ...data.media
          .filter((item) => item.characterId === character?.id)
          .slice(0, 8),
      ].map((item) => [item.id, item]),
    ).values(),
  );
  const latest = (id: string) =>
    data.messages.filter((item) => item.conversationId === id).at(-1);
  const send = async () => {
    if (!text.trim() || !activeId) return;
    await fetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "message",
        conversationId: activeId,
        text,
        mediaId: attachmentId || undefined,
      }),
    });
    setText("");
    setAttachmentId("");
    await refresh();
  };
  const openConversation = (id: string) => {
    setActiveId(id);
    setMobileThread(true);
  };

  return (
    <div className="mx-auto max-w-[1120px] overflow-hidden rounded-[28px] border border-white/[.07] bg-[#101217] shadow-2xl shadow-black/25 md:grid md:min-h-[700px] md:grid-cols-[310px_minmax(0,1fr)]">
      <aside
        className={`${mobileThread ? "hidden md:block" : "block"} border-r border-white/[.07] bg-[#0d0f14] p-3`}
      >
        <header className="flex items-center justify-between px-2 py-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[.18em] text-fuchsia-300">
              Private studio
            </p>
            <h1 className="mt-1 text-2xl font-bold">Messages</h1>
          </div>
          <button
            aria-label="Start a conversation"
            className="grid h-9 w-9 place-items-center rounded-full bg-white/[.07] text-fuchsia-200"
          >
            ✎
          </button>
        </header>
        <div className="px-2 pb-3">
          <input
            aria-label="Search conversations"
            placeholder="Search characters"
            className="w-full rounded-xl bg-white/[.055] px-3 py-2.5 text-sm outline-none placeholder:text-zinc-600"
          />
        </div>
        <div className="space-y-1">
          {data.conversations.map((item) => {
            const contact = data.characters.find(
              (entry) => entry.id === item.characterId,
            );
            const last = latest(item.id);
            return (
              <button
                key={item.id}
                onClick={() => openConversation(item.id)}
                className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${item.id === activeId ? "bg-white/[.08]" : "hover:bg-white/[.045]"}`}
              >
                <div className="relative">
                  <img
                    src={contact?.portraitUrl}
                    alt=""
              className="h-12 w-12 rounded-full object-cover ring-2 ring-fuchsia-400/40"
                  />
                  <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#0d0f14] bg-fuchsia-400" />
                </div>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{contact?.name}</b>
                  <small className="mt-0.5 block truncate text-xs text-zinc-500">
                    {last?.body ?? "Start a scene together"}
                  </small>
                </span>
                <span className="self-start text-[10px] text-zinc-500">
                  {last ? relativeTime(last.createdAt) : ""}
                  {item.unread && (
                    <i className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-fuchsia-400" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </aside>
      <section
        className={`${mobileThread ? "flex" : "hidden md:flex"} min-w-0 flex-col bg-[#12151b]`}
      >
        <header className="flex items-center gap-3 border-b border-white/[.07] px-4 py-3">
          <button
            onClick={() => setMobileThread(false)}
            className="rounded-full p-2 text-zinc-400 md:hidden"
            aria-label="Back to conversations"
          >
            ←
          </button>
          <img
            src={character?.portraitUrl}
            alt=""
            className="h-10 w-10 rounded-full object-cover ring-2 ring-fuchsia-400/50"
          />
          <div className="min-w-0 flex-1">
            <b className="block text-sm">{character?.name}</b>
            <small className="block truncate text-xs text-zinc-500">
              {character?.personality?.split(".")[0] ||
                "Private character conversation"}
            </small>
          </div>
          <button
            onClick={() => setDetails(!details)}
            className="rounded-full bg-white/[.06] px-3 py-2 text-xs"
          >
            Details
          </button>
        </header>
        {details && (
          <div className="border-b border-white/[.07] bg-black/15 p-4">
            <div className="flex gap-3 overflow-x-auto">
              {conversationAssets.slice(0, 5).map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => create(asset, activeId, character?.id)}
                  className="relative min-w-16"
                >
                  <img
                    src={asset.posterUrl ?? asset.url}
                    alt={asset.title}
                    className="h-16 w-16 rounded-xl object-cover"
                  />
                  {asset.type === "video" && (
                    <span className="absolute inset-0 grid place-items-center text-xs">
                      ▶
                    </span>
                  )}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              Shared scenes and references ·{" "}
              {memory?.pinnedFacts || "No pinned context yet"}
            </p>
          </div>
        )}
        <div className="min-h-[430px] flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-6">
          {messages.length === 0 && (
            <div className="grid h-48 place-items-center text-center">
              <div>
                <p className="font-semibold">
                  Start talking to {character?.name}
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  Share an idea, a reference, or a scene direction.
                </p>
              </div>
            </div>
          )}
          {messages.map((message, index) => {
            const attachments = data.attachments
              .filter((item) => item.messageId === message.id)
              .map((item) =>
                data.media.find((asset) => asset.id === item.mediaId),
              )
              .filter(Boolean) as MediaAsset[];
            return (
              <div key={message.id}>
                <div
                  className={`flex gap-2 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {message.role === "character" && (
                    <img
                      src={character?.portraitUrl}
                      alt=""
                      className="mt-auto h-7 w-7 rounded-full object-cover"
                    />
                  )}
                  <div
                    className={`max-w-[82%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed ${message.role === "user" ? "rounded-br-md bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white" : "rounded-bl-md bg-white/[.075] text-zinc-200"}`}
                  >
                    <p>{message.body}</p>
                    {attachments.map((asset) => (
                      <div
                        key={asset.id}
                        className="mt-3 overflow-hidden rounded-xl bg-black/25"
                      >
                        <img
                          src={asset.posterUrl ?? asset.url}
                          alt={asset.title}
                          className="max-h-64 w-full object-cover"
                        />
                        <div className="flex items-center justify-between gap-2 p-2">
                          <span className="truncate text-xs">
                            {asset.title}
                          </span>
                          <button
                            onClick={() =>
                              create(
                                asset,
                                activeId,
                                character?.id,
                                asset.type === "image" ? "video" : "video",
                              )
                            }
                            className="rounded-lg bg-white/[.12] px-2 py-1 text-[10px]"
                          >
                            {asset.type === "image" ? "Animate" : "Remix"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {index === Math.min(1, messages.length - 1) && (
                  <SceneProposalCard
                    character={character}
                    onCreate={() => create(undefined, activeId, character?.id)}
                  />
                )}
              </div>
            );
          })}
        </div>
        <footer className="sticky bottom-0 border-t border-white/[.07] bg-[#12151b]/95 p-3 backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-3">
            <button
              onClick={() => create(undefined, activeId, character?.id)}
              className="rounded-full bg-fuchsia-500/15 px-3 py-1.5 text-xs font-semibold text-fuchsia-200"
            >
              ✦ Create Scene with {character?.name?.split(" ")[0]}
            </button>
            <select
              aria-label="Attach library media"
              value={attachmentId}
              onChange={(event) => setAttachmentId(event.target.value)}
              className="max-w-[9.5rem] rounded-lg bg-white/[.06] px-2 py-1.5 text-xs text-zinc-300"
            >
              <option value="">Attach media</option>
              {data.media.slice(0, 25).map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.type === "video" ? "▶ " : ""}
                  {asset.title}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
              placeholder={`Message ${character?.name?.split(" ")[0] ?? "character"}…`}
              rows={1}
              className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl bg-white/[.07] px-4 py-3 text-sm outline-none placeholder:text-zinc-600 focus:ring-1 focus:ring-fuchsia-400/60"
            />
            <button
              onClick={send}
              disabled={!text.trim()}
              className="grid h-11 w-11 place-items-center rounded-2xl bg-fuchsia-500 text-lg disabled:opacity-35"
              aria-label="Send message"
            >
              ↑
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

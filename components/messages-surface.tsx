"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AppSnapshot, MediaAsset, SceneProposal } from "@/lib/domain";
import { LibraryCharacterPortrait, LibraryMediaThumbnail } from "@/components/library-media-thumbnail";

type CreateScene = (
  media?: MediaAsset,
  conversationId?: string,
  characterId?: string,
  mode?: "image" | "video",
  proposal?: SceneProposal,
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
  proposal,
  data,
  onAction,
  onCreate,
}: {
  character?: AppSnapshot["characters"][number];
  proposal: SceneProposal;
  data: AppSnapshot;
  onAction: (action: string, proposalId: string) => void;
  onCreate: (proposal: SceneProposal) => void;
}) {
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  if (!character || ["REJECTED"].includes(proposal.status)) return null;
  const statusLabel = proposal.status === "SAVED" ? "Saved idea" : proposal.status === "ACCEPTED" ? "Accepted" : proposal.status.toLowerCase();
  return (
    <section className="my-5 overflow-hidden rounded-3xl border border-fuchsia-400/20 bg-gradient-to-br from-fuchsia-500/15 via-[#18151e] to-[#111218] p-4 shadow-xl shadow-fuchsia-950/10">
      <div className="flex items-center gap-3">
        <span className="proposal-character-avatar"><LibraryCharacterPortrait src={character.portraitUrl} name={character.name} /></span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-fuchsia-200">
            {character.name} has an idea
          </p>
            <h3 className="font-semibold">{proposal.title}</h3>
          </div>
        <span className="ml-auto rounded-full bg-fuchsia-400/15 px-2 py-1 text-[10px] text-fuchsia-100">{statusLabel}</span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-zinc-300">{proposal.concept}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
        {[proposal.location, proposal.wardrobe, proposal.mood, proposal.lighting, proposal.shotDescription, proposal.cameraDirection, proposal.imageOrVideoIntent === "video" ? `Video · ${proposal.suggestedDuration}s` : "Image"].map((item) => <span key={item} className="rounded-full bg-white/[.08] px-2 py-1">{item}</span>)}
      </div>
      {!!proposal.suggestedReferenceIds.length && <div className="my-3 flex gap-2">{proposal.suggestedReferenceIds.map((id) => { const asset=data.media.find((entry)=>entry.id===id); return asset ? <div key={id} className="proposal-reference-thumb"><LibraryMediaThumbnail asset={asset} alt={asset.title}/><span>{proposal.suggestedReferenceRoles[id]??"Reference"}</span></div> : null; })}</div>}
      <p className="mt-2 text-[11px] text-zinc-500">{proposal.noveltyReason}</p>
      <div className="mt-4 flex gap-2 message-proposal-actions-desktop">
        {(["GENERATED","REJECTED","REMIXED"] as string[]).includes(proposal.status) ? <button onClick={() => onAction("remix",proposal.id)} className="rounded-xl bg-fuchsia-500 px-3 py-2 text-xs font-bold">Remix this idea</button> : <button onClick={() => onCreate(proposal)} className="rounded-xl bg-fuchsia-500 px-3 py-2 text-xs font-bold">Create this scene</button>}
        <button onClick={() => onAction("remix",proposal.id)} className="rounded-xl bg-white/[.08] px-3 py-2 text-xs">Remix idea</button>
        <button onClick={() => onAction("another",proposal.id)} className="rounded-xl bg-white/[.08] px-3 py-2 text-xs">Ask for another</button>
        {!(["GENERATED","REJECTED","REMIXED"] as string[]).includes(proposal.status) && <><button onClick={() => onAction("save",proposal.id)} className="rounded-xl bg-white/[.08] px-3 py-2 text-xs">Save idea</button><button onClick={() => onAction("reject",proposal.id)} className="ml-auto rounded-xl px-2 py-2 text-xs text-zinc-400">Reject</button></>}
      </div>
      <div className="message-proposal-actions-mobile"><button onClick={() => onCreate(proposal)}>Create This Scene</button><button aria-expanded={mobileActionsOpen} onClick={() => setMobileActionsOpen((open) => !open)}>More</button>{mobileActionsOpen && <div className="message-proposal-secondary-actions"><button onClick={() => onAction("save", proposal.id)}>Save</button><button onClick={() => onAction("reject", proposal.id)}>Reject</button><button onClick={() => onAction("remix", proposal.id)}>Remix</button><button onClick={() => onAction("another", proposal.id)}>Ask Another</button></div>}</div>
    </section>
  );
}

export function PremiumMessages({
  data,
  create,
  refresh,
  initialConversationId,
  initialMobilePage,
  onMobileThreadChange,
  onOpenCharacterHub,
  select,
}: {
  data: AppSnapshot;
  create: CreateScene;
  refresh: () => Promise<void>;
  initialConversationId?: string;
  initialMobilePage?: "list" | "thread" | "details";
  onMobileThreadChange?: (active: boolean) => void;
  onOpenCharacterHub?: (characterId: string, conversationId: string) => void;
  select?: (asset: MediaAsset) => void;
}) {
  const [activeId, setActiveId] = useState(initialConversationId || data.conversations[0]?.id);
  const [mobileThread, setMobileThread] = useState(Boolean(initialConversationId));
  const [mobilePage, setMobilePage] = useState<"list" | "thread" | "details" | "search">(initialMobilePage ?? (initialConversationId ? "thread" : "list"));
  const [listQuery, setListQuery] = useState("");
  const [chatQuery, setChatQuery] = useState("");
  const [highlightedMessageId, setHighlightedMessageId] = useState("");
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [text, setText] = useState("");
  const [attachmentId, setAttachmentId] = useState("");
  const [details, setDetails] = useState(false);
  const [sending, setSending] = useState(false);
  const [partialReply, setPartialReply] = useState("");
  const [inspector, setInspector] = useState<unknown>(null);
  const conversation = data.conversations.find((item) => item.id === activeId);
  const character = data.characters.find(
    (item) => item.id === conversation?.characterId,
  );
  const allMessages = data.messages.filter((item) => item.conversationId === activeId);
  const messages = allMessages;
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
  const directorAction = async (action: string, extra: Record<string, unknown> = {}) => {
    const response = await fetch("/api/director", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, conversationId: activeId, characterId: character?.id, ...extra }),
    });
    if (!response.ok) throw new Error((await response.json()).error ?? "Character Director action failed");
    return response;
  };
  const send = async () => {
    if (!text.trim() || !activeId || sending) return;
    setSending(true);
    const submitted = text; setText(""); setAttachmentId("");
    setPartialReply("");
    try { const response=await directorAction("message",{text:submitted,mediaId:attachmentId||undefined}); const reader=response.body?.getReader(); if(reader){const decoder=new TextDecoder();let buffer="";while(true){const chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true});const lines=buffer.split("\n");buffer=lines.pop()??"";for(const line of lines){if(!line)continue;const event=JSON.parse(line);if(event.type==="error")throw new Error(event.message);if(event.type==="delta")setPartialReply((current)=>current+event.text);}}} await refresh(); }
    catch(error) { setText(submitted); console.error(error); }
    finally { setSending(false); setPartialReply(""); }
  };
  const proposalAction = async (action:string, proposalId:string) => { try { await directorAction(action,{proposalId}); await refresh(); } catch(error) { console.error(error); } };
  const askIdea = async () => { if(!activeId)return; try { await directorAction("ask"); await refresh(); } catch(error) { console.error(error); } };
  const think = async () => { if(!character)return; try { await directorAction("think",{manual:true}); await refresh(); } catch(error) { console.error(error); } };
  const proposals = data.proposals.filter((item)=>item.conversationId===activeId);
  const openConversation = (id: string) => {
    setActiveId(id);
    setMobileThread(true);
    setMobilePage("thread");
    setPlusMenuOpen(false);
  };
  useEffect(() => onMobileThreadChange?.(mobilePage !== "list"), [mobilePage, onMobileThreadChange]);
  useEffect(() => {
    if (!highlightedMessageId || mobilePage !== "thread") return;
    const node = document.querySelector(`[data-message-id="${CSS.escape(highlightedMessageId)}"]`);
    node?.scrollIntoView({ block: "center", behavior: "smooth" });
    const timer = window.setTimeout(() => setHighlightedMessageId(""), 2200);
    return () => window.clearTimeout(timer);
  }, [highlightedMessageId, mobilePage]);

  const backToList = () => { setMobilePage("list"); setMobileThread(false); setPlusMenuOpen(false); };
  const displayedConversations = data.conversations.filter((item) => {
    const contact = data.characters.find((entry) => entry.id === item.characterId);
    const last = latest(item.id);
    return `${contact?.name ?? ""} ${last?.body ?? ""}`.toLowerCase().includes(listQuery.trim().toLowerCase());
  });
  const chatResults = allMessages.filter((message) => message.body.toLowerCase().includes(chatQuery.trim().toLowerCase()));
  const openHub = () => { if (character && activeId) onOpenCharacterHub?.(character.id, activeId); };

  return (
    <><div className="messages-desktop mx-auto max-w-[1120px] overflow-hidden rounded-[28px] border border-white/[.07] bg-[#101217] shadow-2xl shadow-black/25 md:grid md:min-h-[700px] md:grid-cols-[310px_minmax(0,1fr)]">
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
          <span className="h-10 w-10 overflow-hidden rounded-full ring-2 ring-fuchsia-400/50"><LibraryCharacterPortrait src={character?.portraitUrl ?? ""} name={character?.name ?? "Character"} /></span>
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
                  <LibraryMediaThumbnail asset={asset} alt={asset.title} className="message-desktop-preview" style={{ width: 64, height: 64 }} />
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
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {(["SAVED","PROPOSED","ACCEPTED","GENERATED","REJECTED"] as const).map((status)=>{const items=proposals.filter((proposal)=>proposal.status===status);return <section key={status} className="rounded-xl bg-white/[.035] p-3"><b className="text-[10px] uppercase tracking-widest text-zinc-400">{status} ideas · {items.length}</b>{items.slice(0,3).map((proposal)=><button key={proposal.id} onClick={async()=>{if(["GENERATED","REJECTED","REMIXED"].includes(proposal.status)){await proposalAction("remix",proposal.id);await refresh();return;}if(proposal.status!=="ACCEPTED")await proposalAction("accept",proposal.id);create(undefined,activeId,character?.id,proposal.imageOrVideoIntent,proposal);}} className="mt-2 block w-full truncate text-left text-xs text-fuchsia-200">{proposal.title} · reopen</button>)}</section>;})}
            </div>
            <div className="mt-3 flex gap-2"><button onClick={think} className="rounded-lg bg-white/[.08] px-3 py-2 text-xs">Let her think</button>{process.env.NODE_ENV==="development"&&<button onClick={async()=>{try{const response=await directorAction("context");setInspector(await response.json());}catch(error){console.error(error);}}} className="rounded-lg bg-white/[.08] px-3 py-2 text-xs">Brain inspector</button>}</div>
            {Boolean(inspector) && <pre className="mt-3 max-h-56 overflow-auto rounded-xl bg-black/40 p-3 text-[10px] text-zinc-400">{JSON.stringify(inspector,null,2)}</pre>}
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
          {messages.map((message) => {
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
                    <span className="mt-auto h-7 w-7 shrink-0 overflow-hidden rounded-full"><LibraryCharacterPortrait src={character?.portraitUrl ?? ""} name={character?.name ?? "Character"} /></span>
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
                        <LibraryMediaThumbnail asset={asset} alt={asset.title} className="message-desktop-preview" style={{ width: "100%", aspectRatio: "4 / 3" }} />
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
                {message.role==="character" && proposals.filter((proposal)=>proposal.sourceMessageIds.includes(message.id)).map((proposal)=><div id={`proposal-${proposal.id}`} key={proposal.id}><SceneProposalCard character={character} proposal={proposal} data={data} onAction={proposalAction} onCreate={async(item)=>{await proposalAction("accept",item.id);create(undefined,activeId,character?.id,item.imageOrVideoIntent,item);}} /></div>)}
              </div>
            );
          })}
          {sending && <div role="status" aria-live="polite" className="flex gap-2"><img src={character?.portraitUrl} alt="" className="mt-auto h-7 w-7 rounded-full object-cover"/><div className="max-w-[82%] rounded-2xl rounded-bl-md bg-white/[.075] px-3 py-2.5 text-sm leading-relaxed text-zinc-200">{partialReply || `${character?.name?.split(" ")[0] ?? "Character"} is thinking…`}</div></div>}
        </div>
        <footer className="sticky bottom-0 border-t border-white/[.07] bg-[#12151b]/95 p-3 backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-3">
            <button
              onClick={() => create(undefined, activeId, character?.id)}
              className="rounded-full bg-fuchsia-500/15 px-3 py-1.5 text-xs font-semibold text-fuchsia-200"
            >
              ✦ Create Scene with {character?.name?.split(" ")[0]}
            </button>
            <button onClick={askIdea} className="rounded-full bg-fuchsia-500/15 px-3 py-1.5 text-xs font-semibold text-fuchsia-200">What do you want your next scene to be?</button>
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
              disabled={!text.trim() || sending}
              className="grid h-11 w-11 place-items-center rounded-2xl bg-fuchsia-500 text-lg disabled:opacity-35"
              aria-label="Send message"
            >
              ↑
            </button>
          </div>
        </footer>
      </section>
    </div><MobileMessagesSurface
      data={data} activeId={activeId} character={character} messages={messages}
      proposals={proposals} media={conversationAssets} memory={memory} page={mobilePage} setPage={setMobilePage}
      listQuery={listQuery} setListQuery={setListQuery} conversations={displayedConversations} latest={latest}
      openConversation={openConversation} backToList={backToList} openHub={openHub}
      onCreate={async (proposal) => { await proposalAction("accept", proposal.id); create(undefined, activeId, character?.id, proposal.imageOrVideoIntent, proposal); }}
      create={(asset) => create(asset, activeId, character?.id, asset?.type === "image" ? "video" : "video")}
      text={text} setText={setText} send={send} sending={sending} partialReply={partialReply}
      attachmentId={attachmentId} setAttachmentId={setAttachmentId} plusMenuOpen={plusMenuOpen}
      setPlusMenuOpen={setPlusMenuOpen} askIdea={askIdea} think={think} proposalAction={proposalAction}
      select={select} searchQuery={chatQuery} setSearchQuery={setChatQuery} searchResults={chatResults}
      onSearchResult={(id) => { setHighlightedMessageId(id); setMobilePage("thread"); }}
      highlightedMessageId={highlightedMessageId} createScene={() => create(undefined, activeId, character?.id)}
    /></>
  );
}

function MobileMessagesSurface({ data, activeId, character, messages, proposals, media, memory, page, setPage, listQuery, setListQuery, conversations, latest, openConversation, backToList, openHub, onCreate, create, text, setText, send, sending, partialReply, attachmentId, setAttachmentId, plusMenuOpen, setPlusMenuOpen, askIdea, think, proposalAction, select, searchQuery, setSearchQuery, searchResults, onSearchResult, highlightedMessageId, createScene }: {
  data: AppSnapshot; activeId?: string; character?: AppSnapshot["characters"][number]; messages: AppSnapshot["messages"]; proposals: AppSnapshot["proposals"]; media: MediaAsset[]; memory?: AppSnapshot["memory"][number]; page: "list" | "thread" | "details" | "search"; setPage: (page: "list" | "thread" | "details" | "search") => void; listQuery: string; setListQuery: (value: string) => void; conversations: AppSnapshot["conversations"]; latest: (id: string) => AppSnapshot["messages"][number] | undefined; openConversation: (id: string) => void; backToList: () => void; openHub: () => void; onCreate: (proposal: SceneProposal) => void; create: (asset: MediaAsset) => void; text: string; setText: (value: string) => void; send: () => void; sending: boolean; partialReply: string; attachmentId: string; setAttachmentId: (id: string) => void; plusMenuOpen: boolean; setPlusMenuOpen: (open: boolean | ((current: boolean) => boolean)) => void; askIdea: () => void; think: () => void; proposalAction: (action: string, proposalId: string) => void; select?: (asset: MediaAsset) => void; searchQuery: string; setSearchQuery: (value: string) => void; searchResults: AppSnapshot["messages"]; onSearchResult: (id: string) => void; highlightedMessageId: string; createScene: () => void;
}) {
  const [conversationOptions, setConversationOptions] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const nearLatest = useRef(true);
  const attachment = data.media.find((asset) => asset.id === attachmentId);
  const conversationReferences = data.characterReferences.filter((ref) => ref.characterId === character?.id);
  const characterProfile = data.characterProfiles.find((profile) => profile.characterId === character?.id);
  const creativeMemory = data.creativeMemories.find((item) => item.characterId === character?.id);
  const conversationSummary = data.conversationSummaries.find((item) => item.conversationId === activeId);
  const pinnedMemories = data.pinnedMemories.filter((item) => item.conversationId === activeId);
  const conversationProposals = data.proposals.filter((item) => item.conversationId === activeId);
  const attachmentsByMessage = (messageId: string) => data.attachments.filter((item) => item.messageId === messageId).map((item) => data.media.find((asset) => asset.id === item.mediaId)).filter(Boolean) as MediaAsset[];
  useEffect(() => { const node=list.current;if(page==="thread"&&node&&nearLatest.current)node.scrollTop=node.scrollHeight; },[messages.length,sending,partialReply,page]);
  const identity = <button className="mobile-message-identity" onClick={() => setPage("details")} aria-label={`Conversation details for ${character?.name ?? "character"}`}><span className="mobile-message-avatar"><LibraryCharacterPortrait src={character?.portraitUrl ?? ""} name={character?.name ?? "Character"}/></span><span><b>{character?.name ?? "Conversation"}</b><small>Character conversation</small></span><span className="mobile-message-chevron">›</span></button>;

  if (page === "list") return <section className="messages-mobile-list" aria-label="Messages">
    <header className="messages-mobile-heading"><div><p>PRIVATE CONVERSATIONS</p><h1>Messages</h1></div><span>{data.conversations.length}</span></header>
    <label className="messages-mobile-search"><span aria-hidden="true">⌕</span><input type="search" value={listQuery} onChange={(event) => setListQuery(event.target.value)} placeholder="Search messages" aria-label="Search conversations" /></label>
    <div className="messages-mobile-rows">{conversations.map((item) => { const contact=data.characters.find((entry)=>entry.id===item.characterId);const last=latest(item.id);return <button key={item.id} onClick={()=>openConversation(item.id)} className="messages-mobile-row" aria-label={`Open conversation with ${contact?.name ?? "character"}`}><span className="messages-mobile-row-avatar"><LibraryCharacterPortrait src={contact?.portraitUrl??""} name={contact?.name??"Character"}/></span><span className="messages-mobile-row-copy"><b>{contact?.name??"Character"}</b><small>{last?.body??"Start a scene together"}</small></span><span className="messages-mobile-row-meta"><time>{last?relativeTime(last.createdAt):""}</time>{item.unread&&<i aria-label="Unread"/>}</span></button>;})}{conversations.length===0&&<div className="messages-mobile-empty">{listQuery?"No conversations match that search.":"Your character conversations will appear here."}</div>}</div>
  </section>;

  if (page === "search") return <section className="conversation-search-mobile"><header><button aria-label="Back to details" onClick={()=>setPage("details")}>‹</button><h1>Search Chat</h1></header><label><span>⌕</span><input type="search" autoFocus value={searchQuery} onChange={(event)=>setSearchQuery(event.target.value)} placeholder="Search this conversation" aria-label="Search this conversation" /></label><div className="conversation-search-results">{searchQuery.trim()&&searchResults.map((message,index)=><button key={message.id} onClick={()=>onSearchResult(message.id)}><small>{message.role==="user"?"You":character?.name} · {relativeTime(message.createdAt)} · result {index+1}</small><span>{message.body}</span></button>)}{searchQuery.trim()&&searchResults.length===0&&<p>No matching messages.</p>}</div></section>;

  if (page === "details") return <section className="conversation-details-mobile"><header className="conversation-details-header"><button aria-label="Back to conversation" onClick={()=>setPage("thread")}>‹</button><span className="mobile-message-avatar"><LibraryCharacterPortrait src={character?.portraitUrl??""} name={character?.name??"Character"}/></span><div><b>{character?.name??"Conversation"}</b><small>Conversation details</small></div></header>
    <div className="conversation-details-actions"><button onClick={openHub}><span>◉</span>Character Hub</button><button onClick={()=>{setSearchQuery("");setPage("search");}}><span>⌕</span>Search Chat</button><button onClick={createScene}><span>＋</span>Create Scene</button><button onClick={()=>setConversationOptions((open)=>!open)} aria-expanded={conversationOptions}><span>•••</span>Options</button></div>
    {conversationOptions&&<div className="conversation-options-sheet"><button onClick={()=>{setConversationOptions(false);think();}}>Let her think of an idea</button><button onClick={()=>{setConversationOptions(false);askIdea();}}>Ask for a scene idea</button></div>}
    <section className="conversation-details-section"><header><h2>Shared Media</h2><small>{media.length}</small></header>{media.length?<div className="conversation-shared-grid">{media.map((asset)=><button key={asset.id} onClick={()=>select?.(asset)} aria-label={`Open ${asset.title}`}><LibraryMediaThumbnail asset={asset} alt={asset.title}/>{asset.type==="video"&&<span>▶</span>}</button>)}</div>:<p className="conversation-details-empty">Media shared in this conversation will appear here.</p>}</section>
    {character?.personality?.trim()&&<section className="conversation-details-section"><header><h2>Personality</h2></header><p>{character.personality}</p></section>}
    {creativeMemory&&<section className="conversation-details-section"><header><h2>Creative Memory</h2></header>{creativeMemory.recentScenes.length?<div className="conversation-context-chips">{creativeMemory.recentScenes.slice(0,5).map((scene,index)=><span key={`${scene.mediaId}-${index}`}>{[scene.location,scene.mood,scene.title].filter(Boolean).join(" · ")}</span>)}</div>:<p className="conversation-details-empty">No recent creative history yet.</p>}</section>}
    {!!conversationProposals.length&&<section className="conversation-details-section"><header><h2>Scene Ideas</h2><small>{conversationProposals.length}</small></header>{conversationProposals.slice().reverse().slice(0,8).map((proposal)=><button className="conversation-proposal-row" key={proposal.id} onClick={()=>setPage("thread")}><span>{proposal.title}</span><small>{proposal.status.toLowerCase()}</small></button>)}</section>}
    {!!conversationReferences.length&&<section className="conversation-details-section"><header><h2>References</h2><small>{conversationReferences.length}</small></header><div className="conversation-reference-row">{conversationReferences.map((ref)=>{const asset=data.media.find((item)=>item.id===ref.mediaId);return asset?<button key={`${ref.mediaId}-${ref.role}`} onClick={()=>select?.(asset)}><LibraryMediaThumbnail asset={asset} alt={asset.title}/><small>{ref.role}</small></button>:null;})}</div></section>}
    {(conversationSummary?.summary||memory?.pinnedFacts||pinnedMemories.length>0)&&<section className="conversation-details-section"><header><h2>Conversation Memory</h2></header>{conversationSummary?.summary&&<p>{conversationSummary.summary}</p>}{memory?.pinnedFacts&&<p>{memory.pinnedFacts}</p>}{pinnedMemories.map((item)=><p key={item.id}>{item.body}</p>)}</section>}
  </section>;

  return <section className="messages-mobile-thread" aria-label={`Conversation with ${character?.name??"character"}`}>
    <header className="messages-mobile-thread-header"><button onClick={backToList} aria-label="Back to messages">‹</button>{identity}<button className="messages-mobile-header-create" onClick={createScene} aria-label="Create a scene">＋</button></header>
    <div className="messages-mobile-history" ref={list} onScroll={(event)=>{const node=event.currentTarget;nearLatest.current=node.scrollHeight-node.scrollTop-node.clientHeight<140;}}>{messages.map((message)=>{const attached=attachmentsByMessage(message.id);return <div key={message.id} data-message-id={message.id} className={`messages-mobile-message ${message.role} ${highlightedMessageId===message.id?"is-highlighted":""}`}><div className="messages-mobile-bubble-wrap">{message.role==="character"&&<span className="messages-mobile-small-avatar"><LibraryCharacterPortrait src={character?.portraitUrl??""} name={character?.name??"Character"}/></span>}<div className="messages-mobile-bubble"><p>{message.body}</p>{attached.map((asset)=><div className="messages-mobile-attachment" key={asset.id}><button onClick={()=>select?.(asset)} aria-label={`Open ${asset.title}`}><LibraryMediaThumbnail asset={asset} alt={asset.title}/></button><footer><span>{asset.title}</span><button onClick={()=>create(asset)}>{asset.type==="image"?"Animate":"Remix"}</button></footer></div>)}</div></div>{message.role==="character"&&proposals.filter((proposal)=>proposal.sourceMessageIds.includes(message.id)).map((proposal)=><SceneProposalCard key={proposal.id} character={character} proposal={proposal} data={data} onAction={proposalAction} onCreate={onCreate}/>)}</div>;})}{sending&&<div role="status" aria-live="polite" className="messages-mobile-streaming"><span className="messages-mobile-small-avatar"><LibraryCharacterPortrait src={character?.portraitUrl??""} name={character?.name??"Character"}/></span><div>{partialReply||`${character?.name?.split(" ")[0]??"She"} is thinking…`}</div></div>}</div>
    <footer className="messages-mobile-composer"><div className="messages-mobile-composer-inner">{attachment&&<button className="messages-mobile-attachment-chip" onClick={()=>setAttachmentId("")}>Attached: {attachment.title} ×</button>}{plusMenuOpen&&<div className="messages-mobile-plus-menu"><label>Attach media<select value={attachmentId} onChange={(event)=>setAttachmentId(event.target.value)}><option value="">Choose from Library</option>{data.media.map((asset)=><option value={asset.id} key={asset.id}>{asset.type==="video"?"Video · ":"Image · "}{asset.title}</option>)}</select></label><div><button onClick={()=>{setPlusMenuOpen(false);createScene();}}>Create Scene</button><button onClick={()=>{setPlusMenuOpen(false);askIdea();}}>Ask for an idea</button><button onClick={()=>{setPlusMenuOpen(false);think();}}>Let her think</button></div></div>}<button className="messages-mobile-plus" aria-label="More conversation actions" aria-expanded={plusMenuOpen} onClick={()=>setPlusMenuOpen((open)=>!open)}>＋</button><textarea value={text} onChange={(event)=>setText(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();send();}}} placeholder={`Message ${character?.name?.split(" ")[0]??"character"}…`} rows={1} aria-label="Message"/><button className="messages-mobile-send" onClick={send} disabled={!text.trim()||sending} aria-label="Send message">↑</button></div></footer>
  </section>;
}

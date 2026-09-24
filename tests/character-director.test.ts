import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { db } from "../lib/db";
import { seedDatabase } from "../lib/seed";
import { characterDirectorService, canUseAdultConversation, evaluateNovelty, validateCharacterBrainResponse } from "../lib/character-director";
import { repository } from "../lib/repository";
import { generationService } from "../lib/services";
import type { CharacterBrainResponse } from "../lib/domain";
import { emptyCreativeMemory, fixtureCharacterProfile } from "../lib/brain-defaults";

seedDatabase();
const conversation=(characterId:string)=>repository.conversationForCharacter(characterId)!.id;
const migration=(file:string)=>fs.readFileSync(path.join(process.cwd(),"lib","migrations",file),"utf8");
function migrationDatabase(){const db=new DatabaseSync(":memory:");db.exec("PRAGMA foreign_keys=ON; CREATE TABLE characters(id TEXT PRIMARY KEY); CREATE TABLE conversations(id TEXT PRIMARY KEY,characterId TEXT); CREATE TABLE media(id TEXT PRIMARY KEY); CREATE TABLE messages(id TEXT PRIMARY KEY);");return db;}
function createTempCharacter(){const id=`test-director-${randomUUID()}`;const convo=`${id}-conversation`;const now=new Date().toISOString();db.prepare("INSERT INTO characters VALUES(?,?,?,?,?,?,?,?,?)").run(id,"Test Director","@test","/fixtures/test.png","Temporary test character","Test personality","Test identity","{}",now);db.prepare("INSERT INTO conversations VALUES(?,?,?,?)").run(convo,id,now,0);const profile=fixtureCharacterProfile(id);profile.initiativeLevel="DIRECTOR";repository.saveCharacterProfile(profile);repository.saveCreativeMemory(emptyCreativeMemory(id));repository.saveInitiativeState({characterId:id,lastEvaluatedAt:null,nextEligibleAt:null,lastProactiveProposalAt:null,dailyCount:0,dailyCountDate:now.slice(0,10),cooldownSeconds:28800,maxPerDay:1});return {id,convo};}
function cleanTempCharacter(id:string,convo:string){db.exec("BEGIN IMMEDIATE;");try{db.prepare("DELETE FROM proposalReferences WHERE proposalId IN (SELECT id FROM sceneProposals WHERE characterId=?)").run(id);db.prepare("DELETE FROM sceneProposals WHERE characterId=?").run(id);db.prepare("DELETE FROM chatUsageLedger WHERE characterId=?").run(id);db.prepare("DELETE FROM conversationSummaries WHERE conversationId=?").run(convo);db.prepare("DELETE FROM pinnedMemories WHERE conversationId=?").run(convo);db.prepare("DELETE FROM messages WHERE conversationId=?").run(convo);db.prepare("DELETE FROM conversationMemory WHERE conversationId=?").run(convo);db.prepare("DELETE FROM conversations WHERE id=?").run(convo);db.prepare("DELETE FROM creativeMemories WHERE characterId=?").run(id);db.prepare("DELETE FROM initiativeStates WHERE characterId=?").run(id);db.prepare("DELETE FROM characterBrainProfiles WHERE characterId=?").run(id);db.prepare("DELETE FROM characters WHERE id=?").run(id);db.exec("COMMIT;");}catch(error){db.exec("ROLLBACK;");throw error;}}

describe("Character Director M1 local brain",()=>{
  it("migrates and persists creative profiles, initiative, and memory",()=>{
    expect((db.prepare("SELECT version FROM schemaMigrations WHERE version=1").get() as {version:number}).version).toBe(1);
    expect((db.prepare("SELECT version FROM schemaMigrations WHERE version=2").get() as {version:number}).version).toBe(2);
    expect((db.prepare("SELECT version FROM schemaMigrations WHERE version=3").get() as {version:number}).version).toBe(3);
    const before=repository.characterProfile("char-mara")!;
    repository.saveCharacterProfile({...before,initiativeLevel:"CREATIVE",updatedAt:new Date().toISOString()});
    expect(repository.characterProfile("char-mara")?.initiativeLevel).toBe("CREATIVE");
    const memory=repository.creativeMemory("char-mara")!;memory.savedProposalIds=["persistence-check"];repository.saveCreativeMemory(memory);
    expect(repository.creativeMemory("char-mara")?.savedProposalIds).toContain("persistence-check");
    repository.saveCharacterProfile(before);
  });
  it("applies M1 migrations to clean and pre-M1 databases without dropping existing rows",()=>{
    const clean=migrationDatabase();clean.exec(migration("001_character_director.sql"));clean.exec(migration("002_separate_creative_and_conversation_profiles.sql"));clean.exec(migration("003_character_brain_foreign_keys.sql"));clean.exec(migration("001_character_director.sql"));
    expect((clean.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('sceneProposals','creativeMemories','mediaReactions')").get() as {n:number}).n).toBe(3);clean.close();
    const existing=migrationDatabase();existing.exec("INSERT INTO characters VALUES('keep-character'); INSERT INTO conversations VALUES('keep-conversation','keep-character'); INSERT INTO media VALUES('keep-media'); INSERT INTO messages VALUES('keep-message');");
    existing.exec(migration("001_character_director.sql"));existing.prepare("INSERT INTO characterBrainProfiles VALUES(?,?,?,?,?,?,?)").run("keep-character","REACTIVE",1,0,JSON.stringify({speakingStyle:"retained in conversation profile"}),JSON.stringify({speakingStyle:"duplicate",favoriteEnvironments:["studio"]}),new Date().toISOString());existing.prepare("INSERT INTO creativeMemories VALUES(?,?,?)").run("keep-character","{}",new Date().toISOString());existing.exec(migration("002_separate_creative_and_conversation_profiles.sql"));existing.exec(migration("003_character_brain_foreign_keys.sql"));
    const saved=existing.prepare("SELECT * FROM characters WHERE id='keep-character'").get() as {id:string};const creative=JSON.parse((existing.prepare("SELECT creativeProfileJson FROM characterBrainProfiles WHERE characterId='keep-character'").get() as {creativeProfileJson:string}).creativeProfileJson);
    expect(saved.id).toBe("keep-character");expect(creative.speakingStyle).toBeUndefined();expect(creative.favoriteEnvironments).toEqual(["studio"]);
    expect((existing.prepare("PRAGMA foreign_key_list(characterBrainProfiles)").all() as {table:string}[]).some((fk)=>fk.table==="characters")).toBe(true);
    expect(()=>existing.prepare("INSERT INTO sceneProposals(id,characterId,conversationId,title,naturalLanguagePitch,concept,location,wardrobe,mood,lighting,shotDescription,cameraDirection,imageOrVideoIntent,suggestedAspectRatio,proposedImagePlan,proposedVideoPlan,noveltyReason,status,proposalSource,createdAt,updatedAt) VALUES('bad','missing','keep-conversation','x','x','x','x','x','x','x','x','x','image','4:5','x','x','x','PROPOSED','conversation','now','now')").run()).toThrow();existing.close();
  });
  it("keeps seeded characters conversationally and creatively distinct",()=>{
    const nova=characterDirectorService.buildContext(conversation("char-nova"));
    const iona=characterDirectorService.buildContext(conversation("char-iona"));
    const mock=characterDirectorService.conversationProvider;
    expect(mock.respond({context:nova,userText:"Tell me about the frame"}).message).not.toBe(mock.respond({context:iona,userText:"Tell me about the frame"}).message);
    const mara=characterDirectorService.buildContext(conversation("char-mara"));
    const a=characterDirectorService.createProposal({conversationId:nova.conversationId,source:"conversation"}).proposal;
    const b=characterDirectorService.createProposal({conversationId:iona.conversationId,source:"conversation"}).proposal;
    const c=characterDirectorService.createProposal({conversationId:mara.conversationId,source:"conversation"}).proposal;
    expect(a.location).not.toBe(b.location);
    expect(a.cameraDirection).not.toBe(b.cameraDirection);
    expect(new Set([a.naturalLanguagePitch,b.naturalLanguagePitch,c.naturalLanguagePitch]).size).toBe(3);
    expect(new Set([a.location,b.location,c.location]).size).toBe(3);
    expect(new Set([a.mood,b.mood,c.mood]).size).toBe(3);
    expect(new Set([a.cameraDirection,b.cameraDirection,c.cameraDirection]).size).toBe(3);
  });
  it("bounds model context without truncating stored messages and rejects cross-conversation proposal lineage",()=>{
    const {id,convo}=createTempCharacter();let foreignProposalId:string|undefined;
    try {
      const longText="x".repeat(5000);const stored=repository.addMessage(convo,"user",longText);repository.addPinnedMemory({conversationId:convo,category:"preference",body:"p".repeat(1000)});
      const context=characterDirectorService.buildContext(convo);expect(context.recentMessages.find((message)=>message.id===stored.id)?.body).toHaveLength(context.limits.messageCharacters);expect(repository.messages(convo).find((message)=>message.id===stored.id)?.body).toHaveLength(5000);expect(context.pinnedMemories[0].body).toHaveLength(context.limits.pinnedMemoryCharacters);
      const foreign=characterDirectorService.createProposal({conversationId:conversation("char-iona"),source:"conversation"}).proposal;foreignProposalId=foreign.id;
      expect(()=>characterDirectorService.createProposal({conversationId:convo,source:"remix",parentProposalId:foreign.id})).toThrow("Parent proposal does not belong");
      expect(repository.proposals({characterId:id})).toHaveLength(0);
    } finally {if(foreignProposalId){db.prepare("DELETE FROM proposalReferences WHERE proposalId=?").run(foreignProposalId);db.prepare("DELETE FROM sceneProposals WHERE id=?").run(foreignProposalId);}cleanTempCharacter(id,convo);}
  });
  it("creates proposals with ordered role references and save/reject states",()=>{
    const result=characterDirectorService.createProposalMessage(conversation("char-nova"));
    expect(result.proposal.sourceMessageIds).toContain(result.message.id);
    expect(repository.proposalReferences(result.proposal.id).map((ref)=>ref.position)).toEqual([0,1,2].slice(0,repository.proposalReferences(result.proposal.id).length));
    expect(characterDirectorService.setProposalStatus(result.proposal.id,"SAVED").status).toBe("SAVED");
    expect(repository.creativeMemory("char-nova")?.savedProposalIds).toContain(result.proposal.id);
    expect(characterDirectorService.setProposalStatus(result.proposal.id,"REJECTED","wrong mood").status).toBe("REJECTED");
    expect(repository.creativeMemory("char-nova")?.resultNotes[`proposal:${result.proposal.id}`]).toBe("wrong mood");
    expect(repository.creativeMemory("char-nova")?.savedProposalIds).not.toContain(result.proposal.id);
    expect(()=>characterDirectorService.setProposalStatus(result.proposal.id,"ACCEPTED")).toThrow(/Invalid proposal transition/);
    expect(()=>characterDirectorService.setProposalStatus(result.proposal.id,"GENERATED")).toThrow(/only when its linked media completes/);
  });
  it("remixes with parent lineage and asks for another while considering rejected concepts",()=>{
    const original=characterDirectorService.createProposal({conversationId:conversation("char-mara"),source:"conversation"}).proposal;
    const child=characterDirectorService.remixProposal(original.id,"location").proposal;
    expect(child.parentProposalId).toBe(original.id);
    expect(repository.proposal(original.id)?.status).toBe("REMIXED");
    const another=characterDirectorService.anotherProposal(original.conversationId,original.id).proposal;
    expect(another.id).not.toBe(original.id);
    expect(another.location!==original.location||another.wardrobe!==original.wardrobe||another.mood!==original.mood).toBe(true);
  });
  it("evaluates structured novelty and rejects malformed brain output",()=>{
    const scene={mediaId:"new",location:"Studio",wardrobe:"Black",lighting:"Soft",mood:"Calm",shotType:"Portrait",cameraDirection:"Static"};
    const signal=evaluateNovelty(scene,[{...scene,mediaId:"old"}],0.2);
    expect(signal.similarityScore).toBe(1);expect(signal.repeatedConcept).toBe(true);
    expect(validateCharacterBrainResponse({message:"bad",intent:"scene_proposal"})).toBe(false);
    const base=characterDirectorService.directorProvider.propose({context:characterDirectorService.buildContext(conversation("char-nova")),variationIndex:9});
    const malformed={...base,sceneProposal:{...base.sceneProposal,suggestedAspectRatio:"999:1",suggestedReferenceIds:["missing-reference"],suggestedDuration:99}};
    expect(validateCharacterBrainResponse({...base,message:undefined})).toBe(false);
    expect(validateCharacterBrainResponse({...base,intent:"other"})).toBe(false);
    expect(validateCharacterBrainResponse(malformed)).toBe(false);
    expect(validateCharacterBrainResponse({...base,sceneProposal:{...base.sceneProposal,suggestedReferenceRoles:{"some-id":"unknown-role"}}})).toBe(false);
    const conversationResponse:CharacterBrainResponse={message:"A short reply.",intent:"conversation",memoryCandidates:[],creativeSignals:{}};
    expect(validateCharacterBrainResponse(conversationResponse)).toBe(true);
  });
  it("rejects unsupported proposal ratios, durations, unknown references, and mismatched character associations before persistence",()=>{
    const provider=characterDirectorService.conversationProvider;const original=provider.propose.bind(provider);const id=conversation("char-nova");const count=repository.proposals({characterId:"char-nova"}).length;
    const attempt=(patch:Record<string,unknown>)=>{provider.propose=(request)=>{const output=original(request);output.sceneProposal={...output.sceneProposal,...patch};return output;};expect(()=>characterDirectorService.createProposal({conversationId:id,source:"conversation"})).toThrow();};
    try {attempt({suggestedAspectRatio:"2:3"});attempt({characterId:"char-mara"});attempt({suggestedReferenceIds:["missing-reference"],suggestedReferenceRoles:{"missing-reference":"other"}});attempt({imageOrVideoIntent:"video",suggestedAspectRatio:"9:16",suggestedDuration:3});expect(repository.proposals({characterId:"char-nova"})).toHaveLength(count);}
    finally {provider.propose=original;}
  });
  it("keeps explicit adult eligibility gated by both character state and provider policy",()=>{
    const profile=repository.characterProfile("char-nova")!;const deployment=characterDirectorService.conversationProvider.deployment;
    expect(canUseAdultConversation(profile,deployment)).toBe(false);
    expect(canUseAdultConversation({...profile,ageVerifiedAdult:true},{...deployment,adultRoleplay:"supported"})).toBe(true);
    expect(canUseAdultConversation({...profile,adultCharacter:false,ageVerifiedAdult:true},{...deployment,adultRoleplay:"supported"})).toBe(false);
  });
  it("limits context while retaining the complete persisted conversation and summary",()=>{
    const id=conversation("char-iona");const pinned=repository.addPinnedMemory({conversationId:id,category:"preference",body:"Keep the framing precise."});for(let n=0;n<18;n++)repository.addMessage(id,"user",`Distinct context note number ${n} describes a deliberate camera framing experiment.`);
    const context=characterDirectorService.buildContext(id);
    const firstThrough=context.conversationSummary.summarizedThroughMessageId;
    for(let n=18;n<30;n++)repository.addMessage(id,"user",`Later context note number ${n} gives another clear lighting and scene preference.`);
    const updated=characterDirectorService.buildContext(id);
    expect(context.recentMessages.length).toBeLessThanOrEqual(context.limits.recentMessages);
    expect(context.conversationSummary.summary.length).toBeLessThanOrEqual(context.limits.summaryCharacters);
    expect(repository.messages(id).length).toBeGreaterThan(30);
    expect(updated.conversationSummary.summarizedThroughMessageId).not.toBe(firstThrough);
    expect(updated.recentUnsummarizedMessages.length).toBeLessThanOrEqual(updated.limits.recentMessages);
    expect(repository.pinnedMemories(id).some((item)=>item.id===pinned.id)).toBe(true);
  });
  it("creates a conversation-linked generation from proposal context and stores deterministic reaction",()=>{
    const id=conversation("char-mara");const proposal=characterDirectorService.createProposal({conversationId:id,source:"conversation"}).proposal;
    characterDirectorService.setProposalStatus(proposal.id,"ACCEPTED");
    const job=generationService.create({characterId:proposal.characterId,mode:proposal.imageOrVideoIntent,prompt:proposal.proposedImagePlan,aspectRatio:proposal.suggestedAspectRatio,preset:"Hero",duration:proposal.suggestedDuration??undefined,simulation:"success",referenceAssetIds:proposal.suggestedReferenceIds,referenceAssetRoles:proposal.suggestedReferenceRoles,proposalId:proposal.id,sceneContext:{concept:proposal.concept,location:proposal.location,wardrobe:proposal.wardrobe,mood:proposal.mood,lighting:proposal.lighting,shotDescription:proposal.shotDescription,cameraDirection:proposal.cameraDirection},conversationId:id});
    const completed=generationService.callbackComplete(job.id);const reaction=repository.mediaReactions().find((item)=>item.mediaId===completed.mediaId);void characterDirectorService.reactToMedia(repository.asset(completed.mediaId!)!,completed);
    expect(completed.status).toBe("completed");expect(reaction?.proposalId).toBe(proposal.id);expect(repository.messages(id).some((message)=>message.id===reaction?.messageId)).toBe(true);
    expect(repository.asset(completed.mediaId!)!.parentId).toBeNull();expect(repository.proposal(proposal.id)?.status).toBe("GENERATED");
    expect(repository.mediaReactions().filter((item)=>item.mediaId===completed.mediaId)).toHaveLength(1);
    expect(repository.snapshot(generationService.capabilities()).attachments.filter((item)=>item.mediaId===completed.mediaId&&item.kind==="generation")).toHaveLength(1);
    expect(repository.creativeMemory("char-mara")?.generatedProposalIds).toContain(proposal.id);
    expect(generationService.callbackComplete(job.id).mediaId).toBe(completed.mediaId);
    const child=characterDirectorService.remixProposal(proposal.id).proposal;expect(child.parentProposalId).toBe(proposal.id);expect(repository.proposal(proposal.id)?.status).toBe("GENERATED");
    expect(generationService.validate({characterId:proposal.characterId,mode:proposal.imageOrVideoIntent,prompt:proposal.proposedImagePlan,aspectRatio:"2:3",preset:"Hero",proposalId:proposal.id,conversationId:id})).toContain("aspect ratio");
    expect(generationService.validate({characterId:proposal.characterId,mode:proposal.imageOrVideoIntent,prompt:proposal.proposedImagePlan,aspectRatio:proposal.suggestedAspectRatio,preset:"Hero",duration:99,proposalId:proposal.id,conversationId:id})).toContain("duration");
    expect(generationService.validate({characterId:proposal.characterId,mode:proposal.imageOrVideoIntent,prompt:proposal.proposedImagePlan,aspectRatio:proposal.suggestedAspectRatio,preset:"Hero",proposalId:proposal.id,conversationId:"conv-char-iona"})).toContain("Conversation does not belong");
    expect(generationService.validate({characterId:proposal.characterId,mode:proposal.imageOrVideoIntent,prompt:proposal.proposedImagePlan,aspectRatio:proposal.suggestedAspectRatio,preset:"Hero",proposalId:proposal.id,conversationId:id,referenceAssetIds:["missing-reference"]})).toContain("reference assets were not found");
  });
  it("records mock chat usage at zero cost and manual initiative respects conservative defaults",()=>{
    const id="char-iona";const automatic=characterDirectorService.initiativeEngine.evaluate(id,{manual:false,conversationId:conversation(id)});
    expect(automatic).toMatchObject({outcome:"NO_ACTION",reason:"reactive_mode"});
    const usage=repository.chatUsage().filter((item)=>item.conversationId===conversation(id));
    expect(usage.every((item)=>item.estimatedCost===0&&item.actualCost===0)).toBe(true);
    const media=repository.mediaByCharacter("char-iona")[0];repository.toggleFavorite(media.id);characterDirectorService.rememberFavorite(media.id);expect(repository.creativeMemory("char-iona")?.favoriteMediaIds).toContain(media.id);repository.toggleFavorite(media.id);characterDirectorService.rememberFavorite(media.id);expect(repository.creativeMemory("char-iona")?.favoriteMediaIds).not.toContain(media.id);
  });
  it("enforces initiative cooldown, daily limit, duplicate protection, and manual Director triggers",()=>{
    const {id,convo}=createTempCharacter();const day=new Date().toISOString().slice(0,10);const provider=characterDirectorService.conversationProvider;const originalPropose=provider.propose.bind(provider);
    try {
      repository.saveInitiativeState({...repository.initiativeState(id)!,nextEligibleAt:new Date(Date.now()+60000).toISOString(),dailyCount:0,dailyCountDate:day});
      expect(characterDirectorService.initiativeEngine.evaluate(id,{conversationId:convo})).toMatchObject({outcome:"NO_ACTION",reason:"cooldown"});
      repository.saveInitiativeState({...repository.initiativeState(id)!,nextEligibleAt:null,dailyCount:1,dailyCountDate:day});
      expect(characterDirectorService.initiativeEngine.evaluate(id,{conversationId:convo})).toMatchObject({outcome:"NO_ACTION",reason:"daily_limit"});
      repository.saveInitiativeState({...repository.initiativeState(id)!,dailyCount:0,nextEligibleAt:null});
      const result=characterDirectorService.initiativeEngine.evaluate(id,{manual:true,conversationId:convo});expect(result.outcome).toBe("CREATE_SCENE_PROPOSAL");if(result.outcome!=="CREATE_SCENE_PROPOSAL")return;
      const count=repository.proposals({characterId:id}).length;provider.propose=(request)=>{const output=originalPropose(request);output.sceneProposal={...output.sceneProposal,title:result.proposal.title,location:result.proposal.location,wardrobe:result.proposal.wardrobe,lighting:result.proposal.lighting,mood:result.proposal.mood,shotDescription:result.proposal.shotDescription,cameraDirection:result.proposal.cameraDirection};return output;};
      expect(characterDirectorService.initiativeEngine.evaluate(id,{manual:true,conversationId:convo})).toMatchObject({outcome:"NO_ACTION",reason:"duplicate_concept"});expect(repository.proposals({characterId:id}).length).toBe(count);
      expect(repository.chatUsage().filter((item)=>item.conversationId===convo).every((item)=>item.estimatedCost===0&&item.actualCost===0)).toBe(true);
    } finally { provider.propose=originalPropose;cleanTempCharacter(id,convo); }
  });
  it("enforces proactive cooldown and daily limits and suppresses a duplicate concept",()=>{
    const id="char-mara";const priorState=repository.initiativeState(id)!;const day=new Date().toISOString().slice(0,10);
    repository.saveInitiativeState({...priorState,nextEligibleAt:new Date(Date.now()+60000).toISOString(),dailyCount:0,dailyCountDate:day,maxPerDay:1});
    expect(characterDirectorService.initiativeEngine.evaluate(id,{conversationId:conversation(id)})).toMatchObject({outcome:"NO_ACTION",reason:"cooldown"});
    repository.saveInitiativeState({...priorState,nextEligibleAt:null,dailyCount:1,dailyCountDate:day,maxPerDay:1});
    expect(characterDirectorService.initiativeEngine.evaluate(id,{conversationId:conversation(id)})).toMatchObject({outcome:"NO_ACTION",reason:"daily_limit"});
    const context=characterDirectorService.buildContext(conversation(id));const recent=context.recentCreativeHistory[0];expect(recent).toBeTruthy();
    const provider=characterDirectorService.conversationProvider;const originalPropose=provider.propose.bind(provider);const count=repository.proposals({characterId:id}).length;
    provider.propose=(request)=>{const output=originalPropose(request);output.sceneProposal={...output.sceneProposal,title:recent.title??"Repeated recent scene",location:recent.location,wardrobe:recent.wardrobe,lighting:recent.lighting,mood:recent.mood,shotDescription:recent.shotType,cameraDirection:recent.cameraDirection};return output;};
    try { expect(characterDirectorService.initiativeEngine.evaluate(id,{manual:true,conversationId:conversation(id)})).toMatchObject({outcome:"NO_ACTION",reason:"duplicate_concept"});expect(repository.proposals({characterId:id}).length).toBe(count); }
    finally { provider.propose=originalPropose;repository.saveInitiativeState(priorState); }
  });
});

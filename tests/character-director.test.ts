import { describe, expect, it } from "vitest";
import { db } from "../lib/db";
import { seedDatabase } from "../lib/seed";
import { characterDirectorService, canUseAdultConversation, evaluateNovelty, validateCharacterBrainResponse } from "../lib/character-director";
import { repository } from "../lib/repository";
import { generationService } from "../lib/services";
import type { CharacterBrainResponse } from "../lib/domain";

seedDatabase();
const conversation=(characterId:string)=>repository.conversationForCharacter(characterId)!.id;

describe("Character Director M1 local brain",()=>{
  it("migrates and persists creative profiles, initiative, and memory",()=>{
    expect((db.prepare("SELECT version FROM schemaMigrations WHERE version=1").get() as {version:number}).version).toBe(1);
    const before=repository.characterProfile("char-mara")!;
    repository.saveCharacterProfile({...before,initiativeLevel:"CREATIVE",updatedAt:new Date().toISOString()});
    expect(repository.characterProfile("char-mara")?.initiativeLevel).toBe("CREATIVE");
    const memory=repository.creativeMemory("char-mara")!;memory.savedProposalIds=["persistence-check"];repository.saveCreativeMemory(memory);
    expect(repository.creativeMemory("char-mara")?.savedProposalIds).toContain("persistence-check");
    repository.saveCharacterProfile(before);
  });
  it("keeps seeded characters conversationally and creatively distinct",()=>{
    const nova=characterDirectorService.buildContext(conversation("char-nova"));
    const iona=characterDirectorService.buildContext(conversation("char-iona"));
    const mock=characterDirectorService.conversationProvider;
    expect(mock.respond({context:nova,userText:"Tell me about the frame"}).message).not.toBe(mock.respond({context:iona,userText:"Tell me about the frame"}).message);
    const a=characterDirectorService.createProposal({conversationId:nova.conversationId,source:"conversation"}).proposal;
    const b=characterDirectorService.createProposal({conversationId:iona.conversationId,source:"conversation"}).proposal;
    expect(a.location).not.toBe(b.location);
    expect(a.cameraDirection).not.toBe(b.cameraDirection);
  });
  it("creates proposals with ordered role references and save/reject states",()=>{
    const result=characterDirectorService.createProposalMessage(conversation("char-nova"));
    expect(result.proposal.sourceMessageIds).toContain(result.message.id);
    expect(repository.proposalReferences(result.proposal.id).map((ref)=>ref.position)).toEqual([0,1,2].slice(0,repository.proposalReferences(result.proposal.id).length));
    expect(characterDirectorService.setProposalStatus(result.proposal.id,"SAVED").status).toBe("SAVED");
    expect(repository.creativeMemory("char-nova")?.savedProposalIds).toContain(result.proposal.id);
    expect(characterDirectorService.setProposalStatus(result.proposal.id,"REJECTED","wrong mood").status).toBe("REJECTED");
    expect(repository.creativeMemory("char-nova")?.resultNotes[`proposal:${result.proposal.id}`]).toBe("wrong mood");
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
    const conversationResponse:CharacterBrainResponse={message:"A short reply.",intent:"conversation",memoryCandidates:[],creativeSignals:{}};
    expect(validateCharacterBrainResponse(conversationResponse)).toBe(true);
  });
  it("keeps explicit adult eligibility gated by both character state and provider policy",()=>{
    const profile=repository.characterProfile("char-nova")!;const deployment=characterDirectorService.conversationProvider.deployment;
    expect(canUseAdultConversation(profile,deployment)).toBe(false);
    expect(canUseAdultConversation({...profile,ageVerifiedAdult:true},{...deployment,adultRoleplay:"supported"})).toBe(true);
    expect(canUseAdultConversation({...profile,adultCharacter:false,ageVerifiedAdult:true},{...deployment,adultRoleplay:"supported"})).toBe(false);
  });
  it("limits context while retaining the complete persisted conversation and summary",()=>{
    const id=conversation("char-iona");for(let n=0;n<18;n++)repository.addMessage(id,"user",`Distinct context note number ${n} describes a deliberate camera framing experiment.`);
    const context=characterDirectorService.buildContext(id);
    expect(context.recentMessages.length).toBeLessThanOrEqual(context.limits.recentMessages);
    expect(context.conversationSummary.summary.length).toBeLessThanOrEqual(context.limits.summaryCharacters);
    expect(repository.messages(id).length).toBeGreaterThan(18);
    expect(repository.conversationSummary(id)?.summarizedThroughMessageId).toBeTruthy();
  });
  it("creates a conversation-linked generation from proposal context and stores deterministic reaction",()=>{
    const id=conversation("char-mara");const proposal=characterDirectorService.createProposal({conversationId:id,source:"conversation"}).proposal;
    characterDirectorService.setProposalStatus(proposal.id,"ACCEPTED");
    const job=generationService.create({characterId:proposal.characterId,mode:proposal.imageOrVideoIntent,prompt:proposal.proposedImagePlan,aspectRatio:proposal.suggestedAspectRatio,preset:"Hero",duration:proposal.suggestedDuration??undefined,simulation:"success",referenceAssetIds:proposal.suggestedReferenceIds,referenceAssetRoles:proposal.suggestedReferenceRoles,proposalId:proposal.id,sceneContext:{concept:proposal.concept,location:proposal.location,wardrobe:proposal.wardrobe,mood:proposal.mood,lighting:proposal.lighting,shotDescription:proposal.shotDescription,cameraDirection:proposal.cameraDirection},conversationId:id});
    const completed=generationService.callbackComplete(job.id);const reaction=repository.mediaReactions().find((item)=>item.mediaId===completed.mediaId);
    expect(completed.status).toBe("completed");expect(reaction?.proposalId).toBe(proposal.id);expect(repository.messages(id).some((message)=>message.id===reaction?.messageId)).toBe(true);
    expect(repository.asset(completed.mediaId!).parentId).toBeNull();expect(repository.proposal(proposal.id)?.status).toBe("GENERATED");
  });
  it("records mock chat usage at zero cost and manual initiative respects conservative defaults",()=>{
    const result=characterDirectorService.initiativeEngine.evaluate("char-iona",{manual:true,conversationId:conversation("char-iona")});
    expect(result.outcome).toBe("CREATE_SCENE_PROPOSAL");
    const usage=repository.chatUsage().filter((item)=>item.conversationId===conversation("char-iona"));
    expect(usage.every((item)=>item.estimatedCost===0&&item.actualCost===0)).toBe(true);
    const automatic=characterDirectorService.initiativeEngine.evaluate("char-iona",{manual:false,conversationId:conversation("char-iona")});
    expect(automatic.outcome).toBe("NO_ACTION");
  });
});

import { describe, expect, it } from "vitest";
import { db } from "../lib/db";
import { seedTestDatabase } from "./test-seed";
import { generationService } from "../lib/services";
import { repository } from "../lib/repository";
import { MockImageProvider, MockVideoProvider } from "../lib/providers";

seedTestDatabase();
const characterId = repository.characters()[0].id;
const input = (simulation:"success"|"failure"|"timeout"="success") => ({characterId,mode:"image" as const,prompt:"Deterministic test frame",aspectRatio:"4:5",preset:"Hero",simulation});
describe("mock generation lifecycle",()=>{
 it("honors the normalized image and video provider state contract",()=>{
  const job=generationService.create(input()); const character=repository.character(characterId); const request={job,character,input:input()};
  expect(new MockImageProvider().advance(request,0).state).toBe("queued");
  expect(new MockImageProvider().advance(request,900).state).toBe("generating");
  expect(new MockVideoProvider().advance(request,2200).state).toBe("finalizing");
  expect(new MockVideoProvider().advance(request,3000).state).toBe("completed");
 });
 it("creates media after a persisted completed job",()=>{const job=generationService.create(input());db.prepare("UPDATE jobs SET createdAt=? WHERE id=?").run(new Date(Date.now()-4000).toISOString(),job.id);const completed=generationService.advance(job.id);expect(completed.status).toBe("completed");expect(completed.mediaId).toBeTruthy();expect(repository.asset(completed.mediaId!)!.providerId).toBe("mock-image");});
 it("persists provider failures and allows a retry",()=>{const job=generationService.create(input("failure"));db.prepare("UPDATE jobs SET createdAt=? WHERE id=?").run(new Date(Date.now()-2000).toISOString(),job.id);expect(generationService.advance(job.id).status).toBe("failed");expect(generationService.retry(job.id).status).toBe("queued");});
 it("cancels before completion",()=>{const job=generationService.create(input());expect(generationService.cancel(job.id).status).toBe("cancelled");});
 it("stores favorites and references",()=>{const media=repository.media()[0]!;expect(repository.toggleFavorite(media.id)!.favorite).toBe(!media.favorite);expect(repository.setReference(media.id)!.isReference).toBe(true);});
 it("keeps generated media available through a fresh repository read",()=>{const assets=repository.media(); const first=assets[0]!;const persisted=repository.asset(first.id); expect(persisted!.id).toBe(first.id); expect(persisted!.url).toMatch(/^\/(fixtures|generated)\//);});
 it("persists character settings without mixing visual and conversational fields",()=>{const current=repository.character(characterId);const updated=repository.updateCharacter(characterId,{description:"Visual brief",personality:"Measured, lucid, and warm."});expect(updated.description).toBe("Visual brief");expect(updated.personality).toBe("Measured, lucid, and warm.");expect(updated.identityNotes).toBe(current.identityNotes);});
 it("stores categorized canonical references and their metadata",()=>{const media=repository.mediaByCharacter(characterId)[0];repository.addCharacterReference(characterId,media.id,"hair",true);const updated=repository.updateCharacterReference(characterId,media.id,"hair",{label:"Auburn profile",active:true,priority:8});expect(updated?.canonical).toBe(true);expect(updated?.label).toBe("Auburn profile");expect(updated?.priority).toBe(8);});
 it("persists ordered structured job references",()=>{const refs=repository.mediaByCharacter(characterId).slice(0,2).map(m=>m.id);const job=repository.createJob({...input(),referenceAssetIds:refs,parentMediaId:refs[0]});const lineage=repository.jobReferences(job.id);expect(lineage.map(x=>x.mediaId)).toContain(refs[0]);expect(lineage.map(x=>x.mediaId)).toContain(refs[1]);expect(lineage.some(x=>x.role==="parent")).toBe(true);});
 it("persists and clears an autosave draft",()=>{repository.saveDraft({id:"test-draft",characterId,mode:"image",payloadJson:'{"prompt":"draft"}',updatedAt:new Date().toISOString()});expect(repository.draft("test-draft").characterId).toBe(characterId);repository.clearDraft("test-draft");expect(repository.draft("test-draft")).toBeUndefined();});
 it("links collections, conversation memory, and media attachments",()=>{const asset=repository.media()[0];const collection=repository.createCollection("Test collection");repository.addToCollection(collection.id,asset.id);repository.saveMemory({conversationId:"conv-"+characterId,summary:"Recent visual direction",pinnedFacts:"Keep amber hair",contextNotes:"Use as scene context",updatedAt:new Date().toISOString()});const message=repository.addMessage("conv-"+characterId,"user","Attach this frame");repository.attachMessage(message.id,asset.id);const snapshot=repository.snapshot();expect(snapshot.collections.find(c=>c.id===collection.id)?.mediaIds).toContain(asset.id);expect(snapshot.memory.find(m=>m.conversationId==="conv-"+characterId)?.pinnedFacts).toContain("amber");expect(snapshot.attachments.some(a=>a.messageId===message.id&&a.mediaId===asset.id)).toBe(true);});
 it("supports callback-style normalized completion and records a zero-cost ledger",()=>{const job=generationService.create({...input(),mode:"video"});const completed=generationService.callbackComplete(job.id);expect(completed.status).toBe("completed");expect(repository.events(job.id).some(e=>e.channel==="callback")).toBe(true);expect(repository.ledger().find(x=>x.jobId===job.id)?.estimatedCost).toBe(0);});
 it("enforces normalized provider capabilities before submission",()=>{expect(generationService.validate({...input(),aspectRatio:"2:3"})).toContain("aspect ratio");const video=repository.media().find(m=>m.type==="video")!;expect(generationService.validate({...input(),referenceAssetIds:[video.id]})).toContain("video references");});
});

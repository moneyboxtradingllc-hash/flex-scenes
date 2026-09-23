import { describe, expect, it } from "vitest";
import { db } from "../lib/db";
import { seedDatabase } from "../lib/seed";
import { generationService } from "../lib/services";
import { repository } from "../lib/repository";
import { MockImageProvider, MockVideoProvider } from "../lib/providers";

seedDatabase();
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
 it("creates media after a persisted completed job",()=>{const job=generationService.create(input());db.prepare("UPDATE jobs SET createdAt=? WHERE id=?").run(new Date(Date.now()-4000).toISOString(),job.id);const completed=generationService.advance(job.id);expect(completed.status).toBe("completed");expect(completed.mediaId).toBeTruthy();expect(repository.asset(completed.mediaId!).providerId).toBe("mock-image");});
 it("persists provider failures and allows a retry",()=>{const job=generationService.create(input("failure"));db.prepare("UPDATE jobs SET createdAt=? WHERE id=?").run(new Date(Date.now()-2000).toISOString(),job.id);expect(generationService.advance(job.id).status).toBe("failed");expect(generationService.retry(job.id).status).toBe("queued");});
 it("cancels before completion",()=>{const job=generationService.create(input());expect(generationService.cancel(job.id).status).toBe("cancelled");});
 it("stores favorites and references",()=>{const media=repository.media()[0];expect(repository.toggleFavorite(media.id).favorite).toBe(!media.favorite);expect(repository.setReference(media.id).isReference).toBe(true);});
 it("keeps generated media available through a fresh repository read",()=>{const assets=repository.media(); const persisted=repository.asset(assets[0].id); expect(persisted.id).toBe(assets[0].id); expect(persisted.url).toMatch(/^\/(fixtures|generated)\//);});
});

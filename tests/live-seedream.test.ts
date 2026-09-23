import { describe,expect,it } from "vitest";
import { vault, governor } from "../lib/live-governor";
import { sanitizedPreview, seedreamSmokeRequest, HotApiSeedream5ProSpicyProvider, planFor } from "../lib/live-seedream";
describe("safe live Seedream commissioning",()=>{
 it("uses the endpoint-specific 2K smoke request and never exposes a key",()=>{const preview=sanitizedPreview(seedreamSmokeRequest());expect(preview.body).toMatchObject({size:"2K"});expect(JSON.stringify(preview)).not.toContain("hk_live_");});
 it("DPAPI round trips a test credential without touching SQLite",()=>{vault.store("MuAPI","test-secret-not-a-real-provider-key");expect(vault.read("MuAPI")).toBe("test-secret-not-a-real-provider-key");expect(vault.fingerprint("MuAPI")).toMatch(/^••••/);vault.remove("MuAPI");});
 it("commissioning lock prevents transport even with a valid authorization",async()=>{governor.setGlobalLive(true);governor.set("HotAPI",{enabled:true,freeze:false,dailyCap:1,monthlyCap:5,perGenerationCap:.25});const request=seedreamSmokeRequest();const auth=governor.authorize(planFor(request));let calls=0;const service=new HotApiSeedream5ProSpicyProvider({request:async()=>{calls++;return {status:202,json:{id:"never"}};}});await expect(service.submitAuthorized(auth.id,request)).rejects.toThrow("COMMISSIONING_SUBMISSION_LOCKED");expect(calls).toBe(0);governor.setGlobalLive(false);governor.set("HotAPI",{enabled:false,freeze:false});});
});

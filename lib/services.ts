import { randomUUID } from "node:crypto";
import type { GenerationInput, GenerationJob, MediaAsset } from "./domain";
import { MockImageProvider, MockVideoProvider, mockImageCapabilities, mockVideoCapabilities } from "./providers";
import { repository } from "./repository";
import { LocalMediaStore } from "./storage";
const store=new LocalMediaStore(); const imageProvider=new MockImageProvider(); const videoProvider=new MockVideoProvider();
export class GenerationService {
  capabilities(){ return [mockImageCapabilities,mockVideoCapabilities]; }
  create(input: GenerationInput) { return repository.createJob(input); }
  advance(id: string): GenerationJob { const job=repository.job(id); if (!job || ["completed","failed","cancelled"].includes(job.status)) return job; const input=JSON.parse(job.settingsJson) as GenerationInput; const character=repository.character(job.characterId); const provider=job.mode==="image"?imageProvider:videoProvider; const state=provider.advance({job,character,input},Date.now()-Date.parse(job.createdAt)); if(state.state==="completed") { const asset=this.complete(job,character.name,input); return repository.updateJob(id,{status:"completed",mediaId:asset.id,error:null}); } return repository.updateJob(id,{status:state.state,error:state.error??null}); }
  cancel(id:string){ const job=repository.job(id); if(["completed","failed","cancelled"].includes(job.status)) return job; return repository.updateJob(id,{status:"cancelled",error:"Cancelled by user."}); }
  retry(id:string){ const job=repository.job(id); if(job.status!=="failed") return job; const input=JSON.parse(job.settingsJson) as GenerationInput; return this.create({...input,simulation:"success"}); }
  private complete(job:GenerationJob,characterName:string,input:GenerationInput):MediaAsset { const id=randomUUID(); const colors=["#7c3aed","#c026d3","#db2777","#2563eb"]; const accent=colors[id.charCodeAt(0)%colors.length]; const url=store.writeMockVisual(id,characterName,accent,input.mode==="video"?"MOCK VIDEO PREVIEW":"MOCK IMAGE"); const asset:MediaAsset={id,characterId:job.characterId,type:job.mode,url,posterUrl:job.mode==="video"?url:null,title:input.prompt.slice(0,42)||"Untitled scene",caption:`Created with ${job.mode==="image"?"Mock Image Provider":"Mock Video Provider"}`,prompt:input.prompt,providerId:job.providerId,settingsJson:job.settingsJson,parentId:job.parentMediaId??null,isReference:false,createdAt:new Date().toISOString(),favorite:false}; repository.saveMedia(asset); return asset; }
}
export const generationService=new GenerationService();
export class MockConversationService { reply(characterName:string,text:string){ return `${characterName}: I hear you — “${text.slice(0,80)}”. I saved that direction for our next scene.`; } }
export const conversationService=new MockConversationService();

import { randomUUID } from "node:crypto";
import { db } from "./db";
import { HotApiClient, type HttpTransport, type LiveRequest, resolve } from "./live-contracts";
import { audit, governor, requestHash, type LivePlan, vault } from "./live-governor";
import { localMediaStore } from "./storage";

export const seedreamContract = {
  checkedAt: "2026-09-23T00:00:00.000Z",
  source: "https://hotapi.ai/en/docs/api/create-seedream50-pro-text",
  model: "seedream-5.0-pro-spicy",
  path: "/v1/seedream-5.0-pro-spicy/text-to-image",
  commissioningResolution: "2K",
  priceUsd: .12,
  note: "Endpoint reference currently documents 2K; the broader model page advertises 2K/3K/4K. Commissioning uses the endpoint-specific 2K contract."
} as const;
export const seedreamSmokeRequest = (prompt="Cinematic editorial portrait of an adult woman in a modern luxury apartment, fully clothed, natural lighting, photorealistic."):LiveRequest => ({family:"seedream-5.0-pro",mode:"text",prompt,references:[],resolution:"2K",aspectRatio:"4:5"});
export const planFor = (request:LiveRequest):LivePlan => ({provider:"HotAPI",deployment:"hotapi-seedream-t2i",request,estimate:seedreamContract.priceUsd});
export const sanitizedPreview = (request:LiveRequest) => {
  const preview=resolve(request).find(item=>item.deployment.id==="hotapi-seedream-t2i"); if(!preview||!preview.compatible) throw new Error("SEEDREAM_REQUEST_INCOMPATIBLE");
  return {method:"POST",endpoint:preview.endpoint,headers:{Authorization:"Bearer ••••", "Content-Type":"application/json","idempotency-key":"<generated-per-authorized-job>"},body:preview.payload,estimatedUsd:seedreamContract.priceUsd,contract:seedreamContract};
};
export type SubmissionIntent={id:string;jobId:string;authorizationId:string;idempotencyKey:string;state:string};
export function persistIntent(authorizationId:string,plan:LivePlan){const id=randomUUID(),jobId=randomUUID(),idempotencyKey=randomUUID(),timestamp=new Date().toISOString();db.prepare("INSERT INTO submissionIntents VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(id,jobId,authorizationId,plan.provider,plan.deployment,requestHash(plan.request),idempotencyKey,"authorized",null,null,timestamp,timestamp);return {id,jobId,authorizationId,idempotencyKey,state:"authorized"} as SubmissionIntent;}
export class HotApiSeedream5ProSpicyProvider {
  constructor(private transport:HttpTransport,private submitEnabled=false) {}
  async submitAuthorized(authorizationId:string,request:LiveRequest){
    const plan=planFor(request); const intent=persistIntent(authorizationId,plan);
    if(!this.submitEnabled) throw new Error("COMMISSIONING_SUBMISSION_LOCKED");
    if(!governor.isGlobalLiveEnabled()) throw new Error("GLOBAL_LIVE_PROVIDERS_DISABLED");
    const settings=governor.settings("HotAPI"); if(!settings.enabled||settings.freeze) throw new Error(settings.freeze?"PAID_GENERATION_FROZEN":"LIVE_PROVIDERS_DISABLED");
    const secret=vault.read("HotAPI");if(!secret)throw new Error("CREDENTIAL_MISSING");
    governor.consume(authorizationId,plan);db.prepare("UPDATE submissionIntents SET state=?,updatedAt=? WHERE id=?").run("submitting",new Date().toISOString(),intent.id);audit("submission-attempted",{intentId:intent.id,jobId:intent.jobId});
    const preview=resolve(request).find(x=>x.deployment.id==="hotapi-seedream-t2i")!;
    try {const result=await new HotApiClient(this.transport,secret,false).submit({...preview,payload:preview.payload});const payload=result as {json:any};const taskId=payload.json?.id;db.prepare("UPDATE submissionIntents SET state=?,providerTaskId=?,updatedAt=? WHERE id=?").run("submitted",taskId??null,new Date().toISOString(),intent.id);audit("provider-task-created",{intentId:intent.id,taskId});return {intent,taskId,response:payload.json};}
    catch(error){db.prepare("UPDATE submissionIntents SET state=?,error=?,updatedAt=? WHERE id=?").run("uncertain",error instanceof Error?error.message:"transport",new Date().toISOString(),intent.id);throw error;}
  }
}

export const normalizeHotApiTask=(task:any)=>{const states:Record<string,string>={pending:"queued",queued:"queued",processing:"generating",succeeded:"completed",failed:"failed",cancelled:"cancelled",expired:"failed"};return {providerTaskId:task?.id as string|undefined,state:states[String(task?.status)]??"failed",error:task?.error?.message,outputUrl:task?.output?.url??task?.output?.images?.[0]?.url,estimatedCost:typeof task?.estimated_credits_cost==="number"?task.estimated_credits_cost/1000:undefined,actualCost:typeof task?.actual_credits_cost==="number"?task.actual_credits_cost/1000:undefined};};
export async function pollHotApiTask(transport:HttpTransport,apiKey:string,taskId:string){const result=await transport.request({url:`https://api.hotapi.ai/v1/tasks/${taskId}`,method:"GET",headers:{Authorization:`Bearer ${apiKey}`}});return normalizeHotApiTask(result.json);}
/** Downloads only a completed, image-content provider output; caller supplies an injected fetcher for testability. */
export async function ingestSeedreamOutput(input:{url:string;jobId:string;characterId:string;prompt:string;fetcher:(url:string)=>Promise<{contentType:string;bytes:Buffer}>}){const file=await input.fetcher(input.url);if(!file.contentType.startsWith("image/")||!file.bytes.length)throw new Error("INVALID_PROVIDER_IMAGE_OUTPUT");const ext=file.contentType.includes("png")?"png":"jpg";const url=localMediaStore.saveUpload(`provider-${input.jobId}`,`seedream.${ext}`,file.bytes);return {url,providerId:"HotAPI",jobId:input.jobId,provenance:"provider-ingested" as const};}

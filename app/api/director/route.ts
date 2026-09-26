import { characterDirectorService } from "@/lib/character-director";
import { repository } from "@/lib/repository";
import type { CharacterProfile } from "@/lib/domain";

type DirectorActionBody={action:string;conversationId?:string;characterId?:string;text?:string;mediaId?:string;proposalId?:string;rejectionReason?:string;variation?:string;manual?:boolean;confirmed?:boolean};
const json=(value:unknown,status=200)=>Response.json(value,{status});

export async function POST(request:Request){
  const body=await request.json() as DirectorActionBody;
  try {
    if(body.action==="message"&&body.conversationId&&body.text){
      const stream=characterDirectorService.streamMessage(body.conversationId,body.text,body.mediaId);
      const encoder=new TextEncoder();const iterator=stream[Symbol.asyncIterator]();
      return new Response(new ReadableStream<Uint8Array>({async pull(controller){try{const next=await iterator.next();if(next.done){controller.close();return;}controller.enqueue(encoder.encode(next.value));}catch(error){controller.enqueue(encoder.encode(JSON.stringify({type:"error",message:error instanceof Error?error.message:"Message failed"})+"\n"));controller.close();}},cancel(){void iterator.return?.();}}),{headers:{"Content-Type":"application/x-ndjson; charset=utf-8","Cache-Control":"no-cache, no-transform","X-Content-Type-Options":"nosniff"}});
    }
    if(body.action==="ask"&&body.conversationId)return json(characterDirectorService.createProposalMessage(body.conversationId));
    if(body.action==="another"&&body.conversationId)return json(characterDirectorService.anotherProposal(body.conversationId,body.proposalId));
    if(body.action==="remix"&&body.proposalId)return json(characterDirectorService.remixProposal(body.proposalId,body.variation));
    if(body.action==="save"&&body.proposalId)return json(characterDirectorService.setProposalStatus(body.proposalId,"SAVED"));
    if(body.action==="reject"&&body.proposalId)return json(characterDirectorService.setProposalStatus(body.proposalId,"REJECTED",body.rejectionReason));
    if(body.action==="accept"&&body.proposalId)return json(characterDirectorService.setProposalStatus(body.proposalId,"ACCEPTED"));
    if(body.action==="think"&&body.characterId){
      const result=characterDirectorService.initiativeEngine.evaluate(body.characterId,{manual:body.manual??true,conversationId:body.conversationId});
      if(result.outcome==="NO_ACTION")return json(result);
      const proposalMessage=repository.addMessage(result.proposal.conversationId,"character",result.message);
      const proposal=repository.updateProposalSources(result.proposal.id,[proposalMessage.id]);
      return json({outcome:result.outcome,proposal,message:proposalMessage,state:result.state});
    }
    if(body.action==="context"&&body.conversationId){if(process.env.NODE_ENV!=="development")return json({error:"Inspector only available in development"},404);const context=characterDirectorService.buildContext(body.conversationId);const mockResponse=characterDirectorService.directorProvider.propose({context,variationIndex:repository.proposals({characterId:context.character.id}).length});return json({context,normalizedRequest:{characterProfile:context.profile,visualIdentity:context.visualIdentity,conversationSummary:context.conversationSummary,recentMessages:context.recentMessages,pinnedMemories:context.pinnedMemories,creativeMemory:context.creativeMemory,recentCreativeHistory:context.recentCreativeHistory,limits:context.limits},mockResponse});}
    if(body.action==="profile-update"&&body.characterId){
      const current=repository.characterProfile(body.characterId);if(!current)return json({error:"Character profile not found"},404);
      const patch=body as unknown as {initiativeLevel?:string;adultCharacter?:boolean;ageVerifiedAdult?:boolean;creativeProfile?:Record<string,unknown>;conversationalProfile?:Record<string,unknown>};
      if(patch.ageVerifiedAdult===true&&!current.ageVerifiedAdult)return json({error:"Age verification requires a separate explicit verification action."},409);
      if(patch.initiativeLevel&&!(["REACTIVE","CREATIVE","DIRECTOR"] as string[]).includes(patch.initiativeLevel))return json({error:"Invalid initiative level"},400);
      const profile:CharacterProfile={...current,characterId:body.characterId,initiativeLevel:(patch.initiativeLevel as CharacterProfile["initiativeLevel"]|undefined)??current.initiativeLevel,adultCharacter:patch.adultCharacter??current.adultCharacter,ageVerifiedAdult:patch.ageVerifiedAdult??current.ageVerifiedAdult,creativeProfile:{...current.creativeProfile,...patch.creativeProfile},conversationalProfile:{...current.conversationalProfile,...patch.conversationalProfile},updatedAt:new Date().toISOString()};
      if(profile.ageVerifiedAdult&&!profile.adultCharacter)return json({error:"Age-verified adult mode requires an explicitly adult character."},400);
      for(const key of ["creativeBoldness","noveltyPreference","repetitionTolerance","experimentationLevel","emotionalExpressiveness"]){const value=(key in profile.creativeProfile?profile.creativeProfile[key as keyof typeof profile.creativeProfile]:profile.conversationalProfile[key as keyof typeof profile.conversationalProfile]);if(typeof value==="number"&&(!Number.isFinite(value)||value<0||value>1))return json({error:`${key} must be between 0 and 1`},400);}
      return json(repository.saveCharacterProfile(profile));
    }
    if(body.action==="verify-adult-age"&&body.characterId){if(body.confirmed!==true)return json({error:"Explicit confirmation is required."},400);return json(repository.recordAdultAgeVerification(body.characterId,true));}
    if(body.action==="pin"&&body.conversationId&&body.text?.trim())return json(repository.addPinnedMemory({conversationId:body.conversationId,category:"creative-context",body:body.text.trim().slice(0,500)}));
    if(body.action==="summarize"&&body.conversationId){const context=characterDirectorService.buildContext(body.conversationId);return json(context.conversationSummary);}
    return json({error:"Unsupported Character Director action"},400);
  } catch(error){return json({error:error instanceof Error?error.message:"Character Director request failed"},400);}
}

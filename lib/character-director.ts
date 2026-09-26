import { randomUUID } from "node:crypto";
import type { CharacterBrainContext, CharacterBrainResponse, CharacterProfile, ConversationProviderDeployment, ConversationSummary, CreativeMemory, GenerationJob, MediaAsset, NoveltySignal, RecentCreativeScene, SceneProposal, SceneProposalStatus } from "./domain";
import { emptyCharacterProfile, emptyCreativeMemory } from "./brain-defaults";
import { repository } from "./repository";
import { mockImageCapabilities, mockVideoCapabilities } from "./providers";

const now=()=>new Date().toISOString();
const parse=<T,>(value:string,fallback:T):T=>{try{return JSON.parse(value) as T;}catch{return fallback;}};
const unique=(values:string[],limit=20)=>Array.from(new Set(values.filter(Boolean))).slice(0,limit);
const words=(value:string)=>value.toLocaleLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g," ").trim();
const DIMENSIONS:[keyof RecentCreativeScene,string][]=[["location","location"],["wardrobe","wardrobe"],["lighting","lighting"],["mood","mood"],["shotType","shot"],["cameraDirection","camera"]];
const ALLOWED_PROPOSAL_TRANSITIONS:Record<SceneProposalStatus,SceneProposalStatus[]>={DRAFT:["PROPOSED","REJECTED"],PROPOSED:["SAVED","ACCEPTED","REJECTED","REMIXED"],SAVED:["ACCEPTED","REJECTED","REMIXED"],ACCEPTED:["REJECTED","REMIXED"],REJECTED:["REMIXED"],REMIXED:[],GENERATED:[]};
class DuplicateSceneProposalError extends Error { constructor(){super("The initiative draft duplicates a recent scene.");this.name="DuplicateSceneProposalError";} }

export interface ConversationRequest { context:CharacterBrainContext; userText:string; }
export interface DirectorRequest { context:CharacterBrainContext; variationIndex:number; parent?:SceneProposal; rejectedProposal?:SceneProposal; variation?:string; }
export interface CharacterConversationProvider { readonly id:string; readonly deployment:ConversationProviderDeployment; respond(request:ConversationRequest):CharacterBrainResponse; streamText(text:string):AsyncIterable<string>; }
export interface CharacterDirectorProvider { readonly id:string; propose(request:DirectorRequest):CharacterBrainResponse; }
export interface ConversationMemoryProvider { readonly id:string; summarize(messages:{id:string;role:string;body:string}[]):{summary:string;summarizedThroughMessageId:string|null}; }

export class DeterministicConversationMemoryProvider implements ConversationMemoryProvider {
  readonly id="local-summary-v1";
  summarize(messages:{id:string;role:string;body:string}[]) {
    const userLines=messages.filter((m)=>m.role==="user").map((m)=>m.body.trim()).filter(Boolean);
    const characterLines=messages.filter((m)=>m.role==="character").map((m)=>m.body.trim()).filter(Boolean);
    const themes=unique([...userLines,...characterLines].flatMap((line)=>line.split(/[.!?\n]/).map((part)=>part.trim()).filter((part)=>part.length>12)),3);
    return {summary:themes.join(" ").slice(0,360),summarizedThroughMessageId:messages.at(-1)?.id??null};
  }
}

export function defaultConversationProvider():ConversationProviderDeployment {
  return {providerId:"mock-character-brain",model:"mock-character-brain-v1",connected:true,textConversation:true,structuredOutput:true,contextWindow:null,streaming:true,toolCalling:false,adultRoleplay:"not_supported",estimatedInputCostPerMillion:0,estimatedOutputCostPerMillion:0};
}

export function defaultMemory(characterId:string):CreativeMemory { return {...emptyCreativeMemory(characterId),...repository.creativeMemory(characterId)}; }

export function evaluateNovelty(scene:RecentCreativeScene,history:RecentCreativeScene[],tolerance=0.3):NoveltySignal {
  if(!history.length)return {noveltyScore:1,similarityScore:0,similarDimensions:[],repeatedConcept:false};
  const dimensions=DIMENSIONS.filter(([key])=>!!scene[key]);
  let best:{score:number;matches:string[];repeated:boolean}={score:0,matches:[],repeated:false};
  for(const previous of history){
    const compared=dimensions.filter(([key])=>!!previous[key]);
    const matches=compared.filter(([key])=>words(String(scene[key]))===words(String(previous[key]))).map(([,label])=>label);
    const score=compared.length?matches.length/compared.length:0;
    const repeated=!!scene.title&&!!previous.title&&words(scene.title)===words(previous.title);
    const weighted=score+(repeated?0.35:0);
    if(weighted>best.score)best={score:Math.min(1,weighted),matches,repeated};
  }
  const similarityScore=Math.min(1,best.score);
  return {noveltyScore:1-similarityScore,similarityScore,similarDimensions:best.matches,repeatedConcept:best.repeated||similarityScore>=1-tolerance};
}

export function validateCharacterBrainResponse(value:unknown):value is CharacterBrainResponse {
  if(!value||typeof value!=="object")return false;
  const item=value as Record<string,unknown>;
  if(typeof item.message!=="string"||!item.message.trim()||item.message.length>4000)return false;
  if(!["conversation","scene_proposal","scene_revision"].includes(String(item.intent)))return false;
  if(!Array.isArray(item.memoryCandidates)||!item.memoryCandidates.every((x)=>typeof x==="string"&&x.length<=300))return false;
  if(!item.creativeSignals||typeof item.creativeSignals!=="object"||Array.isArray(item.creativeSignals))return false;
  if(item.intent==="conversation")return item.sceneProposal===undefined;
  const proposal=item.sceneProposal as Record<string,unknown>|undefined;
  if(!proposal)return false;
  const required=["title","naturalLanguagePitch","concept","location","wardrobe","mood","lighting","shotDescription","cameraDirection","suggestedAspectRatio","proposedImagePlan","proposedVideoPlan","noveltyReason"];
  if(!required.every((key)=>typeof proposal[key]==="string"&&String(proposal[key]).trim().length>0&&String(proposal[key]).length<=2400))return false;
  if(!/^\d{1,2}:\d{1,2}$/.test(String(proposal.suggestedAspectRatio)))return false;
  if(proposal.status!==undefined&&!(["DRAFT","PROPOSED","SAVED","ACCEPTED","REJECTED","REMIXED","GENERATED"] as unknown[]).includes(proposal.status))return false;
  if(!["image","video"].includes(String(proposal.imageOrVideoIntent)))return false;
  if(proposal.imageOrVideoIntent==="video"&&(typeof proposal.suggestedDuration!=="number"||proposal.suggestedDuration<1||proposal.suggestedDuration>60))return false;
  if(proposal.imageOrVideoIntent==="image"&&proposal.suggestedDuration!==null&&proposal.suggestedDuration!==undefined)return false;
  if(!Array.isArray(proposal.suggestedReferenceIds)||!proposal.suggestedReferenceIds.every((x)=>typeof x==="string"))return false;
  const roles=proposal.suggestedReferenceRoles as Record<string,unknown>|undefined;
  const allowedRoles=["face","body","hair","look","outfit","environment","pose","motion","video","other"];
  if(!roles||typeof roles!=="object"||Array.isArray(roles)||Object.values(roles).some((role)=>!allowedRoles.includes(String(role))))return false;
  if(!Array.isArray(proposal.sourceMessageIds)||!proposal.sourceMessageIds.every((id)=>typeof id==="string"))return false;
  if(proposal.parentProposalId!==undefined&&proposal.parentProposalId!==null&&typeof proposal.parentProposalId!=="string")return false;
  if(proposal.noveltyScore!==undefined&&(typeof proposal.noveltyScore!=="number"||proposal.noveltyScore<0||proposal.noveltyScore>1))return false;
  if(proposal.similarityScore!==undefined&&(typeof proposal.similarityScore!=="number"||proposal.similarityScore<0||proposal.similarityScore>1))return false;
  return true;
}

export function canUseAdultConversation(profile:CharacterProfile|undefined,deployment:ConversationProviderDeployment|undefined) {
  return !!profile?.adultCharacter&&profile.ageVerifiedAdult&&deployment?.adultRoleplay==="supported";
}

export class MockCharacterBrainProvider implements CharacterConversationProvider,CharacterDirectorProvider {
  readonly id="mock-character-brain";
  readonly deployment=defaultConversationProvider();
  respond({context,userText}:ConversationRequest):CharacterBrainResponse {
    const voice=context.profile.conversationalProfile;
    const recent=unique(context.recentMessages.filter((m)=>m.role==="user").slice(-3).map((m)=>m.body),2);
    const continuity=recent.length?` I’m keeping in mind your note about ${recent.at(-1)!.slice(0,80).replace(/[.!?]+$/g,"")}.`:"";
    let message:string;
    const declined=/\b(stop|no thanks|not now|not interested|change the subject|different direction|don't continue|do not continue)\b/i.test(userText);
    const approved=/\b(yes|sounds good|love that|great idea|go ahead|please do)\b/i.test(userText);
    if(declined && voice.rejectionReaction) message=voice.rejectionReaction;
    else if(approved && voice.approvalReaction) message=voice.approvalReaction;
    else if(voice.seductionStyle) {
      const style=voice.seductionStyle.toLowerCase();
      const tease=voice.favoriteTeasingPatterns[0];
      if(style.includes("slow-burn")) message=`I was thinking of something quieter—closer, more personal, with room for the anticipation to build.${tease?` Maybe I’ll start with ${tease}.`:""}${continuity}`;
      else if(style.includes("dark feminine")) message=`There’s something about this direction that feels better after dark. I have a thought, but I want to know if you’re in the mood for it.${continuity}`;
      else if(style.includes("sweet-but-naughty")) message=`I can keep this sweet and innocent… or let one little hint slip and see if you ask me to continue.${continuity}`;
      else if(style.includes("cute-but-dangerous")) message=`I have a sweet version and a much bolder little twist. Which one do you want to hear first?${continuity}`;
      else if(style.includes("troublemaker")) message=`I’ve got a bold idea that might get exactly the reaction I’m hoping for. Want to hear the cheeky version?${continuity}`;
      else message=`Mmm, I like this direction. I have a tempting idea, but I’ll let you decide how bold we get.${tease?` Maybe I’ll start with ${tease}.`:""}${continuity}`;
    }
    else if(voice.speakingStyle.toLowerCase().includes("economical")||voice.attitude.toLowerCase().includes("analytical")) message=`That tracks. I’d keep the frame deliberate and let one clear detail carry it.${continuity}`;
    else if(voice.speakingStyle.toLowerCase().includes("lively")||voice.attitude.toLowerCase().includes("optimistic")) message=`Oh, I like where you’re taking that. There’s room for one small, lovely detail to make it feel lived in.${continuity}`;
    else message=`I can see that. The light and the quieter framing feel like a good thread for us to follow.${continuity}`;
    const reply:CharacterBrainResponse={message,intent:"conversation",memoryCandidates:userText.length>20?[userText.slice(0,220)]:[],creativeSignals:{voice:voice.speakingStyle,seductionStyle:voice.seductionStyle,flirtIntensity:voice.flirtIntensity,naughtiness:voice.naughtiness,relationshipDynamic:voice.privateRelationshipDynamic,continuity:recent.length>0}};
    if(!validateCharacterBrainResponse(reply))throw new Error("Mock conversation response failed validation");
    return reply;
  }
  async *streamText(text:string):AsyncIterable<string> {
    const chunks=text.match(/.{1,18}(?:\s|$)|.{1,18}/g)??[text];
    for(const chunk of chunks){await new Promise((resolve)=>setTimeout(resolve,14));yield chunk;}
  }
  propose({context,variationIndex,parent,rejectedProposal,variation}:DirectorRequest):CharacterBrainResponse {
    const profile=context.profile.creativeProfile;const voice=context.profile.conversationalProfile;
    const environments=profile.favoriteEnvironments.length?profile.favoriteEnvironments:["a sunlit studio"];
    const wardrobes=profile.wardrobeCategories.length?profile.wardrobeCategories:["an editorial look"];
    const moods=profile.preferredMoods.length?profile.preferredMoods:["quiet confidence"];
    const lighting=profile.preferredLighting.length?profile.preferredLighting:["soft natural light"];
    const shots=profile.preferredShotTypes.length?profile.preferredShotTypes:["portrait"];
    const cameras=profile.cameraEnergy.length?profile.cameraEnergy:["gentle push-in"];
    const previous:RecentCreativeScene[]=[...context.recentCreativeHistory,...(parent?[{mediaId:parent.id,title:parent.title,location:parent.location,wardrobe:parent.wardrobe,lighting:parent.lighting,mood:parent.mood,shotType:parent.shotDescription,cameraDirection:parent.cameraDirection}]:[]),...(rejectedProposal?[{mediaId:rejectedProposal.id,title:rejectedProposal.title,location:rejectedProposal.location,wardrobe:rejectedProposal.wardrobe,lighting:rejectedProposal.lighting,mood:rejectedProposal.mood,shotType:rejectedProposal.shotDescription,cameraDirection:rejectedProposal.cameraDirection}]:[])];
    let chosen:RecentCreativeScene|undefined;let best:NoveltySignal|undefined;let chosenIndex=variationIndex;
    const variationOffset=variation==="location"?3:variation==="wardrobe"?2:variation==="mood"?4:variation==="camera"?5:variation==="boldness"?6:variation==="media"?7:0;
    for(let offset=0;offset<Math.max(8,environments.length*2);offset++){
      const n=variationIndex+variationOffset+offset;
      const scene:RecentCreativeScene={mediaId:"draft",location:environments[n%environments.length],wardrobe:wardrobes[(n+1)%wardrobes.length],mood:moods[(n+2)%moods.length],lighting:lighting[(n+3)%lighting.length],shotType:shots[(n+4)%shots.length],cameraDirection:cameras[(n+5)%cameras.length]};
      const score=evaluateNovelty(scene,previous,profile.repetitionTolerance);
      const sceneText=words([scene.location,scene.wardrobe,scene.lighting,scene.mood,scene.shotType,scene.cameraDirection].join(" "));
      const tiredMatch=profile.ideasTiredOf.some((idea)=>{const terms=words(idea).split(" ").filter((term)=>term.length>3);return terms.length>0&&terms.every((term)=>sceneText.includes(term));});
      const adjustedNovelty=score.noveltyScore*profile.noveltyPreference+(1-profile.noveltyPreference)*0.5-(tiredMatch?0.35:0);
      if(!best||adjustedNovelty>best.noveltyScore){chosen=scene;best={...score,noveltyScore:Math.max(0,adjustedNovelty),similarityScore:1-Math.max(0,adjustedNovelty)};chosenIndex=n;}
      if(adjustedNovelty>=0.8)break;
    }
    const scene=chosen!;const novelty=best!;const imageOrVideoIntent:SceneProposal["imageOrVideoIntent"]=profile.mediaBalance==="balanced"?(chosenIndex%2?"video":"image"):profile.mediaBalance;
    const title=scene.location!.toLowerCase().includes("train")?"Before the First Train":scene.location!.toLowerCase().includes("diner")?"Before the Coffee Cools":scene.location!.toLowerCase().includes("roof")?"Above the City Glow":scene.location!.toLowerCase().includes("sunroom")?"Light Finds the Table":scene.location!.toLowerCase().includes("gallery")?"Quiet Between Frames":scene.location!.toLowerCase().includes("courtyard")?"A Little Sun in the Courtyard":`A New Frame at ${scene.location!.replace(/^(a|an|the) /i,"").replace(/\b\w/g,(c)=>c.toUpperCase())}`;
    const sceneType=profile.favoriteSceneTypes.length?profile.favoriteSceneTypes[chosenIndex%profile.favoriteSceneTypes.length]:"";
    const visualBrief=profile.visualBrief?` ${profile.visualBrief}.`:"";
    const sceneTreatment=sceneType?` Scene treatment: ${sceneType}.`:"";
    const imagePlan=`${context.character.name} in ${scene.location}, wearing ${scene.wardrobe}. ${scene.mood}, lit with ${scene.lighting}. ${scene.shotType}; ${scene.cameraDirection}.${sceneTreatment}${visualBrief} ${profile.visualThemes.join(", ")}. Maintain the character's canonical visual identity.`;
    const videoPlan=`${context.character.name} in ${scene.location}, wearing ${scene.wardrobe}. ${scene.mood}; ${scene.lighting}. ${scene.shotType} with ${scene.cameraDirection}.${sceneTreatment}${visualBrief} Natural restrained motion; keep face and outfit consistent.`;
    const basePitch=voice.speakingStyle.toLowerCase().includes("economical")?`I’ve got a thought. Let’s leave the soft, familiar setups behind and use ${scene.location} for a ${scene.mood} frame. The ${scene.wardrobe} and ${scene.lighting} give the composition a clear line; I’d keep the camera ${scene.cameraDirection}.`:
      voice.speakingStyle.toLowerCase().includes("lively")?`I have a fun one for us: ${scene.location}, with ${scene.wardrobe} and all that ${scene.lighting}. I want it to feel ${scene.mood}, like we caught a little moment that was just about to happen. Let the camera ${scene.cameraDirection}.`:
      `I want to change the rhythm a little. Let’s meet at ${scene.location} in ${scene.wardrobe}, with ${scene.lighting} settling into a ${scene.mood} frame. I’m picturing a ${scene.shotType} and a camera that stays ${scene.cameraDirection}.`;
    const teasingPattern=voice.favoriteTeasingPatterns.length?voice.favoriteTeasingPatterns[chosenIndex%voice.favoriteTeasingPatterns.length]:"";
    const pitch=basePitch+(voice.seductionStyle?(teasingPattern?` I might lean into ${teasingPattern}, then let you decide whether we take the idea any further.`:" I’ll keep the idea suggestive and let you set the pace."):"");
    const ideaToTry=profile.ideasToTry.length?profile.ideasToTry[chosenIndex%profile.ideasToTry.length]:"";
    const boldNote=profile.creativeBoldness>0.7?" Add one unexpected visual interruption while keeping her identity clear.":" Keep the styling intentional and the visual direction restrained.";
    const proposal:Partial<SceneProposal>={parentProposalId:parent?.id??null,title,naturalLanguagePitch:pitch,concept:`${scene.mood} study shaped by ${scene.location}, ${profile.visualThemes[chosenIndex%Math.max(profile.visualThemes.length,1)]??"natural detail"}${ideaToTry?`; exploring ${ideaToTry}`:""}`,location:scene.location!,wardrobe:scene.wardrobe!,mood:scene.mood!,lighting:scene.lighting!,shotDescription:scene.shotType!,cameraDirection:scene.cameraDirection!,imageOrVideoIntent,suggestedAspectRatio:imageOrVideoIntent==="video"?"9:16":"4:5",suggestedDuration:imageOrVideoIntent==="video"?5:null,suggestedReferenceIds:[],suggestedReferenceRoles:{},proposedImagePlan:imagePlan+boldNote,proposedVideoPlan:videoPlan+boldNote,noveltyReason:novelty.similarDimensions.length?`A deliberate callback with a different angle; vary ${novelty.similarDimensions.join(" and ")}.${ideaToTry?` It also explores ${ideaToTry}.`:""}`:`A fresh combination: ${scene.location} and ${scene.lighting} have not appeared in her recent scene history.${ideaToTry?` This develops her idea to try: ${ideaToTry}.`:""}`,sourceMessageIds:[],status:"PROPOSED",proposalSource:parent?"remix":"conversation",noveltyScore:novelty.noveltyScore,similarityScore:novelty.similarityScore,characterId:context.character.id,conversationId:context.conversationId,createdAt:now(),updatedAt:now()};
    const response:CharacterBrainResponse={message:pitch,intent:parent?"scene_revision":"scene_proposal",sceneProposal:proposal,memoryCandidates:[],creativeSignals:{noveltyScore:novelty.noveltyScore,similarityScore:novelty.similarityScore,variationIndex:chosenIndex,similarDimensions:novelty.similarDimensions.join(", "),sceneType,visualBrief,seductionStyle:voice.seductionStyle,flirtIntensity:voice.flirtIntensity,relationshipDynamic:voice.privateRelationshipDynamic,spicyScenePreferences:voice.spicyScenePreferences.join(", ")}};
    if(!validateCharacterBrainResponse(response))throw new Error("Mock scene proposal failed structured output validation");
    return response;
  }
}

type InitiativeOutcome={kind:"NO_ACTION";reason:string}|{kind:"CREATE_MESSAGE";message:string}|{kind:"CREATE_SCENE_PROPOSAL";proposal:SceneProposal;message:string};

export class CharacterInitiativeEngine {
  evaluate(characterId:string,options:{manual?:boolean;conversationId?:string}={}):{outcome:"NO_ACTION";reason:string;state:ReturnType<typeof repository.initiativeState>}|{outcome:"CREATE_SCENE_PROPOSAL";proposal:SceneProposal;message:string;state:ReturnType<typeof repository.initiativeState>} {
    const profile=repository.characterProfile(characterId);if(!profile)return {outcome:"NO_ACTION",reason:"character_profile_missing",state:undefined};
    const time=now();const day=time.slice(0,10);const old=repository.initiativeState(characterId)??{characterId,lastEvaluatedAt:null,nextEligibleAt:null,lastProactiveProposalAt:null,dailyCount:0,dailyCountDate:day,cooldownSeconds:28800,maxPerDay:1};
    const state={...old,lastEvaluatedAt:time,dailyCount:old.dailyCountDate===day?old.dailyCount:0,dailyCountDate:day};
    const convo=options.conversationId??repository.conversationForCharacter(characterId)?.id;
    const messages=convo?repository.messages(convo):[];const cue=messages.slice(-3).some((item)=>/scene|shoot|look|camera|light|idea/i.test(item.body));
    const isDue=!state.nextEligibleAt||Date.parse(state.nextEligibleAt)<=Date.parse(time);
    if(!options.manual&&profile.initiativeLevel==="REACTIVE"){repository.saveInitiativeState(state);return {outcome:"NO_ACTION",reason:"reactive_mode",state};}
    if(!options.manual&&profile.initiativeLevel==="CREATIVE"&&!cue){repository.saveInitiativeState(state);return {outcome:"NO_ACTION",reason:"no_relevant_conversation_cue",state};}
    if(!options.manual&&(!isDue||state.dailyCount>=state.maxPerDay)){repository.saveInitiativeState(state);return {outcome:"NO_ACTION",reason:!isDue?"cooldown":"daily_limit",state};}
    if(!convo){repository.saveInitiativeState(state);return {outcome:"NO_ACTION",reason:"conversation_missing",state};}
    let result:{proposal:SceneProposal;message:string};
    try { result=characterDirectorService.createProposal({conversationId:convo,source:"proactive"}); }
    catch(error) { if(error instanceof DuplicateSceneProposalError){repository.saveInitiativeState(state);return {outcome:"NO_ACTION",reason:"duplicate_concept",state};} throw error; }
    const next={...state,lastProactiveProposalAt:time,nextEligibleAt:new Date(Date.parse(time)+state.cooldownSeconds*1000).toISOString(),dailyCount:state.dailyCount+1,dailyCountDate:day};repository.saveInitiativeState(next);
    return {outcome:"CREATE_SCENE_PROPOSAL",proposal:result.proposal,message:result.message,state:next};
  }
}

export class CharacterDirectorService {
  readonly conversationProvider=new MockCharacterBrainProvider();
  readonly directorProvider:CharacterDirectorProvider=this.conversationProvider;
  readonly memoryProvider:ConversationMemoryProvider=new DeterministicConversationMemoryProvider();
  readonly initiativeEngine=new CharacterInitiativeEngine();
  readonly contextLimits={recentMessages:8,pinnedMemories:8,recentScenes:10,summaryCharacters:360,messageCharacters:1200,pinnedMemoryCharacters:500};
  buildContext(conversationId:string):CharacterBrainContext {
    const conversation=repository.conversations().find((item)=>item.id===conversationId);if(!conversation)throw new Error("Conversation not found");
    const character=repository.character(conversation.characterId);const profile=repository.characterProfile(character.id)??emptyCharacterProfile(character.id);const allMessages=repository.messages(conversationId);
    const recentMessages=allMessages.slice(-this.contextLimits.recentMessages);let summary=repository.conversationSummary(conversationId);
    if(!summary){summary={conversationId,summary:"",summarizedThroughMessageId:null,summarizedAt:null,pinnedFacts:[],recentUnsummarizedMessageIds:[]};}
    const summarizableMessages=allMessages.slice(0,Math.max(0,allMessages.length-this.contextLimits.recentMessages));
    if(summarizableMessages.length&&summarizableMessages.at(-1)?.id!==summary.summarizedThroughMessageId){
      const result=this.memoryProvider.summarize(summarizableMessages);summary={...summary,summary:result.summary.slice(0,this.contextLimits.summaryCharacters),summarizedThroughMessageId:result.summarizedThroughMessageId,summarizedAt:now()};repository.saveConversationSummary(summary);
    }
    const lastSummaryIndex=summary.summarizedThroughMessageId?allMessages.findIndex((item)=>item.id===summary!.summarizedThroughMessageId):-1;
    const recentUnsummarizedMessages=allMessages.slice(lastSummaryIndex+1).slice(-this.contextLimits.recentMessages);
    summary={...summary,recentUnsummarizedMessageIds:recentUnsummarizedMessages.map((item)=>item.id)};repository.saveConversationSummary(summary);
    const legacy=repository.memory(conversationId)[0];const legacyPinned=legacy?.pinnedFacts?[legacy.pinnedFacts]:[];
    const pinned=repository.pinnedMemories(conversationId).slice(0,this.contextLimits.pinnedMemories);
    const profileMemory=repository.creativeMemory(character.id)??emptyCreativeMemory(character.id);
    const proposalHistory=repository.proposals({characterId:character.id}).slice(0,8).map((p)=>({mediaId:p.id,proposalId:p.id,title:p.title,location:p.location,wardrobe:p.wardrobe,lighting:p.lighting,mood:p.mood,shotType:p.shotDescription,cameraDirection:p.cameraDirection}));
    const storedScenes=profileMemory.recentScenes??[];
    const seen=new Set(storedScenes.map((item)=>item.mediaId));
    const mediaHistory=repository.mediaByCharacter(character.id).slice(0,8).filter((asset)=>!seen.has(asset.id)).map((asset)=>{const settings=parse<Record<string,unknown>>(asset.settingsJson,{});const scene=settings.sceneContext as Record<string,string>|undefined;return {mediaId:asset.id,title:asset.title,location:scene?.location,wardrobe:scene?.wardrobe,lighting:scene?.lighting,mood:scene?.mood,shotType:scene?.shotDescription,cameraDirection:scene?.cameraDirection,referenceIds:Array.isArray(settings.referenceAssetIds)?settings.referenceAssetIds as string[]:[]};});
    const recentCreativeHistory=[...proposalHistory,...storedScenes,...mediaHistory].slice(0,this.contextLimits.recentScenes);
    const bounded=(message:typeof recentMessages[number])=>({...message,body:message.body.slice(0,this.contextLimits.messageCharacters)});
    return {character,profile,conversationId,conversationSummary:{...summary,summary:summary.summary.slice(0,this.contextLimits.summaryCharacters),pinnedFacts:unique([...summary.pinnedFacts,...legacyPinned]).map((fact)=>fact.slice(0,this.contextLimits.pinnedMemoryCharacters))},recentMessages:recentMessages.map(bounded),recentUnsummarizedMessages:recentUnsummarizedMessages.map(bounded),pinnedMemories:pinned.map((memory)=>({...memory,body:memory.body.slice(0,this.contextLimits.pinnedMemoryCharacters)})),creativeMemory:profileMemory,recentCreativeHistory,visualIdentity:{identityNotes:character.identityNotes.slice(0,this.contextLimits.messageCharacters),generationDefaults:parse(character.defaultsJson,{}),canonicalReferences:repository.characterReferences(character.id).filter((item)=>item.active&&item.canonical).slice(0,8)},limits:{...this.contextLimits}};
  }
  async respondToMessage(conversationId:string,userText:string,mediaId?:string) {
    if(!userText.trim())throw new Error("Message is empty");
    const userMessage=repository.addMessage(conversationId,"user",userText.trim());if(mediaId)repository.attachMessage(userMessage.id,mediaId,"media");
    const context=this.buildContext(conversationId);const askedForScene=/what (?:do you want|would you like).{0,35}(?:next|scene)|next scene|pitch (?:me )?(?:a )?scene|scene idea|what should we shoot/i.test(userText);
    const relevant=/scene|shoot|look|camera|light|location|idea|frame/i.test(userText);
    const shouldSuggest=askedForScene||((context.profile.initiativeLevel==="CREATIVE"||context.profile.initiativeLevel==="DIRECTOR")&&relevant&&this.proactiveCueAvailable(context));
    if(shouldSuggest){
      const result=this.createProposal({conversationId,source:"conversation",sourceMessageIds:[userMessage.id]});
      const answer=repository.addMessage(conversationId,"character",result.message);const proposal=repository.updateProposalSources(result.proposal.id,[userMessage.id,answer.id])!;
      if(!askedForScene)this.noteNaturalInitiative(context.profile.characterId);
      this.recordUsage(context,userText,answer.body);return {userMessage,characterMessage:answer,proposal};
    }
    const response=this.conversationProvider.respond({context,userText});if(!validateCharacterBrainResponse(response))throw new Error("Character response failed validation");
    const characterMessage=repository.addMessage(conversationId,"character",response.message);this.recordUsage(context,userText,response.message);
    return {userMessage,characterMessage,proposal:null,response};
  }
  private proactiveCueAvailable(context:CharacterBrainContext) {
    const state=repository.initiativeState(context.character.id);if(!state)return true;
    if(state.nextEligibleAt&&Date.parse(state.nextEligibleAt)>Date.now())return false;
    return state.dailyCount<(state.dailyCountDate===now().slice(0,10)?state.maxPerDay:state.maxPerDay);
  }
  createProposal(options:{conversationId:string;source:"conversation"|"proactive"|"remix";sourceMessageIds?:string[];parentProposalId?:string;rejectedProposalId?:string;variation?:string}) {
    const context=this.buildContext(options.conversationId);const prior=options.parentProposalId?repository.proposal(options.parentProposalId):undefined;const rejected=options.rejectedProposalId?repository.proposal(options.rejectedProposalId):undefined;
    if(options.parentProposalId&&(!prior||prior.characterId!==context.character.id||prior.conversationId!==context.conversationId))throw new Error("Parent proposal does not belong to this character conversation.");
    if(options.rejectedProposalId&&(!rejected||rejected.characterId!==context.character.id||rejected.conversationId!==context.conversationId))throw new Error("Previous proposal does not belong to this character conversation.");
    const variationIndex=repository.proposals({characterId:context.character.id}).length+(prior?3:0)+(rejected?5:0);
    const output=this.directorProvider.propose({context,variationIndex,parent:prior,rejectedProposal:rejected,variation:options.variation});if(!validateCharacterBrainResponse(output)||!output.sceneProposal)throw new Error("Scene proposal failed structured validation");
    const draft=output.sceneProposal;const references=context.visualIdentity.canonicalReferences.slice(0,3);const ids=references.map((item)=>item.mediaId);
    if(draft.characterId!==undefined&&draft.characterId!==context.character.id)throw new Error("Scene proposal character association does not match the conversation.");
    if(draft.conversationId!==undefined&&draft.conversationId!==context.conversationId)throw new Error("Scene proposal conversation association does not match the request.");
    const supportedRatios=(draft.imageOrVideoIntent==="image"?mockImageCapabilities:mockVideoCapabilities).aspectRatios;
    if(!supportedRatios.includes(String(draft.suggestedAspectRatio)))throw new Error("Scene proposal aspect ratio is unsupported by the mock generation capability.");
    if(draft.imageOrVideoIntent==="video"&&!((draft.suggestedDuration===5)||(draft.suggestedDuration===10)))throw new Error("Scene proposal duration is unsupported by the mock video capability.");
    const allowedReferenceIds=new Set(context.visualIdentity.canonicalReferences.map((item)=>item.mediaId));
    const suggestedIds=draft.suggestedReferenceIds??[];
    if(suggestedIds.some((id)=>!repository.asset(id)||(!allowedReferenceIds.has(id)&&!repository.asset(id)?.isReference)))throw new Error("Scene proposal contains an unknown or ineligible reference.");
    if(options.source==="proactive"){
      const signal=evaluateNovelty({mediaId:"initiative-draft",title:draft.title,location:draft.location,wardrobe:draft.wardrobe,lighting:draft.lighting,mood:draft.mood,shotType:draft.shotDescription,cameraDirection:draft.cameraDirection},context.recentCreativeHistory,context.profile.creativeProfile.repetitionTolerance);
      if(signal.repeatedConcept||signal.similarityScore>=0.82)throw new DuplicateSceneProposalError();
    }
    const roles={...Object.fromEntries(references.map((item)=>[item.mediaId,item.role])),...(draft.suggestedReferenceRoles??{})};const referenceIds=unique([...ids,...suggestedIds],8);const created=now();
    const proposal:SceneProposal={id:randomUUID(),parentProposalId:options.parentProposalId??null,characterId:context.character.id,conversationId:context.conversationId,title:String(draft.title),naturalLanguagePitch:String(draft.naturalLanguagePitch),concept:String(draft.concept),location:String(draft.location),wardrobe:String(draft.wardrobe),mood:String(draft.mood),lighting:String(draft.lighting),shotDescription:String(draft.shotDescription),cameraDirection:String(draft.cameraDirection),imageOrVideoIntent:draft.imageOrVideoIntent as SceneProposal["imageOrVideoIntent"],suggestedAspectRatio:String(draft.suggestedAspectRatio),suggestedDuration:draft.suggestedDuration==null?null:Number(draft.suggestedDuration),suggestedReferenceIds:referenceIds,suggestedReferenceRoles:roles,proposedImagePlan:String(draft.proposedImagePlan),proposedVideoPlan:String(draft.proposedVideoPlan),noveltyReason:String(draft.noveltyReason),sourceMessageIds:options.sourceMessageIds??[],status:"PROPOSED",proposalSource:options.source,noveltyScore:Number(draft.noveltyScore??output.creativeSignals.noveltyScore??1),similarityScore:Number(draft.similarityScore??output.creativeSignals.similarityScore??0),createdAt:created,updatedAt:created};
    repository.saveProposal(proposal);if(options.parentProposalId&&prior?.status!=="GENERATED"&&prior?.status!=="REMIXED")this.setProposalStatus(options.parentProposalId,"REMIXED");
    const character=repository.character(context.character.id);const message=proposal.naturalLanguagePitch;
    this.recordUsage(context,"scene proposal request",message);return {proposal,message,context};
  }
  createProposalMessage(conversationId:string,options:{source:"conversation"|"proactive"|"remix";parentProposalId?:string;rejectedProposalId?:string;variation?:string}={source:"conversation"}) {
    const result=this.createProposal({conversationId,...options});const message=repository.addMessage(conversationId,"character",result.message);const proposal=repository.updateProposalSources(result.proposal.id,[message.id])!;return {proposal,message};
  }
  remixProposal(proposalId:string,variation?:string) { const parent=repository.proposal(proposalId);if(!parent)throw new Error("Proposal not found");const result=this.createProposalMessage(parent.conversationId,{source:"remix",parentProposalId:parent.id,variation});const memory=defaultMemory(parent.characterId);memory.remixedProposalIds=unique([parent.id,...memory.remixedProposalIds]);memory.updatedAt=now();repository.saveCreativeMemory(memory);return result; }
  anotherProposal(conversationId:string,previousProposalId?:string) { return this.createProposalMessage(conversationId,{source:"conversation",rejectedProposalId:previousProposalId}); }
  setProposalStatus(proposalId:string,status:SceneProposalStatus,rejectionReason?:string) {
    const proposal=repository.proposal(proposalId);if(!proposal)throw new Error("Proposal not found");if(status==="GENERATED")throw new Error("A proposal becomes generated only when its linked media completes.");if(proposal.status!==status&&!ALLOWED_PROPOSAL_TRANSITIONS[proposal.status].includes(status))throw new Error(`Invalid proposal transition: ${proposal.status} to ${status}.`);if(proposal.status!==status)repository.updateProposal(proposalId,status);const memory=defaultMemory(proposal.characterId);
    if(status==="SAVED")memory.savedProposalIds=unique([proposalId,...memory.savedProposalIds]);
    if(status==="ACCEPTED"){memory.savedProposalIds=memory.savedProposalIds.filter((id)=>id!==proposalId);memory.acceptedProposalIds=unique([proposalId,...memory.acceptedProposalIds]);}
    if(status==="REJECTED"){memory.savedProposalIds=memory.savedProposalIds.filter((id)=>id!==proposalId);memory.acceptedProposalIds=memory.acceptedProposalIds.filter((id)=>id!==proposalId);memory.rejectedProposalIds=unique([proposalId,...memory.rejectedProposalIds]);if(rejectionReason)memory.resultNotes[`proposal:${proposalId}`]=rejectionReason;}
    if(status==="REMIXED"){memory.savedProposalIds=memory.savedProposalIds.filter((id)=>id!==proposalId);memory.acceptedProposalIds=memory.acceptedProposalIds.filter((id)=>id!==proposalId);memory.remixedProposalIds=unique([proposalId,...memory.remixedProposalIds]);}
    memory.updatedAt=now();repository.saveCreativeMemory(memory);return repository.proposal(proposalId)!;
  }
  private markProposalGenerated(proposalId:string|null,characterId:string,conversationId:string,mediaId:string) {
    if(!proposalId)return;
    const proposal=repository.proposal(proposalId);if(!proposal||proposal.characterId!==characterId||proposal.conversationId!==conversationId||proposal.status!=="ACCEPTED")throw new Error("Completed media is not associated with an accepted scene proposal.");
    repository.updateProposal(proposalId,"GENERATED");const memory=defaultMemory(characterId);memory.generatedProposalIds=unique([proposalId,...memory.generatedProposalIds]);memory.updatedAt=now();repository.saveCreativeMemory(memory);
  }
  async *streamMessage(conversationId:string,text:string,mediaId?:string):AsyncIterable<string> {
    const result=await this.respondToMessage(conversationId,text,mediaId);
    for await(const chunk of this.conversationProvider.streamText(result.characterMessage.body))yield JSON.stringify({type:"delta",text:chunk})+"\n";
    yield JSON.stringify({type:"complete",result})+"\n";
  }
  async reactToMedia(media:MediaAsset,job:GenerationJob) {
    if(!job.conversationId||repository.mediaReactions().some((item)=>item.mediaId===media.id))return;
    const character=repository.character(job.characterId);const profile=repository.characterProfile(job.characterId)??emptyCharacterProfile(job.characterId);const input=parse<Record<string,unknown>>(job.settingsJson,{});const scene=(input.sceneContext??{}) as Record<string,string>;
    const sceneDetails=[scene.location,scene.wardrobe,scene.lighting].filter(Boolean).join(", ");
    const message=profile.conversationalProfile.speakingStyle.toLowerCase().includes("economical")?`The composition held together. I’d keep ${scene.lighting||"the light"} and try one cleaner angle next.`:profile.conversationalProfile.speakingStyle.toLowerCase().includes("lively")?`Oh, I love how this turned out${sceneDetails?` at ${scene.location}`:""}. Next I want to see a little more movement through the frame.`:`The ${scene.lighting||"light"} is doing exactly what I hoped. I’d like to see this look move in a slow, quiet shot next.`;
    const proposalId=typeof input.proposalId==="string"?input.proposalId:null;this.markProposalGenerated(proposalId,character.id,job.conversationId,media.id);
    const characterMessage=repository.addMessage(job.conversationId,"character",message);repository.attachMessage(characterMessage.id,media.id,"generation");
    repository.saveMediaReaction({mediaId:media.id,proposalId,characterId:character.id,messageId:characterMessage.id,payloadJson:JSON.stringify({message,scene,mode:media.type,favorite:media.favorite}),createdAt:now()});
    const memory=defaultMemory(character.id);const sceneRecord:RecentCreativeScene={mediaId:media.id,proposalId:proposalId??undefined,title:media.title,location:scene.location,wardrobe:scene.wardrobe,lighting:scene.lighting,mood:scene.mood,shotType:scene.shotDescription,cameraDirection:scene.cameraDirection,referenceIds:Array.isArray(input.referenceAssetIds)?input.referenceAssetIds as string[]:[]};
    memory.recentScenes=[sceneRecord,...memory.recentScenes.filter((item)=>item.mediaId!==media.id)].slice(0,20);memory.recentSceneIds=unique([media.id,...memory.recentSceneIds]);memory.recentLocations=unique([sceneRecord.location??"",...memory.recentLocations]);memory.recentWardrobes=unique([sceneRecord.wardrobe??"",...memory.recentWardrobes]);memory.recentLightings=unique([sceneRecord.lighting??"",...memory.recentLightings]);memory.recentMoods=unique([sceneRecord.mood??"",...memory.recentMoods]);memory.recentShotTypes=unique([sceneRecord.shotType??"",...memory.recentShotTypes]);memory.recentCameraDirections=unique([sceneRecord.cameraDirection??"",...memory.recentCameraDirections]);memory.recentReferencePacks=[sceneRecord.referenceIds??[],...memory.recentReferencePacks].slice(0,20);memory.updatedAt=now();repository.saveCreativeMemory(memory);
    const context=this.buildContext(job.conversationId);this.recordUsage(context,"generation result reaction",message);
  }
  rememberFavorite(mediaId:string) { const asset=repository.asset(mediaId);if(!asset)return;const memory=defaultMemory(asset.characterId);memory.favoriteMediaIds=asset.favorite?unique([mediaId,...memory.favoriteMediaIds]):memory.favoriteMediaIds.filter((id)=>id!==mediaId);memory.updatedAt=now();repository.saveCreativeMemory(memory); }
  rememberNote(mediaId:string,note:string) { const asset=repository.asset(mediaId);if(!asset)return;const memory=defaultMemory(asset.characterId);if(note.trim())memory.resultNotes[mediaId]=note.trim().slice(0,1200);else delete memory.resultNotes[mediaId];memory.updatedAt=now();repository.saveCreativeMemory(memory); }
  private recordUsage(context:CharacterBrainContext,input:string,output:string) { const provider=this.conversationProvider.deployment;repository.addChatUsage({id:randomUUID(),providerId:provider.providerId,model:provider.model,characterId:context.character.id,conversationId:context.conversationId,inputTokens:Math.ceil((input.slice(0,this.contextLimits.messageCharacters).length+context.recentMessages.reduce((n,m)=>n+m.body.length,0))/4),outputTokens:Math.ceil(output.length/4),estimatedCost:0,actualCost:0,createdAt:now()}); }
  private noteNaturalInitiative(characterId:string) { const profile=repository.characterProfile(characterId);if(!profile)return;const time=now();const day=time.slice(0,10);const state=repository.initiativeState(characterId)??{characterId,lastEvaluatedAt:null,nextEligibleAt:null,lastProactiveProposalAt:null,dailyCount:0,dailyCountDate:day,cooldownSeconds:28800,maxPerDay:1};repository.saveInitiativeState({...state,lastEvaluatedAt:time,lastProactiveProposalAt:time,nextEligibleAt:new Date(Date.parse(time)+state.cooldownSeconds*1000).toISOString(),dailyCount:state.dailyCountDate===day?state.dailyCount+1:1,dailyCountDate:day}); }
}

export const characterDirectorService=new CharacterDirectorService();

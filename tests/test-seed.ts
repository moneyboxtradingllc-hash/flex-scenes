import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { emptyCreativeMemory } from "../lib/brain-defaults";
import { fixtureCharacterProfile } from "./test-character-profile";

export function seedTestDatabase() {
  const count=(db.prepare("SELECT COUNT(*) as count FROM characters").get() as {count:number}).count;
  if(count) { ensureCanonicalFixtureReferences(); ensureCharacterBrainDefaults(); return; }
  const now=new Date().toISOString();
  const chars=[
    ["char-nova","Nova Vale","@novavale","Cinematic muse with a sharp eye for light.","Warm, concise, visually observant.","Warm complexion, long dark auburn hair, freckles, editorial wardrobe.","#7c3aed"],
    ["char-iona","Iona Reed","@ionareed","Architect of quiet, electric scenes.","Thoughtful, dry humor, patient.","Short dark curls, sculptural silhouettes, cobalt accents.","#2563eb"],
    ["char-mara","Mara Sol","@marasol","Golden-hour storyteller and collector of small details.","Direct, playful, optimistic.","Honey-toned skin, copper waves, luminous styling.","#db2777"]
  ];
  for(const [id,name,handle,description,personality,identityNotes] of chars) { const portrait="/qa-fixtures/qa-test.svg"; db.prepare("INSERT INTO characters VALUES(?,?,?,?,?,?,?,?,?)").run(id,name,handle,portrait,description,personality,identityNotes,JSON.stringify({aspectRatio:"4:5",preset:"Hero"}),now); }
  const scenes=[
    ["char-nova","After Hours Atrium","Glass, rain, and a quiet neon horizon.","A cinematic editorial portrait in a rain-lit atrium.","#7c3aed","image"],
    ["char-iona","Blue Hour Transit","A still moment between destinations.","An editorial frame at blue hour beside a modern train.","#2563eb","video"],
    ["char-mara","Sunroom Study","Warm geometry and a desk full of notes.","A refined sunroom portrait with soft afternoon light.","#db2777","image"],
    ["char-nova","Violet Workshop","An experimental portrait study.","A character study in a violet atelier.","#9333ea","image"],
    ["char-iona","Library of Light","A quiet cinematic interior.","A precise editorial composition in a modern library.","#0ea5e9","video"]
  ];
  for(const [characterId,title,caption,prompt,_accent,type] of scenes) { const id=randomUUID(); const url="/qa-fixtures/qa-test.svg"; db.prepare("INSERT INTO media VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id,characterId,type,url,type==="video"?url:null,title,caption,prompt,`fixture-${type}`,JSON.stringify({aspectRatio:"4:5"}),null,0,now,title==="After Hours Atrium"?1:0); }
  const collectionId="collection-night-studies"; db.prepare("INSERT INTO collections VALUES(?,?)").run(collectionId,"Night Studies"); const first=(db.prepare("SELECT id FROM media LIMIT 2").all() as {id:string}[]); for(const item of first) db.prepare("INSERT INTO collectionItems VALUES(?,?)").run(collectionId,item.id);
  for(const [id,name] of chars.map(x=>[x[0],x[1]])) { const conversationId=`conv-${id}`; db.prepare("INSERT INTO conversations VALUES(?,?,?,?)").run(conversationId,id,now,0); for(const [role,body] of [["character",`${name}: I’ve been thinking about our next scene.`],["user","Let’s keep the lighting cinematic and intimate." ]] as const) db.prepare("INSERT INTO messages VALUES(?,?,?,?,?)").run(randomUUID(),conversationId,role,body,now); }
  ensureCanonicalFixtureReferences();
  ensureCharacterBrainDefaults();
}
function ensureCharacterBrainDefaults(){
 const now=new Date().toISOString();
 const characters=db.prepare("SELECT id FROM characters").all() as {id:string}[];
 for(const {id} of characters){
  const profile=fixtureCharacterProfile(id);
  db.prepare("INSERT OR IGNORE INTO characterBrainProfiles(characterId,initiativeLevel,adultCharacter,ageVerifiedAdult,conversationalProfileJson,creativeProfileJson,updatedAt) VALUES(?,?,?,?,?,?,?)").run(id,profile.initiativeLevel,Number(profile.adultCharacter),Number(profile.ageVerifiedAdult),JSON.stringify(profile.conversationalProfile),JSON.stringify(profile.creativeProfile),now);
  const defaults=emptyCreativeMemory(id);
  const prior=db.prepare("SELECT payloadJson FROM creativeMemories WHERE characterId=?").get(id) as {payloadJson:string}|undefined;
  if(!prior){
   const seedScene:Record<string,{location:string;wardrobe:string;lighting:string;mood:string;shotType:string;cameraDirection:string}>={
    "char-nova":{location:"rain-lit glass atrium",wardrobe:"tailored charcoal",lighting:"violet practicals",mood:"after-hours calm",shotType:"three-quarter portrait",cameraDirection:"locked and deliberate"},
    "char-iona":{location:"modern train platform at blue hour",wardrobe:"sculptural black",lighting:"cool side light",mood:"composed solitude",shotType:"symmetrical wide",cameraDirection:"static frame"},
    "char-mara":{location:"sunroom in afternoon",wardrobe:"soft linen",lighting:"warm afternoon sun",mood:"bright intimacy",shotType:"candid medium",cameraDirection:"gentle handheld drift"}
   };
   const media=db.prepare("SELECT id,title FROM media WHERE characterId=? ORDER BY createdAt DESC LIMIT 2").all(id) as {id:string;title:string}[];
   const scene=seedScene[id];
   if(media.length&&scene){defaults.recentSceneIds=media.map(x=>x.id);defaults.recentScenes=media.slice(0,1).map(item=>({mediaId:item.id,title:item.title,...scene}));defaults.recentLocations=[scene.location];defaults.recentWardrobes=[scene.wardrobe];defaults.recentLightings=[scene.lighting];defaults.recentMoods=[scene.mood];defaults.recentShotTypes=[scene.shotType];defaults.recentCameraDirections=[scene.cameraDirection];}
   db.prepare("INSERT OR IGNORE INTO creativeMemories VALUES(?,?,?)").run(id,JSON.stringify(defaults),now);
  }
  db.prepare("INSERT OR IGNORE INTO initiativeStates(characterId,cooldownSeconds,maxPerDay) VALUES(?,28800,1)").run(id);
 }
 db.prepare("INSERT OR IGNORE INTO conversationProviderRegistry(providerId,model,connected,capabilitiesJson,updatedAt) VALUES(?,?,?,?,?)").run("mock-character-brain","mock-character-brain-v1",1,JSON.stringify({textConversation:true,structuredOutput:true,contextWindow:null,streaming:true,toolCalling:false,adultRoleplay:"not_supported",estimatedInputCostPerMillion:0,estimatedOutputCostPerMillion:0}),now);
}
function ensureCanonicalFixtureReferences(){
 const characters=db.prepare("SELECT id FROM characters").all() as {id:string}[];
 for(const character of characters){const media=db.prepare("SELECT id FROM media WHERE characterId=? ORDER BY createdAt LIMIT 1").get(character.id) as {id:string}|undefined; if(media){db.prepare("UPDATE media SET isReference=1 WHERE id=?").run(media.id);db.prepare("INSERT OR IGNORE INTO characterReferences VALUES(?,?,?,?,?)").run(character.id,media.id,"face",1,new Date().toISOString());}}
}

import type { CharacterProfile, CreativeMemory } from "./domain";

export function emptyCharacterProfile(characterId: string): CharacterProfile {
  return {
    characterId,
    initiativeLevel: "REACTIVE",
    adultCharacter: false,
    ageVerifiedAdult: false,
    conversationalProfile: {
      speakingStyle: "", vocabulary: [], confidence: 0, humorStyle: "",
      emotionalExpressiveness: 0, attitude: "", boundaries: [], lore: "", relationshipNotes: "",
      seductionStyle: "", flirtIntensity: 0, naughtiness: 0, provocationStyle: "", dirtyHumor: "",
      possessiveness: 0, approvalSeeking: 0, initiativeStyle: "", favoriteTeasingPatterns: [],
      privateRelationshipDynamic: "", escalationStyle: "", spicyScenePreferences: [],
      permissionStyle: "", approvalReaction: "", rejectionReaction: "",
    },
    creativeProfile: {
      visualBrief: "", favoriteSceneTypes: [], favoriteEnvironments: [], wardrobeCategories: [], preferredLighting: [], preferredMoods: [],
      preferredShotTypes: [], cameraEnergy: [], mediaBalance: "balanced", experimentationLevel: 0,
      visualThemes: [], avoidedThemes: [], ideasToTry: [], ideasTiredOf: [], creativeBoldness: 0,
      noveltyPreference: 0, repetitionTolerance: 0,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function emptyCreativeMemory(characterId:string):CreativeMemory {
  return {characterId,recentSceneIds:[],recentScenes:[],recentLocations:[],recentWardrobes:[],recentLightings:[],recentMoods:[],recentShotTypes:[],recentCameraDirections:[],recentReferencePacks:[],savedProposalIds:[],acceptedProposalIds:[],rejectedProposalIds:[],remixedProposalIds:[],generatedProposalIds:[],favoriteMediaIds:[],resultNotes:{},updatedAt:new Date().toISOString()};
}

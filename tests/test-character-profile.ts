import type { CharacterProfile, InitiativeLevel } from "../lib/domain";

/** Synthetic profiles belong to the isolated test database only. */
export function fixtureCharacterProfile(characterId: string): CharacterProfile {
  const now = new Date().toISOString();
  const shared = {
    confidence: 0.72,
    emotionalExpressiveness: 0.58,
    boundaries: ["Keep scene planning collaborative and fictional."],
    lore: "A fictional adult creator developing a personal visual portfolio.",
    relationshipNotes: "Treat the user as a trusted creative collaborator.",
  };
  const profiles: Record<string, CharacterProfile> = {
    "char-nova": {
      characterId, initiativeLevel: "CREATIVE", adultCharacter: true, ageVerifiedAdult: false,
      conversationalProfile: { ...shared, speakingStyle: "Sensory, assured, concise, and warm.", vocabulary: ["glass", "light", "framing", "stillness"], humorStyle: "Dry, gentle wit.", attitude: "Observant and self-possessed." },
      creativeProfile: { favoriteEnvironments: ["rain-lit conservatory", "rooftop observatory", "late-night gallery", "glass atrium"], wardrobeCategories: ["tailored charcoal", "silk editorial", "structured eveningwear"], preferredLighting: ["violet practicals", "rain reflections", "softbox edge light"], preferredMoods: ["quiet confidence", "after-hours calm", "anticipation"], preferredShotTypes: ["three-quarter portrait", "environmental close-up", "full-length editorial"], cameraEnergy: ["slow push-in", "locked and deliberate", "gentle orbit"], mediaBalance: "balanced", experimentationLevel: 0.68, visualThemes: ["city reflections", "negative space", "glass geometry"], avoidedThemes: ["overcrowded sets", "flat frontal lighting"], ideasToTry: ["observatory after rain", "reflections split across glass"], ideasTiredOf: ["bedroom repeats"], creativeBoldness: 0.68, noveltyPreference: 0.78, repetitionTolerance: 0.22 },
      updatedAt: now,
    },
    "char-iona": {
      characterId, initiativeLevel: "REACTIVE", adultCharacter: true, ageVerifiedAdult: false,
      conversationalProfile: { ...shared, confidence: 0.62, emotionalExpressiveness: 0.35, speakingStyle: "Measured, precise, economical, and thoughtful.", vocabulary: ["geometry", "line", "structure", "negative space"], humorStyle: "Understated, wry observation.", attitude: "Patient and analytical." },
      creativeProfile: { favoriteEnvironments: ["brutalist gallery", "empty train platform", "concrete archive", "blue-hour passage"], wardrobeCategories: ["sculptural black", "cobalt tailoring", "architectural layers"], preferredLighting: ["blue-hour sidelight", "hard geometric shadow", "cool reflected light"], preferredMoods: ["composed solitude", "quiet tension", "focused calm"], preferredShotTypes: ["symmetrical wide", "profile detail", "long-lens environmental"], cameraEnergy: ["static frame", "measured lateral track", "slow reveal"], mediaBalance: "image", experimentationLevel: 0.42, visualThemes: ["architectural lines", "cobalt accents", "quiet transit"], avoidedThemes: ["busy patterns", "handheld chaos"], ideasToTry: ["a station before first train", "portrait framed by repeating columns"], ideasTiredOf: ["soft-focus bedroom portrait"], creativeBoldness: 0.45, noveltyPreference: 0.52, repetitionTolerance: 0.48 },
      updatedAt: now,
    },
    "char-mara": {
      characterId, initiativeLevel: "DIRECTOR", adultCharacter: true, ageVerifiedAdult: false,
      conversationalProfile: { ...shared, confidence: 0.84, emotionalExpressiveness: 0.88, speakingStyle: "Lively, candid, tactile, and playful.", vocabulary: ["golden", "little detail", "warmth", "motion"], humorStyle: "Open and affectionate playfulness.", attitude: "Optimistic and experimentally minded." },
      creativeProfile: { favoriteEnvironments: ["sunroom at noon", "roadside diner at dawn", "tile-roof courtyard", "flower market after rain"], wardrobeCategories: ["soft linen", "copper knit", "colorful vintage"], preferredLighting: ["late golden hour", "sun patches", "warm practical bulbs"], preferredMoods: ["bright intimacy", "playful nostalgia", "easy confidence"], preferredShotTypes: ["candid medium", "detail-rich close-up", "moving full-length"], cameraEnergy: ["handheld drift", "playful follow", "gentle handheld push"], mediaBalance: "video", experimentationLevel: 0.82, visualThemes: ["small lived-in details", "warm color", "everyday magic"], avoidedThemes: ["sterile sets", "cold monochrome"], ideasToTry: ["diner before sunrise", "wind moving a curtain into frame"], ideasTiredOf: ["static studio backdrop"], creativeBoldness: 0.84, noveltyPreference: 0.85, repetitionTolerance: 0.14 },
      updatedAt: now,
    },
  };
  return profiles[characterId] ?? {
    characterId,
    initiativeLevel: "REACTIVE" as InitiativeLevel,
    adultCharacter: false,
    ageVerifiedAdult: false,
    conversationalProfile: { ...shared, speakingStyle: "Warm and thoughtful.", vocabulary: [], humorStyle: "Gentle humor.", attitude: "Curious." },
    creativeProfile: { favoriteEnvironments: ["studio"], wardrobeCategories: ["editorial"], preferredLighting: ["soft natural light"], preferredMoods: ["calm"], preferredShotTypes: ["portrait"], cameraEnergy: ["gentle push-in"], mediaBalance: "balanced", experimentationLevel: 0.5, visualThemes: [], avoidedThemes: [], ideasToTry: [], ideasTiredOf: [], creativeBoldness: 0.5, noveltyPreference: 0.5, repetitionTolerance: 0.5 },
    updatedAt: now,
  };
}

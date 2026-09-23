export type MediaType = "image" | "video";
export type JobStatus = "queued" | "generating" | "finalizing" | "completed" | "failed" | "cancelled";
export type GenerationMode = "image" | "video";

export interface ProviderCapabilities {
  providerId: string; label: string; mode: GenerationMode;
  textPrompt: boolean; negativePrompt: boolean; referenceImages: boolean; referenceVideos: boolean;
  multipleReferences: boolean; imageToImage: boolean; imageToVideo: boolean; videoReference: boolean;
  aspectRatios: string[]; resolutions: string[]; durations: number[]; seed: boolean;
  guidance: boolean; generationCount: boolean; audio: boolean; advancedControls: string[];
}

export interface Character { id: string; name: string; handle: string; portraitUrl: string; description: string; personality: string; identityNotes: string; defaultsJson: string; createdAt: string; }
export interface MediaAsset { id: string; characterId: string; type: MediaType; url: string; posterUrl: string | null; title: string; caption: string; prompt: string; providerId: string; settingsJson: string; parentId: string | null; isReference: boolean; createdAt: string; favorite: boolean; }
export interface GenerationJob { id: string; characterId: string; mode: GenerationMode; prompt: string; status: JobStatus; providerId: string; settingsJson: string; parentMediaId: string | null; conversationId: string | null; createdAt: string; updatedAt: string; error: string | null; mediaId: string | null; }
export interface Conversation { id: string; characterId: string; updatedAt: string; unread: boolean; }
export interface Message { id: string; conversationId: string; role: "user" | "character"; body: string; createdAt: string; }
export interface CharacterReference { characterId: string; mediaId: string; role: "face"|"body"|"look"|"outfit"|"environment"|"motion"; canonical: boolean; createdAt: string; }
export interface JobReference { jobId: string; mediaId: string; role: "canonical"|"scene"|"parent"|"video"; position: number; }
export interface AppSnapshot { characters: Character[]; media: MediaAsset[]; jobs: GenerationJob[]; conversations: Conversation[]; messages: Message[]; collections: { id: string; name: string; mediaIds: string[] }[]; notes: Record<string, string>; characterReferences: CharacterReference[]; jobReferences: JobReference[]; capabilities: ProviderCapabilities[]; }

export interface GenerationInput { characterId: string; mode: GenerationMode; prompt: string; aspectRatio: string; preset: string; count?: number; duration?: number; simulation?: "success" | "failure" | "timeout"; parentMediaId?: string | null; conversationId?: string | null; referenceAssetIds?: string[]; negativePrompt?: string; seed?: string; audio?: boolean; }
export interface ProviderRequest { job: GenerationJob; character: Character; input: GenerationInput; }
export interface ProviderResult { state: JobStatus; asset?: Omit<MediaAsset, "favorite">; error?: string; }
export interface ImageGenerationProvider { readonly id: string; advance(request: ProviderRequest, elapsedMs: number): ProviderResult; }
export interface VideoGenerationProvider { readonly id: string; advance(request: ProviderRequest, elapsedMs: number): ProviderResult; }

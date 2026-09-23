import type { ImageGenerationProvider, ProviderCapabilities, ProviderRequest, ProviderResult, VideoGenerationProvider } from "./domain";
export const mockImageCapabilities:ProviderCapabilities={providerId:"mock-image",label:"Mock Image Provider",mode:"image",textPrompt:true,negativePrompt:true,referenceImages:true,referenceVideos:false,multipleReferences:true,imageToImage:true,imageToVideo:false,videoReference:false,aspectRatios:["4:5","1:1","16:9","9:16"],resolutions:["Draft 768","Hero 1024"],durations:[],seed:true,guidance:true,generationCount:true,audio:false,advancedControls:["simulation","seed","negative prompt","guidance"]};
export const mockVideoCapabilities:ProviderCapabilities={providerId:"mock-video",label:"Mock Video Provider",mode:"video",textPrompt:true,negativePrompt:true,referenceImages:true,referenceVideos:true,multipleReferences:true,imageToImage:false,imageToVideo:true,videoReference:true,aspectRatios:["4:5","1:1","16:9","9:16"],resolutions:["Draft 768","Hero 1024"],durations:[5,10],seed:true,guidance:true,generationCount:false,audio:true,advancedControls:["simulation","seed","negative prompt","guidance","audio"]};
export const modelRegistry=[
 {id:"mock-image",provider:"Flex Scenes",modelIdentifier:"mock-image-v1",displayName:"Mock Image Provider",mediaType:"image" as const,connectionState:"connected" as const,capabilities:mockImageCapabilities,defaults:{aspectRatio:"4:5",preset:"Hero 1024"}},
 {id:"seedream5-spicy-placeholder",provider:"Seedream",modelIdentifier:"unverified-placeholder",displayName:"Seedream 5.0 Spicy — not connected",mediaType:"image" as const,connectionState:"not-connected" as const,capabilities:null,defaults:{}},
 {id:"mock-video",provider:"Flex Scenes",modelIdentifier:"mock-video-v1",displayName:"Mock Video Provider",mediaType:"video" as const,connectionState:"connected" as const,capabilities:mockVideoCapabilities,defaults:{aspectRatio:"9:16",duration:5}},
 {id:"seedance25-spicy-placeholder",provider:"Seedance",modelIdentifier:"unverified-placeholder",displayName:"Seedance 2.5 Spicy — not connected",mediaType:"video" as const,connectionState:"not-connected" as const,capabilities:null,defaults:{}}
];
const result = (request: ProviderRequest, elapsed: number): ProviderResult => {
  const simulation = request.input.simulation ?? "success";
  if (simulation === "failure" && elapsed >= 1400) return { state: "failed", error: "Deterministic mock failure requested." };
  if (simulation === "timeout") return { state: elapsed < 8500 ? "generating" : "failed", error: elapsed >= 8500 ? "Deterministic mock timeout requested." : undefined };
  if (elapsed < 700) return { state: "queued" };
  if (elapsed < 1800) return { state: "generating" };
  if (elapsed < 2700) return { state: "finalizing" };
  return { state: "completed" };
};
export class MockImageProvider implements ImageGenerationProvider { readonly id = "mock-image"; advance(request: ProviderRequest, elapsed: number) { const r=result(request,elapsed); return {...r,providerJobId:`mock-img-${request.job.id.slice(0,8)}`,progress:r.state==="queued"?0:r.state==="generating"?50:r.state==="finalizing"?90:100,statusMessage:`Mock image ${r.state}`,usage:{estimatedCost:0,actualCost:0,units:1},retryable:r.state==="failed"}; } }
export class MockVideoProvider implements VideoGenerationProvider { readonly id = "mock-video"; advance(request: ProviderRequest, elapsed: number) { const r=result(request,elapsed); return {...r,providerJobId:`mock-vid-${request.job.id.slice(0,8)}`,progress:r.state==="queued"?0:r.state==="generating"?50:r.state==="finalizing"?90:100,statusMessage:`Mock video ${r.state}`,usage:{estimatedCost:0,actualCost:0,units:1},retryable:r.state==="failed"}; } }
// Future boundary only: Seedream5Provider and Seedance25Provider deliberately do not exist until their official contracts are verified.

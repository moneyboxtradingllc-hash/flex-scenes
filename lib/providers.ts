import type { ImageGenerationProvider, ProviderCapabilities, ProviderRequest, ProviderResult, VideoGenerationProvider } from "./domain";
export const mockImageCapabilities:ProviderCapabilities={providerId:"mock-image",label:"Mock Image Provider",mode:"image",textPrompt:true,negativePrompt:true,referenceImages:true,referenceVideos:false,multipleReferences:true,imageToImage:true,imageToVideo:false,videoReference:false,aspectRatios:["4:5","1:1","16:9","9:16"],resolutions:["Draft 768","Hero 1024"],durations:[],seed:true,guidance:true,generationCount:true,audio:false,advancedControls:["simulation","seed","negative prompt","guidance"]};
export const mockVideoCapabilities:ProviderCapabilities={providerId:"mock-video",label:"Mock Video Provider",mode:"video",textPrompt:true,negativePrompt:true,referenceImages:true,referenceVideos:true,multipleReferences:true,imageToImage:false,imageToVideo:true,videoReference:true,aspectRatios:["4:5","1:1","16:9","9:16"],resolutions:["Draft 768","Hero 1024"],durations:[5,10],seed:true,guidance:true,generationCount:false,audio:true,advancedControls:["simulation","seed","negative prompt","guidance","audio"]};
const result = (request: ProviderRequest, elapsed: number): ProviderResult => {
  const simulation = request.input.simulation ?? "success";
  if (simulation === "failure" && elapsed >= 1400) return { state: "failed", error: "Deterministic mock failure requested." };
  if (simulation === "timeout") return { state: elapsed < 8500 ? "generating" : "failed", error: elapsed >= 8500 ? "Deterministic mock timeout requested." : undefined };
  if (elapsed < 700) return { state: "queued" };
  if (elapsed < 1800) return { state: "generating" };
  if (elapsed < 2700) return { state: "finalizing" };
  return { state: "completed" };
};
export class MockImageProvider implements ImageGenerationProvider { readonly id = "mock-image"; advance(request: ProviderRequest, elapsed: number) { return result(request, elapsed); } }
export class MockVideoProvider implements VideoGenerationProvider { readonly id = "mock-video"; advance(request: ProviderRequest, elapsed: number) { return result(request, elapsed); } }
// Future boundary only: Seedream5Provider and Seedance25Provider deliberately do not exist until their official contracts are verified.

import { generationService } from "@/lib/services"; import type { GenerationInput } from "@/lib/domain";
export async function POST(request:Request){ const input=await request.json() as GenerationInput; if(!input.characterId||!input.prompt?.trim()) return Response.json({error:"Character and prompt are required."},{status:400}); return Response.json(generationService.create(input),{status:202}); }

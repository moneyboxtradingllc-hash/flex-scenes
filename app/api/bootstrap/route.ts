import { seedDatabase } from "@/lib/seed"; import { repository } from "@/lib/repository"; import { generationService } from "@/lib/services";
export async function GET(){ seedDatabase(); return Response.json(repository.snapshot(generationService.capabilities())); }

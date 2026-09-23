import { seedDatabase } from "@/lib/seed";
import { repository } from "@/lib/repository";
import { StudioApp } from "@/components/studio-app";
import { generationService } from "@/lib/services";
export const dynamic = "force-dynamic";
export default function Page(){ seedDatabase(); const initial=JSON.parse(JSON.stringify(repository.snapshot(generationService.capabilities()))); return <StudioApp initial={initial} route="home"/>; }

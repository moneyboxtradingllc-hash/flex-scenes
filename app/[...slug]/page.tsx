import { seedDatabase } from "@/lib/seed";
import { repository } from "@/lib/repository";
import { StudioApp } from "@/components/studio-app";
import { generationService } from "@/lib/services";
export const dynamic = "force-dynamic";
export default async function Catchall({params}:{params:Promise<{slug:string[]}>}){ seedDatabase(); const {slug}=await params; const initial=JSON.parse(JSON.stringify(repository.snapshot(generationService.capabilities()))); return <StudioApp initial={initial} route={slug.join("/")}/>; }

import { resolve } from "@/lib/live-contracts";
import type { LiveRequest } from "@/lib/live-contracts";
export async function POST(request:Request){const input=await request.json() as LiveRequest;return Response.json({dryRun:true,candidates:resolve(input)});}

import { randomUUID } from "node:crypto";
import { LocalMediaStore } from "@/lib/storage";
import { repository } from "@/lib/repository";
import type { MediaAsset } from "@/lib/domain";

export async function POST(request:Request) {
  const form=await request.formData(); const file=form.get("file"); const characterId=String(form.get("characterId")??"");
  if(!(file instanceof File)||!characterId) return Response.json({error:"A character and an image or video file are required."},{status:400});
  if(!file.type.startsWith("image/")&&!file.type.startsWith("video/")) return Response.json({error:"Only image and video reference assets are supported."},{status:400});
  if(file.size>50*1024*1024) return Response.json({error:"Local development imports are limited to 50 MB."},{status:413});
  const id=randomUUID(); const type=file.type.startsWith("video/")?"video":"image"; const url=new LocalMediaStore().saveUpload(id,file.name,Buffer.from(await file.arrayBuffer()));
  const asset:MediaAsset={id,characterId,type,url,posterUrl:type==="video"?null:url,title:file.name,caption:"Local reference import",prompt:"",providerId:"local-import",settingsJson:JSON.stringify({source:"local-import",mime:file.type}),parentId:null,isReference:true,createdAt:new Date().toISOString(),favorite:false};
  repository.saveMedia(asset); return Response.json(asset,{status:201});
}

import { DurableObject } from "cloudflare:workers";

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  OVERLAY_ROOM: DurableObjectNamespace;
  APP_ORIGIN: string;
  UC_PER_UNIT: string;
  TWITCH_CLIENT_ID?: string; TWITCH_CLIENT_SECRET?: string;
  YOUTUBE_CLIENT_ID?: string; YOUTUBE_CLIENT_SECRET?: string;
  KICK_CLIENT_ID?: string; KICK_CLIENT_SECRET?: string;
  TIKTOK_CLIENT_ID?: string; TIKTOK_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
}

type Platform = "twitch"|"youtube"|"kick"|"tiktok";
type EventType = "follow"|"subscription"|"donation"|"gift"|"chat"|"like"|"share"|"command";
type UnifiedEvent = {id:string;userId:string;platform:Platform;type:EventType;actor?:{id?:string;name?:string};value?:{amount?:number;currency?:string;uc?:number};message?:string;metadata?:Record<string,unknown>;createdAt:string};

const response = (d:unknown,status=200)=>new Response(JSON.stringify(d),{status,headers:{"content-type":"application/json; charset=utf-8","access-control-allow-origin":"*"}});
const id=()=>crypto.randomUUID();

async function storeEvent(env:Env,e:UnifiedEvent,key:string){
  const r=await env.DB.prepare(`INSERT OR IGNORE INTO events(id,user_id,platform,type,event_json,idempotency_key) VALUES(?,?,?,?,?,?)`).bind(e.id,e.userId,e.platform,e.type,JSON.stringify(e),key).run();
  return (r.meta.changes??0)>0;
}
async function addUC(env:Env,userId:string,uc:number){
  if(!uc)return;
  await env.DB.prepare(`INSERT INTO balances(user_id,uc_balance) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET uc_balance=balances.uc_balance+excluded.uc_balance,updated_at=CURRENT_TIMESTAMP`).bind(userId,uc).run();
}
async function publish(env:Env,userId:string,e:UnifiedEvent){
  const stub=env.OVERLAY_ROOM.get(env.OVERLAY_ROOM.idFromName(userId));
  await stub.fetch("https://room/broadcast",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(e)});
}
function normalize(raw:any,platform:Platform):UnifiedEvent{
  return {id:raw.id??id(),userId:raw.userId,type:raw.type??"chat",platform,actor:raw.actor,value:raw.value,message:raw.message,metadata:raw.metadata,createdAt:raw.createdAt??new Date().toISOString()};
}
async function ingest(request:Request,env:Env,platform:Platform){
  let raw:any; try{raw=await request.json()}catch{return response({error:"invalid json"},400)}
  const e=normalize({...raw,platform},platform); if(!e.userId)return response({error:"userId required"},400);
  const fresh=await storeEvent(env,e,`${platform}:${raw.eventId??e.id}`); if(!fresh)return response({ok:true,duplicate:true});
  await addUC(env,e.userId,e.value?.uc??0); await publish(env,e.userId,e);
  return response({ok:true,event:e});
}

export default {async fetch(request:Request,env:Env){
  const u=new URL(request.url);
  if(u.pathname==="/api/health")return response({ok:true,service:"vtuber-unified",time:new Date().toISOString()});
  if(u.pathname==="/api/platforms")return response([
    {id:"twitch",name:"Twitch",status:"ready",transport:"EventSub"},
    {id:"youtube",name:"YouTube",status:"ready",transport:"Live API"},
    {id:"kick",name:"Kick",status:"ready",transport:"Webhooks/API"},
    {id:"tiktok",name:"TikTok LIVE",status:"bridge",transport:"Bridge/API"}
  ]);
  if(u.pathname==="/api/demo-event"&&request.method==="POST"){
    const b=await request.json<any>().catch(()=>({})); const e:UnifiedEvent={id:id(),userId:b.userId??"demo",platform:b.platform??"twitch",type:b.type??"donation",actor:{name:b.actor??"Demo Viewer"},value:{amount:b.amount??500,currency:b.currency??"UC",uc:b.uc??b.amount??500},message:b.message,metadata:{demo:true},createdAt:new Date().toISOString()};
    await storeEvent(env,e,`demo:${e.id}`); await addUC(env,e.userId,e.value?.uc??0); await publish(env,e.userId,e); return response({ok:true,event:e});
  }
  if(u.pathname.startsWith("/api/webhooks/")){const p=u.pathname.split("/").pop() as Platform;if(["twitch","youtube","kick","tiktok"].includes(p))return ingest(request,env,p);}
  if(u.pathname==="/api/overlay"&&request.method==="GET"){
    const user=u.searchParams.get("user")??"demo"; const row=await env.DB.prepare(`SELECT id,name,document_json,is_default,updated_at FROM layouts WHERE user_id=? ORDER BY is_default DESC,updated_at DESC LIMIT 1`).bind(user).first<any>();
    return response(row?{...row,document:JSON.parse(row.document_json)}:{id:"demo",name:"Neon Sakura",is_default:1,document:{canvas:{width:1920,height:1080},elements:[]}});
  }
  if(u.pathname==="/api/overlay"&&request.method==="PUT"){
    const b=await request.json<any>(), user=b.userId??"demo", lid=b.id??id();
    await env.DB.prepare(`INSERT INTO layouts(id,user_id,name,document_json,is_default) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,document_json=excluded.document_json,is_default=excluded.is_default,updated_at=CURRENT_TIMESTAMP`).bind(lid,user,b.name??"Neon Sakura",JSON.stringify(b.document??{}),b.isDefault?1:0).run();
    return response({ok:true,id:lid});
  }
  if(u.pathname==="/api/commands"&&request.method==="GET"){const user=u.searchParams.get("user")??"demo";const r=await env.DB.prepare(`SELECT * FROM commands WHERE user_id=? ORDER BY created_at DESC`).bind(user).all();return response(r.results)}
  if(u.pathname==="/api/commands"&&request.method==="POST"){const b=await request.json<any>(),cid=id();await env.DB.prepare(`INSERT INTO commands(id,user_id,name,cost_uc,cooldown_seconds,action_json,enabled) VALUES(?,?,?,?,?,?,?)`).bind(cid,b.userId??"demo",b.name??"!new",b.costUC??0,b.cooldownSeconds??0,JSON.stringify(b.action??{}),b.enabled===false?0:1).run();return response({ok:true,id:cid},201)}
  if(u.pathname==="/ws"){const user=u.searchParams.get("user")??"demo";return env.OVERLAY_ROOM.get(env.OVERLAY_ROOM.idFromName(user)).fetch(request)}
  if(u.pathname.startsWith("/overlay/"))return env.ASSETS.fetch(new Request(new URL("/overlay.html",u)));
  return env.ASSETS.fetch(request);
}};

export class OverlayRoom extends DurableObject<Env>{
  async fetch(request:Request){
    const u=new URL(request.url);
    if(u.pathname==="/broadcast"&&request.method==="POST"){const p=JSON.stringify({kind:"event",event:await request.json()});for(const ws of this.ctx.getWebSockets()){try{ws.send(p)}catch{}}return new Response("ok")}
    if(request.headers.get("Upgrade")==="websocket"){const pair=new WebSocketPair();const [client,server]=Object.values(pair);this.ctx.acceptWebSocket(server);return new Response(null,{status:101,webSocket:client})}
    return new Response("overlay room")
  }
  webSocketMessage(ws:WebSocket,msg:string|ArrayBuffer){try{const x=JSON.parse(typeof msg==="string"?msg:new TextDecoder().decode(msg));if(x?.type==="ping")ws.send(JSON.stringify({type:"pong"}))}catch{}}
  webSocketClose(){}
}

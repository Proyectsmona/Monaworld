import type { WorkerEnv } from './env.js';

export class OverlayRoom extends DurableObject<WorkerEnv> {
  async fetch(request:Request):Promise<Response>{
    const url=new URL(request.url);
    if(request.method==='GET' && url.pathname.endsWith('/ws')){
      if(request.headers.get('Upgrade')!=='websocket') return new Response('Expected websocket',{status:426});
      const pair=new WebSocketPair();
      const client=pair[0], server=pair[1];
      const role=url.searchParams.get('role')||'overlay';
      const widget=url.searchParams.get('widget')||'full';
      this.ctx.acceptWebSocket(server,[role,widget]);
      server.send(JSON.stringify({type:'hello',connected:true,at:new Date().toISOString()}));
      return new Response(null,{status:101,webSocket:client});
    }
    if(request.method==='POST' && url.pathname.endsWith('/publish')){
      const payload=await request.text();
      let sent=0;
      for(const socket of this.ctx.getWebSockets()){
        try{ socket.send(payload); sent++; }catch{}
      }
      return Response.json({ok:true,sent});
    }
    return new Response('Not found',{status:404});
  }
  webSocketMessage(ws:WebSocket,message:string|ArrayBuffer){
    if(typeof message==='string' && message==='ping') ws.send('pong');
  }
  webSocketClose(ws:WebSocket,code:number,reason:string){ try{ws.close(code,reason);}catch{} }
}

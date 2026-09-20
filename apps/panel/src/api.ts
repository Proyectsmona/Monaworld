export type Platform='twitch'|'youtube'|'kick'|'tiktok';
export interface User {id:number;username:string;role:string}
export interface Resource {id:string;kind:string;name:string;enabled:boolean;data:Record<string,any>;createdAt?:string;updatedAt?:string}
async function request<T>(url:string,init:RequestInit={}){const r=await fetch(url,{credentials:'include',...init,headers:{...(init.body instanceof Blob?{}:{'content-type':'application/json'}),...(init.headers||{})}});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error||`HTTP ${r.status}`);return body as T;}
export const api={
 me:()=>request<{user:User}>('/api/auth/me'),
 login:(username:string,password:string)=>request('/api/auth/login',{method:'POST',body:JSON.stringify({username,password})}),
 register:(username:string,password:string)=>request('/api/auth/register',{method:'POST',body:JSON.stringify({username,password})}),
 logout:()=>request('/api/auth/logout',{method:'POST',body:'{}'}),
 settings:()=>request<{settings:Record<string,any>}>('/api/settings'),
 saveSettings:(v:Record<string,any>)=>request('/api/settings',{method:'PUT',body:JSON.stringify(v)}),
 connections:()=>request<{connections:any[]}>('/api/connections'),
 disconnect:(p:Platform)=>request(`/api/connections/${p}`,{method:'DELETE'}),
 resources:(kind:string)=>request<{items:Resource[]}>(`/api/resources/${kind}`),
 createResource:(kind:string,v:Omit<Resource,'id'|'kind'>)=>request<{id:string}>(`/api/resources/${kind}`,{method:'POST',body:JSON.stringify(v)}),
 updateResource:(kind:string,id:string,v:Omit<Resource,'id'|'kind'>)=>request(`/api/resources/${kind}/${id}`,{method:'PUT',body:JSON.stringify(v)}),
 deleteResource:(kind:string,id:string)=>request(`/api/resources/${kind}/${id}`,{method:'DELETE'}),
 events:(limit=150)=>request<{events:any[]}>(`/api/events?limit=${limit}`),
 dashboard:()=>request<any>('/api/dashboard'),
 leaderboard:()=>request<{items:any[]}>('/api/leaderboard'),
 pays:()=>request<{items:any[]}>('/api/coin/pays'),
 overlayToken:()=>request<{token:string;userId:number}>('/api/overlay/token'),
 rotateOverlayToken:()=>request<{token:string;userId:number}>('/api/overlay/token/rotate',{method:'POST',body:'{}'}),
 simulate:(event:any)=>request('/api/simulate',{method:'POST',body:JSON.stringify(event)}),
 uploadMedia:async(file:File,kind:string)=>{const r=await fetch('/api/media/upload',{method:'POST',credentials:'include',headers:{'content-type':file.type||'application/octet-stream','x-file-name':encodeURIComponent(file.name),'x-media-kind':kind},body:file});const j=await r.json();if(!r.ok)throw new Error(j.error||'Error al subir');return j as {url:string;id:string;name:string};}
};

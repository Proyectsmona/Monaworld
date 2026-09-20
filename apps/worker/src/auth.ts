import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Context } from 'hono';
import type { WorkerEnv } from './env.js';

const COOKIE='mw_session';
const enc=new TextEncoder();
function b64(bytes:Uint8Array){ return btoa(String.fromCharCode(...bytes)); }
function fromB64(value:string){ return Uint8Array.from(atob(value),c=>c.charCodeAt(0)); }
export function randomToken(size=32){ const b=new Uint8Array(size); crypto.getRandomValues(b); return Array.from(b,x=>x.toString(16).padStart(2,'0')).join(''); }
export async function hashPassword(password:string){ const salt=crypto.getRandomValues(new Uint8Array(16)); const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']); const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:180000},key,256); return `pbkdf2$180000$${b64(salt)}$${b64(new Uint8Array(bits))}`; }
export async function verifyPassword(password:string,stored:string){ const [kind,it,saltB,hashB]=stored.split('$'); if(kind!=='pbkdf2'||!it||!saltB||!hashB)return false; const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']); const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:fromB64(saltB),iterations:Number(it)},key,256); const a=new Uint8Array(bits), b=fromB64(hashB); if(a.length!==b.length)return false; let diff=0; for(let i=0;i<a.length;i++) diff|=a[i]^b[i]; return diff===0; }
export async function createSession(c:Context<{Bindings:WorkerEnv}>,userId:number){ const id=randomToken(32); const expires=Date.now()+1000*60*60*24*30; await c.env.DB.prepare('INSERT INTO sessions(id,user_id,expires_at) VALUES(?,?,?)').bind(id,userId,expires).run(); setCookie(c,COOKIE,id,{httpOnly:true,secure:true,sameSite:'Lax',path:'/',maxAge:60*60*24*30}); }
export async function sessionUser(c:Context<{Bindings:WorkerEnv}>){ const id=getCookie(c,COOKIE); if(!id)return null; const row=await c.env.DB.prepare('SELECT u.id,u.username,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>?').bind(id,Date.now()).first<{id:number;username:string;role:string}>(); return row??null; }
export async function logout(c:Context<{Bindings:WorkerEnv}>){ const id=getCookie(c,COOKIE); if(id)await c.env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(id).run(); deleteCookie(c,COOKIE,{path:'/'}); }

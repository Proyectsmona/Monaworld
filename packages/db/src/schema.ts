/** Documentación tipada del esquema D1. Las migraciones SQL son la fuente de verdad. */
export interface UserRow { id:number; username:string; password_hash:string; role:string; created_at:string }
export interface AccountRow { id:number; user_id:number; platform:string; channel_name:string; platform_user_id:string|null; access_token:string|null; refresh_token:string|null; expires_at:number|null; status:string; last_error:string|null }
export interface ResourceRow { id:string; user_id:number; kind:string; name:string; enabled:number; data_json:string; created_at:string; updated_at:string }
export interface BalanceRow { id:number; owner_user_id:number; platform:string; platform_user_id:string; display_name:string; points:number; coins:number; updated_at:string }
export interface EventRow { id:number; user_id:number|null; platform:string; event_type:string; username:string|null; amount:number; monacoins:number; monopoints:number; raw_unit:string|null; gift_name:string|null; message:string|null; created_at:string }

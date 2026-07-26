export type EnemyState = "spawning" | "roaming" | "pursuing" | "windup" | "recovering" | "returning" | "defeated" | "respawning";
export type Enemy = { instanceId:string; slot:number; maxHealth:number; health:number; attack:number; x:number; y:number; targetX:number; targetY:number; state:EnemyState; facingLeft:boolean; nextActionAt:number };
export type Session = { sessionId:string; pet:{inventoryId:string;maxHealth:number;attack:number}; enemies:Array<Omit<Enemy,"x"|"y"|"targetX"|"targetY"|"state"|"facingLeft"|"nextActionAt">> };
export type SessionState = "loading" | "ready" | "error";

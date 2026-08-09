import type { Express } from "express";
import { exchangePet, getSoulExchangeState, SoulExchangeError } from "../soulExchange";
export function registerSoulExchangeRoutes(app:Express,{isAuthenticated}:{isAuthenticated:any}){
  app.get("/api/soul-exchange/pets",isAuthenticated,async(req:any,res)=>{ try { res.json(await getSoulExchangeState(req.user.id)); } catch(error){ console.error("[soul-exchange] quote failed",error); res.status(500).json({message:"The souls are quiet. Please try again."}); }});
  app.post("/api/soul-exchange/exchange",isAuthenticated,async(req:any,res)=>{ try { const {petInventoryId,exchangeActionId}=req.body||{}; if(typeof petInventoryId!=="string") return res.status(400).json({message:"A pet is required."}); res.json(await exchangePet(req.user.id,petInventoryId,exchangeActionId)); } catch(error){ if(error instanceof SoulExchangeError)return res.status(error.status).json({errorCode:error.code,message:error.message}); console.error("[soul-exchange] exchange failed",error); res.status(500).json({message:"The ritual failed safely. Your pet was not exchanged."}); }});
}

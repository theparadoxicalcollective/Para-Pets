import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";

const W=991,H=1233,ROOT=process.cwd(),OUT=path.join(ROOT,"promo_output");
await fs.mkdir(OUT,{recursive:true});
const A=(p)=>path.join(ROOT,"attached_assets",p);
const F={
  explore:A("IMG_3028_1774876682518.jpeg"),
  enchanted:A("bg_enchanted_grove_map.webp"),
  haunted:A("bg_haunted_woods_map.webp"),
  sky:A("bg_sky_realm_map.webp"),
  volcanic:A("bg_volcanic_map_v4.webp"),
  home:A("inside_room_bg.png"),
  pet:A("IMG_3026_1774876682518.jpeg"),
  market:A("bg_market_cellar.webp"),
  friends:A("icon_friends_inventory.png"),
  egg:A("limited_eggs/midnight_juggler_egg.webp"),
  coin5:A("coin_pack_5000.png"),
  coin1:A("coin_pack_1000_v3.png"),
  hauntedFull:A("world_haunted_woods_v3.png")
};

function esc(s){return String(s).replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&apos;"}[c]));}
function svg(body,w=W,h=H){return Buffer.from('<svg width="'+w+'" height="'+h+'" xmlns="http://www.w3.org/2000/svg">'+body+'</svg>');}
function titleLayer(eyebrow,title,sub){
  return svg(
    '<defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#030706" stop-opacity=".94"/><stop offset="1" stop-color="#030706" stop-opacity="0"/></linearGradient><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#020604" stop-opacity="0"/><stop offset="1" stop-color="#020604" stop-opacity=".94"/></linearGradient></defs>'+
    '<rect width="991" height="260" fill="url(#t)"/><rect y="900" width="991" height="333" fill="url(#b)"/>'+
    '<rect x="28" y="28" width="935" height="1177" rx="38" fill="none" stroke="#cfa83f" stroke-width="3" stroke-opacity=".80"/>'+
    '<rect x="41" y="41" width="909" height="1151" rx="31" fill="none" stroke="#7fbfb0" stroke-width="1" stroke-opacity=".28"/>'+
    '<text x="496" y="86" text-anchor="middle" fill="#d8c47a" font-family="serif" font-size="25" letter-spacing="8">'+esc(eyebrow)+'</text>'+
    '<text x="496" y="160" text-anchor="middle" fill="#fff4cb" font-family="serif" font-size="56" font-weight="700" letter-spacing="3">'+esc(title)+'</text>'+
    '<text x="496" y="207" text-anchor="middle" fill="#d6eee5" font-family="sans-serif" font-size="22" letter-spacing="1">'+esc(sub)+'</text>'
  );
}
async function crop(file,w,h,pos="centre"){return sharp(file).resize(w,h,{fit:"cover",position:pos}).png().toBuffer();}
async function round(buf,w,h,r=28){
  const mask=svg('<rect width="'+w+'" height="'+h+'" rx="'+r+'" fill="white"/>',w,h);
  const border=svg('<rect x="2" y="2" width="'+(w-4)+'" height="'+(h-4)+'" rx="'+Math.max(1,r-2)+'" fill="none" stroke="#d7b657" stroke-width="4" stroke-opacity=".82"/>',w,h);
  return sharp(buf).composite([{input:mask,blend:"dest-in"},{input:border}]).png().toBuffer();
}
async function dim(file){return sharp(file).resize(W,H,{fit:"cover"}).modulate({brightness:.70,saturation:.90}).png().toBuffer();}

async function exploreBanner(){
  const bg=await dim(F.enchanted);
  const main=await round(await crop(F.explore,760,650),760,650,34);
  const t1=await round(await crop(F.haunted,245,166),245,166,22);
  const t2=await round(await crop(F.sky,245,166),245,166,22);
  const t3=await round(await crop(F.volcanic,245,166),245,166,22);
  const labels=svg(
    '<rect x="58" y="921" width="875" height="230" rx="34" fill="#03110b" fill-opacity=".76"/>'+
    '<text x="190" y="1120" text-anchor="middle" fill="#f1d36f" font-family="serif" font-size="18" letter-spacing="2">HAUNTED</text>'+
    '<text x="496" y="1120" text-anchor="middle" fill="#f1d36f" font-family="serif" font-size="18" letter-spacing="2">SKY REALM</text>'+
    '<text x="802" y="1120" text-anchor="middle" fill="#f1d36f" font-family="serif" font-size="18" letter-spacing="2">VOLCANIC</text>'+
    '<text x="496" y="1162" text-anchor="middle" fill="#b9dbd0" font-family="sans-serif" font-size="19" letter-spacing="3">WORLDS • QUESTS • BATTLES • FISHING</text>'
  );
  await sharp(bg).composite([
    {input:svg('<rect width="991" height="1233" fill="#00150c" fill-opacity=".18"/>')},
    {input:main,left:116,top:252},
    {input:t1,left:68,top:940},{input:t2,left:373,top:940},{input:t3,left:678,top:940},
    {input:labels},{input:titleLayer("PARA PETS","EXPLORE THE REALMS","Adventure is waiting beyond your pet’s doorstep")}
  ]).png({compressionLevel:9}).toFile(path.join(OUT,"parapets-promo-explore.png"));
}

async function socialBanner(){
  const bg=await dim(F.home);
  const pet=await round(await crop(F.pet,430,710),430,710,34);
  const market=await round(await crop(F.market,350,250),350,250,28);
  const friends=await sharp(F.friends).resize(180,180,{fit:"contain"}).png().toBuffer();
  const card=svg(
    '<rect x="530" y="535" width="385" height="455" rx="34" fill="#07150e" fill-opacity=".90" stroke="#d2ac4a" stroke-opacity=".60" stroke-width="2"/>'+
    '<text x="722" y="610" text-anchor="middle" fill="#f4dc83" font-family="serif" font-size="29" font-weight="700" letter-spacing="3">MAKE IT YOURS</text>'+
    '<text x="722" y="670" text-anchor="middle" fill="#d8eee5" font-family="sans-serif" font-size="20">Decorate your pet home</text>'+
    '<text x="722" y="710" text-anchor="middle" fill="#d8eee5" font-family="sans-serif" font-size="20">Add &amp; visit friends</text>'+
    '<text x="722" y="750" text-anchor="middle" fill="#d8eee5" font-family="sans-serif" font-size="20">Buy &amp; sell in the player market</text>'+
    '<line x1="578" y1="794" x2="866" y2="794" stroke="#7fbfb0" stroke-opacity=".35"/>'+
    '<text x="722" y="945" text-anchor="middle" fill="#9bcfc0" font-family="sans-serif" font-size="16" letter-spacing="2">YOUR PET • YOUR SPACE • YOUR COMMUNITY</text>'
  );
  await sharp(bg).composite([
    {input:svg('<rect width="991" height="1233" fill="#03120a" fill-opacity=".28"/>')},
    {input:pet,left:70,top:267},{input:market,left:560,top:285},{input:friends,left:632,top:800},
    {input:card},{input:titleLayer("PLAY TOGETHER","BUILD • CONNECT • TRADE","Homes, friends and a player-driven marketplace")}
  ]).png({compressionLevel:9}).toFile(path.join(OUT,"parapets-promo-social-market-home.png"));
}

async function limitedBanner(){
  const bg=await dim(F.hauntedFull);
  const egg=await sharp(F.egg).resize(430,430,{fit:"contain"}).png().toBuffer();
  const c5=await sharp(F.coin5).resize(320,320,{fit:"contain"}).png().toBuffer();
  const c1=await sharp(F.coin1).resize(260,260,{fit:"contain"}).png().toBuffer();
  const glow=svg(
    '<defs><radialGradient id="g"><stop offset="0" stop-color="#b154ff" stop-opacity=".76"/><stop offset=".46" stop-color="#8f35ff" stop-opacity=".24"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><radialGradient id="c"><stop offset="0" stop-color="#f6cf5a" stop-opacity=".66"/><stop offset=".6" stop-color="#f6cf5a" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>'+
    '<ellipse cx="496" cy="590" rx="365" ry="330" fill="url(#g)"/><ellipse cx="220" cy="905" rx="220" ry="205" fill="url(#c)"/><ellipse cx="790" cy="905" rx="220" ry="205" fill="url(#c)"/>'+
    '<rect x="105" y="1000" width="781" height="124" rx="28" fill="#090612" fill-opacity=".84" stroke="#d0a53c" stroke-opacity=".62" stroke-width="2"/>'+
    '<text x="496" y="1052" text-anchor="middle" fill="#f4dc83" font-family="serif" font-size="27" font-weight="700" letter-spacing="3">SEASONAL EGGS • COIN BUNDLES</text>'+
    '<text x="496" y="1093" text-anchor="middle" fill="#e4d9f6" font-family="sans-serif" font-size="20" letter-spacing="1">Limited-time drops and special shop offers</text>'
  );
  await sharp(bg).composite([
    {input:svg('<rect width="991" height="1233" fill="#08010f" fill-opacity=".48"/>')},{input:glow},
    {input:egg,left:281,top:320},{input:c5,left:52,top:725},{input:c1,left:675,top:760},
    {input:titleLayer("CHECK THE SHOP","LIMITED DROPS","Find seasonal eggs, bundles and special rewards")}
  ]).png({compressionLevel:9}).toFile(path.join(OUT,"parapets-promo-limited-shop.png"));
}

await exploreBanner();
await socialBanner();
await limitedBanner();
console.log("Generated 3 ParaPets promo banners in",OUT);

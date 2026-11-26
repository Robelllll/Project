const $ = id => document.getElementById(id);
const show = id => { document.querySelectorAll(".screen").forEach(s => s.classList.toggle("on", s.id === id)); autoFit(); };

// ---- Fit everything on any laptop/PC screen: the 1280x800 stage scales to the window,
// and any screen whose content is still too tall is shrunk to fit (no scrolling) ----
function fitStage(){
  const s = Math.min(innerWidth / 1280, innerHeight / 800);
  document.documentElement.style.setProperty("--s", s);
}
function autoFit(){
  if(typeof document.querySelector !== "function") return;
  const el = document.querySelector(".screen.on"); if(!el) return;
  el.style.zoom = 1;
  const need = el.scrollHeight, have = el.clientHeight;
  if(need > have + 1) el.style.zoom = Math.max(0.5, have / need);
}
if(typeof window !== "undefined" && window.addEventListener){
  fitStage();
  window.addEventListener("resize", () => { fitStage(); autoFit(); });
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(autoFit);
}
const MIN_ACC = 0.6;
let G = null, raf = 0, recent = [], runId = 0;

// ---------- Feedback ----------
const spriteCache = {};
function pixelSprite(e, n = 16){
  const key = e + n; if(spriteCache[key]) return spriteCache[key];
  try{
    const c = document.createElement("canvas"); c.width = c.height = n;
    const x = c.getContext("2d");
    x.font = (n - 2) + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
    x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(e, n/2, n/2 + 1);
    const d = x.getImageData(0, 0, n, n);
    for(let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 110 ? 255 : 0;
    x.putImageData(d, 0, 0);
    return spriteCache[key] = `<img class="spr" src="${c.toDataURL()}" alt="">`;
  }catch(err){ return e; }
}

// ---- Item icons (your art). emoji -> [animation name, file]. Missing files fall back to the pixel emoji. ----
const ICONS = {
  "✨":["gold","golden words.webp"], "🗡":["dmg30","30% damage.webp"], "🪓":["dmg15","15% damage.jpg"],
  "⏱":["time","time.jpg"], "🔥":["fury","fury scroll.jpg"], "🧪":["potion","red potion.webp"],
  "🎲":["mystery","mystery.png"], "❄":["freeze","freeze.avif"], "💣":["bomb","bomb.gif"],
  "🛡":["shield","shield (powerup).jpg"], "💚":["heart","heart.gif"], "❤":["heart","heart.gif"]
};
function sprite(e, n = 16){
  const ic = ICONS[e.replace(/\uFE0F/g, "")];
  if(!ic) return pixelSprite(e, n);
  const alts = ["icons/", "powerups/", "shop/"].map(d => encodeURI(d + ic[1])).join("|");
  return `<img class="spr" data-ico="${ic[0]}" src="${encodeURI(PATHS.icon + ic[1])}" data-alt="${alts}" alt="" onerror="icoErr(this,'${e}')">`;
}
function icoErr(img, e){
  if(img.dataset.alt){
    const parts = img.dataset.alt.split("|"), a = parts.shift();
    if(parts.length) img.dataset.alt = parts.join("|"); else delete img.dataset.alt;
    img.src = a; return;
  }
  img.outerHTML = pixelSprite(e);
}

// Where your image files live. "" = same folder as index.html. Example: hero:"class/"
const PATHS = { bg:"", hero:"", enemy:"", icon:"powerup & shop/" };

// Animated character image. If the file is missing, an emoji is shown instead.
// List the GIFs whose art ALREADY faces LEFT (as drawn). Everything else is assumed to face right.
// The game flips each sprite so heroes (left side) face right and enemies (right side) face left.
const FACES_LEFT = ["guard.gif", "guard.png"];   // the guard is drawn with its sword on the left, toward the hero
// Choices made in the "Sprite setup" screen are saved in the browser and win over the list above
let FLIPS = {};
try{ FLIPS = JSON.parse(localStorage.getItem("keystrikeFlips") || "{}"); }catch(e){}

function fig(file, emoji, onRight = false, alt = ""){
  const name = file.split("/").pop();
  const drawnLeft = FLIPS[name] ?? FACES_LEFT.includes(name);
  const flip = drawnLeft !== onRight ? -1 : 1;
  return `<img class="fig" style="--flip:${flip}" src="${encodeURI(file)}"${[].concat(alt || []).length ? ` data-alt="${[].concat(alt).map(encodeURI).join("|")}"` : ""} alt="" onerror="figErr(this,'${emoji}')">`;
}
// Enemy files are looked up in their realm folder first, then in the main folder. Heroes: main folder, then "class/".
function enemyFig(R, gif, emoji){ return fig(PATHS.enemy + R.folder + "/" + gif, emoji, true, PATHS.enemy + gif); }
function heroFig(gif, emoji, onRight = false){ return fig(PATHS.hero + gif, emoji, onRight, "class/" + gif); }

function figErr(img, e){
  if(img.dataset.alt){
    const parts = img.dataset.alt.split("|"), a = parts.shift();
    if(parts.length) img.dataset.alt = parts.join("|"); else delete img.dataset.alt;
    img.src = a; return;
  } const s = document.createElement("span"); s.className = "fig fb"; s.textContent = e; img.replaceWith(s); }

// Restart a CSS animation class (hit, atk, enter)
function play(el, cls){ el.classList.remove("hit","atk","enter"); void el.offsetWidth; el.classList.add(cls); }

const bgUrl = f => `url("${encodeURI(PATHS.bg + f)}")`;
function setScene(R, boss){
  $("scene").style.backgroundImage = boss ? `${bgUrl(R.bossImg)}, ${bgUrl(R.bgImg)}` : bgUrl(R.bgImg);
}
function setBg(R, boss){
  const img = boss ? `${bgUrl(R.bossImg)}, ${bgUrl(R.bgImg)}` : bgUrl(R.bgImg);
  document.body.style.setProperty("--bgimg", `linear-gradient(rgba(20,12,8,.5),rgba(20,12,8,.5)), ${img}`);
  document.body.style.setProperty("--rc", R.color);
}
function clearBg(){ document.body.style.removeProperty("--bgimg"); }

function bigPop(text, cls){
  const el = document.createElement("div"); el.className = "big " + cls; el.textContent = text;
  $("scene").appendChild(el); setTimeout(() => el.remove(), 1100);
}

// One-time tips: each shows the first time the situation happens
let TIPS = {};
try{ TIPS = JSON.parse(localStorage.getItem("keystrikeTips") || "{}"); }catch(e){}
function tip(key, text){
  if(TIPS[key]) return; TIPS[key] = 1;
  try{ localStorage.setItem("keystrikeTips", JSON.stringify(TIPS)); }catch(e){}
  const t = $("tip"); t.textContent = "Tip: " + text; t.classList.add("on");
  setTimeout(() => t.classList.remove("on"), 7000);
}

function shake(el){ el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); }

function bossDmg(){ return Math.round((8 + G.level*1.2) * (G.p[1].mega ? 1.4 : G.p[1].boss ? 1.2 : 1)); }
const oneOf = arr => arr[Math.floor(Math.random() * arr.length)];

// Random word from a list, avoiding the last few used
function fresh(list){
  let w, tries = 0;
  do { w = oneOf(list); tries++; } while(recent.includes(w) && tries < 20);
  recent.push(w); if(recent.length > 8) recent.shift();
  return w;
}

// Words are themed to the realm. Short and common first, longer later. No long sentences.
function pick(tier){
  const g = G || {level:1};
  const R = g.adv ? REALMS[g.realm] : g.mode === "pvp" ? REALMS[Math.floor(g.round / 3) % REALMS.length] : REALMS[Math.floor((g.level - 1) / 5) % REALMS.length];
  if(g.adv){
    // Adventure: each realm gets a bit harder than the last
    const pools = [R.easy, [...R.easy, ...R.mid], R.mid, [...R.mid, ...R.mid, ...R.hard], [...R.mid, ...R.hard]];
    if(g.kind === "boss" && Math.random() < 0.3) return fresh(R.easy) + " " + fresh(R.easy);
    return fresh(pools[g.realm]);
  }
  if(tier === 0) return fresh(R.easy);
  if(tier === 1) return fresh(R.mid);
  if(tier === 2) return fresh(R.hard);
  return fresh(R.easy) + " " + fresh(R.mid);
}

const POWERS = {
  freeze:{icon:"❄️",name:"Freeze"},
  bomb:{icon:"💣",name:"Bomb"},
  heal:{icon:"💚",name:"Heal"},
  shield:{icon:"🛡️",name:"Shield"}
};

function award(i){
  const p = G.p[i];
  if(p.inv.length >= 3) return "(power-up slots full)";
  const k = oneOf(Object.keys(POWERS)); p.inv.push(k);
  tip("power", "Use power-ups with the number keys 1, 2, 3 while typing, or click them.");
  return `✨ Got ${POWERS[k].icon} ${POWERS[k].name}!`;
}

function usePower(i, slot){
  if(!G || G.busy) return;
  const p = G.p[i], k = p.inv[slot];
  if(!k || p.locked) return;
  p.inv.splice(slot, 1);
  let text = "";
  if(k==="heal"){ p.hp = Math.min(p.max, p.hp + 25); text = `${p.name} healed 25 HP! 💚` + (p.poison ? " Poison cured!" : ""); p.poison = 0; }
  if(k==="shield"){ p.shield = true; text = `${p.name} raised a shield! 🛡️`; }
  if(k==="bomb"){ p.bomb = true; text = `${p.name}’s next hit does double damage! 💣`; }
  if(k==="freeze"){
    if(G.mode==="single"){ G.tLimit += 4; text = "Time frozen: +4 seconds! ❄️"; }
    else {
      const o = 1-i, r = G.round, inp = $("i"+o);
      inp.disabled = true; text = `${G.p[o].name} is frozen for 2 seconds! ❄️`;
      setTimeout(() => { if(G.round===r && !G.busy && !G.p[o].locked) inp.disabled = false; }, 2000);
    }
  }
  $("msg").textContent = text; draw();
}

// Boss AI: sometimes uses its own power-up at the start of a round
function bossMove(){
  const b = G.p[1];
  if(Math.random() > (b.mega ? 0.6 : 0.4)) return "";
  const m = oneOf(["shield","heal","rage","steal","poison"]);
  if(m==="shield" && !b.shield){ b.shield = true; return "🛡️ The boss raised a shield!"; }
  if(m==="heal"){ b.hp = Math.min(b.max, b.hp + Math.round(b.max*0.1)); return "💚 The boss healed itself!"; }
  if(m==="rage"){ b.rage = true; return "💢 The boss is enraged: its next hit does 30% more damage!"; }
  if(m==="steal"){ G.tLimit *= 0.8; return "⏳ The boss stole some of your time!"; }
  if(m==="poison" && G.p[0].poison === 0){ G.p[0].poison = 3; tip("poison", "Poison costs 3 HP each round. A Heal power-up or a campfire cures it."); return "☠️ The boss poisoned you: −3 HP at the end of the next 3 rounds! (Heal cures it)"; }
  return "";
}

// Royal guards stand beside the King. Art: guard.png (static), animated with CSS.
function guardImg(isNew){
  const R = REALMS[4];
  return fig(PATHS.enemy + R.folder + "/guard.gif", "💂", true, [PATHS.enemy + "guard.gif", PATHS.enemy + R.folder + "/guard.png", PATHS.enemy + "guard.png"]).replace('class="fig"', `class="fig guard${isNew ? " in" : ""}"`);
}
function renderGuards(summoned){
  const f = $("f1"); f.querySelectorAll(".guard").forEach(g => g.remove());
  const n = G.p[1].guards || 0;
  for(let i = 0; i < n; i++) f.insertAdjacentHTML("afterbegin", guardImg(summoned && i === n - 1));
}
// A glowing bubble shows around anyone who has a shield; it shatters when it blocks a hit
function shieldBreak(i, gold){
  const el = document.createElement("span"); el.className = "sbreak" + (gold ? " gold" : "");
  $("f"+i).appendChild(el); setTimeout(() => el.remove(), 500);
}

function guardDown(){
  const gs = $("f1").querySelectorAll(".guard"), g = gs[gs.length - 1];
  if(g){ g.classList.add("dying"); setTimeout(() => renderGuards(false), 450); }
}

// Boss signature ability, checked at the start of every round
function bossSig(){
  const b = G.p[1];
  if(G.mode !== "single" || !b.boss) return "";
  if(b.sig === "regrow"){ const h = Math.round(b.max * 0.04); b.hp = Math.min(b.max, b.hp + h); return `🌿 The Treant regrows +${h} HP.`; }
  if(b.sig === "flash" && b.rounds % 3 === 0){
    const inp = $("i0"), r = G.round; inp.disabled = true;
    setTimeout(() => { if(G.round === r && !G.busy){ inp.disabled = false; inp.focus(); } }, 1200);
    return "❄️ Flash freeze! Your typing box is frozen for a moment.";
  }
  if(b.sig === "guard" && b.rounds % 3 === 0 && (b.guards || 0) < 2){
    b.guards = (b.guards || 0) + 1; renderGuards(true); bigPop("SHIELD RAISED!", "gold");
    const f = $("f1"); f.classList.add("forming"); setTimeout(() => f.classList.remove("forming"), 650);
    return "💂 A royal guard raises a shield around the king!";
  }
  return "";
}

// ---------- Adventure mode ----------
const REALMS = [
  {name:"Whispering Forest", folder:"whispering forest", icon:"🌲", color:"#3f6b4f", bgImg:"whispering forest.png", bossImg:"boss_backgrounds/boss_whispering forest.png",
   enemies:["🐗","🐺","🦇","🕷️"], names:["Wild Boar","Wolf","Bat","Spider"], gifs:["boar.gif","wolf.gif","bat.gif","spider.gif"],
   boss:"🌳 Elder Treant", bossIcon:"🌳", bossGif:"treant.gif",
   intro:"Moss-covered trees whisper stolen words. The Elder Treant guards the first Lost Word.",
   words:"leaf moss oak vine fern acorn root bark branch thorn mushroom".split(" ")},
  {name:"Burning Desert", folder:"burning desert", icon:"🏜️", color:"#a8741a", bgImg:"burning desert.png", bossImg:"boss_backgrounds/boss_burning desert.png",
   enemies:["🦂","🐍","🐫","🦎"], names:["Scorpion","Snake","Camel","Lizard"], gifs:["scorpion.gif","snake.gif","camel.gif","lizard.gif"],
   boss:"🏺 Sand Pharaoh", bossIcon:"🏺", bossGif:"pharaoh.gif",
   intro:"Heat shimmers over endless dunes. The Sand Pharaoh buried the second Lost Word.",
   words:"dune sand cactus oasis mirage scorpion dust pyramid camel desert".split(" ")},
  {name:"Frozen Cave", folder:"frozen cave", icon:"❄️", color:"#2f6f86", bgImg:"frozen cave.png", bossImg:"boss_backgrounds/boss_frozen cave.png",
   enemies:["🐧","🐻‍❄️","🦊","⛄"], names:["Penguin","Polar Bear","Arctic Fox","Snowman"], gifs:["penguin.gif","polar bear.gif","arctic fox.gif","snowman.gif"],
   boss:"🧊 Frost Giant", bossIcon:"🧊", bossGif:"frost giant.gif",
   intro:"Your breath turns to frost. The Frost Giant has frozen the third Lost Word in ice.",
   words:"ice snow frost glacier chill blizzard crystal freeze icicle winter".split(" ")},
  {name:"Volcano Keep", folder:"volcano keep", icon:"🌋", color:"#b0432a", bgImg:"volcano keep.webp", bossImg:"boss_backgrounds/boss_volcano keep.jpg",
   enemies:["🔥","🪨","😈","🗿"], names:["Fire Sprite","Lava Rock","Fire Demon","Fire Golem"], gifs:["fire.gif","lava rock.gif","fire demon.gif","fire golem.gif"],
   boss:"🐲 Lava Dragon", bossIcon:"🐲", bossGif:"lava dragon.gif",
   intro:"Rivers of lava light the path. The Lava Dragon burns the fourth Lost Word.",
   words:"lava ember flame magma ash volcano smoke inferno spark blaze".split(" ")},
  {name:"Dark Castle", folder:"dark castle", icon:"🏰", color:"#6a4c93", bgImg:"dark castle.jpeg", bossImg:"boss_backgrounds/boss_dark castle.avif",
   enemies:["👻","🧟","🧛","🗿"], names:["Ghost","Zombie","Vampire","Gargoyle"], gifs:["ghost.gif","zombie.gif","vampire.gif","gargoyle.gif"],
   boss:"👑 Medieval King", bossIcon:"👑", bossGif:"medieval king.gif",
   intro:"The Medieval King, the true Word Thief, waits on his throne with the last Lost Word. End this.",
   words:"tower throne shadow dungeon crown knight curse ghost moat gate".split(" ")}
];
REALMS[0].phrases = ["moss grows on the old oak","the wolf hunts at dusk","follow the winding root path","whispers hide in the leaves"];
REALMS[1].phrases = ["the sun burns the sand","a mirage dances on the dunes","the scorpion waits in the shade","ancient kings sleep below"];
REALMS[2].phrases = ["frost bites at the cold wind","the glacier groans and cracks","snow covers every footprint","ice sings in the dark cave"];
REALMS[3].phrases = ["lava rivers light the cave","embers rise from the keep","the volcano roars awake","ash falls like gray snow"];
REALMS[4].phrases = ["the king guards the last word","shadows walk the empty halls","the old castle never sleeps","break the curse and take the crown"];
// Enemy personalities (order matches each realm's enemy list)
const TRAITS = {
  normal:{time:1, dmg:1, label:""},
  fast:{time:0.8, dmg:0.8, label:"Quick"},
  heavy:{time:1.3, dmg:1.6, label:"Heavy"},
  poison:{time:1, dmg:0.9, label:"Venom"},
  drain:{time:1, dmg:0.9, label:"Drain"}
};
REALMS[0].traits = ["heavy","fast","drain","poison"];
REALMS[1].traits = ["poison","fast","heavy","fast"];
REALMS[2].traits = ["fast","heavy","fast","drain"];
REALMS[3].traits = ["fast","heavy","poison","heavy"];
REALMS[4].traits = ["fast","heavy","drain","heavy"];
// Themed word lists (easy 3-5 letters, mid 5-7, hard 7-10)
Object.assign(REALMS[0], {easy:"leaf moss oak vine fern root bark tree wood seed bush twig pine owl fox nest bee deer".split(" "), mid:"acorn branch forest thorns meadow willow cedar clover flower sprout lichen hollow berry".split(" "), hard:"woodland evergreen blossom wildflower mushroom toadstool rainforest treetop".split(" ")});
Object.assign(REALMS[1], {easy:"sun sand dune heat dust rock camel oasis snake palm hot dry cave tomb sky wind".split(" "), mid:"cactus mirage canyon desert temple pharaoh sphinx caravan sunset thirst ruins".split(" "), hard:"pyramid scorpion sandstone sandstorm wasteland treasure scorching quicksand".split(" ")});
Object.assign(REALMS[2], {easy:"ice snow cold frost fog wind hail bear fox seal igloo chill sled cave".split(" "), mid:"arctic freeze shiver winter frozen icicle tundra penguin mammoth glacier snowy".split(" "), hard:"blizzard avalanche snowflake snowstorm permafrost frostbite hailstorm".split(" ")});
Object.assign(REALMS[3], {easy:"lava fire ash heat hot ember smoke rock coal flame burn glow spark".split(" "), mid:"magma crater molten blaze scorch sulfur cinder forge dragon volcano".split(" "), hard:"obsidian eruption inferno fireball wildfire brimstone scorching".split(" ")});
Object.assign(REALMS[4], {easy:"king gate moat wall bell tower crown ghost bone sword lord duke".split(" "), mid:"shield knight throne dungeon castle banner armor dagger curse guard".split(" "), hard:"kingdom fortress gargoyle skeleton drawbridge sorcerer cathedral".split(" ")});

// Each realm's boss has its own signature ability
Object.assign(REALMS[0], {sig:"regrow", sigLabel:"Regrowth", sigTip:"The Elder Treant regrows 4% of its HP every round. Don't drag the fight out."});
Object.assign(REALMS[1], {sig:"curse", sigLabel:"Curse", sigTip:"The Sand Pharaoh curses your words: Mirror rounds (type it backwards) happen far more often. They give +50% damage."});
Object.assign(REALMS[2], {sig:"flash", sigLabel:"Flash Freeze", sigTip:"The Frost Giant freezes your typing box for a moment every 3rd round. Use that time to get ready."});
Object.assign(REALMS[3], {sig:"phase", sigLabel:"Dragonfire", sigTip:"The Lava Dragon becomes enraged at half HP: it gives you less time per word and hits harder."});
Object.assign(REALMS[4], {sig:"guard", sigLabel:"Royal Guard", sigTip:"Every 3rd round a royal guard raises a shield around the Medieval King (2 at most). Each shield absorbs one of your hits, and each guard makes the King hit 25% harder."});
const NODES = {
  fight:{icon:"⚔️", name:"Fight", desc:"A normal enemy. Earn gold."},
  elite:{icon:"💀", name:"Elite", desc:"Tougher enemy. Drops gold and a power-up."},
  camp:{icon:"🏕️", name:"Campfire", desc:"Rest and recover 30 HP."},
  chest:{icon:"🎁", name:"Chest", desc:"A free power-up. Might be trapped."},
  shop:{icon:"🛒", name:"Shop", desc:"Spend gold on upgrades."}
};

function showMap(title, text, opts, cards){
  const p = G.p[0], R = REALMS[G.realm];
  setBg(R);
  const realms = REALMS.map((r,i) => `<span class="rm ${i < G.realm ? "done" : i === G.realm ? "cur" : ""}" title="${r.name}">${sprite(r.icon)}</span>`).join('<i class="ln"></i>');
  const stages = [0,1,2,3].map(s => `<span class="st ${s < G.step ? "done" : s === G.step ? "cur" : ""}">${s === 3 ? "👑" : s + 1}</span>`).join('<i class="ln"></i>');
  const inv = p.inv.length ? p.inv.map(k => sprite(POWERS[k].icon)).join("") : "no power-ups";
  $("mapBox").innerHTML = `<div class="banner"><div class="bi">${sprite(R.icon)}</div><div><div class="bn">${R.name}</div><div class="bs">Lost Words recovered: ${G.realm} of ${REALMS.length}</div></div></div>
    <div class="track">${realms}</div><div class="track sm">${stages}</div>
    <div class="status"><div class="hpm"><i style="width:${p.hp/p.max*100}%"></i></div><span>❤️ ${p.hp}/${p.max}</span><span>🪙 ${G.coins}</span>${G.dmgmult > 1 ? `<span>⚔️ +${Math.round((G.dmgmult - 1) * 100)}% damage</span>` : ""}<span>${inv}</span></div>
    <h2>${title}</h2><p>${text}</p>
    <div class="choices ${cards ? "cards" : ""}">` + opts.map((o,i) => o.icon
      ? `<button class="card ${o.type}" data-o="${i}"><span class="ci">${o.fig || sprite(o.icon)}</span><b>${o.name}</b><small>${o.desc}</small></button>`
      : `<button data-o="${i}" class="${i ? "alt" : ""}">${o.label}</button>`).join("") + `</div>`;
  $("mapBox").onclick = e => { const b = e.target.closest("button"); if(b) opts[+b.dataset.o].fn(); };
  show("map");
}

function story(){
  const R = REALMS[G.realm];
  const pro = G.realm === 0 && G.level === 1 ? "The Word Thief has stolen the Lost Words that give every language its power. Cross five realms, beat each guardian, and win them back.<br><br>" : "";
  showMap("A new realm", pro + R.intro, [{label:"Enter the realm", fn:choosePath}]);
}

function choosePath(){
  const R = REALMS[G.realm];
  if(G.step >= 3) return showMap("The guardian awaits", "Your power-ups and upgrades come with you into the fight.",
    [{icon:"👑", type:"boss", name:"Face the guardian", desc:R.boss, fn:() => fight("boss")}], true);
  const pool = ["fight","fight","elite","camp","chest","shop"];
  const a = oneOf(pool); let b; do { b = oneOf(pool); } while(b === a);
  if(G.step === 0 && a !== "fight" && b !== "fight") b = "fight";
  showMap("Choose your path", "Two paths lie ahead.", [a,b].map(t => ({icon:NODES[t].icon, type:t, name:NODES[t].name, desc:NODES[t].desc, fn:() => enter(t)})), true);
}

function enter(type){
  const p = G.p[0], cont = [{label:"Continue", fn:choosePath}];
  if(type === "fight" || type === "elite") return fight(type);
  G.step++;
  if(type === "camp"){ p.hp = Math.min(p.max, p.hp + 30); p.poison = 0; return showMap("🏕️ Campfire", "You rest by the fire and recover 30 HP.", cont); }
  if(type === "chest"){
    if(Math.random() < 0.25){ p.hp = Math.max(1, p.hp - 10); return showMap("🎁 Trapped chest!", "It was a trap. You lose 10 HP.", cont); }
    return showMap("🎁 Chest", "You found a power-up! " + award(0), cont);
  }
  G.stock = rollStock(); shop();
}

const SHOP_POOL = [
  {icon:"💚", name:"Heal power-up", base:20, pw:"heal"},
  {icon:"🛡️", name:"Shield power-up", base:25, pw:"shield"},
  {icon:"💣", name:"Bomb power-up", base:25, pw:"bomb"},
  {icon:"❄️", name:"Freeze power-up", base:20, pw:"freeze"},
  {icon:"🎲", name:"Mystery power-up", base:15, pw:"?"},
  {icon:"🧪", name:"Potion: heal 30 HP now", base:25, fn:p => { p.hp = Math.min(p.max, p.hp + 30); p.poison = 0; }},
  {icon:"🔥", name:"Fury scroll: next 2 hits do double", base:35, fn:p => { p.fury = 2; }},
  {icon:"❤️", name:"+15 max HP", base:30, fn:p => { p.max += 15; p.hp += 15; }},
  {icon:"⏱️", name:"+10% time on every word", base:40, fn:() => { G.tbonus += 0.1; }},
  {icon:"🪓", name:"+15% damage", base:40, fn:() => { G.dmgmult = Math.min(1.9, G.dmgmult + 0.15); }},
  {icon:"🗡️", name:"+30% damage (rare)", base:75, fn:() => { G.dmgmult = Math.min(1.9, G.dmgmult + 0.3); }},
  {icon:"✨", name:"More golden words", base:35, fn:() => { G.goldy += 0.08; }}
];

// Each visit shows 4 random items at randomized prices (always at least one power-up)
function rollStock(){
  const stock = [...SHOP_POOL].sort(() => Math.random() - 0.5).slice(0, 4)
    .map(it => ({...it, cost: Math.round(it.base * (0.7 + Math.random() * 0.6) / 5) * 5, sold:false}));
  if(!stock.some(it => it.pw)){
    const it = oneOf(SHOP_POOL.filter(x => x.pw));
    stock[3] = {...it, cost: Math.round(it.base * (0.7 + Math.random() * 0.6) / 5) * 5, sold:false};
  }
  return stock;
}

function shop(msg = ""){
  const p = G.p[0];
  const cards = G.stock.map(it => ({
    icon:it.icon, type: it.sold ? "sold" : "shop", name:it.name, desc: it.sold ? "Sold out" : `${it.cost} 🪙`,
    fn:() => {
      if(it.sold) return shop("That one is already sold.");
      if(G.coins < it.cost) return shop("Not enough gold.");
      if(it.pw && p.inv.length >= 3) return shop("Your power-up slots are full.");
      G.coins -= it.cost; it.sold = true;
      if(it.pw){
        const k = it.pw === "?" ? oneOf(Object.keys(POWERS)) : it.pw; p.inv.push(k);
        return shop(`You got ${POWERS[k].icon} ${POWERS[k].name}!`);
      }
      it.fn(p); shop("Bought: " + it.name);
    }
  }));
  showMap("🛒 Shop", msg || "The stock is different every visit.", [...cards,
    {label:"🎲 Reroll the stock (10 🪙)", fn:() => {
      if(G.coins < 10) return shop("Not enough gold to reroll.");
      G.coins -= 10; G.stock = rollStock(); shop("Fresh stock!");
    }},
    {label:"Leave the shop", fn:choosePath}], true);
}

function fight(kind){
  G.kind = kind; spawn(kind);
  const R = REALMS[G.realm]; setBg(R, kind === "boss");
  show("game"); draw(); nextRound();
}

function advWin(){
  const kind = G.kind, p = G.p[0];
  const gain = 15 + G.level*3 + (kind === "elite" ? 15 : 0) + (kind === "boss" ? 40 : 0);
  G.coins += gain; G.score += G.level*50 + gain*2; G.level++; G.step++;
  const heal = Math.round(p.max * 0.2); p.hp = Math.min(p.max, p.hp + heal);
  let note = `+${gain} 🪙 and +${heal} HP.`;
  if(kind === "elite") note += " " + award(0);
  if(kind === "boss"){
    if(G.realm >= REALMS.length - 1){ G.score += 500; return finish(true); }
    return showMap("Guardian defeated!", `${note} A Lost Word returns to you (${G.realm + 1} of ${REALMS.length}).`, [{label:"Travel onward", fn:() => { G.realm++; G.step = 0; story(); }}]);
  }
  showMap("Enemy defeated!", note, [{label:"Continue", fn:choosePath}]);
}

const HEROES = [
  {icon:"🛡️", gif:"knight.gif", name:"Knight", desc:"+30 max HP. Starts with a Shield.", fn:p => { p.max += 30; p.hp += 30; p.inv.push("shield"); }},
  {icon:"🧙", gif:"wizard.gif", name:"Wizard", desc:"Many more golden words. Starts with a Bomb.", fn:p => { G.goldy += 0.15; p.inv.push("bomb"); }},
  {icon:"🥷", gif:"rogue.gif", name:"Rogue", desc:"+15% time on every word. Starts with a Freeze.", fn:p => { G.tbonus += 0.15; p.inv.push("freeze"); }}
];

function heroSelect(){
  showMap("Choose your hero", "Each hero begins the journey with a different advantage.",
    HEROES.map(h => ({icon:h.icon, fig:heroFig(h.gif, h.icon), type:"shop", name:h.name, desc:h.desc, fn:() => { h.fn(G.p[0]); $("f0").innerHTML = heroFig(h.gif, h.icon); story(); }})), true);
}

// Creates the next enemy (used by both Adventure and Endless)
function spawn(kind){
  const boss = kind === "boss";
  const R = G.adv ? REALMS[G.realm] : REALMS[Math.floor((G.level-1)/5) % REALMS.length];
  const mega = boss && (G.adv ? G.realm === REALMS.length - 1 : G.level % 10 === 0);
  const k = Math.floor(Math.random() * R.enemies.length), nm = R.names[k];
  const name = boss ? (G.adv ? R.boss : mega ? "💀 Mega Boss" : "👑 Boss") : kind === "elite" ? "Elite " + nm : nm;
  const base = G.adv ? 40 + (G.level-1)*12 : 45 + (G.level-1)*18;
  const hp = Math.round(base * (mega ? (G.adv ? 2.5 : 3) : boss ? 2 : kind === "elite" ? 1.5 : 1));
  const e = newPlayer(name, hp);
  e.boss = boss; e.mega = mega; e.shield = boss;
  if(boss) bigPop("BOSS FIGHT!", "gold");
  e.elite = kind === "elite"; e.trait = boss ? "normal" : R.traits[k];
  e.sig = boss ? R.sig : ""; e.sigTip = R.sigTip;
  const T = TRAITS[e.trait];
  const label = boss ? R.sigLabel : T.label;
  G.p[1] = e; $("n1").textContent = name + (label ? ` (${label})` : ""); $("pn1").classList.toggle("boss", boss);
  $("f1").innerHTML = enemyFig(R, boss ? R.bossGif : R.gifs[k], boss ? R.bossIcon : R.enemies[k]);
  $("f1").classList.remove("dead"); play($("f1"), "enter");
  setScene(R, boss);
}

function newPlayer(name, max){ return {name, max, hp:max, locked:false, chars:0, correct:0, time:0, words:0, inv:[], shield:false, bomb:false, streak:0, fury:0, poison:0}; }

function start(mode){
  const adv = mode === "adventure"; if(adv) mode = "single";
  runId++;
  clearBg();
  G = { mode, adv, realm:0, step:0, coins:0, tbonus:0, goldy:0, dmgmult:1, kind:"normal", round:0, level:1, score:0, combo:0, busy:true, word:"", tStart:0, tLimit:0,
        p:[ newPlayer(mode==="pvp"?"Player 1":"You",100),
            mode==="pvp" ? newPlayer("Player 2",100) : newPlayer("Enemy",45) ] };
  if(mode !== "pvp"){
    const U = META.up, p0 = G.p[0];
    p0.max += 10 * (U.hp || 0); p0.hp = p0.max;
    G.tbonus += 0.03 * (U.time || 0); G.coins += 10 * (U.gold || 0); G.dmgmult += 0.03 * (U.dmg || 0);
  }
  $("n0").textContent = G.p[0].name; $("n1").textContent = G.p[1].name;
  $("f0").innerHTML = heroFig("wizard.gif", "🧙"); if(mode === "pvp") $("f1").innerHTML = heroFig("rogue.gif", "🥷", true);
  $("tbar").classList.toggle("enemy", mode !== "pvp"); $("tlabel").textContent = mode === "pvp" ? "TIME" : "ENEMY ATTACK";
  $("pn1").querySelector(".typebox").style.visibility = mode==="pvp" ? "" : "hidden";
  $("help").textContent = mode==="pvp"
    ? "Same word for both. Click your box or press Tab to switch. Press 1–3 in your own box to use a power-up. First clean finish hits."
    : "Finish the word before the bar runs out. Golden words drop power-ups: press 1–3 or click them. Land 5 hits in a row for 🔥 Fury. Bosses (every 5 levels) use power-ups too.";
  if(adv) heroSelect(); else { if(mode === "single") spawn("normal"); else setScene(oneOf(REALMS), false); show("game"); draw(); nextRound(); }
}

function nextRound(){
  G.round++;
  const tier = G.mode==="pvp" ? Math.floor((G.round-1)/3) : Math.floor((G.level-1)/2);
  G.word = pick(tier);
  const len = G.word.length;
  G.tLimit = G.mode==="pvp" ? 3 + len*0.6
           : (3 + len*0.55) * Math.max(0.55, 1 - (G.level-1)*0.06);
  G.tLimit *= 1 + G.tbonus;
  if(G.mode === "single"){ const e = G.p[1]; G.tLimit *= TRAITS[e.trait || "normal"].time * (e.enraged ? 0.8 : 1); }
  G.p.forEach(p => p.locked = false);
  G.busy = false; G.tStart = performance.now(); G.lastT = G.tStart;
  [0,1].forEach(i => { const inp = $("i"+i); inp.value = ""; inp._n = 0; inp.disabled = (G.mode==="single" && i===1); });
  G.gold = Math.random() < 0.25 + G.goldy;
  // Fog is rare: ~8% of words from level 3, ~40% on boss levels
  G.fog = G.mode==="single" && (G.p[1].boss ? Math.random() < 0.4 : G.level >= 3 && Math.random() < 0.08);
  // Mirror rounds: the word is shown normally, you type it backwards
  G.rev = !G.fog && ((G.mode==="single" && G.level >= 2) || (G.mode==="pvp" && G.round >= 3)) && Math.random() < (G.mode==="single" && G.p[1].sig === "curse" ? 0.45 : 0.12);
  if(G.rev) G.word = [...G.word].reverse().join("");
  if(G.mode==="single" && G.p[1].boss){ const b = G.p[1]; b.rounds = (b.rounds||0) + 1; G.charging = b.rounds % (b.mega ? 3 : 4) === 0; }
  else G.charging = false;
  $("pn1").classList.toggle("charging", !!G.charging);
  const bm = G.mode==="single" && G.p[1].boss ? bossMove() : "";
  const sg = bossSig();
  $("msg").textContent = [G.gold && "✨ Golden word! Finish it for a power-up.", G.fog && "🌫️ Fog! Letters are hidden.", G.rev && "🔄 Mirror! Type it backwards for +50% damage.", G.charging && "⚠️ SLAM incoming! Finish fast to interrupt it.", sg, bm].filter(Boolean).join(" ");
  if(G.charging){ bigPop("SLAM INCOMING!", "red"); tip("slam", "A boss slam is coming. Finish the word quickly to interrupt it, or it hits hard."); }
  else if(G.gold) bigPop("GOLDEN WORD!", "gold");
  if(G.gold) tip("gold", "Golden words drop a power-up. Press 1, 2 or 3 (or click it) to use one.");
  if(G.rev) tip("rev", "Mirror round: the word is shown normally, but you type it backwards for +50% damage.");
  if(G.fog) tip("fog", "Fog hides most letters until you type them.");
  if(G.mode==="single" && G.p[1].sig) tip("sig_" + G.p[1].sig, G.p[1].sigTip);
  else if(G.mode==="single" && G.p[1].boss) tip("boss", "Bosses start with a shield and use power-ups. Your first hit may be blocked.");
  draw(); renderWords(); $("i0").focus();
  cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
}

function renderWords(){
  const targets = G.mode==="pvp" ? [0,1] : [0];
  [0,1].forEach(i => {
    const el = $("w"+i);
    if(!targets.includes(i)){ el.textContent = ""; return; }
    const typed = $("i"+i).value;
    el.innerHTML = Array.from(G.word, (_, d) => {
      const n = G.word.length, k = G.rev ? n-1-d : d, ch = G.word[k];
      const cls = k >= typed.length ? "n" : typed[k] === ch ? "c" : "x";
      const hide = G.fog && k >= typed.length && k > 0 && ch !== " ";
      return `<span class="${cls}">${ch === " " ? "&nbsp;" : hide ? "•" : ch}</span>`;
    }).join("");
    el.classList.toggle("gold", !!G.gold);
  });
}

function tick(){
  if(!G || G.busy) return;
  const left = G.tLimit - (performance.now() - G.tStart) / 1000, pct = Math.max(0, left / G.tLimit * 100);
  $("tfill").style.width = pct + "%";
  $("tfill").style.backgroundColor = pct < 25 ? "#ff2a1a" : "";
  if(left <= 0){ timeout(); return; }
  raf = requestAnimationFrame(tick);
}

function grade(i){
  const typed = $("i"+i).value, w = G.word;
  let ok = 0; for(let k=0;k<w.length;k++) if(typed[k]===w[k]) ok++;
  return { ok, acc: ok/Math.max(w.length, typed.length) };
}

function damage(acc, ratio){ return Math.round(acc * (8 + 14*ratio)) + Math.min(G.combo,5); }

function submit(i){
  if(G.busy || G.p[i].locked) return;
  const secs = (performance.now()-G.tStart)/1000;
  const {ok, acc} = grade(i), p = G.p[i];
  p.chars += G.word.length; p.correct += ok; p.time += secs; p.words++;
  const ratio = Math.max(0, 1 - secs/G.tLimit);

  if(acc < MIN_ACC){
    if(G.mode==="pvp"){
      p.locked = true; $("i"+i).disabled = true;
      $("msg").textContent = p.name + " fumbled the word!";
      if(G.p.every(q => q.locked)) endRound("Both fumbled. No damage.", null);
      return;
    }
    return missSingle("Too many typos! The enemy strikes.");
  }
  let dmg = Math.round(damage(acc, ratio) * G.dmgmult);
  if(p.bomb){ dmg *= 2; p.bomb = false; }
  if(p.fury > 0){ dmg *= 2; p.fury--; }
  if(G.rev) dmg = Math.round(dmg * 1.5);
  const perfect = acc === 1 && ratio >= 0.5;
  if(perfect) dmg = Math.round(dmg * 1.25);
  if(G.mode==="single"){ G.combo++; G.score += dmg*10 + G.combo*5; }
  const dealt = hurt(1-i, dmg);
  let text = dealt ? `${p.name} hits for ${dealt}! (${Math.round(acc*100)}%)` : `${p.name === "You" ? "Your" : p.name + "’s"} hit was blocked by a shield! 🛡️`;
  if(!dealt && G.lastBlock === "guard") text = "The guard's shield absorbed your hit!";
  if(perfect){ text = "⭐ PERFECT! " + text; bigPop("PERFECT!", "gold"); }
  if(G.mode==="single" && G.charging && G.p[1].hp > 0){
    if(ratio >= 0.4) text += " ⚡ Slam interrupted!";
    else { const s = hurt(0, Math.round(bossDmg() * 1.3)); text += s ? ` 💥 SLAM −${s} HP!` : " 💥 Slam blocked by your shield!"; }
  }
  if(G.gold) text += " " + award(i);
  G.p[1-i].streak = 0; p.streak++;
  if(p.streak % 5 === 0){ p.fury = 2; text += " 🔥 FURY! Next 2 hits do double damage!"; bigPop("FURY!", "orange"); }
  endRound(text, G.p[1-i]);
}

function missSingle(text){
  G.combo = 0; G.p[0].streak = 0;
  const e = G.p[1], T = TRAITS[e.trait || "normal"];
  let dmg = Math.round((8 + G.level*1.2) * T.dmg * (e.mega ? 1.4 : e.boss ? 1.2 : e.elite ? 1.15 : 1) * (e.enraged ? 1.3 : 1) * (1 + 0.25 * (e.guards || 0)));
  if(G.charging) dmg = Math.round(dmg * 1.3);
  if(e.rage){ dmg = Math.round(dmg * 1.3); e.rage = false; }
  const dealt = hurt(0, dmg);
  let extra = "";
  if(dealt && e.trait === "drain"){ e.hp = Math.min(e.max, e.hp + Math.round(dealt * 0.5)); extra += " It drains your life!"; }
  if(dealt && e.trait === "poison" && G.p[0].poison === 0){ G.p[0].poison = 2; extra += " You are poisoned!"; }
  endRound(dealt ? text + ` −${dealt} HP` + extra : text + " Your shield blocked it! 🛡️", G.p[0]);
}

function timeout(){
  if(G.busy) return;
  if(G.mode==="single") missSingle("Time’s up! The enemy strikes.");
  else endRound("Time’s up! No damage.", null);
}

function pop(i, txt, cls){
  const el = document.createElement("span"); el.className = "pop " + cls; el.textContent = txt;
  $("pn"+i).appendChild(el); setTimeout(() => el.remove(), 900);
}

function hurt(i, dmg){
  const p = G.p[i];
  if(i === 1 && p.guards > 0){
    play($("f0"), "atk"); p.guards--; guardDown(); shieldBreak(1, true); G.lastBlock = "guard";
    pop(i, "💂 guard blocked", "blk"); return 0;
  }
  G.lastBlock = "shield";
  play($("f"+i), "hit"); play($("f"+(1-i)), "atk");
  if(p.shield){ p.shield = false; shieldBreak(i, false); pop(i, "🛡️ blocked", "blk"); return 0; }
  p.hp = Math.max(0, p.hp - dmg);
  if(i === 1 && p.sig === "phase" && !p.enraged && p.hp > 0 && p.hp <= p.max / 2){
    p.enraged = true; bigPop("DRAGON ENRAGED!", "red");
  } pop(i, "−" + dmg, "dmg");
  return dmg;
}

function endRound(text, target){
  G.busy = true; cancelAnimationFrame(raf);
  if(G.mode==="single" && G.p[0].poison > 0 && G.p[1].hp > 0){
    G.p[0].hp = Math.max(0, G.p[0].hp - 3); G.p[0].poison--; text += " ☠️ Poison −3 HP";
  }
  $("msg").textContent = text; draw();
  const id = runId;
  setTimeout(() => {
    if(id !== runId) return;
    if(G.mode==="single"){
      if(G.p[0].hp <= 0) return finish();
      if(G.p[1].hp <= 0){
        if(G.adv) return advWin();
        G.score += G.level*50; G.level++;
        spawn(G.level % 5 === 0 ? "boss" : "normal");
        G.p[0].hp = Math.min(G.p[0].max, G.p[0].hp + 15);
        $("msg").textContent = "Enemy defeated! Level " + G.level + (G.p[1].mega ? " – MEGA BOSS!" : G.p[1].boss ? " – BOSS FIGHT!" : ""); draw();
        return setTimeout(() => { if(id === runId) nextRound(); }, 1000);
      }
    } else if(G.p.some(p => p.hp <= 0)) return finish();
    nextRound();
  }, 1100);
}

function draw(){
  G.p.forEach((p,i) => {
    const pct = p.hp/p.max*100, h = $("h"+i);
    $("f"+i).classList.toggle("dead", p.hp <= 0);
    $("f"+i).classList.toggle("shielded", !!p.shield || (p.guards || 0) > 0);
    $("f"+i).classList.toggle("gshield", !p.shield && (p.guards || 0) > 0);
    h.style.width = pct + "%";
    h.style.backgroundColor = pct > 50 ? "var(--ok)" : pct > 25 ? "var(--warn)" : "var(--bad)";
    $("t"+i).textContent = `${p.hp} / ${p.max} HP${p.shield ? " 🛡️" : ""}${p.bomb ? " 💣" : ""}${p.fury > 0 ? " 🔥" : ""}${p.rage ? " 💢" : ""}${p.poison > 0 ? " ☠️" : ""}`;
    $("inv"+i).innerHTML = p.inv.map((k,s) => `<button class="pw" data-i="${i}" data-s="${s}" title="${POWERS[k].name}">${sprite(POWERS[k].icon)}<small>${s+1}</small></button>`).join("");
  });
  $("score").textContent = G.score;
  $("pn0").classList.toggle("low", G.p[0].hp > 0 && G.p[0].hp / G.p[0].max <= 0.25);
  $("combo").innerHTML = G.mode==="single" ? `Combo <b>${G.combo}</b>` : "";
  $("info").innerHTML = G.adv ? `${REALMS[G.realm].icon} <b>${REALMS[G.realm].name}</b>, ${G.kind === "boss" ? "guardian fight" : "stage " + (G.step + 1) + " of 4"}` : G.mode==="single" ? `Level <b>${G.level}</b>` : `Round <b>${G.round}</b>`;
}

const wpm = p => p.time > 0 ? Math.round((p.correct/5) / (p.time/60)) : 0;
const accp = p => p.chars ? Math.round(p.correct/p.chars*100) : 0;

function finish(won){
  let html = "";
  if(G.mode==="single"){
    const best = Math.max(G.score, +localStorage.getItem("keystrikeHigh")||0);
    const isNew = G.score >= best && G.score > 0;
    try{ localStorage.setItem("keystrikeHigh", best); }catch(e){}
    $("hs").textContent = best;
    const p = G.p[0];
    const glory = Math.floor(G.score / 150) + (won ? 20 : 0) + (G.adv ? G.realm * 3 : 0);
    META.glory += glory; saveMeta();
    html = `<h2>${won ? "🏆 Adventure complete!" : "Game over"}</h2><table>
      ${G.adv ? `<tr><th>Realm</th><td>${REALMS[G.realm].icon} ${REALMS[G.realm].name}</td></tr>` : ""}
      <tr><th>Level reached</th><td>${G.level}</td></tr>
      <tr><th>Score</th><td>${G.score}${isNew ? " (new high score!)" : ""}</td></tr>
      <tr><th>Typing speed</th><td>${wpm(p)} WPM</td></tr>
      <tr><th>Accuracy</th><td>${accp(p)}%</td></tr>
      <tr><th>High score</th><td>${best}</td></tr>
      <tr><th>Glory earned</th><td>+${glory}</td></tr></table>`;
  } else {
    const [a,b] = G.p, win = a.hp > 0 ? a : b;
    html = `<h2>${win.name} wins!</h2><table>
      <tr><th></th><th>${a.name}</th><th>${b.name}</th></tr>
      <tr><th>HP left</th><td>${a.hp}</td><td>${b.hp}</td></tr>
      <tr><th>Speed</th><td>${wpm(a)} WPM</td><td>${wpm(b)} WPM</td></tr>
      <tr><th>Accuracy</th><td>${accp(a)}%</td><td>${accp(b)}%</td></tr>
      <tr><th>Words typed</th><td>${a.words}</td><td>${b.words}</td></tr></table>`;
  }
  $("resBox").innerHTML = html + `<button id="again">Play again</button> <button class="ghost" id="home">Menu</button>`;
  const mode = G.adv ? "adventure" : G.mode;
  $("again").onclick = () => start(mode);
  $("home").onclick = () => { clearBg(); show("menu"); };
  show("results");
}

[0,1].forEach(i => {
  const inp = $("i"+i);
  inp.addEventListener("input", () => {
    if(!G || G.busy) return;
    renderWords();
    const v = inp.value, k = v.length - 1;
    if(k >= 0 && inp._n < v.length){ if(v[k] !== G.word[k]) shake(inp); }
    inp._n = v.length;
    if(v.length >= G.word.length) submit(i);
  });
  inp.addEventListener("keydown", e => {
    if(e.key==="Enter") submit(i);
    if(["1","2","3"].includes(e.key)){ e.preventDefault(); usePower(i, +e.key-1); }
  });
});

function leave(){
  const inRun = $("game").classList.contains("on") || $("map").classList.contains("on");
  if(G && inRun && !confirm("Leave this game? Your progress will be lost.")) return;
  runId++; cancelAnimationFrame(raf); if(G) G.busy = true;
  clearBg(); show("menu");
}

document.addEventListener("click", e => {
  if(e.target.closest(".back")) return leave();
  const b = e.target.closest(".pw"); if(!b) return;
  usePower(+b.dataset.i, +b.dataset.s); $("i"+b.dataset.i).focus();
});

$("bAdv").onclick = () => start("adventure");
$("bSingle").onclick = () => start("single");
$("bPvp").onclick = () => start("pvp");
try{ $("hs").textContent = localStorage.getItem("keystrikeHigh") || 0; }catch(e){}

// Esc also goes back to the main menu
document.addEventListener("keydown", e => {
  if(e.key === "Escape" && !$("menu").classList.contains("on")) leave();
});


// ---------- Sprite setup: shows every character the way it appears in a fight ----------
function setup(){
  const items = [];
  HEROES.forEach(h => items.push({file:PATHS.hero + h.gif, alt:"class/" + h.gif, emoji:h.icon, right:false, label:h.name}));
  REALMS.forEach(R => {
    R.gifs.forEach((g, i) => items.push({file:PATHS.enemy + R.folder + "/" + g, alt:PATHS.enemy + g, emoji:R.enemies[i], right:true, label:R.names[i]}));
    items.push({file:PATHS.enemy + R.folder + "/" + R.bossGif, alt:PATHS.enemy + R.bossGif, emoji:R.bossIcon, right:true, label:R.boss});
  });
  items.push({file:PATHS.enemy + REALMS[4].folder + "/guard.gif", alt:[PATHS.enemy + "guard.gif", PATHS.enemy + REALMS[4].folder + "/guard.png", PATHS.enemy + "guard.png"], emoji:"💂", right:true, label:"Royal Guard"});
  const draw = () => {
    $("setupBox").innerHTML = `<h2>Sprite facing</h2><p>Heroes must face right. Enemies and bosses must face left. Press Flip on any that face the wrong way. Your choices are saved.</p><div class="sgrid">`
      + items.map((it, i) => `<div class="scell"><div class="sfig">${fig(it.file, it.emoji, it.right, it.alt)}</div><small>${it.label}</small><button data-i="${i}">Flip</button></div>`).join("") + `</div>`;
  };
  $("setupBox").onclick = e => {
    const b = e.target.closest("button"); if(!b) return;
    const name = items[+b.dataset.i].file.split("/").pop();
    FLIPS[name] = !(FLIPS[name] ?? FACES_LEFT.includes(name));
    try{ localStorage.setItem("keystrikeFlips", JSON.stringify(FLIPS)); }catch(err){}
    draw();
  };
  draw(); show("setup");
}
$("bSetup").onclick = setup;
$("bSetupBack").onclick = () => show("menu");

// ---------- Turn every emoji in the page into a matching pixel sprite ----------
const EMO = /\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}\uFE0F?)*/gu;
function pixelEmoji(root){
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes = [];
  while(w.nextNode()) nodes.push(w.currentNode);
  nodes.forEach(n => {
    if(n.parentNode.closest("input,script,style")) return;
    EMO.lastIndex = 0; if(!EMO.test(n.nodeValue)) return;
    let changed = false;
    const html = n.nodeValue.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(EMO, m => {
      const s = sprite(m, 16);
      if(!s.startsWith("<img")) return m;
      changed = true; return s.replace('class="spr"', 'class="emo"');
    });
    if(!changed) return;
    const span = document.createElement("span"); span.innerHTML = html;
    n.replaceWith(...[...span.childNodes]);
  });
}
if(typeof MutationObserver !== "undefined"){
  let pxBusy = false;
  new MutationObserver(() => { if(pxBusy) return; pxBusy = true; pixelEmoji(document.body); pxBusy = false; })
    .observe(document.body, {childList:true, subtree:true, characterData:true});
}

// ---------- 2. How to play ----------
function howto(){
  try{ localStorage.setItem("keystrikeSeen", "1"); }catch(e){}
  $("howtoBox").innerHTML = `<h2>How to play</h2>
    <p><b>Type the word</b> on your side before the bar runs out. Faster and cleaner typing deals more damage. Under 60% accuracy counts as a miss and the enemy strikes.</p>
    <p><b>The red bar at the top is the enemy's attack.</b> Finish the word before it empties, or the enemy strikes. Each enemy has a trait: <b>Quick</b> gives you less time and hits softer, <b>Heavy</b> gives you more time but hits hard, <b>Venom</b> poisons you, <b>Drain</b> heals itself.</p>
    <p><b>Golden words</b> drop power-ups. Press <b>1, 2, 3</b> (or click) to use them: ❄️ Freeze adds time, 💣 Bomb doubles your next hit, 💚 Heal restores HP, 🛡️ Shield blocks a hit.</p>
    <p><b>Combos:</b> 5 hits in a row starts 🔥 Fury (double damage). A 100% accurate word finished fast is a ⭐ Perfect strike.</p>
    <p><b>Twists:</b> 🔄 Mirror words must be typed backwards for bonus damage. 🌫️ Fog hides the letters.</p>
    <p><b>Bosses</b> start with a shield, use power-ups, and each has a signature ability: the Treant regrows, the Pharaoh curses your words, the Frost Giant freezes your typing box, the Lava Dragon enrages at half HP, and the King's guards raise shields around him. When you see ⚠️ SLAM, finish the word fast to interrupt it.</p>
    <p><b>Adventure:</b> pick a hero, choose your path (fight, elite, campfire, chest, shop), beat each realm's guardian and win back all 5 Lost Words. Finished runs earn Glory to spend in the Training Hall.</p>
    <button id="hwBack">Got it</button>`;
  $("hwBack").onclick = () => show("menu"); show("howto");
}

// ---------- 6. Glory and the Training Hall (kept between runs) ----------
let META = {glory:0, up:{hp:0, time:0, gold:0, dmg:0}};
try{ META = Object.assign(META, JSON.parse(localStorage.getItem("keystrikeMeta") || "{}")); }catch(e){}
const saveMeta = () => { try{ localStorage.setItem("keystrikeMeta", JSON.stringify(META)); }catch(e){} };
const UPG = [
  {k:"hp", icon:"❤️", name:"Toughness", desc:"+10 max HP per level"},
  {k:"time", icon:"⏱️", name:"Focus", desc:"+3% time per level"},
  {k:"gold", icon:"🪙", name:"Treasure", desc:"+10 starting gold per level"},
  {k:"dmg", icon:"⚔️", name:"Might", desc:"+3% damage per level"}
];
function hall(msg = ""){
  const cards = UPG.map(u => { const lv = META.up[u.k] || 0, cost = 15 * (lv + 1), maxed = lv >= 5;
    return `<button class="card ${maxed ? "sold" : "shop"}" data-k="${u.k}"><span class="ci">${sprite(u.icon)}</span><b>${u.name} ${lv}/5</b><small>${u.desc}</small><small>${maxed ? "Maxed" : cost + " Glory"}</small></button>`; }).join("");
  $("hallBox").innerHTML = `<h2>Training Hall</h2><p>You have <b>${META.glory}</b> Glory. ${msg || "Finish runs to earn more."}</p><div class="choices cards">${cards}</div>`;
  $("hallBox").onclick = e => {
    const b = e.target.closest("button"); if(!b) return;
    const k = b.dataset.k, lv = META.up[k] || 0, cost = 15 * (lv + 1);
    if(lv >= 5) return hall("Already maxed.");
    if(META.glory < cost) return hall("Not enough Glory.");
    META.glory -= cost; META.up[k] = lv + 1; saveMeta(); hall("Upgraded!");
  };
  show("hall");
}
$("bHow").onclick = howto;
$("bHall").onclick = () => hall();
try{ if(!localStorage.getItem("keystrikeSeen")) howto(); }catch(e){}

// If dark castle/shield.gif exists, the guards' shield uses that animation (see style.css); otherwise a CSS bubble is drawn
if(typeof Image !== "undefined"){
  const probe = new Image();
  probe.onload = () => document.documentElement.classList.add("hasShieldGif");
  probe.src = encodeURI(PATHS.enemy + "dark castle/shield.gif");
}
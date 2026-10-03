import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import { PointerLockControls } from "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/PointerLockControls.js";

const $ = id => document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x081018);
scene.fog=new THREE.Fog(0x081018,35,120);
const camera=new THREE.PerspectiveCamera(78,innerWidth/innerHeight,.05,180);
camera.position.set(0,1.7,24);
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
$("game").appendChild(renderer.domElement);

const controls=new PointerLockControls(camera,document.body);
controls.pointerSpeed=.65;
scene.add(camera);

const hemi=new THREE.HemisphereLight(0x8bd8ff,0x182028,1.8); scene.add(hemi);
const sun=new THREE.DirectionalLight(0xccecff,2.2); sun.position.set(18,30,10); sun.castShadow=true; sun.shadow.mapSize.set(1024,1024); scene.add(sun);
const fill=new THREE.PointLight(0x2bbcff,40,35); fill.position.set(0,8,0); scene.add(fill);

const mats={
 floor:new THREE.MeshStandardMaterial({color:0x59636b,roughness:.92,metalness:.02}),
 wall:new THREE.MeshStandardMaterial({color:0x27333c,roughness:.8,metalness:.08}),
 trim:new THREE.MeshStandardMaterial({color:0x8da0aa,roughness:.4,metalness:.5}),
 blue:new THREE.MeshStandardMaterial({color:0x2299cc,emissive:0x0b3548,emissiveIntensity:1.5}),
 orange:new THREE.MeshStandardMaterial({color:0xff744e,emissive:0x4a160c,emissiveIntensity:1.3}),
 crate:new THREE.MeshStandardMaterial({color:0x7b634b,roughness:1}),
 glass:new THREE.MeshStandardMaterial({color:0x6be4ff,transparent:true,opacity:.32,roughness:.15,metalness:.2}),
};
const colliders=[];
function box(x,y,z,sx,sy,sz,mat=mats.wall,solid=true){
 const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;scene.add(m);
 if(solid) colliders.push({x1:x-sx/2,x2:x+sx/2,y1:y-sy/2,y2:y+sy/2,z1:z-sz/2,z2:z+sz/2});
 return m;
}
function cylinder(x,y,z,r,h,mat){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,12),mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;scene.add(m);return m}

box(0,-.35,0,72,.7,52,mats.floor,false);
for(const x of [-36,36])box(x,4,0,1,8,52);
for(const z of [-26,26])box(0,4,z,72,8,1);
for(const p of [[-15,2,-8,14,4,2],[15,2,8,14,4,2],[-2,2,-16,2,4,13],[2,2,16,2,4,13],[0,2,0,6,4,2],[-23,1,8,5,2,5],[23,1,-8,5,2,5]]){
 box(...p,mats.wall);
}
for(const p of [[-10,1,-19,4,2,4],[10,1,19,4,2,4],[-24,1,-4,3,2,3],[24,1,4,3,2,3],[-8,1,8,3,2,3],[8,1,-8,3,2,3]])box(...p,mats.crate);
for(const x of [-29,29]){box(x,1,0,1,2,14,mats.trim,false);box(x*.98,2.7,0,.2,3,14,x<0?mats.blue:mats.orange,false)}
for(const x of [-25,25]){const p=cylinder(x,1.2,0,1.2,2.4,x<0?mats.blue:mats.orange);p.material.emissive=p.material.color;p.material.emissiveIntensity=1.4}
for(let i=0;i<18;i++){const x=(Math.random()-.5)*60,z=(Math.random()-.5)*40; cylinder(x,.3,z,.08,1.5,mats.trim).rotation.z=Math.PI/2}

const player={hp:100,energy:100,ammo:12,reserve:48,credits:800,team:"blue",speed:7,armor:0,damage:24,fireRate:7,reload:1.45,shotTimer:0,reloading:false,grounded:true,vy:0,score:0};
let round=1,roundTime=120,playing=false,ended=false;
let keys={}, bots=[], beams=[], particles=[], last=performance.now(), mouseDown=false;
let mobileMove={x:0,y:0}, touchLook={active:false,x:0,y:0}, mobileFire=false;
const spawnBlue=[new THREE.Vector3(-29,1.7,0),new THREE.Vector3(-27,1.7,5),new THREE.Vector3(-27,1.7,-5)];
const spawnOrange=[new THREE.Vector3(29,1.7,0),new THREE.Vector3(27,1.7,5),new THREE.Vector3(27,1.7,-5)];

function loadSettings(){
 const s=JSON.parse(localStorage.getItem("neonRelaySettings")||"{}");
 controls.pointerSpeed=s.sens??.65; camera.fov=s.fov??78; camera.updateProjectionMatrix();
 $("volume").value=s.volume??.65;$("sens").value=s.sens??.65;$("fov").value=s.fov??78;$("quality").value=s.quality??"high";
}
loadSettings();

const AudioCtx=window.AudioContext||window.webkitAudioContext;let audio;
function beep(freq=440,dur=.07,type="sine",gain=.035){
 if(!audio)audio=new AudioCtx(); const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=freq;g.gain.value=gain*Number($("volume").value||.65);o.connect(g).connect(audio.destination);o.start();g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+dur);o.stop(audio.currentTime+dur)
}
function feed(text,enemy=false){const e=document.createElement("div");e.className="feedline"+(enemy?" enemy":"");e.textContent=text;$("feed").prepend(e);setTimeout(()=>e.remove(),3200)}
function particle(pos,color=0x6be4ff){
 const m=new THREE.Mesh(new THREE.SphereGeometry(.07,6,6),new THREE.MeshBasicMaterial({color}));m.position.copy(pos);scene.add(m);particles.push({m,life:.35,v:new THREE.Vector3((Math.random()-.5)*4,Math.random()*3,(Math.random()-.5)*4)})
}
function beam(a,b,color=0x6be4ff){
 const g=new THREE.BufferGeometry().setFromPoints([a,b]),m=new THREE.LineBasicMaterial({color,transparent:true,opacity:.9});const l=new THREE.Line(g,m);scene.add(l);beams.push({l,life:.09})
}
function createBot(team,pos,id){
 const g=new THREE.Group();const body=new THREE.Mesh(new THREE.CapsuleGeometry(.42,.9,4,8),team==="blue"?mats.blue:mats.orange);body.position.y=.95;body.castShadow=true;
 const head=new THREE.Mesh(new THREE.SphereGeometry(.3,10,8),team==="blue"?mats.blue:mats.orange);head.position.y=1.75;g.add(body,head);g.position.copy(pos);scene.add(g);
 return {g,team,hp:100,id,state:"patrol",target:null,cool:Math.random(),pathIndex:Math.floor(Math.random()*4),alive:true}
}
function resetBots(){
 bots.forEach(b=>scene.remove(b.g));bots=[];
 const pts=[new THREE.Vector3(-14,0,0),new THREE.Vector3(-8,0,-10),new THREE.Vector3(0,0,10),new THREE.Vector3(14,0,0),new THREE.Vector3(8,0,-10),new THREE.Vector3(0,0,-10)];
 for(let i=0;i<5;i++)bots.push(createBot("orange",spawnOrange[i%3].clone().add(new THREE.Vector3(0,0,(i-2)*3)),i));
 for(let i=0;i<4;i++)bots.push(createBot("blue",spawnBlue[i%3].clone().add(new THREE.Vector3(0,0,(i-1.5)*3)),100+i));
 bots.forEach((b,i)=>b.route=pts.map(v=>v.clone()).sort(()=>Math.random()-.5));
}
function respawn(){
 const s=player.team==="blue"?spawnBlue[0]:spawnOrange[0];camera.position.copy(s);player.hp=100;player.energy=100;player.ammo=12;player.reserve=48;player.reloading=false;
}
function beginRound(){
 ended=false;playing=true;roundTime=120;player.score=0;respawn();resetBots();$("roundText").textContent=`ROUND ${round}`;$("roundEnd").classList.add("hidden");$("menu").classList.add("hidden");updateHUD();feed(`Раунд ${round} начался`);beep(700,.12,"square")
}
function finish(winner,reason){
 if(ended)return;ended=true;playing=false;controls.unlock();$("roundWinner").textContent=winner==="blue"?"BLUE TEAM":"ORANGE TEAM";$("roundReason").textContent=reason;$("roundEnd").classList.remove("hidden");
 if(winner==="blue"){player.credits+=450;player.score+=1;$("blueScore").textContent=Number($("blueScore").textContent)+1}else $("orangeScore").textContent=Number($("orangeScore").textContent)+1;
}
function aabb(pos,r=.35){
 for(const c of colliders)if(pos.x+r>c.x1&&pos.x-r<c.x2&&pos.z+r>c.z1&&pos.z-r<c.z2&&pos.y+.9>c.y1&&pos.y-.9<c.y2)return true;return false
}
function movePlayer(dt){
 const dir=new THREE.Vector3(
   ((keys.KeyD?1:0)-(keys.KeyA?1:0))+mobileMove.x,
   0,
   ((keys.KeyS?1:0)-(keys.KeyW?1:0))+mobileMove.y
 );
 if(dir.lengthSq())dir.normalize();
 const speed=player.speed*(keys.ShiftLeft?1.35:1)*(keys.ControlLeft?.58:1);
 const forward=new THREE.Vector3();camera.getWorldDirection(forward);forward.y=0;forward.normalize();const right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0)).normalize();
 const vel=forward.multiplyScalar(dir.z*speed*dt).add(right.multiplyScalar(dir.x*speed*dt));
 const next=camera.position.clone().add(vel);if(!aabb(next,.32))camera.position.copy(next);
 if(keys.Space&&player.grounded){player.vy=7;player.grounded=false}
 player.vy-=18*dt;camera.position.y+=player.vy*dt;
 if(camera.position.y<=1.7){camera.position.y=1.7;player.vy=0;player.grounded=true}
}
function shoot(){
 if(!playing||player.reloading||player.ammo<=0||player.shotTimer>0)return;
 player.ammo--;player.shotTimer=1/player.fireRate;beep(170,.045,"sawtooth",.025);
 const origin=camera.position.clone();const dir=new THREE.Vector3();camera.getWorldDirection(dir);
 const spread=.018*(keys.MouseRight?.45:1);dir.x+=(Math.random()-.5)*spread;dir.y+=(Math.random()-.5)*spread;dir.z+=(Math.random()-.5)*spread;dir.normalize();
 const ray=new THREE.Raycaster(origin,dir,0,65);const targets=bots.filter(b=>b.alive).map(b=>b.g);const hit=ray.intersectObjects(targets,true)[0];
 let end=origin.clone().add(dir.multiplyScalar(65));
 if(hit){end.copy(hit.point);let bot=bots.find(b=>hit.object===b.g.children[0]||hit.object===b.g.children[1]);if(bot){const head=hit.object===bot.g.children[1];const dmg=player.damage*(head?1.8:1);bot.hp-=dmg;feed(`YOU → ${bot.team.toUpperCase()}-${bot.id}`,true);for(let i=0;i<5;i++)particle(hit.point,0x6be4ff);if(bot.hp<=0){bot.alive=false;scene.remove(bot.g);player.credits+=100;feed(`TAGGED ${bot.team.toUpperCase()}-${bot.id}`);beep(900,.08,"triangle")}}}
 beam(origin,end);if(player.ammo===0)beep(90,.12,"square")
}
function reload(){if(player.reloading||player.ammo===12||player.reserve<=0)return;player.reloading=true;beep(260,.06,"sine");setTimeout(()=>{const n=Math.min(12-player.ammo,player.reserve);player.ammo+=n;player.reserve-=n;player.reloading=false},player.reload*1000)}
function botThink(b,dt){
 if(!b.alive)return;const toP=camera.position.clone().sub(b.g.position);const dist=toP.length();
 if(b.team==="orange"&&dist<30){b.state="attack";b.target=camera.position.clone()}else if(b.state!=="attack"){const t=b.route[b.pathIndex];if(b.g.position.distanceTo(t)<1.2)b.pathIndex=(b.pathIndex+1)%b.route.length;b.target=t}
 if(b.target){const d=b.target.clone().sub(b.g.position);d.y=0;if(d.length()>1){d.normalize();const next=b.g.position.clone().addScaledVector(d,dt*2.4);if(!aabb(next,.45))b.g.position.copy(next)}b.g.lookAt(b.target.x,b.g.position.y,b.target.z)}
 b.cool-=dt;if(b.team==="orange"&&dist<24&&b.cool<=0){b.cool=.8+Math.random()*.7;const o=b.g.position.clone();o.y=1.45;const d=camera.position.clone().sub(o).normalize();const end=o.clone().addScaledVector(d,dist);beam(o,end,0xff765e);if(Math.random()<.22){player.hp-=Math.max(5,16*(1-dist/30));$("damage").classList.remove("dead");void $("damage").offsetWidth;$("damage").classList.add("dead");beep(80,.08,"square");if(player.hp<=0){player.credits=Math.max(0,player.credits-100);respawn();feed("YOU RE-ENTERED")}}}
}
function updateHUD(){
 $("hp").textContent=Math.max(0,Math.ceil(player.hp));$("energy").textContent=Math.ceil(player.energy);$("ammo").textContent=`${player.ammo} / ${player.reserve}`;$("credits").textContent=player.credits
}
function updateShop(){
 const items=[["ЭНЕРГИЯ +25","energy",250],["ЗАЩИТА +25","armor",350],["СИЛА МЕТКИ +5","damage",400],["СКОРОСТЬ +8%","speed",450]];
 $("shopItems").innerHTML=items.map(([n,k,c])=>`<div class="shopItem"><div><b>${n}</b><small>${c} кредитов</small></div><button data-k="${k}" data-c="${c}">КУПИТЬ</button></div>`).join("");
 document.querySelectorAll(".shopItem button").forEach(btn=>btn.onclick=()=>{const c=+btn.dataset.c,k=btn.dataset.k;if(player.credits<c)return;if(k==="energy")player.energy=clamp(player.energy+25,0,125);if(k==="armor")player.armor=clamp(player.armor+25,0,100);if(k==="damage")player.damage+=5;if(k==="speed")player.speed*=1.08;player.credits-=c;updateHUD();updateShop();beep(820,.06,"triangle")})
}
function tick(dt){
 if(!playing)return;
 roundTime-=dt;if(roundTime<=0){finish("blue","Время вышло — BLUE удерживает контроль.");return}
 player.shotTimer=Math.max(0,player.shotTimer-dt);player.energy=clamp(player.energy+dt*5,0,100);
 movePlayer(dt);bots.forEach(b=>botThink(b,dt));
 beams.forEach(x=>x.life-=dt);beams=beams.filter(x=>{if(x.life<=0){scene.remove(x.l);return false}x.l.material.opacity=x.life/.09;return true});
 particles.forEach(x=>{x.life-=dt;x.m.position.addScaledVector(x.v,dt);x.v.y-=8*dt});particles=particles.filter(x=>{if(x.life<=0){scene.remove(x.m);return false}return true});
 const aliveEnemy=bots.filter(b=>b.alive&&b.team!=="blue").length;if(aliveEnemy===0)finish("blue","Все соперники отмечены.");
 $("timer").textContent=`${String(Math.floor(roundTime/60)).padStart(2,"0")}:${String(Math.floor(roundTime%60)).padStart(2,"0")}`;updateHUD();
}
function animate(now=performance.now()){requestAnimationFrame(animate);const dt=Math.min((now-last)/1000,.05);last=now;tick(dt);renderer.render(scene,camera)}
animate();

$("play").onclick=()=>{audio?.resume();beginRound();if(matchMedia("(pointer:fine)").matches)controls.lock()};
$("nextRound").onclick=()=>{round++;beginRound();controls.lock()};
$("shopOpen").onclick=()=>{updateShop();$("shop").classList.remove("hidden")};
$("shopClose").onclick=()=>$("shop").classList.add("hidden");
$("settingsOpen").onclick=()=>$("settings").classList.remove("hidden");
$("settingsClose").onclick=()=>{const s={volume:+$("volume").value,sens:+$("sens").value,fov:+$("fov").value,quality:$("quality").value};localStorage.setItem("neonRelaySettings",JSON.stringify(s));controls.pointerSpeed=s.sens;camera.fov=s.fov;camera.updateProjectionMatrix();$("settings").classList.add("hidden")};
controls.addEventListener("unlock",()=>{if(playing&&!ended) $("menu").classList.remove("hidden")});
addEventListener("keydown",e=>{keys[e.code]=true;if(e.code==="KeyR")reload();if(e.code==="Digit1")player.damage=24;if(e.code==="Digit2")player.damage=31;if(e.code==="Digit3")player.damage=40;if(e.code==="Escape"&&playing&&!ended)$("menu").classList.remove("hidden")});
addEventListener("keyup",e=>keys[e.code]=false);
addEventListener("mousedown",e=>{if(e.button===0){mouseDown=true;shoot()}if(e.button===2)keys.MouseRight=true});
addEventListener("mouseup",e=>{if(e.button===0)mouseDown=false;if(e.button===2)keys.MouseRight=false});
addEventListener("contextmenu",e=>e.preventDefault());

function bindMobile(){
 const zone=$("stickZone"), stick=$("stick"), look=$("lookZone");
 if(!zone)return;
 let sid=null;
 const updateStick=e=>{
   const r=zone.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2;
   let x=e.clientX-cx,y=e.clientY-cy,max=r.width*.34,d=Math.hypot(x,y);
   if(d>max){x=x/d*max;y=y/d*max}
   stick.style.transform=`translate(${x}px,${y}px)`;
   mobileMove.x=clamp(x/max,-1,1);mobileMove.y=clamp(y/max,-1,1);
 };
 zone.addEventListener("pointerdown",e=>{sid=e.pointerId;zone.setPointerCapture(sid);updateStick(e)});
 zone.addEventListener("pointermove",e=>{if(e.pointerId===sid)updateStick(e)});
 const release=()=>{sid=null;mobileMove.x=0;mobileMove.y=0;stick.style.transform="translate(0,0)"};
 zone.addEventListener("pointerup",release);zone.addEventListener("pointercancel",release);

 let lastX=0,lastY=0;
 look.addEventListener("pointerdown",e=>{touchLook.active=true;lastX=e.clientX;lastY=e.clientY;look.setPointerCapture(e.pointerId)});
 look.addEventListener("pointermove",e=>{
   if(!touchLook.active)return;
   const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;
   camera.rotation.y-=dx*(+$("sens").value||.65)*.004;
   camera.rotation.x-=dy*(+$("sens").value||.65)*.003;
   camera.rotation.x=clamp(camera.rotation.x,-1.45,1.45);
 });
 const endLook=()=>touchLook.active=false;
 look.addEventListener("pointerup",endLook);look.addEventListener("pointercancel",endLook);

 const hold=(id,on,off)=>{
   const b=$(id);b.addEventListener("pointerdown",e=>{e.preventDefault();on()});
   b.addEventListener("pointerup",e=>{e.preventDefault();off&&off()});
   b.addEventListener("pointercancel",()=>off&&off());
 };
 hold("btnFire",()=>{mobileFire=true;shoot()},()=>mobileFire=false);
 hold("btnJump",()=>keys.Space=true,()=>keys.Space=false);
 hold("btnCrouch",()=>keys.ControlLeft=true,()=>keys.ControlLeft=false);
 $("btnReload").addEventListener("pointerdown",e=>{e.preventDefault();reload()});
}
bindMobile();
addEventListener("mousemove",()=>{if(mouseDown)shoot()});
addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});

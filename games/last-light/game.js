(function(){
"use strict";

/* ================= constants ================= */
const W=320, H=192, T=16, RW=20, RH=12;
const ROOMS=70, TIME_LIMIT=20*60, GRACE=40;
const DIRS=[[0,-1,"n"],[1,0,"e"],[0,1,"s"],[-1,0,"w"]];
const DOOR={n:{x:160,y:7}, s:{x:160,y:185}, w:{x:7,y:96}, e:{x:313,y:96}};
const RADIUS=[0,30,54,82];          // light radius by lantern level
const BURN=[0,0.35,0.6,1.0];        // fuel per second by level
const SLUDGE_RATE=[5,0.8,-2,-3.5];  // percent per second by level (index 0 = no light)
const SW_DEFAULTS={sound:true,music:true,vibration:true,touchSize:"m",touchAlpha:0.75,leftHanded:false,inputMode:"auto"};
let SW=SW_DEFAULTS;
function readSettings(){try{SW=Object.assign({},SW_DEFAULTS,JSON.parse(localStorage.getItem("shanoware.settings"))||{});}catch(e){SW=SW_DEFAULTS;}}
readSettings();
// Touch screen and no mouse = touch mode; anything else = keyboard and mouse. A setting can override it.
function detectTouch(){ return (("ontouchstart" in window)||navigator.maxTouchPoints>0) && !matchMedia("(any-pointer: fine)").matches; }
function inputMode(){ return SW.inputMode==="touch"||SW.inputMode==="pc"?SW.inputMode:(detectTouch()?"touch":"pc"); }
const touchMode=()=>document.body.dataset.input==="touch";
function applyInput(){ document.body.dataset.input=inputMode(); }
applyInput();
const buzz=ms=>{ if(SW.vibration&&navigator.vibrate) try{navigator.vibrate(ms);}catch(e){} };
const SLOT=Math.max(1,Math.min(9,parseInt(new URLSearchParams(location.search).get("slot"),10)||1));
const SAVE_KEY="lastlight.v1.slot"+SLOT;
// The old single save becomes Save 1. It is only removed once copied, so nothing can be lost.
try{const old=localStorage.getItem("lastlight.v1"); if(old!==null&&localStorage.getItem("lastlight.v1.slot1")===null){localStorage.setItem("lastlight.v1.slot1",old); localStorage.removeItem("lastlight.v1");}}catch(e){}
const OTHER_T=480, SHIFT_T=900;          // when the Other starts showing up, when the Black Shift starts
const EXIT_TYPES=["hatch","lift","chimney","drain"];
const JIDS=["moth","listener","roughneck","tarling","knocker","smother","tenant","firedamp","timekeeper"]; // journal pages
// The Works in seven zones. Each is one connected cluster of rooms with its own floor, props and kinds of room (weights add up to 100).
const ZONES=[
  {id:"storage",name:"STORAGE",tag:"STORAGE",floor:"#1f1f1e",mc:"#6f685c",kinds:[["plain",50],["storage",20],["rats",15],["lockers",15]]},
  {id:"barracks",name:"THE BARRACKS",tag:"BARRACKS",floor:"#22201c",mc:"#6e5f50",kinds:[["dorm",35],["lockers",30],["chapel",15],["plain",20]]},
  {id:"offices",name:"THE OFFICES",tag:"OFFICES",floor:"#241f19",mc:"#6a6458",kinds:[["office",50],["plain",35],["chapel",15]]},
  {id:"pump",name:"THE PUMP HOUSE",tag:"PUMPS",floor:"#1d221d",mc:"#56665a",kinds:[["pump",45],["plain",40],["flooded",15]]},
  {id:"boiler",name:"THE BOILER WORKS",tag:"BOILERS",floor:"#271c17",mc:"#73574a",kinds:[["boiler",50],["plain",50]]},
  {id:"sump",name:"THE FLOODED SUMP",tag:"SUMP",floor:"#1a2022",mc:"#4f6266",kinds:[["flooded",55],["nest",20],["rats",10],["plain",15]]},
  {id:"drill",name:"THE DRILL FLOOR",tag:"DRILL",floor:"#261d16",mc:"#6b5547",kinds:[["plain",45],["nest",20],["pump",15],["boiler",20]]}
];
const ZONE=Object.fromEntries(ZONES.map(z=>[z.id,z]));
const MUST={storage:["storage","storage"],barracks:["infirmary"],offices:["terminal"],pump:["valve"],boiler:["valve"],sump:["valve","rats"],drill:["drill"]}; // in every run
const PIPE_ZONES=["pump","boiler","sump"]; // broken pipes here, until the zone's valve room is shut

const cv=document.getElementById("c");
const ctx=cv.getContext("2d");
ctx.imageSmoothingEnabled=false;
const darkC=document.createElement("canvas"); darkC.width=W; darkC.height=H;
const dg=darkC.getContext("2d");

/* ================= helpers ================= */
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const dist=(ax,ay,bx,by)=>Math.hypot(ax-bx,ay-by);
function mk(w,h){const c=document.createElement("canvas");c.width=w;c.height=h;return c;}
function shuffled(arr,rnd){const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function fmt(s){s=Math.max(0,Math.ceil(s));return Math.floor(s/60)+":"+String(s%60).padStart(2,"0");}
// turn soft-edged shapes into hard pixels
const tint=(h,d)=>"#"+[1,3,5].map(i=>clamp(parseInt(h.substr(i,2),16)+d,0,255).toString(16).padStart(2,"0")).join("");
function crisp(c){const g=c.getContext("2d");const d=g.getImageData(0,0,c.width,c.height);for(let i=3;i<d.data.length;i+=4)d.data[i]=d.data[i]>110?255:0;g.putImageData(d,0,0);return c;}

/* ================= map ================= */
function genMap(seed,ev){
  const rnd=mulberry(seed);
  gen: for(let attempt=0;attempt<300;attempt++){
    const grid=new Map(), key=(x,y)=>x+","+y;
    const list=[{x:0,y:0}]; grid.set("0,0",list[0]);
    const q=[list[0]]; let guard=0;
    while(list.length<ROOMS && guard++<6000){
      if(!q.length) q.push(list[Math.floor(rnd()*list.length)]);
      const r=q.shift();
      for(const [dx,dy] of shuffled(DIRS,rnd)){
        if(list.length>=ROOMS) break;
        const nx=r.x+dx, ny=r.y+dy;
        if(grid.has(key(nx,ny))||Math.abs(nx)>9||Math.abs(ny)>9||rnd()<0.5) continue;
        let n=0; for(const [ex,ey] of DIRS) if(grid.has(key(nx+ex,ny+ey))) n++;
        if(n>1) continue;
        const nr={x:nx,y:ny}; grid.set(key(nx,ny),nr); list.push(nr); q.push(nr);
      }
    }
    if(list.length<ROOMS) continue;
    list.forEach((r,i)=>{
      r.id=i; r.nb={};
      for(const [dx,dy,d] of DIRS){const o=grid.get(key(r.x+dx,r.y+dy)); if(o) r.nb[d]=o;}
      r.neighbors=Object.values(r.nb);
      r.seed=Math.floor(rnd()*1e9);
      r.visited=false; r.canvas=null; r.oil=[];
    });
    const d0=bfs(list,list[0]);
    list.forEach(r=>r.dist=d0[r.id]);
    const maxD=Math.max(...d0);
    // two of the four ways out are open each run, far from the start and from each other
    const far=shuffled(list.filter(r=>r.dist>=Math.ceil(maxD*0.55)),rnd).sort((a,b)=>(a.neighbors.length===1?0:1)-(b.neighbors.length===1?0:1));
    const exits=[];
    for(const ty of shuffled(EXIT_TYPES,rnd).slice(0,2)){
      const r=far.find(r=>!exits.includes(r)&&exits.every(e=>Math.abs(e.x-r.x)+Math.abs(e.y-r.y)>=3))||far.find(r=>!exits.includes(r))||list[list.length-1-exits.length];
      r.exitT=ty; exits.push(r);
    }
    const exit=exits[0];
    // the people of the Works, one room each
    const used=new Set([list[0],...exits]);
    const pickR=f=>{const c=list.filter(r=>!used.has(r)&&f(r)); const r=c.length?c[Math.floor(rnd()*c.length)]:list.find(r=>!used.has(r)); used.add(r); return r;};
    pickR(r=>ev==="moved"?r.dist>=5:r.dist===1).special="shop";
    pickR(r=>r.dist>=2&&r.dist<=4).special="gauge";
    pickR(r=>r.dist>=4&&r.dist<=9).special="smudge";
    pickR(r=>r.dist>=4).special="office";
    pickR(r=>r.dist>=4).special="whistle";
    // the zones, the rooms each one always has, then what every other room was back when this place worked
    if(!assignZones(list,rnd)) continue;
    for(const z of ZONES){
      const free=shuffled(list.filter(r=>r.zone===z.id&&!used.has(r)),rnd);
      if(free.length<MUST[z.id].length+1) continue gen;
      MUST[z.id].forEach((k,i)=>free[i].kind=k);
    }
    list.forEach(r=>{
      r.ev=ev;
      if(used.has(r)) {r.kind="plain"; return;}
      if(r.kind) return;
      let w=rnd()*100; r.kind="plain"; for(const [k,n] of ZONE[r.zone].kinds){if(w<n){r.kind=k;break;} w-=n;}
    });
    // two or three broken pipes in each wet or hot zone, never across the north door
    for(const zid of PIPE_ZONES) shuffled(list.filter(r=>r.zone===zid&&!used.has(r)&&r.kind!=="valve"),rnd).slice(0,2+Math.floor(rnd()*2)).forEach(r=>{
      r.broken=true; r.brokenX=[2,3,4,5,6,13,14,15,16][Math.floor(rnd()*9)]*T+4;
    });
    list.forEach(r=>buildRoom(r,r===list[0],!!r.exitT));
    const spare=()=>shuffled(list.filter(r=>!used.has(r)&&r.dist>=3&&!r.item),rnd)[0]||list.find(r=>!used.has(r)&&!r.item);
    const place=(r,kind)=>{const [x,y]=freeSpot(r,rnd); r.item={kind,x:x*T+8,y:y*T+9};};
    const near=(lo,hi)=>{for(let h=hi;h<30;h++){const c=shuffled(list.filter(r=>!used.has(r)&&!r.item&&r.dist>=lo&&r.dist<=h),rnd); if(c.length) return c[0];} return spare();};
    // the blueprint waits in a crate a few rooms from the start, the camera in a storeroom, film and flares in crates anywhere
    const crateIn=(rs,kind)=>{
      rs=rs.filter(r=>!used.has(r));
      const c=shuffled(rs.flatMap(r=>r.crates.filter(c=>!c.item)),rnd)[0];
      if(c){c.item=kind; return true;}
      for(const r of shuffled(rs,rnd)){const n=addCrate(r,rnd); if(n){n.item=kind; return true;}}
      return false;
    };
    if(!crateIn(list.filter(r=>r.dist>=1&&r.dist<=3),"blueprint")) place(near(1,3),"blueprint");
    if(!crateIn(list.filter(r=>r.kind==="storage"),"camera")) place(near(2,6),"camera");
    for(let k=0;k<3;k++) crateIn(list,"film")||place(spare(),"film");
    for(let k=0;k<2;k++) crateIn(list,"flare")||place(spare(),"flare");
    // what the exits need: a crank for the hatch, three fuses for the lift; and a wrench, all on the floor
    if(exits.some(e=>e.exitT==="hatch")) place(spare(),"crank");
    if(exits.some(e=>e.exitT==="lift")) for(let k=0;k<3;k++) place(spare(),"fuse");
    place(spare(),"wrench");
    for(const r of list) for(const c of r.crates) if(!c.item){const w=rnd(); c.item=w<0.3?"scrip":w<(ev==="shortage"?0.36:0.45)?"oil":null;}
    list.forEach(r=>{ r.noNight=r!==list[0]&&rnd()<0.12; r.glitch=r!==list[0]&&rnd()<0.08; }); // night vision shows only static here; the map can't be read here
    // eight worker notes, scattered
    shuffled(list.filter(r=>!used.has(r)),rnd).slice(0,NOTES.length).forEach((r,i)=>{const [x,y]=freeSpot(r,rnd); r.note={i,x:x*T+8,y:y*T+9};});
    return {rooms:list,start:list[0],exit:exit,exits:exits,rnd:rnd};
  }
  throw new Error("map generation failed");
}

// Seven seeds spread as far apart as they can be, grown outwards together, so each zone is one piece.
// The start seeds Storage and the seed farthest from it the Drill Floor.
function assignZones(list,rnd){
  const seeds=[list[0]], dists=[bfs(list,list[0])];
  while(seeds.length<ZONES.length){
    let best=null,bd=-1;
    for(const r of shuffled(list,rnd)){const d=Math.min(...dists.map(D=>D[r.id])); if(d>bd){bd=d;best=r;}}
    seeds.push(best); dists.push(bfs(list,best));
  }
  const order=[seeds[0]].concat(seeds.slice(1).sort((a,b)=>a.dist-b.dist));
  const ids=["storage",...shuffled(["barracks","offices","pump","boiler","sump"],rnd),"drill"];
  list.forEach(r=>r.zone=null); order.forEach((s,i)=>s.zone=ids[i]);
  // zones take turns to grow by one room into a random free neighbour, up to a cap, so they come out about the same size
  const cap=Math.ceil(list.length/ZONES.length)+1, size=Object.fromEntries(ids.map(id=>[id,1]));
  for(let grew=true;grew;){ grew=false;
    for(const id of ids){ if(size[id]>=(id==="storage"?cap-3:cap)) continue; // Storage sits in the middle and picks up the dead ends left over
      const opts=list.filter(r=>r.zone===id).flatMap(r=>r.neighbors.filter(n=>!n.zone)); if(!opts.length) continue;
      opts[Math.floor(rnd()*opts.length)].zone=id; size[id]++; grew=true; }
  }
  for(let left=list.filter(r=>!r.zone);left.length;left=left.filter(r=>!r.zone)) // anything left joins the smallest zone it touches
    for(const r of left){const zs=r.neighbors.filter(n=>n.zone).map(n=>n.zone); if(zs.length){r.zone=zs.sort((a,b)=>size[a]-size[b])[0]; size[r.zone]++;}}
  return ZONES.every(z=>list.filter(r=>r.zone===z.id).length>=5);
}

function bfs(rooms,from){
  const d=new Array(rooms.length).fill(Infinity); d[from.id]=0;
  const q=[from];
  while(q.length){const r=q.shift(); for(const n of r.neighbors) if(d[n.id]===Infinity){d[n.id]=d[r.id]+1;q.push(n);}}
  return d;
}

// tiles: 0 floor, 1 wall, 2 pillar, 3 crate, 4 glass (walkable, loud)
function buildRoom(r,isStart,isExit){
  const rnd=mulberry(r.seed);
  const t=new Uint8Array(RW*RH);
  for(let y=0;y<RH;y++)for(let x=0;x<RW;x++) if(x===0||y===0||x===RW-1||y===RH-1) t[y*RW+x]=1;
  if(r.nb.n){t[9]=0;t[10]=0;}
  if(r.nb.s){t[(RH-1)*RW+9]=0;t[(RH-1)*RW+10]=0;}
  if(r.nb.w){t[5*RW]=0;t[6*RW]=0;}
  if(r.nb.e){t[5*RW+RW-1]=0;t[6*RW+RW-1]=0;}
  const lane=(x,y)=>x===9||x===10||y===5||y===6;   // the cross between doors always stays open
  const inner=()=>[2+Math.floor(rnd()*(RW-4)),2+Math.floor(rnd()*(RH-4))];
  if(!isStart&&!r.special&&!isExit){
    const blocks=r.kind==="plain"?Math.floor(rnd()*8):Math.floor(rnd()*3);
    for(let i=0;i<blocks;i++){
      const [x,y]=inner(); if(lane(x,y)) continue;
      const kind=rnd()<0.55?2:3;
      t[y*RW+x]=kind;
      if(rnd()<0.4){const x2=x+(rnd()<0.5?1:-1); if(x2>1&&x2<RW-2&&!lane(x2,y)) t[y*RW+x2]=kind;}
    }
    const glass=Math.floor(rnd()*4);
    for(let i=0;i<glass;i++){
      const [x,y]=inner();
      for(let k=0;k<3;k++){const gx=clamp(x+Math.floor(rnd()*3)-1,1,RW-2), gy=clamp(y+Math.floor(rnd()*3)-1,1,RH-2); if(t[gy*RW+gx]===0) t[gy*RW+gx]=4;}
    }
  }
  // 5 = water (slow, splashy), 6 = furniture (solid, painted by the room's kind)
  if(r.kind==="flooded"){const x0=2+Math.floor(rnd()*6), y0=2+Math.floor(rnd()*3), w=8+Math.floor(rnd()*6), h=5+Math.floor(rnd()*3); for(let y=y0;y<Math.min(RH-1,y0+h);y++)for(let x=x0;x<Math.min(RW-1,x0+w);x++) if(t[y*RW+x]===0||t[y*RW+x]===4) t[y*RW+x]=5;}
  if(r.kind==="boiler"){for(let y=2;y<=3;y++)for(let x=2;x<=5;x++) t[y*RW+x]=6;}
  if(r.kind==="dorm"){for(const y of [2,3,8,9]) for(const x of [2,3,16,17]) t[y*RW+x]=6;}
  if(r.kind==="lockers"){for(let x=2;x<=17;x++) if(x<8||x>11) t[1*RW+x]=6;}
  if(r.kind==="pump"){r.pumpX=rnd()<0.5?3:14; for(let y=2;y<=3;y++)for(let k=0;k<3;k++) t[y*RW+r.pumpX+k]=6;}
  if(r.kind==="chapel"){for(const y of [3,8]) for(const x of [3,4,5,6,13,14,15,16]) t[y*RW+x]=6;}
  // 7 = crate (solid, can be opened), 8 = the bore hole (solid)
  if(r.kind==="office"){for(const [x,y] of [[3,3],[4,3],[15,3],[16,3],[3,8],[4,8],[15,8],[16,8]]) t[y*RW+x]=6;}
  if(r.kind==="infirmary"){for(const y of [2,3,8,9]) for(const x of [2,5,14,17]) t[y*RW+x]=6;}
  if(r.kind==="terminal"){t[2*RW+4]=6; t[2*RW+5]=6; t[3*RW+4]=0; t[3*RW+5]=0; t[4*RW+4]=0; t[4*RW+5]=0; r.term={x:5*T,y:2*T+4};}
  if(r.kind==="valve") r.valves=[3*T+8,6*T+8,14*T+8].map(x=>({x,shut:false,a:0}));
  if(r.kind==="drill"){for(let y=7;y<=9;y++)for(let x=13;x<=16;x++) t[y*RW+x]=8; r.hole={x:15*T,y:8.5*T};}
  r.tiles=t; r.crates=[]; r.decor=[];
  computeReach(r);
  if(!isStart&&!r.special&&!isExit){
    const n=r.kind==="storage"?6+Math.floor(rnd()*4):(r.kind!=="terminal"&&rnd()<0.2?1+Math.floor(rnd()*2):0);
    for(let k=0;k<n;k++) addCrate(r,rnd);
  }
  r.lamps=[];
  if(!isStart&&!["lockers","valve","drill"].includes(r.kind)){const n=rnd()<0.45?1:(rnd()<0.25?2:0); for(let k=0;k<n;k++){let tx=5+Math.floor(rnd()*10); if(tx>=8&&tx<=11) tx=rnd()<0.5?5:14; r.lamps.push({x:tx*T+8,y:19,dead:r.ev==="blackout"||rnd()<0.25,dieAt:rnd()<0.5?120+rnd()*800:1e9,ph:rnd()*9});}}
  r.scrawl=!isStart&&rnd()<0.22?SCRAWLS[Math.floor(rnd()*SCRAWLS.length)]:null;
  r.blood=!isStart&&rnd()<0.3;
  const freeTile=()=>{for(let k=0;k<200;k++){const [x,y]=inner(); if(t[y*RW+x]===0&&r.reach[y*RW+x]) return [x,y];} return [9,5];};
  if(!isStart && rnd()<(r.ev==="shortage"?0.13:0.3)){const [x,y]=freeTile(); r.oil.push({x:x*T+8,y:y*T+10});}
  r.scrip=[];
  if(!isStart && rnd()<(r.ev==="shortage"?0.7:0.45)) for(let k=0,n=rnd()<0.35?2:1;k<n;k++){const [x,y]=freeTile(); r.scrip.push({x:x*T+4+Math.floor(rnd()*8),y:y*T+6+Math.floor(rnd()*6)});}
  // the dead, and what is left of them
  if(!isStart&&!r.special){
    for(let k=0,n=r.kind==="infirmary"?2:rnd()<0.1?1:0;k<n;k++){const [x,y]=freeTile(); r.decor.push({k:"corpse",x:x*T+8,y:y*T+9,f:rnd()<0.5});}
    if(rnd()<0.07){const [x,y]=freeTile(); r.decor.push({k:"skel",x:x*T+8,y:y*T+9,f:rnd()<0.5});}
  }
  if(!isStart&&rnd()<0.18) for(let k=0,n=2+Math.floor(rnd()*4);k<n;k++){const [x,y]=freeTile(); r.decor.push({k:"moth",x:x*T+3+Math.floor(rnd()*10),y:y*T+4+Math.floor(rnd()*9)});}
  r.hatch=isExit?{x:160,y:84}:null;   // every way out sits in the middle of its room
}

// Which tiles Ash can walk to from the centre of the room (the cross between the doors is always open).
function computeReach(r){
  const t=r.tiles, seen=new Uint8Array(RW*RH), q=[5*RW+9]; seen[q[0]]=1; let n=1;
  while(q.length){const i=q.pop(), x=i%RW, y=(i/RW)|0;
    for(const [dx,dy] of DIRS){const nx=x+dx, ny=y+dy, j=ny*RW+nx; if(nx>=0&&ny>=0&&nx<RW&&ny<RH&&!seen[j]&&!isSolid(t[j])){seen[j]=1; n++; q.push(j);}}}
  r.reach=seen; return n;
}
// A crate only goes where it walls nothing off and nothing is lying there already.
function addCrate(r,rnd){
  const t=r.tiles, before=computeReach(r);
  const busy=(x,y)=>r.oil.concat(r.scrip||[],r.item?[r.item]:[],r.note?[r.note]:[]).some(o=>Math.floor(o.x/T)===x&&Math.floor(o.y/T)===y);
  for(let k=0;k<40;k++){
    const x=2+Math.floor(rnd()*(RW-4)), y=2+Math.floor(rnd()*(RH-4)), i=y*RW+x;
    if((x>=8&&x<=11)||(y>=4&&y<=7)||t[i]!==0||!r.reach[i]||busy(x,y)) continue;
    t[i]=7;
    if(computeReach(r)===before-1){const c={tx:x,ty:y,x:x*T+8,y:y*T+8,open:false,item:null}; r.crates.push(c); r.canvas=null; return c;}
    t[i]=0; computeReach(r);
  }
  return null;
}

function freeSpot(r,rnd){
  const ok=(x,y)=>r.tiles[y*RW+x]===0&&r.reach[y*RW+x]&&!(x>=8&&x<=11&&y>=4&&y<=6);
  for(let k=0;k<200;k++){const x=2+Math.floor(rnd()*(RW-4)), y=2+Math.floor(rnd()*(RH-4)); if(ok(x,y)) return [x,y];}
  for(let y=2;y<RH-2;y++) for(let x=2;x<RW-2;x++) if(ok(x,y)) return [x,y];
  return [9,5];
}
function tileAt(r,px,py){
  const tx=Math.floor(px/T), ty=Math.floor(py/T);
  if(tx<0||ty<0||tx>=RW||ty>=RH) return 0;
  return r.tiles[ty*RW+tx];
}
const isSolid=v=>v===1||v===2||v===3||v===6||v===7||v===8;
function boxHits(r,x,y,hw,hh){
  return isSolid(tileAt(r,x-hw,y-hh))||isSolid(tileAt(r,x+hw,y-hh))||isSolid(tileAt(r,x-hw,y+hh))||isSolid(tileAt(r,x+hw,y+hh));
}
function moveBox(r,e,dx,dy,hw,hh){
  let blocked=false;
  e.x+=dx; if(boxHits(r,e.x,e.y,hw,hh)){e.x-=dx;blocked=true;}
  e.y+=dy; if(boxHits(r,e.x,e.y,hw,hh)){e.y-=dy;blocked=true;}
  return blocked;
}

/* ================= room art ================= */
function px(g,c,x,y,w,h){g.fillStyle=c;g.fillRect(x,y,w||1,h||1);}

function paintRoom(r){
  const c=mk(W,H), g=c.getContext("2d"), rnd=mulberry(r.seed^0x5bd1);
  const F=(ZONE[r.zone]||{floor:"#211f1b"}).floor, F1=tint(F,7), F2=tint(F,-6); // each zone has its own floor
  for(let ty=0;ty<RH;ty++)for(let tx=0;tx<RW;tx++){
    const v=r.tiles[ty*RW+tx], x=tx*T, y=ty*T;
    if(v===1){ // riveted iron plate
      px(g,"#191715",x,y,T,T); px(g,"#0f0e0d",x+T-1,y,1,T); px(g,"#0f0e0d",x,y+T-1,T,1);
      px(g,"#221f1c",x,y,T-1,1);
      px(g,"#3a3530",x+2,y+2); px(g,"#3a3530",x+T-3,y+2); px(g,"#3a3530",x+2,y+T-3); px(g,"#3a3530",x+T-3,y+T-3);
      if(rnd()<0.25) px(g,"#3a2418",x+3+Math.floor(rnd()*9),y+4+Math.floor(rnd()*8),2,1+Math.floor(rnd()*3));
    } else {
      px(g,F,x,y,T,T);
      for(let k=0;k<7;k++) px(g,rnd()<0.5?F1:F2,x+Math.floor(rnd()*T),y+Math.floor(rnd()*T));
      px(g,"#1c1a17",x+T-1,y,1,T); px(g,"#1c1a17",x,y+T-1,T,1);
      if(v===0&&rnd()<0.02){px(g,"#161513",x+2,y+2,12,12); for(let k=0;k<4;k++) px(g,"#0b0a09",x+3,y+4+k*3,10,1);} // floor grate
      if(v===4) for(let k=0;k<8;k++) px(g,["#9fb7bd","#cfe0e3","#6f8a90"][k%3],x+1+Math.floor(rnd()*14),y+1+Math.floor(rnd()*14));
      if(v===5){px(g,"#0c1414",x,y,T,T); for(let k=0;k<4;k++) px(g,"#16262a",x+Math.floor(rnd()*12),y+Math.floor(rnd()*15),3+Math.floor(rnd()*3),1);}
    }
  }
  g.fillStyle="rgba(0,0,0,.35)"; g.fillRect(T,T,W-2*T,4); g.fillRect(T,T,4,H-2*T);
  // One pipe runs through the whole Works: along the top wall and out of the side doors at the same height,
  // and across the floor beside the north and south doors, so it lines up with the next room's.
  const x0=r.nb.w?0:T, x1=r.nb.e?W:W-T, bx=r.broken?r.brokenX:-99, PX=11*T+5;
  for(let x=x0;x<x1;x++){
    if(r.nb.n&&x>=9*T-3&&x<11*T+3) continue;
    if(x>=bx&&x<bx+10) continue;
    px(g,"#4a3f33",x,11,1,4); px(g,"#6b5a46",x,11,1,1); px(g,"#2e2720",x,14,1,1);
    if(x%32===0){px(g,"#2e2720",x-1,10,3,6);}
  }
  if(!r.nb.w) px(g,"#2e2720",T,10,2,6);
  if(!r.nb.e) px(g,"#2e2720",W-T-2,10,2,6);
  const riser=(y0,y1)=>{for(let y=y0;y<y1;y++){px(g,"#4a3f33",PX,y,4,1); px(g,"#6b5a46",PX,y,1,1); px(g,"#2e2720",PX+3,y,1,1); if(y%32===0) px(g,"#2e2720",PX-1,y,6,3);}};
  if(r.nb.n) riser(0,11);
  if(r.nb.s){riser(15,H); px(g,"#2e2720",PX-1,11,6,5);}
  if(r.broken){ // torn, rusted ends, and sludge running down the wall into a pool
    const b=r.brokenX;
    px(g,"#7a3a1f",b-2,10,2,6); px(g,"#7a3a1f",b+10,10,2,6); px(g,"#4a2414",b,11,1,3); px(g,"#4a2414",b+9,12,1,3);
    for(let k=0;k<3;k++) px(g,"#060508",b+1+k*3,13,2,3+Math.floor(rnd()*3));
    g.fillStyle="#060508"; g.beginPath(); g.ellipse(b+5,T+5,10,3,0,0,7); g.fill(); px(g,"#1f2b2b",b+1,T+4,3,1);
  }
  if(r.kind!=="valve"&&rnd()<0.5){const vx=T*2+Math.floor(rnd()*(W-T*5)); if(!(r.nb.n&&vx>8*T&&vx<12*T)&&!(vx>bx-6&&vx<bx+16)){px(g,"#3a3530",vx-3,8,7,1);px(g,"#3a3530",vx-3,14,7,1);px(g,"#3a3530",vx-4,9,1,5);px(g,"#3a3530",vx+3,9,1,5);px(g,"#4a4540",vx,9,1,5);}} // a seized wheel: only the red ones turn
  paintZone(g,r,rnd);
  // tar puddles, oil stains
  for(let k=0,n=1+Math.floor(rnd()*4);k<n;k++){
    const x=T*2+Math.floor(rnd()*(W-T*4)), y=T*2+Math.floor(rnd()*(H-T*4));
    if(isSolid(tileAt(r,x,y))) continue;
    g.fillStyle=rnd()<0.6?"#0a0909":"#141210"; g.beginPath(); g.ellipse(x,y,3+rnd()*7,2+rnd()*3,0,0,7); g.fill();
    px(g,"#1f2b2b",x-1,y-1,2,1);
  }
  // door frames
  const frame=(x,y,w,h)=>{px(g,"#090808",x,y,w,h);};
  if(r.nb.n){frame(9*T,0,2*T,T);px(g,"#4a3f33",9*T-2,0,2,T);px(g,"#4a3f33",11*T,0,2,T);}
  if(r.nb.s){frame(9*T,H-T,2*T,T);px(g,"#4a3f33",9*T-2,H-T,2,T);px(g,"#4a3f33",11*T,H-T,2,T);}
  if(r.nb.w){frame(0,5*T,T,2*T);px(g,"#4a3f33",0,5*T-2,T,2);px(g,"#4a3f33",0,7*T,T,2);}
  if(r.nb.e){frame(W-T,5*T,T,2*T);px(g,"#4a3f33",W-T,5*T-2,T,2);px(g,"#4a3f33",W-T,7*T,T,2);}
  // boiler columns and oil drums
  for(let ty=0;ty<RH;ty++)for(let tx=0;tx<RW;tx++){
    const v=r.tiles[ty*RW+tx], x=tx*T, y=ty*T;
    if(v===2){px(g,"#0d0c0b",x,y+12,T,4);px(g,"#2f2c28",x+2,y+2,12,12);px(g,"#3e3a35",x+2,y,12,3);px(g,"#4a4540",x+2,y+6,12,1);px(g,"#4a4540",x+2,y+10,12,1);px(g,"#22201d",x+12,y+2,2,12);px(g,"#3a2418",x+5,y+8,2,2);}
    if(v===3){const red=((tx*7+ty*13)%3===0);
      px(g,"#0d0c0b",x+1,y+13,14,3);px(g,red?"#4a221c":"#3d2f22",x+2,y+2,12,12);px(g,red?"#6a3026":"#4a3a2a",x+2,y,12,3);
      px(g,red?"#2e1512":"#5a4632",x+2,y+5,12,1);px(g,red?"#2e1512":"#5a4632",x+2,y+10,12,1);px(g,"#0a0909",x+5,y+1,3,1);px(g,"#22201d",x+12,y+2,2,12);}
  }
  paintKind(g,r,rnd);
  paintCrates(g,r); paintDecor(g,r,rnd);
  if(r.blood) for(let k=0;k<3;k++){const x=T+Math.floor(rnd()*(W-3*T)); px(g,"#3e1410",x,3+Math.floor(rnd()*6),2+Math.floor(rnd()*4),2); px(g,"#3e1410",x+1,6,1,4+Math.floor(rnd()*8));}
  if(r.blood&&rnd()<0.6){const x=T*3+Math.floor(rnd()*(W-T*6)), y=T*3+Math.floor(rnd()*(H-T*6)); if(!isSolid(tileAt(r,x,y))){for(let k=0;k<9;k++) px(g,"#3e1410",x+k*3+Math.floor(rnd()*2),y+Math.floor(rnd()*3)-k,2,2);}}
  if(r.scrawl){const w=textW(r.scrawl,1), x=Math.max(T+2,Math.min(W-T-2-w,T*2+Math.floor(rnd()*(W-T*4-w)))), y=r.kind==="lockers"?T*2+6:T+4+Math.floor(rnd()*4); text(g,r.scrawl,x,y,1,"#5a1a14");}
  if(r.hatch){
    const x=r.hatch.x, y=r.hatch.y, ty=r.exitT;
    if(ty==="hatch"){
      px(g,"#0a0806",x-9,y-9,18,18);px(g,"#3a2a1a",x-8,y-8,16,16);
      for(let k=0;k<4;k++) px(g,"#2c1f13",x-8,y-6+k*4,16,1);
      px(g,"#5a4f45",x-3,y-3,6,6); px(g,"#0a0806",x-1,y-1,2,2); // the socket a crank fits into
    }
    if(ty==="lift"){
      px(g,"#0a0908",x-16,y-30,32,34); px(g,"#141210",x-14,y-28,28,30);
      for(let k=0;k<7;k++) px(g,"#3a3530",x-14+k*4+1,y-28,1,30);
      px(g,"#3a3530",x-16,y-30,32,2); px(g,"#3a3530",x-16,y+2,32,2); px(g,"#2a2622",x-1,0,2,y-30);
      px(g,"#2a2622",x+20,y-24,10,14); px(g,"#4a4540",x+20,y-24,10,1);
    }
    if(ty==="chimney"){
      g.fillStyle="#050505"; g.beginPath(); g.ellipse(x,16,18,8,0,0,7); g.fill();
      px(g,"#3a2418",x-18,14,4,3); px(g,"#3a2418",x+14,14,4,3);
      px(g,"#4a3f33",x-7,0,2,y+6); px(g,"#4a3f33",x+5,0,2,y+6);
      for(let k=4;k<y+6;k+=6) px(g,"#6b5a46",x-6,k,12,1);
    }
    if(ty==="drain"){
      px(g,"#070b0b",x-22,y-12,44,26); px(g,"#0c1414",x-20,y-10,40,22);
      for(let k=0;k<6;k++) px(g,"#16262a",x-18+k*7,y-6+((k*5)%9),5,1);
      px(g,"#3a3530",x-22,y-13,44,2); px(g,"#3a3530",x-22,y+13,18,2); px(g,"#3a3530",x+10,y+13,12,2); // a broken grate
      for(let k=0;k<5;k++) px(g,"#2a2622",x-20+k*9,y-12,2,6);
    }
  }
  return c;
}
const SCRAWLS=["IT SEES YOUR LIGHT","DON'T RUN","WE ARE STILL ON SHIFT","LOOK BEHIND YOU","SHE ISN'T REAL","137","IT COPIES YOU","ONE FILL ONE WAY OUT","STOP LISTENING","THE WALLS MOVE"];
function paintKind(g,r,rnd){
  const k=r.kind;
  if(k==="boiler"){
    const x=2*T, y=2*T;
    px(g,"#0d0c0b",x,y+30,64,4); px(g,"#2a2622",x,y-6,64,36); px(g,"#3a3530",x,y-6,64,3); px(g,"#1c1a17",x+60,y-6,4,36);
    for(let i=0;i<8;i++){px(g,"#4a4540",x+4+i*8,y-2);px(g,"#4a4540",x+4+i*8,y+26);}
    px(g,"#120a06",x+24,y+8,16,14); for(let i=0;i<4;i++) px(g,"#3a3530",x+24,y+10+i*3,16,1);
    px(g,"#4a3f33",x+50,0,4,y-6);
  }
  if(k==="dorm"){
    for(const [bx,by] of [[2,2],[2,8],[16,2],[16,8]]){
      const x=bx*T, y=by*T;
      px(g,"#0d0c0b",x,y+30,32,3); px(g,"#3b2b1b",x,y,32,31); px(g,"#6e665a",x+2,y+3,28,26); px(g,"#a89f8c",x+3,y+4,10,7);
      px(g,"#8a8274",x+2,y+13,28,16); if(rnd()<0.7){g.fillStyle="#4a1612"; g.beginPath(); g.ellipse(x+12+rnd()*10,y+20,4+rnd()*4,3+rnd()*2,0,0,7); g.fill();}
    }
  }
  if(k==="lockers"){
    const ajar=2+Math.floor(rnd()*12);
    for(let tx=2;tx<=17;tx++){ if(tx>=8&&tx<=11) continue; const x=tx*T, y=T;
      px(g,"#2e3a36",x+1,y-6,14,22); px(g,"#1c2422",x+1,y-6,1,22); px(g,"#3e4c47",x+1,y-6,14,1);
      for(let i=0;i<3;i++) px(g,"#1c2422",x+4,y-3+i*2,8,1);
      px(g,"#6a6a60",x+12,y+5,1,3);
      if(tx===ajar||tx===ajar+6){px(g,"#050505",x+3,y-4,10,18); px(g,"#8a7a5a",x+6,y+2); px(g,"#8a7a5a",x+9,y+2);} // something inside is looking out
    }
  }
  if(k==="pump"){
    const x=r.pumpX*T, y=2*T;
    px(g,"#0d0c0b",x,y+30,48,3); px(g,"#3a3028",x,y,48,30); px(g,"#4a3f33",x,y,48,3);
    g.fillStyle="#5a4a3a"; g.beginPath(); g.arc(x+16,y+15,9,0,7); g.fill(); g.fillStyle="#3a3028"; g.beginPath(); g.arc(x+16,y+15,5,0,7); g.fill();
    px(g,"#2a2622",x+34,y+6,8,22); px(g,"#4a3f33",x+40,0,4,y);
  }
  if(k==="chapel"){
    for(const [rowy,xs] of [[3,[3,13]],[8,[3,13]]]) for(const sx of xs){const x=sx*T, y=rowy*T; px(g,"#0d0c0b",x,y+13,64,3); px(g,"#3b2b1b",x,y+2,64,11); px(g,"#4f3a25",x,y+2,64,2); px(g,"#2c2014",x,y+8,64,1);}
    px(g,"#2c2014",W/2-20,18,40,8); px(g,"#3b2b1b",W/2-20,17,40,2);
    for(let i=0;i<5;i++){px(g,"#cfc6a8",W/2-16+i*8,11,2,6); px(g,"#8a8170",W/2-16+i*8,16,2,1);}
  }
  if(k==="nest"){
    for(let i=0;i<4;i++){
      const x=T*2+Math.floor(rnd()*(W-T*4)), y=18+Math.floor(rnd()*18), h=14+Math.floor(rnd()*8);
      px(g,"#8a8270",x+3,4,1,y-4);
      g.fillStyle="#cfc6b0"; g.beginPath(); g.ellipse(x+3,y+h/2,5,h/2,0,0,7); g.fill();
      for(let j=0;j<6;j++) px(g,"#a89f88",x+Math.floor(rnd()*7),y+Math.floor(rnd()*h),2,1);
      px(g,"#4a1612",x+1,y+h-6,4,3);
      if(i===0){px(g,"#2a1d16",x+2,y+h,3,4); px(g,"#2a1d16",x+2,y+h+3,5,2);} // a boot. someone is still in there
    }
    for(let i=0;i<40;i++) px(g,"#4a463c",T*2+Math.floor(rnd()*(W-T*4)),T*2+Math.floor(rnd()*(H-T*4)));
  }
  if(k==="office"){
    for(const [dx,dy] of [[3,3],[15,3],[3,8],[15,8]]){const x=dx*T, y=dy*T;
      px(g,"#0d0c0b",x,y+13,32,3); px(g,"#3b2b1b",x,y+1,32,12); px(g,"#4f3a25",x,y+1,32,2); px(g,"#2c2014",x+2,y+12,2,4); px(g,"#2c2014",x+28,y+12,2,4);
      const pp=x+3+Math.floor(rnd()*8); px(g,"#d9cfb8",pp,y+4,8,6); px(g,"#b9b09a",pp+1,y+6,5,1); px(g,"#b9b09a",pp+1,y+8,4,1); // papers
      if(rnd()<0.5){px(g,"#1c1a17",x+18,y-1,11,8); px(g,"#2a2622",x+19,y,9,3); px(g,"#d9cfb8",x+20,y-4,7,4);} // a typewriter, a page still in it
      if(rnd()<0.4) px(g,"#3e1410",x+13,y+5,4,3);
    }
    for(const fx of [2*T,5*T,13*T+8,16*T+4]){px(g,"#2e3a36",fx,2,11,13); px(g,"#3e4c47",fx,2,11,1); px(g,"#1c2422",fx+2,6,7,1); px(g,"#1c2422",fx+2,10,7,1); px(g,"#6a6a60",fx+5,4,1,1); px(g,"#6a6a60",fx+5,8,1,1);} // filing cabinets
  }
  if(k==="infirmary"){
    for(const cy of [2,8]) for(const cx of [2,5,14,17]){const x=cx*T, y=cy*T;
      px(g,"#0d0c0b",x+1,y+30,14,3); px(g,"#4a4a44",x+1,y+1,14,30); px(g,"#7a7a70",x+2,y+2,12,28); px(g,"#cfc6b0",x+3,y+3,10,6); // frame, mattress, pillow
      if(rnd()<0.6){px(g,"#a8a090",x+2,y+12,12,17); if(rnd()<0.6){g.fillStyle="#4a1612"; g.beginPath(); g.ellipse(x+8,y+18+rnd()*6,3+rnd()*2,3+rnd()*3,0,0,7); g.fill();}} // a sheet, and what soaked through it
    }
    const mx=7*T-6; px(g,"#2a2622",mx,2,20,12); px(g,"#cfc6b0",mx+1,3,18,10); px(g,"#8a2a22",mx+8,4,4,8); px(g,"#8a2a22",mx+5,6,10,4); // the medicine cabinet
  }
  if(k==="terminal"){
    const x=4*T, y=2*T;
    px(g,"#0d0c0b",x,y+13,32,3); px(g,"#3b2b1b",x,y+3,32,11); px(g,"#4f3a25",x,y+3,32,2); // the desk
    px(g,"#2a2622",x+6,y-10,20,14); px(g,"#3a3530",x+6,y-10,20,1); px(g,"#0a0d0a",x+8,y-8,16,10); // the set; its screen is drawn live
    px(g,"#1c1a17",x+2,y+5,10,4); px(g,"#3a3530",x+3,y+6,8,2); px(g,"#0a0908",x+5,y+6,4,1); // the tape deck, empty
    for(let i=0;i<7;i++) px(g,"#1c1a17",x+26+i*2,y-3-i*2,2,1); // its cable, up into the wall
  }
  if(k==="storage"){ // racks along the top wall
    for(let sx=2*T;sx<W-3*T;sx+=44){ if(r.nb.n&&sx+36>8*T&&sx<12*T) continue;
      px(g,"#2a2622",sx,1,36,14); for(const sy of [6,13]) px(g,"#4a3f33",sx,sy,36,2); px(g,"#1c1a17",sx,1,2,14); px(g,"#1c1a17",sx+34,1,2,14);
      for(let i=0;i<4;i++){ if(rnd()<0.7) px(g,["#3d2f22","#4a3a2a","#5a4632"][i%3],sx+3+i*8,rnd()<0.5?2:9,6,4); }
    }
  }
  if(k==="valve"){ // a stem from each wheel down to the pipe, and a warning plate
    for(const v of r.valves){px(g,"#2e2720",v.x-1,6,3,6); px(g,"#5a1f17",v.x-3,10,7,1);}
    px(g,"#2a2622",12*T+2,2,26,8); text(g,"SEAL",12*T+15,3,1,"#9a3a2a","c");
  }
  if(k==="drill"){
    const h=r.hole, x=13*T, y=7*T;
    px(g,"#3a3530",x-3,y-3,70,54); px(g,"#2a2622",x-1,y-1,66,50);
    for(let i=0;i<8;i++){px(g,"#5a4f45",x+i*9,y-2,2,1); px(g,"#5a4f45",x+i*9,y+49,2,1);}
    g.fillStyle="#010101"; g.beginPath(); g.ellipse(h.x,h.y,30,22,0,0,7); g.fill();
    g.fillStyle="#0b0a09"; g.beginPath(); g.ellipse(h.x,h.y-2,30,20,0,Math.PI,0); g.fill();
    g.fillStyle="#010101"; g.beginPath(); g.ellipse(h.x,h.y+2,24,16,0,0,7); g.fill();
    for(let cy=T+4;cy<h.y;cy+=3) px(g,"#5a4f45",h.x-1,cy,2,2); // the drill chain, still running down into it
    px(g,"#2a2622",h.x-18,1,36,10); px(g,"#4a3f33",h.x-18,1,36,1); text(g,"900 FT",h.x,3,1,"#c9a04a","c");
    for(let i=0;i<5;i++) px(g,i%2?"#141210":"#6a5a1a",x+i*13,y-6,13,2); // hazard paint round the rim
  }
  if(k==="rats"){
    for(let i=0;i<6;i++){const x=T*2+Math.floor(rnd()*(W-T*4)), y=T*2+Math.floor(rnd()*(H-T*4)); if(isSolid(tileAt(r,x,y))) continue;
      g.fillStyle="#2e2618"; g.beginPath(); g.ellipse(x,y,8+rnd()*6,4+rnd()*2,0,0,7); g.fill(); // nests of straw and rag
      for(let j=0;j<10;j++) px(g,rnd()<0.5?"#6a5a3a":"#4a3f2a",x-8+Math.floor(rnd()*16),y-3+Math.floor(rnd()*6),2+Math.floor(rnd()*2),1);}
    for(let i=0;i<30;i++) px(g,"#0b0a09",T*2+Math.floor(rnd()*(W-T*4)),T*2+Math.floor(rnd()*(H-T*4)));
    for(const hx of [3*T,7*T,13*T,17*T]) px(g,"#030303",hx,H-T,6,3); // gnawed holes in the wall
    for(const hy of [3*T,8*T]){px(g,"#030303",T,hy,3,6); px(g,"#030303",W-T-3,hy,3,6);}
  }
}
// small things each zone has on its walls and floors
function paintZone(g,r,rnd){
  const z=r.zone, door=x=>r.nb.n&&x>8*T&&x<12*T;
  const spots=[]; for(let k=0;k<3;k++){const x=T*2+Math.floor(rnd()*(W-T*5)); if(!door(x)&&!door(x+28)) spots.push(x);}
  if(r.kind==="storage"||r.kind==="valve"||r.kind==="drill"||r.kind==="office"||r.kind==="lockers") spots.length=0; // those walls are full
  if(z==="storage") for(const x of spots.slice(0,1)) text(g,"BAY "+(r.id%9+1),x,3,1,"#3a3530");
  if(z==="barracks") for(const x of spots){px(g,"#5a4f45",x+2,2,1,2); px(g,"#2a2420",x,4,5,7); px(g,"#1f1a17",x+2,4,1,7);} // coats on hooks
  if(z==="offices") for(const x of spots.slice(0,1)){px(g,"#3b2b1b",x,1,22,9); for(let i=0;i<4;i++) px(g,"#cfc6a8",x+2+i*5,2+(i%2),4,5);} // a notice board
  if(z==="pump") for(const x of spots){px(g,"#2e2720",x+3,8,2,3); g.fillStyle="#cfc6b0"; g.beginPath(); g.arc(x+4,5,4,0,7); g.fill(); px(g,"#9a3a2a",x+4,3,1,3);} // pressure gauges
  if(z==="boiler"){ for(const x of spots) px(g,"#0b0a09",x,1,4+Math.floor(rnd()*6),10); // soot
    for(let i=0;i<2;i++){const x=T*2+Math.floor(rnd()*(W-T*4)), y=T*2+Math.floor(rnd()*(H-T*4)); if(!isSolid(tileAt(r,x,y))){g.fillStyle="#0b0a09"; g.beginPath(); g.ellipse(x,y,6,3,0,0,7); g.fill(); px(g,"#2a2622",x-2,y-1,2,1);}}} // spilt coal
  if(z==="sump"){ px(g,"#1f2b2b",T,8,W-2*T,1); for(let i=0;i<4;i++){const x=T*2+Math.floor(rnd()*(W-T*4)), y=T*2+Math.floor(rnd()*(H-T*4)); if(!isSolid(tileAt(r,x,y))){g.fillStyle="#0c1414"; g.beginPath(); g.ellipse(x,y,7,3,0,0,7); g.fill();}}} // the water line, and puddles
  if(z==="drill") for(const x of spots){for(let y=1;y<11;y+=2) px(g,"#3a3530",x,y,2,1); px(g,"#4a3f33",x-1,10,4,2);} // hanging chains
}
function paintCrates(g,r){
  for(const c of r.crates){const x=c.tx*T, y=c.ty*T;
    px(g,"#0d0c0b",x+1,y+13,14,3);
    if(!c.open){
      px(g,"#5a4228",x+1,y+1,14,12); px(g,"#6e5232",x+1,y+1,14,2); px(g,"#3e2c18",x+1,y+5,14,1); px(g,"#3e2c18",x+1,y+9,14,1);
      px(g,"#3e2c18",x+1,y+1,1,12); px(g,"#3e2c18",x+14,y+1,1,12); for(let i=0;i<10;i++) px(g,"#4a361e",x+3+i,y+2+i);
      px(g,"#8a7a5a",x+5,y+6,2,2);
    } else {
      px(g,"#5a4228",x+1,y+4,14,9); px(g,"#120d08",x+2,y+5,12,5); px(g,"#6e5232",x+1,y+4,14,1);
      px(g,"#6e5232",x+3,y-1,12,3); px(g,"#3e2c18",x+3,y+1,12,1); // the lid, pushed back
    }
  }
}
function paintDecor(g,r,rnd){
  for(const d of r.decor){const x=d.x, y=d.y, s=d.f?-1:1, P=(dx,dy,w,h,c)=>px(g,c,s>0?x+dx:x-dx-w,y+dy,w,h);
    if(d.k==="corpse"){ // a worker face-down in overalls, dragged here
      g.fillStyle="#2a0c0a"; g.beginPath(); g.ellipse(x,y+1,12,5,0,0,7); g.fill();
      for(let k=0;k<5;k++) P(-14-k*5,Math.floor(rnd()*3)-1,3,2,"#3e1410");
      P(-3,-3,9,6,"#2a3238"); P(-3,-1,9,1,"#3a444a"); P(-10,-2,7,2,"#232a2f"); P(-10,1,7,2,"#232a2f"); P(-12,-2,2,2,"#141210"); P(-12,1,2,2,"#141210");
      P(6,-2,4,4,"#6e5a46"); P(9,-2,1,4,"#2a1d16"); P(1,3,2,3,"#6e5a46");
    }
    if(d.k==="skel"){
      P(6,-2,4,4,"#cfc6b0"); P(7,-1,1,1,"#0b0a09"); P(7,1,1,1,"#0b0a09"); P(-3,0,9,1,"#a89f88");
      for(let i=0;i<4;i++) P(-1+i*2,-2,1,5,"#cfc6b0");
      P(-6,-1,3,3,"#a89f88"); P(-12,-2,6,1,"#cfc6b0"); P(-12,2,6,1,"#cfc6b0"); P(1,4,5,1,"#cfc6b0"); P(-9,5,2,1,"#a89f88");
    }
    if(d.k==="moth"){px(g,"#5c564c",x-3,y,3,2); px(g,"#5c564c",x+1,y,3,2); px(g,"#3b352c",x,y-1,1,3);} // wings flat, dead
  }
}
function roomCanvas(r){return r.canvas||(r.canvas=paintRoom(r));}

/* ================= character art ================= */
/* Ash: sprites cut from Shano's sheet (17 x 26, 4 rows by 3 frames: down, up, -, right) */
const SPR_W=17, SPR_H=26;
const sprImg=new Image(); sprImg.src="data:image/png;base64,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";
const sprites={};
sprImg.onload=()=>{
  const grab=(row,col,flip)=>{const c=mk(SPR_W,SPR_H),g=c.getContext("2d");if(flip){g.translate(SPR_W,0);g.scale(-1,1);}g.drawImage(sprImg,col*SPR_W,row*SPR_H,SPR_W,SPR_H,0,0,SPR_W,SPR_H);return c;};
  sprites.d=[grab(0,0),grab(0,1),grab(0,2)];
  sprites.u=[grab(1,0),grab(1,1),grab(1,2)];
  sprites.r=[grab(3,2),grab(3,1),grab(3,2)];
  sprites.l=[grab(3,2,1),grab(3,1,1),grab(3,2,1)];
};
// where the lantern sits inside each facing, measured from the sheet
const LANTERN={d:[2,20],u:[2,19],r:[14,18],l:[SPR_W-1-14,18]};
const sludgeC=mk(SPR_W,SPR_H), sludgeG=sludgeC.getContext("2d");
function drawPlayer(g,fx,fy,dir,frame,lit,sludge,t){
  const x=Math.round(fx)-8, y=Math.round(fy)-SPR_H+1;
  px(g,"rgba(0,0,0,.4)",x+3,y+SPR_H-2,11,3);
  const f=sprites[dir]&&sprites[dir][frame]; if(!f) return;
  if(sludge>0){
    // black rising up the body, clipped to the character's own pixels
    sludgeG.clearRect(0,0,SPR_W,SPR_H); sludgeG.globalCompositeOperation="source-over"; sludgeG.drawImage(f,0,0);
    sludgeG.globalCompositeOperation="source-atop";
    const h=sludge/100*(SPR_H+2);
    for(let i=0;i<SPR_W;i++){const c=Math.round(h+Math.sin(i*0.9+t*2.4)*1.3+((i*7)%3)); px(sludgeG,"#060508",i,SPR_H-c,1,c);}
    g.drawImage(sludgeC,x,y);
  } else g.drawImage(f,x,y);
  if(!lit){const L=LANTERN[dir]; px(g,"#3a3026",x+L[0]-1,y+L[1]-1,3,3);}
}
function lanternPos(fx,fy,dir){
  const L=LANTERN[dir]; return {x:Math.round(fx)-8+L[0], y:Math.round(fy)-SPR_H+1+L[1]};
}

function drawMoth(g,cx,cy,t){
  cx=Math.round(cx); cy=Math.round(cy);
  const open=Math.sin(t*28)>0;
  const up=[7,8,8,7,5], lo=[6,6,5,3];
  g.fillStyle="#a89f88";
  up.forEach((w,i)=>{w=open?w:Math.ceil(w/2);g.fillRect(cx-2-w,cy-4+i,w,1);g.fillRect(cx+2,cy-4+i,w,1);});
  lo.forEach((w,i)=>{w=open?w:Math.ceil(w/2);g.fillRect(cx-2-w,cy+1+i,w,1);g.fillRect(cx+2,cy+1+i,w,1);});
  if(open){px(g,"#3b352c",cx-7,cy-3,2,2);px(g,"#3b352c",cx+5,cy-3,2,2);px(g,"#d8cfb8",cx-7,cy-3);px(g,"#d8cfb8",cx+6,cy-3);}
  px(g,"#cfc6b0",cx-1,cy-4,3,9); px(g,"#cfc6b0",cx-1,cy-6,3,2);
  px(g,"#cfc6b0",cx-2,cy-8);px(g,"#cfc6b0",cx-3,cy-9);px(g,"#cfc6b0",cx+2,cy-8);px(g,"#cfc6b0",cx+3,cy-9);
  px(g,"#f6e7a6",cx-1,cy-6);px(g,"#f6e7a6",cx+1,cy-6);
}

function drawListener(g,fx,fy,t,mouth){
  const sway=Math.round(Math.sin(t*5));
  const x=Math.round(fx)-5, y=Math.round(fy)-22;
  px(g,"rgba(0,0,0,.4)",x+1,y+21,8,2);
  px(g,"#6e695f",x+3,y+16,1,6-(sway>0?1:0)); px(g,"#6e695f",x+6,y+16,1,6-(sway<0?1:0));
  px(g,"#9a9487",x+3,y+7,4,10); px(g,"#7d776b",x+3,y+9,4,1); px(g,"#7d776b",x+3,y+11,4,1); px(g,"#7d776b",x+3,y+13,4,1);
  px(g,"#9a9487",x+1,y+8+sway,1,11); px(g,"#9a9487",x+8,y+8-sway,1,11);
  px(g,"#9a9487",x,y+19+sway,2,1); px(g,"#9a9487",x+8,y+19-sway,2,1);
  px(g,"#c2bcae",x+2,y,6,7); px(g,"#c2bcae",x+1,y+1,8,5);
  px(g,"#a8a294",x+3,y+2); px(g,"#a8a294",x+6,y+2);
  px(g,"#1a0806",x+3,y+4,4,mouth?3:1);
  if(mouth){px(g,"#e6e0d0",x+3,y+4);px(g,"#e6e0d0",x+5,y+4);px(g,"#e6e0d0",x+4,y+6);px(g,"#e6e0d0",x+6,y+6);}
}

/* the people of the Works */
const OBJ={x:160,y:84};
function drawWick(g,x,y,t){
  // behind his counter, a candle burning on his hat
  px(g,"#2a2724",x-6,y-26,12,22); px(g,"#8a8170",x-4,y-18,8,14);
  px(g,"#cbb9a0",x-4,y-34,8,8); px(g,"#cbb9a0",x+4,y-30,2,2); px(g,"#141010",x-2,y-31); px(g,"#141010",x+1,y-31);
  px(g,"#1b1a18",x-6,y-36,12,2); px(g,"#1b1a18",x-4,y-40,8,4);
  px(g,"#e8dcc0",x-1,y-45,2,5); px(g,Math.sin(t*15)>0?"#f2c35a":"#fff1c8",x-1,y-48,2,3);
  px(g,"#3b2b1b",x-24,y-4,48,12); px(g,"#6b5233",x-24,y-5,48,2); px(g,"#2c2014",x-24,y+7,48,1);
  px(g,"#6b4a22",x+12,y-10,4,6); px(g,"#d18b2a",x+13,y-8,2,3); px(g,"#6b4a22",x-16,y-9,4,5); px(g,"#d18b2a",x-15,y-7,2,2);
}
function drawGauge(g,x,y,t,talking){
  px(g,"#0d0c0b",x-4,y+16,8,3); px(g,"#4a3f33",x-2,y+2,4,16); px(g,"#6b5a46",x-2,y+2,1,16);
  px(g,"#2e2720",x-8,y-1,16,2);
  const R="#9a3a2a", D="#5a1f17";
  px(g,R,x-5,y-9,10,1); px(g,R,x-5,y+7,10,1); px(g,R,x-7,y-7,1,13); px(g,R,x+6,y-7,1,13);
  px(g,R,x-6,y-8,1,1); px(g,R,x+5,y-8,1,1); px(g,R,x-6,y+6,1,1); px(g,R,x+5,y+6,1,1);
  px(g,D,x-5,y-8,10,15); px(g,R,x-1,y-8,2,15); px(g,R,x-5,y-1,10,2);
  px(g,"#e8e4dc",x-3,y-4,2,2); px(g,"#e8e4dc",x+2,y-4,2,2); px(g,"#141010",x-2,y-3); px(g,"#141010",x+3,y-3);
  const open=talking&&Math.sin(t*22)>0;
  px(g,"#141010",x-2,y+3,5,open?2:1);
}
function drawSmudge(g,x,y,t){
  const b=Math.round(Math.sin(t*3)*1);
  x=Math.round(x); y=Math.round(y);
  px(g,"rgba(0,0,0,.4)",x-4,y,8,2);
  px(g,"#0b0a0a",x-3,y-10+b,6,10-b); px(g,"#0b0a0a",x-4,y-8+b,8,6); px(g,"#0b0a0a",x-2,y-13+b,4,3);
  px(g,"#1a1818",x-5,y-9+b,1,2); px(g,"#1a1818",x+4,y-7+b,1,3); px(g,"#1a1818",x-1,y-15+b,1,2);
  px(g,"#e8e4dc",x-2,y-9+b,1,2); px(g,"#e8e4dc",x+1,y-9+b,1,2);
}
function drawOffice(g,x,y,t,lit){
  px(g,"#0d0c0b",x-18,y+6,36,3); px(g,"#3b2b1b",x-18,y-4,36,10); px(g,"#4f3a25",x-18,y-5,36,2);
  px(g,"#d9cfb8",x-12,y-6,6,1); px(g,"#d9cfb8",x-11,y-7,5,1);
  px(g,"#6b5233",x+4,y-7,8,2); px(g,"#4a3a26",x+5,y-17,1,10); px(g,"#4a3a26",x+10,y-17,1,10); px(g,"#4a3a26",x+4,y-19,8,2);
  px(g,lit?"#3a2a14":"#141210",x+6,y-17,4,10);
  if(lit){const h=5+(Math.sin(t*14)>0.5?1:0); px(g,"#f2c35a",x+6,y-7-h,4,h); px(g,"#fff1c8",x+7,y-7-h+1,2,h-1);}
}
function drawWhistle(g,x,y,t){
  px(g,"#0d0c0b",x-5,y+16,10,3); px(g,"#4a3f33",x-2,y-2,4,18);
  px(g,"#9a7a3a",x-4,y-20,8,18); px(g,"#c9a04a",x-4,y-20,2,18); px(g,"#6b5233",x-4,y-15,8,1); px(g,"#6b5233",x-4,y-8,8,1);
  px(g,"#2a1f10",x-2,y-12,4,2); px(g,"#6b5233",x-5,y-22,10,2);
  px(g,"#4a3f33",x+4,y-6,8,2); px(g,"#7a2a1f",x+11,y-9,2,8);
  if(Math.sin(t*0.9)>0.85){px(g,"#5c564c",x-1,y-26,2,2);px(g,"#5c564c",x+1,y-30,2,2);}
}

function scareFace(kind){
  const c=mk(48,48), g=c.getContext("2d",{willReadFrequently:true});
  if(kind==="other"){ // your own face, wrong
    if(portraitImg.complete) g.drawImage(portraitImg,0,0,PN,PN,0,0,48,48);
    g.fillStyle="#000"; g.beginPath(); g.ellipse(30,23,5,4,0,0,7); g.ellipse(17,22,4,3,0,0,7); g.fill();
    px(g,"#e8e4dc",30,23); px(g,"#e8e4dc",17,22);
    g.fillStyle="#1a0505"; g.beginPath(); g.ellipse(24,35,11,4,0,0,Math.PI); g.fill();
    for(let x=15;x<=33;x+=3) px(g,"#ece6d6",x,35,2,2);
    px(g,"#4a0f0c",20,39,1,5); px(g,"#4a0f0c",28,39,1,6);
    return c;
  }
  if(kind==="moth"){
    const r=mulberry(91);
    g.strokeStyle="#b8ae96"; g.lineWidth=1;
    g.beginPath();g.moveTo(17,12);g.quadraticCurveTo(10,4,3,1);g.moveTo(31,12);g.quadraticCurveTo(38,4,45,1);g.stroke();
    g.fillStyle="#b8ae96"; g.beginPath(); g.ellipse(24,27,20,17,0,0,7); g.fill();
    g.beginPath(); g.ellipse(24,42,7,6,0,0,7); g.fill();
    crisp(c);
    for(let i=0;i<9;i++){px(g,"#b8ae96",9-i,6-Math.floor(i*0.6)-1);px(g,"#b8ae96",38+i,6-Math.floor(i*0.6)-1);} // feathered antennae
    for(let i=0;i<260;i++){const x=6+Math.floor(r()*36), y=11+Math.floor(r()*34); const d=g.getImageData(x,y,1,1).data; if(d[3]) px(g,r()<0.5?"#d6ccb4":"#8a8170",x,y);}
    // compound eyes
    g.fillStyle="#0b0a09"; g.beginPath(); g.ellipse(13,24,9,11,-0.15,0,7); g.ellipse(35,24,9,11,0.15,0,7); g.fill();
    for(let y=14;y<36;y+=2)for(let x=4;x<45;x+=2){const d=g.getImageData(x,y,1,1).data; if(d[0]<20&&d[3]) px(g,"#17140f",x+((y/2)%2),y);}
    // the reflection of your own lantern, one in each eye
    px(g,"#f2c35a",10,19,2,2); px(g,"#fff1c8",10,19); px(g,"#f2c35a",32,19,2,2); px(g,"#fff1c8",32,19);
    // coiled proboscis
    [[24,36],[25,37],[25,38],[24,39],[23,39],[22,38],[22,37],[23,36]].forEach(([x,y])=>px(g,"#2a2218",x,y));
    px(g,"#2a2218",24,35,1,1); px(g,"#2a2218",21,38,1,1);
  } else {
    g.fillStyle="#bfb8a9"; g.beginPath(); g.ellipse(24,24,17,22,0,0,7); g.fill();
    g.fillStyle="#a19a8b"; g.beginPath(); g.ellipse(16,15,4,2,0,0,7); g.ellipse(32,15,4,2,0,0,7); g.fill();
    g.fillStyle="#120504"; g.beginPath(); g.ellipse(24,32,13,10,0,0,7); g.fill();
    crisp(c);
    for(let x=13;x<=33;x+=3){px(g,"#ece6d6",x,23,2,4);px(g,"#ece6d6",x+1,38,2,4);}
    px(g,"#5a1410",22,41,1,6); px(g,"#5a1410",27,40,1,5);
  }
  return c;
}

/* ================= portrait: Shano's three Ash faces, 48 x 48 each ================= */
const PN=48;
const portraitImg=new Image(); portraitImg.src="data:image/png;base64,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";
function drawPortrait(g,x,y,s,t,growing,rnd){
  const stage=s<25?0:s<55?1:2;
  const shake=growing&&stage>0?Math.round((rnd()-0.5)*2*stage):0;
  px(g,"#3b3328",x-2,y-2,PN+4,PN+4); px(g,"#0b0a09",x-1,y-1,PN+2,PN+2); px(g,"#14110f",x,y,PN,PN);
  if(portraitImg.complete) g.drawImage(portraitImg,stage*PN,0,PN,PN,x+shake,y,PN,PN);
  // the sludge: rises from the bottom, drips from the top once it is deep
  if(s>0){
    const h=s/100*(PN+2);
    for(let i=0;i<PN;i++){
      const drip=((i*37)%11)/11*(s/100)*10;
      const col=clamp(h+Math.sin(i*0.5+t*2.2)*2+drip,0,PN);
      px(g,"#060508",x+i,y+PN-col,1,col);
      if(col>1&&col<PN&&(i+Math.floor(t*3))%5===0) px(g,"#2b2723",x+i,y+PN-col);
      if(s>60){const top=(s-60)/40*24*(((i*53)%7)/7); px(g,"#060508",x+i,y,1,top);}
      if(col>4&&(i*17+Math.floor(t*1.5))%23===0) px(g,"#1f2b2b",x+i,y+PN-col+2); // oil-slick sheen
    }
    if(s>45) for(const i of [6,17,29,41]){ // once it is deep it spills past the frame
      const len=Math.floor(((s-45)/55)*16*(0.5+0.5*Math.sin(i+t*0.8))+2);
      px(g,"#060508",x+i,y+PN+1,1,len); px(g,"#060508",x+i-1,y+PN+1,3,1);
    }
  }
}

/* ================= hand-made 5x7 pixel font ================= */
const FONT=(()=>{
  const src={
    A:"01110100011000111111100011000110001",B:"11110100011000111110100011000111110",C:"01110100011000010000100001000101110",
    D:"11110100011000110001100011000111110",E:"11111100001000011110100001000011111",F:"11111100001000011110100001000010000",
    G:"01110100011000010111100011000101111",H:"10001100011000111111100011000110001",I:"01110001000010000100001000010001110",
    J:"00111000100001000010000101001001100",K:"10001100101010011000101001001010001",L:"10000100001000010000100001000011111",
    M:"10001110111010110101100011000110001",N:"10001100011100110101100111000110001",O:"01110100011000110001100011000101110",
    P:"11110100011000111110100001000010000",Q:"01110100011000110001101011001001101",R:"11110100011000111110101001001010001",
    S:"01111100001000001110000010000111110",T:"11111001000010000100001000010000100",U:"10001100011000110001100011000101110",
    V:"10001100011000110001100010101000100",W:"10001100011000110101101011010101010",X:"10001100010101000100010101000110001",
    Y:"10001100010101000100001000010000100",Z:"11111000010001000100010001000011111",
    "0":"01110100011001110101110011000101110","1":"00100011000010000100001000010001110","2":"01110100010000100010001000100011111",
    "3":"11110000010000101110000010000111110","4":"00010001100101010010111110001000010","5":"11111100001111000001000011000101110",
    "6":"00110010001000011110100011000101110","7":"11111000010001000100010000100001000","8":"01110100011000101110100011000101110",
    "9":"01110100011000101111000010001001100",":":"00000001000010000000001000010000000",".":"00000000000000000000000000110001100",
    ",":"00000000000000000000011000010001000","-":"00000000000000001110000000000000000","!":"00100001000010000100001000000000100",
    "?":"01110100010000100010001000000000100","'":"00100001000100000000000000000000000","/":"00001000100001000100010000100010000",
    "(":"00010001000100001000010000010000010",")":"01000001000001000010000100010001000",">":"01000001000001000001000100010001000","<":"00010001000100010000010000010000010"," ":"00000000000000000000000000000000000"
  };
  return src;
})();
const ADV=6; // 5 wide plus 1 space
function textW(s,k){return s.length*ADV*k-k;}
function text(g,s,x,y,k,color,align,shadow){
  s=String(s).toUpperCase(); k=k||1;
  if(align==="c") x=Math.round(x-textW(s,k)/2); else if(align==="r") x=Math.round(x-textW(s,k));
  if(shadow){text(g,s,x+k,y+k,k,shadow);}
  g.fillStyle=color;
  for(let n=0;n<s.length;n++){
    const gl=FONT[s[n]]||FONT["?"];
    for(let i=0;i<35;i++) if(gl.charCodeAt(i)===49) g.fillRect(x+n*ADV*k+(i%5)*k,y+Math.floor(i/5)*k,k,k);
  }
}
// palette for words on screen
const INK="#d9cfb8", INK2="#8f8778", INK3="#5c564c", FLAME="#e8a94a", EMBER="#3a2a14", BLOOD="#c4473a", COLD="#8fb4c4";

/* ================= words: notes, voices, endings ================= */
const NOTES=[
  "SHIFT RULE 1: KEEP YOUR LAMP LIT. SHIFT RULE 2: SEE RULE 1.",
  "THE DRILL CREW HIT SOMETHING SOFT AT 900 FEET. THE FOREMAN SAYS KEEP DRILLING.",
  "THE BLACK STUFF ISN'T OIL. OIL DOESN'T CRAWL.",
  "ONE FILL. ONE WAY OUT. THEY PAINTED IT ON EVERY WALL. NOBODY LAUGHED.",
  "THE WHISTLE BLEW AT MIDNIGHT. NOBODY PULLED IT. IT HASN'T STOPPED SINCE.",
  "THE FOREMAN TURNED HIS LAMP UP SO BRIGHT WE COULDN'T LOOK AT HIM. HE SAID IT WAS THE ONLY WAY IT WOULDN'T TAKE HIM.",
  "MY GIRL KEEPS ASKING ABOUT THE SUN. I TOLD HER TOMORROW. -T.",
  "IF YOU'RE READING THIS: THE HATCH MOVES. DON'T TRUST THE SAME ROOM TWICE."
];
const EXIT_NAME={hatch:"THE HATCH",lift:"GOING UP",chimney:"BACK THE WAY YOU CAME",drain:"WASHED OUT"};
const VAR_NAME={alone:"ALONE",lamp:"THE FOREMAN'S LAMP",quiet:"QUIET SHIFT",sun:"TWO FOR THE SUNRISE"};
const EXIT_TEXT={
  hatch:"ASH CRANKS THE HATCH OPEN AND CLIMBS OUT INTO A GREY DAWN.",
  lift:"THE CAGE SHUDDERS UP THROUGH 900 FEET OF DARK. THE DOORS OPEN ON MORNING.",
  chimney:"ASH CLIMBS OUT OF THE SAME CHIMNEY HE FELL INTO. THE TOWN IS STILL ASLEEP.",
  drain:"HOLLOW CREEK SPITS ASH OUT ONTO THE MUD. SOAKED. BLACK TO THE ELBOWS. ALIVE."
};
const VAR_TEXT={
  sun:[["SMUDGE","...OH. IT'S SO BIG."],["ASH","YEAH. TRY NOT TO STARE AT IT. TRUST ME."]],
  lamp:[["","FAR BELOW, ONE LAMP IS STILL BURNING. THE FOREMAN SITS BESIDE IT AND DOES NOT CHASE ANYTHING ANYMORE."]],
  quiet:[["","BEHIND HIM THE WHISTLE BLOWS ONE LAST TIME. THEN, FOR THE FIRST TIME IN 137 YEARS, THE WORKS ARE SILENT."]],
  alone:[["ASH","NEVER AGAIN."],["","HE SAYS THAT A LOT."]]
};
const ENDING_IDS=[].concat(...EXIT_TYPES.map(e=>Object.keys(VAR_NAME).map(v=>e+"_"+v)),["foreman","secret"]);
function endingName(id){
  if(id==="foreman") return "THE NEW FOREMAN";
  if(id==="secret") return "THE LAST SHIFT ENDS";
  const [e,v]=id.split("_"); return EXIT_NAME[e]+": "+VAR_NAME[v];
}
const LANTERNS=[
  {id:"brass",name:"BRASS LANTERN",perk:"THE ONE YOU WOKE UP WITH.",how:"",has:()=>true,radius:1,burn:1,moth:1,noise:1,sludge:1},
  {id:"miner",name:"MINER'S LAMP",perk:"BURNS 30% LONGER, BUT A LITTLE DIMMER.",how:"ESCAPE ONCE",has:s=>Object.keys(s.endings).some(k=>k!=="foreman"),radius:0.88,burn:0.7,moth:1,noise:1,sludge:1},
  {id:"foreman",name:"FOREMAN'S LAMP",perk:"MUCH BRIGHTER. THE MOTH LOVES IT.",how:"ESCAPE AFTER HELPING THE MOTH",has:s=>Object.keys(s.endings).some(k=>k.endsWith("_lamp")),radius:1.25,burn:1,moth:1.6,noise:1,sludge:1},
  {id:"whistle",name:"WHISTLE-MAN'S LAMP",perk:"YOUR NOISE IS HALF AS LOUD.",how:"ESCAPE AFTER HELPING THE LISTENER",has:s=>Object.keys(s.endings).some(k=>k.endsWith("_quiet")),radius:1,burn:1,moth:1,noise:0.5,sludge:1},
  {id:"candle",name:"SMUDGE'S CANDLE",perk:"THE DARK SPREADS SLOWER. BURNS FASTER.",how:"ESCAPE WITH SMUDGE",has:s=>Object.keys(s.endings).some(k=>k.endsWith("_sun")),radius:1,burn:1.25,moth:1,noise:1,sludge:0.7},
  {id:"keeper",name:"THE KEEPER'S LAMP",perk:"THE BLACK RISES 25% SLOWER.",how:"COMPLETE THE JOURNAL",has:s=>!!(s.journal&&s.journal.photos&&s.journal.photos.length>=JIDS.length),radius:1,burn:1,moth:1,noise:1,sludge:0.75},
  {id:"first",name:"THE FIRST LAMP",perk:"A LITTLE BETTER AT EVERYTHING.",how:"???",has:s=>!!s.endings.secret,radius:1.06,burn:0.85,moth:0.9,noise:0.8,sludge:0.85}
];
const EVENTS={
  none:null,
  blackout:"TONIGHT: BLACKOUT. THE WALL LAMPS ARE DEAD.",
  double:"TONIGHT: DOUBLE SHIFT. THEY'RE HUNGRY. AND CLOSER.",
  moved:"TONIGHT: WICK MOVED HIS SHOP DEEPER IN.",
  shortage:"TONIGHT: OIL SHORTAGE. MORE SCRIP, LESS OIL.",
  early:"TONIGHT: THE OTHER ONE IS EARLY."
};
const WICK_LORE=[
  "THE FOREMAN WAS A GOOD MAN, BEFORE. HE JUST COULDN'T STAND THE DARK.",
  "THE WHISTLE-MAN HAD A LITTLE GIRL. SHE USED TO BRING HIM HIS LUNCH DOWN HERE.",
  "THEY SAY THE BLACK STUFF CAME UP THE NIGHT WE HIT 900 FEET. I SAY IT WAS ALWAYS HERE. WE JUST WOKE IT.",
  "FUNNY THING. I'VE NEVER SEEN YOUR FACE IN THE DARK. JUST THE OTHER ONE.",
  "READ EVERY NOTE AND YOU'LL KNOW WHO THE LISTENER WAS. THEN BRING HER TO HIM."
];
const VOICE={ASH:["square",300],WICK:["triangle",150],GAUGE:["square",640],SMUDGE:["sine",900],MOTH:["sawtooth",210],LISTENER:["sawtooth",95]};
const JOKES=[
  [["GAUGE","WHY DID THE OIL WORKS CLOSE? IT WASN'T WELL-RUN."],["ASH","...I'M LEAVING."]],
  [["GAUGE","WHAT DO YOU CALL A LANTERN WITH NO OIL?"],["GAUGE","DEPRESSING. THAT'S IT. THAT'S THE JOKE."]],
  [["GAUGE","I TRIED TO QUIT THE WORKS ONCE. BUT I WAS TOO ATTACHED."],["ASH","TO THE PIPE?"],["GAUGE","TO THE PIPE."]],
  [["GAUGE","THE FOREMAN SAYS I'M UNDER TOO MUCH PRESSURE. HE'S RIGHT. IT'S LITERALLY MY JOB."]]
];

/* ================= audio (all synthesized) ================= */
const A={ctx:null,master:null,sfx:null,music:null,noise:null,loops:{}};
function applyAudio(){ if(A.sfx){A.sfx.gain.value=SW.sound?1:0; A.music.gain.value=SW.music?1:0;} }
function audioStart(){
  if(!A.ctx){
    const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return;
    A.ctx=new AC(); A.master=A.ctx.createGain(); A.master.gain.value=0.9; A.master.connect(A.ctx.destination);
    A.sfx=A.ctx.createGain(); A.sfx.connect(A.master); A.music=A.ctx.createGain(); A.music.connect(A.master); applyAudio();
    const len=A.ctx.sampleRate*2, b=A.ctx.createBuffer(1,len,A.ctx.sampleRate), d=b.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    A.noise=b;
  }
  if(A.ctx.state==="suspended") A.ctx.resume();
}
function out(pan){
  if(!A.ctx) return null;
  if(pan===undefined||!A.ctx.createStereoPanner) return A.sfx;
  const p=A.ctx.createStereoPanner(); p.pan.value=clamp(pan,-1,1); p.connect(A.sfx); return p;
}
function nz({dur=0.1,freq=800,q=1,type="bandpass",gain=0.1,pan,attack=0.004,f1}){
  if(!A.ctx) return; const c=A.ctx, t=c.currentTime;
  const s=c.createBufferSource(); s.buffer=A.noise; s.loop=true;
  const f=c.createBiquadFilter(); f.type=type; f.frequency.setValueAtTime(freq,t); f.Q.value=q;
  if(f1) f.frequency.exponentialRampToValueAtTime(f1,t+dur);
  const g=c.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(gain,t+attack); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  s.connect(f).connect(g).connect(out(pan)); s.start(t,Math.random()*1.5); s.stop(t+dur+0.05);
}
function tone({type="sine",f0=440,f1,dur=0.2,gain=0.1,pan,attack=0.005,lp,delay=0}){
  if(!A.ctx) return; const c=A.ctx, t=c.currentTime+delay;
  const o=c.createOscillator(); o.type=type; o.frequency.setValueAtTime(f0,t); if(f1) o.frequency.exponentialRampToValueAtTime(f1,t+dur);
  const g=c.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(gain,t+attack); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  let node=o; if(lp){const f=c.createBiquadFilter(); f.type="lowpass"; f.frequency.value=lp; node.connect(f); node=f;}
  node.connect(g).connect(out(pan)); o.start(t); o.stop(t+dur+0.05);
}
const panOf=x=>x/W*2-1;
const sfx={
  step(run,x){nz({dur:run?0.07:0.05,freq:run?700:450,q:0.8,gain:run?0.12:0.035,pan:panOf(x)});},
  glass(run,x){for(let i=0;i<3;i++) setTimeout(()=>nz({dur:0.04,freq:3000+Math.random()*3500,q:6,gain:run?0.22:0.14,pan:panOf(x)}),i*28);},
  click(){nz({dur:0.03,freq:2200,q:4,gain:0.06});},
  pickup(){tone({type:"triangle",f0:900,f1:1400,dur:0.15,gain:0.08});nz({dur:0.06,freq:4200,q:8,gain:0.08});},
  pour(){nz({dur:0.9,freq:300,f1:180,q:3,gain:0.12,attack:0.08});tone({type:"sine",f0:220,f1:160,dur:0.8,gain:0.05,attack:0.1});},
  out(){nz({dur:0.8,freq:2500,f1:200,q:0.7,gain:0.12,attack:0.02});},
  pain(s){ // placeholder groan until Shano's own pain sounds are dropped in
    const f=150-s*0.5+Math.random()*25;
    tone({type:"sawtooth",f0:f,f1:f*0.6,dur:0.7,gain:0.12+s*0.0015,lp:650,attack:0.05});
    nz({dur:0.6,freq:500,q:1.2,gain:0.05+s*0.0008,attack:0.05});
  },
  clicks(x,vol){for(let i=0;i<3;i++) setTimeout(()=>nz({dur:0.025,freq:1800+i*300,q:9,gain:vol,pan:panOf(x)}),i*90);},
  heartbeat(vol){tone({f0:60,f1:40,dur:0.18,gain:vol});tone({f0:55,f1:38,dur:0.2,gain:vol*0.8,delay:0.22});},
  scare(){nz({dur:0.9,freq:1200,q:0.4,gain:0.5,attack:0.002});[311,330,466,622].forEach(f=>tone({type:"sawtooth",f0:f,f1:f*0.92,dur:1.0,gain:0.12,attack:0.002}));},
  thud(){tone({f0:70,f1:30,dur:1.2,gain:0.35,attack:0.01});nz({dur:1.4,freq:200,type:"lowpass",gain:0.2});},
  blip(who){const v=VOICE[who]; if(!v) return; tone({type:v[0],f0:v[1]*(0.94+Math.random()*0.12),dur:0.04,gain:0.035,attack:0.002});},
  coin(){tone({type:"triangle",f0:1500,f1:1900,dur:0.08,gain:0.06});},
  rumble(){nz({dur:1.3,freq:140,type:"lowpass",gain:0.32,attack:0.02});tone({f0:52,f1:34,dur:1.2,gain:0.16});},
  whoosh(){nz({dur:2.4,freq:260,f1:2600,q:0.6,gain:0.2,attack:0.25});},
  splash(x){nz({dur:0.12,freq:900,q:0.7,gain:0.08,pan:panOf(x)});},
  whisper(pan){for(let i=0;i<5;i++) setTimeout(()=>nz({dur:0.18,freq:2600+Math.random()*1400,q:3,gain:0.05,pan,attack:0.05}),i*120);},
  sting(){tone({type:"sawtooth",f0:58,f1:52,dur:1.4,gain:0.12,lp:300,attack:0.01});tone({type:"sine",f0:1244,f1:1180,dur:0.9,gain:0.03,attack:0.2});},
  slam(){nz({dur:0.5,freq:180,type:"lowpass",gain:0.4,attack:0.002});tone({f0:90,f1:40,dur:0.4,gain:0.3});},
  clank(){nz({dur:0.25,freq:1400,q:5,gain:0.18});tone({type:"square",f0:110,f1:90,dur:0.3,gain:0.06,lp:600});},
  squeal(x){tone({type:"square",f0:2400,f1:3100,dur:0.09,gain:0.025,pan:panOf(x)}); tone({type:"square",f0:2900,f1:2200,dur:0.12,gain:0.025,pan:panOf(x),delay:0.11});},
  valve(x){tone({type:"sawtooth",f0:420,f1:370,dur:0.45,gain:0.05,lp:1800,pan:panOf(x)}); nz({dur:0.4,freq:2600,q:6,gain:0.04,pan:panOf(x)});},
  crate(x){nz({dur:0.25,freq:420,q:2,gain:0.12,pan:panOf(x)}); tone({type:"triangle",f0:180,f1:120,dur:0.2,gain:0.05});},
  rattle(x){for(let i=0;i<6;i++) setTimeout(()=>nz({dur:0.04,freq:800+Math.random()*600,q:4,gain:0.12,pan:panOf(x)}),i*55);},
  win(){[262,330,392,523].forEach((f,i)=>tone({type:"triangle",f0:f,dur:1.4,gain:0.07,delay:i*0.18,attack:0.05}));}
};
function startLoops(){
  if(!A.ctx||A.loops.drone) return;
  const c=A.ctx;
  const srcs=[];
  const drone=c.createGain(); drone.gain.value=0.05; drone.connect(A.music);
  [49,49.6,73.5].forEach(f=>{const o=c.createOscillator();o.frequency.value=f;o.connect(drone);o.start();srcs.push(o);});
  const wind=c.createBufferSource(); wind.buffer=A.noise; wind.loop=true;
  const wf=c.createBiquadFilter(); wf.type="lowpass"; wf.frequency.value=260;
  const wg=c.createGain(); wg.gain.value=0.05; wind.connect(wf).connect(wg).connect(A.music); wind.start(); srcs.push(wind);
  // flutter: noise chopped at wing speed, volume driven by how close the moth is
  const fl=c.createBufferSource(); fl.buffer=A.noise; fl.loop=true;
  const ff=c.createBiquadFilter(); ff.type="bandpass"; ff.frequency.value=1300; ff.Q.value=0.8;
  const chop=c.createGain(); chop.gain.value=0;
  const lfo=c.createOscillator(); lfo.type="square"; lfo.frequency.value=24;
  const lfoG=c.createGain(); lfoG.gain.value=0.5; lfo.connect(lfoG).connect(chop.gain);
  const fv=c.createGain(); fv.gain.value=0; const fp=c.createStereoPanner?c.createStereoPanner():c.createGain();
  fl.connect(ff).connect(chop).connect(fv).connect(fp).connect(A.music); fl.start(); lfo.start(); srcs.push(fl,lfo);
  A.loops={drone,wind:wg,flutter:fv,flutterPan:fp,srcs};
}
function stopLoops(){
  if(!A.ctx||!A.loops.drone) return;
  const t=A.ctx.currentTime;
  A.loops.drone.gain.setTargetAtTime(0,t,0.3); A.loops.wind.gain.setTargetAtTime(0,t,0.3); A.loops.flutter.gain.setTargetAtTime(0,t,0.1);
  const old=A.loops; A.loops={};
  setTimeout(()=>{old.srcs.forEach(n=>{try{n.stop();}catch(e){}});},1500);
}

// Vibration follows the Shanoware setting.
{const scare=sfx.scare, pain=sfx.pain; sfx.scare=function(){buzz([60,40,160]); return scare.apply(this,arguments);}; sfx.pain=function(){buzz(40); return pain.apply(this,arguments);};}

/* ================= save ================= */
function loadSave(){try{return cleanSave(JSON.parse(localStorage.getItem(SAVE_KEY))||{})||cleanSave({});}catch(e){return cleanSave({});}} // no save yet = a complete empty one
function writeSave(s){try{localStorage.setItem(SAVE_KEY,JSON.stringify(s)); writeMeta(s);}catch(e){}}
// Shanoware reads this summary to show progress, unlocks and totals for the save slot.
function writeMeta(s,when=Date.now()){try{
  const found=Object.keys(s.endings||{}).filter(k=>ENDING_IDS.includes(k)).length;
  const lan=LANTERNS.filter(l=>l.has(Object.assign({endings:{}},s))).length;
  localStorage.setItem(SAVE_KEY+".meta",JSON.stringify({progress:[["Endings",found,ENDING_IDS.length],["Notes",(s.notes||[]).length,NOTES.length],["Lanterns",lan,LANTERNS.length]],totals:{Runs:s.runs||0,Escapes:s.escapes||0,Playtime:s.playtime||0},updated:when}));
}catch(e){}}
// A save with no summary, or an older one, gets a fresh summary without changing when it was last played.
// An older save is also rewritten in full (every field present), the form cloud saves expect.
try{const raw=localStorage.getItem(SAVE_KEY); if(raw!==null){
  const m=JSON.parse(localStorage.getItem(SAVE_KEY+".meta")||"null"), when=m&&typeof m.updated==="number"?m.updated:null, full=JSON.stringify(loadSave());
  if(full!==raw) localStorage.setItem(SAVE_KEY,full);
  if(full!==raw||!m||!m.totals) writeMeta(loadSave(),when);
}}catch(e){}
// Only known fields with the right types survive an import, so a broken or foreign file can't wreck the game.
function cleanSave(d){
  if(!d||typeof d!=="object"||Array.isArray(d)) return null;
  const n=v=>typeof v==="number"&&isFinite(v)&&v>=0?v:0;
  const out={runs:n(d.runs),deaths:n(d.deaths),escapes:n(d.escapes),playtime:Math.floor(n(d.playtime)),mostRooms:Math.min(ROOMS,n(d.mostRooms)),wickLore:Math.min(WICK_LORE.length,Math.floor(n(d.wickLore)))};
  if(n(d.best)>0) out.best=d.best;
  out.met={}; if(d.met&&typeof d.met==="object") for(const k of ["wick","gauge","smudge","moth","lis"]) if(d.met[k]) out.met[k]=1;
  out.endings={}; if(d.endings&&typeof d.endings==="object") for(const k of Object.keys(d.endings)) if(ENDING_IDS.includes(k)) out.endings[k]=1;
  out.notes=Array.isArray(d.notes)?[...new Set(d.notes.filter(i=>Number.isInteger(i)&&i>=0&&i<NOTES.length))]:[];
  for(const k of ["lastDeath","lastEnding","lastHelped","lantern"]) if(typeof d[k]==="string"&&d[k].length<24) out[k]=d[k];
  if(d.smudgeSaved===true) out.smudgeSaved=true;
  // journal: only known creatures, no repeats, and a photo only of something already met
  const jj=d.journal&&typeof d.journal==="object"&&!Array.isArray(d.journal)?d.journal:{};
  const seen=Array.isArray(jj.seen)?[...new Set(jj.seen.filter(x=>JIDS.includes(x)))]:[];
  out.journal={seen,photos:Array.isArray(jj.photos)?[...new Set(jj.photos.filter(x=>seen.includes(x)))]:[]};
  if(d.settings&&typeof d.settings==="object") out.settings={hints:d.settings.hints!==false};
  return out;
}
function savePayload(){return {game:"last-light",v:1,saved:new Date().toISOString(),data:cleanSave(loadSave())||{}};}
function applyPayload(obj){
  if(!obj||obj.game!=="last-light"||obj.v!==1) return false;
  const c=cleanSave(obj.data); if(!c) return false;
  writeSave(c); return true;
}
let notice=null;
function notify(msg){notice={msg,t:0}; say(msg);}
function exportSave(){
  const blob=new Blob([JSON.stringify(savePayload(),null,1)],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="last-light-save.json";
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),20000);
  notify("SAVE FILE DOWNLOADED: LAST-LIGHT-SAVE.JSON");
}
const importInput=document.createElement("input"); importInput.type="file"; importInput.accept=".json,application/json";
importInput.addEventListener("change",()=>{
  const f=importInput.files[0]; importInput.value="";
  if(!f) return;
  if(f.size>200000){notify("THAT FILE IS TOO BIG TO BE A SAVE. NOTHING CHANGED.");return;}
  f.text().then(txt=>{let ok=false; try{ok=applyPayload(JSON.parse(txt));}catch(e){} notify(ok?"SAVE LOADED. WELCOME BACK.":"THAT ISN'T A LAST LIGHT SAVE. NOTHING CHANGED.");});
});
function importSave(){importInput.click();}
function saveCode(){return "LL1."+btoa(unescape(encodeURIComponent(JSON.stringify(savePayload()))));}
function copyCode(){
  const code=saveCode(), fallback=()=>{window.prompt("Copy your Last Light save code:",code); keys.clear();};
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(()=>notify("SAVE CODE COPIED. PASTE IT SOMEWHERE SAFE."),fallback);
  else fallback();
}
function pasteCode(){
  const c=window.prompt("Paste your Last Light save code:"); keys.clear();
  if(!c) return;
  let ok=false;
  try{ const t=c.trim(); if(t.startsWith("LL1.")) ok=applyPayload(JSON.parse(decodeURIComponent(escape(atob(t.slice(4)))))); }catch(e){}
  notify(ok?"SAVE CODE LOADED. WELCOME BACK.":"THAT CODE DIDN'T WORK. NOTHING CHANGED.");
}

/* ================= game state ================= */
let G=null, mode="title", last=performance.now();
const keys=new Set();
const fxRnd=mulberry(12345);

function newGame(){
  const sv0=loadSave();
  let ev="none";
  if(sv0.runs){const r=Math.random(); ev=r<0.35?"none":["blackout","double","moved","shortage","early"][Math.floor((r-0.35)/0.13)]||"none";}
  const map=genMap((Math.random()*1e9)|0,ev);
  const rooms=map.rooms, rnd=map.rnd;
  const pick=minD=>{const c=rooms.filter(r=>r.dist>=minD); return c[Math.floor(rnd()*c.length)]||rooms[rooms.length-1];};
  const near=ev==="double"?2:0;
  let lisRoom=pick(5-near), mothRoom=pick(6-near), guard=0;
  while(mothRoom===lisRoom&&guard++<20) mothRoom=pick(6-near);
  G={
    map, rooms, room:map.start, elapsed:0,
    p:{x:160,y:104,dir:"d",step:false,stepT:0,moving:false},
    level:2, fuel:100, flasks:1, pouring:0,
    sludge:0, darkT:0, painT:0, growing:false,
    moth:{kind:"moth",room:mothRoom,inRoom:false,x:0,y:0,interest:0,moveT:10,leaveT:0,safeT:0,wx:160,wy:96,wT:0,exitDir:null},
    lis:{kind:"lis",room:lisRoom,inRoom:false,x:0,y:0,state:"wander",target:null,moveT:8,tx:0,ty:0,listenT:0,stunT:0,safeT:0,wx:160,wy:96,wT:0,idleT:0,exitDir:null,clickT:1},
    hitCool:0, heartT:0, shake:0, scare:null, slide:null, dying:null,
    distCur:null, exitSeen:false, toasts:{}, drips:[], motes:[], visitedCount:1,
    scrip:0, boots:false, tea:0, flares:0, film:0, loaded:0, camera:false, blueprint:false, wrench:false, cam:null, flare:null, reloadT:0, ui:null, invSel:0, jSel:0, invMsg:"", helped:null, burnMul:1, sit:null, hatchCool:0, dlg:null, introPanel:null, metWick:false, jokeI:0,
    smudge:{follow:false,x:0,y:0}, officeLit:false, save:loadSave(),
    ev, lan:LANTERNS[0], crank:false, fuses:0, exitSeq:null, liftT:0, liftReady:false, liftClank:0,
    other:null, figure:null, echo:0, doorShut:null, wrongFace:0, hallT:60+Math.random()*40, blackShift:false, secret:false, enteredFrom:null,
    motes:[], drops:[], steam:[], waterT:0, lockerT:0, critters:[], sealed:{}, turn:null, hissT:0,
  };
  const lid=G.save.lantern; G.lan=LANTERNS.find(l=>l.id===lid&&l.has(Object.assign({endings:{}},G.save)))||LANTERNS[0];
  G.save.met=G.save.met||{}; G.save.endings=G.save.endings||{}; G.save.notes=G.save.notes||[];
  G.room.visited=true; G.toasts["z_"+G.room.zone]=1;
  G.distCur=bfs(rooms,G.room);
}

/* ================= toasts ================= */
function toast(id,msg){
  if(!G||G.toasts[id]) return;
  if(!hintsOn()&&!["ev","shift","slip","liftok"].includes(id)) return; // story and event lines still show
  G.toasts[id]=1;
  G.toast={msg,t:0}; say(msg);
}
const srEl=document.getElementById("sr");
function say(msg){srEl.textContent=msg;}

/* ================= noise and enemy movement ================= */
function noise(x,y,L){
  const e=G.lis; L*=G.lan.noise; if(G.elapsed<GRACE*0.5||e.gone||e.calm) return;
  if(e.inRoom){ if(L>=0.15&&e.state!=="stun"){e.state="hunt";e.tx=x;e.ty=y;} return; }
  const d=G.distCur[e.room.id];
  if((d===1&&L>=0.45)||(d===2&&L>=0.75)) e.target=G.room;
}
function nextRoomToward(from,to){
  if(from===to) return null;
  const d=bfs(G.rooms,to); let best=null;
  for(const n of from.neighbors) if(d[n.id]<d[from.id]) best=n;
  return best;
}
function sideTo(from,to){ // which door of `to` you arrive through when coming from `from`
  if(from.x<to.x) return "w"; if(from.x>to.x) return "e"; if(from.y<to.y) return "n"; return "s";
}
function moveAbstract(e,next){
  const prev=e.room; e.room=next;
  if(next===G.room){
    const side=sideTo(prev,next);
    e.inRoom=true; e.x=DOOR[side].x; e.y=DOOR[side].y; e.safeT=1.2; e.leaveT=0; e.idleT=0; e.exitDir=null;
    if(e.kind==="lis"){e.state="wander";e.target=null;}
  }
}
function placeInside(e){
  let best=null,bd=-1;
  for(let k=0;k<30;k++){
    const x=2*T+Math.random()*(W-4*T), y=2*T+Math.random()*(H-4*T);
    if(boxHits(G.room,x,y,4,3)) continue;
    const d=dist(x,y,G.p.x,G.p.y); if(d>bd){bd=d;best={x,y};}
  }
  e.x=best?best.x:160; e.y=best?best.y:96; e.inRoom=true; e.safeT=1.5; e.leaveT=0; e.idleT=0; e.exitDir=null;
}
function leaveVia(e,dirKey){ e.exitDir=dirKey; }
function stepConcreteExit(e,speed,dt){
  const d=DOOR[e.exitDir]; const dx=d.x-e.x, dy=d.y-e.y, L=Math.hypot(dx,dy);
  if(L<6){ const n=G.room.nb[e.exitDir]; e.inRoom=false; e.exitDir=null; if(n) e.room=n; e.moveT=6; return; }
  e.x+=dx/L*speed*dt; e.y+=dy/L*speed*dt;
}
function randomDoor(){const ks=Object.keys(G.room.nb);return ks[Math.floor(Math.random()*ks.length)];}

function agg(e){return 1+G.elapsed/TIME_LIMIT*1.6+(e&&e.bonus||0)+(G.blackShift?0.5:0)+(G.ev==="double"?0.3:0);}
function lightOn(){return G.fuel>0&&G.level>0&&!G.dying&&!G.sit&&!(G.exitSeq&&G.exitSeq.type==="drain");}
function lightRadius(){return lightOn()?RADIUS[G.level]*G.lan.radius:0;}

function updateMoth(dt){
  const m=G.moth, a=agg(m), on=lightOn();
  if(m.gone||m.calm) return;
  m.flashT=Math.max(0,(m.flashT||0)-dt);
  if(!m.inRoom){
    const d=G.distCur[m.room.id];
    const pull=on?[0,0.6,2.2,5][G.level]*G.lan.moth:-4;
    m.interest=clamp(m.interest+pull*a*dt/(1+0.25*d),0,100);
    m.moveT-=dt;
    if(m.moveT<=0){
      m.moveT=G.elapsed<GRACE?14:(m.interest>=55?Math.max(3,9/a):14);
      const next=(G.elapsed>=GRACE&&m.interest>=55)?nextRoomToward(m.room,G.room):m.room.neighbors[Math.floor(Math.random()*m.room.neighbors.length)];
      if(next) moveAbstract(m,next);
    }
    return;
  }
  m.safeT=Math.max(0,m.safeT-dt);
  const L=lanternPos(G.p.x,G.p.y,G.p.dir);
  const d=dist(m.x,m.y,L.x,L.y);
  if(m.exitDir){stepConcreteExit(m,40,dt);return;}
  const sees=on&&(G.level>1||d<70);
  let tx,ty,sp;
  const fl=G.flare&&G.flare.room===G.room?G.flare:null;
  if(fl){tx=fl.x;ty=fl.y-8;sp=Math.min(95,40*a);m.leaveT=0;}                                  // it would rather have the flare
  else if(sees||m.flashT>0){tx=L.x;ty=L.y;sp=Math.min(95,(26+12*Math.max(1,G.level))*a);m.leaveT=0;} // a camera flash calls it
  else{
    m.leaveT+=dt; m.wT-=dt;
    if(m.wT<=0){m.wT=1.5+Math.random()*2;m.wx=30+Math.random()*(W-60);m.wy=64+Math.random()*(H-104);}
    tx=m.wx;ty=m.wy;sp=22;
    if(m.leaveT>7){m.interest=25;leaveVia(m,randomDoor());}
  }
  const dx=tx-m.x, dy=ty-m.y, len=Math.hypot(dx,dy)||1;
  const wob=Math.sin(G.elapsed*7+m.x*0.05)*0.6;
  m.x+=(dx/len-dy/len*wob)*sp*dt; m.y+=(dy/len+dx/len*wob)*sp*dt;
  m.x=clamp(m.x,10,W-10); m.y=clamp(m.y,12,H-10);
  if(on&&m.safeT<=0&&d<9&&!fl) die("moth"); // while it chases a flare it ignores Ash
}

function updateListener(dt){
  const e=G.lis, a=agg(e);
  if(e.gone||e.calm) return;
  e.safeT=Math.max(0,e.safeT-dt);
  if(!e.inRoom){
    e.moveT-=dt;
    if(e.moveT<=0){
      let next=null;
      if(e.target&&G.elapsed>=GRACE){ next=nextRoomToward(e.room,e.target); if(!next) e.target=null; e.moveT=Math.max(2.5,6/a); }
      else { e.moveT=12; next=e.room.neighbors[Math.floor(Math.random()*e.room.neighbors.length)]; }
      if(next) moveAbstract(e,next);
    }
    e.clickT-=dt;
    if(e.clickT<=0&&G.distCur[e.room.id]===1){e.clickT=3.5;const s=sideTo(G.room,e.room);sfx.clicks(DOOR[s==="w"?"e":s==="e"?"w":s==="n"?"s":"n"].x,0.05);}
    return;
  }
  e.clickT-=dt;
  if(e.clickT<=0){e.clickT=e.state==="hunt"?0.7:1.4;sfx.clicks(e.x,e.state==="hunt"?0.3:0.16);}
  if(e.exitDir){stepConcreteExit(e,30,dt);return;}
  let tx,ty,sp;
  if(e.state==="stun"){e.stunT-=dt; if(e.stunT<=0){let far=null,fd=-1;for(const k of Object.keys(G.room.nb)){const dd=dist(DOOR[k].x,DOOR[k].y,G.p.x,G.p.y);if(dd>fd){fd=dd;far=k;}} leaveVia(e,far);} return;}
  if(e.state==="hunt"){tx=e.tx;ty=e.ty;sp=Math.min(110,62*a); if(dist(e.x,e.y,tx,ty)<6){e.state="listen";e.listenT=1.6;}}
  else if(e.state==="listen"){e.listenT-=dt; if(e.listenT<=0) e.state="wander"; tx=e.x;ty=e.y;sp=0;}
  if(e.state==="wander"){
    e.wT-=dt; e.idleT+=dt;
    if(e.wT<=0){e.wT=2.5+Math.random()*2;e.wx=2*T+Math.random()*(W-4*T);e.wy=2*T+Math.random()*(H-4*T);}
    tx=e.wx;ty=e.wy;sp=16;
    if(e.idleT>22){leaveVia(e,randomDoor());return;}
  } else e.idleT=0;
  const dx=tx-e.x, dy=ty-e.y, len=Math.hypot(dx,dy);
  if(len>1&&sp>0){
    const blocked=moveBox(G.room,e,dx/len*sp*dt,dy/len*sp*dt,3,2);
    if(blocked) moveBox(G.room,e,(-dy/len)*sp*dt,(dx/len)*sp*dt,3,2); // slide round the obstacle
  }
  if(e.safeT<=0&&G.hitCool<=0&&dist(e.x,e.y,G.p.x,G.p.y)<10){
    scare("lis"); G.sludge=clamp(G.sludge+40,0,100); G.hitCool=3;
    e.state="stun"; e.stunT=1.2;
    if(G.sludge>=100) die("dark");
  }
}

/* ================= scares, death, win ================= */
const faces={moth:null,lis:null,other:null};
function scare(kind){
  faces[kind]=faces[kind]||scareFace(kind);
  G.scare={kind,t:0}; G.shake=6; sfx.scare();
}
function die(cause){
  if(G.dying) return;
  G.dying={cause,t:0};
  if(cause==="moth") scare("moth"); else sfx.thud();
  stopLoops();
}
function finish(won,ending){
  mode="end";
  const s=G.save; s.runs=(s.runs||0)+1;
  const hadL=LANTERNS.filter(l=>l.has(s)).map(l=>l.id);
  const rooms=G.rooms.filter(r=>r.visited).length;
  s.mostRooms=Math.max(s.mostRooms||0,rooms);
  let newBest=false;
  if(won){s.escapes=(s.escapes||0)+1; if(!s.best||G.elapsed<s.best){s.best=G.elapsed;newBest=true;} s.endings[ending]=1; s.lastEnding=ending; s.lastDeath=null; if(ending==="sunrise") s.smudgeSaved=true;}
  else {s.deaths=(s.deaths||0)+1; s.lastDeath=G.dying.cause;}
  s.lastHelped=G.helped;
  writeSave(s);
  const fresh=LANTERNS.filter(l=>l.has(s)&&!hadL.includes(l.id));
  const c=won?"won":G.dying.cause, found=Object.keys(s.endings).filter(k=>ENDING_IDS.includes(k)).length;
  const copy={
    won:won?[endingName(ending), "ENDING "+found+" OF "+ENDING_IDS.length+" FOUND."+(newBest?" NEW BEST TIME.":"")]:null,
    moth:["IT FOUND YOUR LIGHT","BRIGHT LIGHT CARRIES A LONG WAY DOWN HERE."],
    time:["THE LAST LIGHT WENT OUT","TWENTY MINUTES. THE DARK DOES NOT WAIT LONGER."],
    dark:["THE DARK TOOK YOU","IT COVERED YOU A LITTLE AT A TIME."]
  }[c];
  G.end={cause:c,title:copy[0],line:copy[1],stats:"TIME "+fmt(G.elapsed)+"   ROOMS "+rooms+"/"+ROOMS+(s.best?"   BEST "+fmt(s.best):""),unlock:fresh.length?"NEW LANTERN: "+fresh.map(l=>l.name).join(", "):""};
  titleT=0;
  say(copy[0]+". "+copy[1]+" Time "+fmt(G.elapsed)+". Press Enter to "+(won?"go back down.":"try again."));
}

/* ================= dialogue ================= */
// steps: [who, text, choices?, pick?, panel?]
function dialog(steps,onDone){
  if(!steps.length){ if(onDone) onDone(); return; }
  G.dlg={steps,i:0,shown:0,sel:0,onDone,blipT:0};
  stepPanel();
}
function stepPanel(){
  const st=G.dlg.steps[G.dlg.i];
  if(st[4]!==undefined&&st[4]!==G.introPanel){G.introPanel=st[4]; G.panelAt=titleT; const f={3:"sting",4:"rumble",5:"whoosh",6:"thud",8:"whisper"}[st[4]]; if(f) sfx[f](0);}
  say((st[0]?st[0]+": ":"")+st[1]);
}
function wrapText(str,n){
  const out=[]; let line="";
  for(const w of str.split(" ")){ if((line+" "+w).trim().length>n){out.push(line);line=w;} else line=(line+" "+w).trim(); }
  if(line) out.push(line); return out;
}
function updDialog(dt){
  const d=G.dlg, st=d.steps[d.i];
  if(d.shown<st[1].length){
    const before=Math.floor(d.shown); d.shown=Math.min(st[1].length,d.shown+dt*48);
    for(let k=before;k<Math.floor(d.shown);k++) if(st[1][k]!==" "&&k%2===0) sfx.blip(st[0]);
  }
}
function dialogKey(code){
  const d=G.dlg, st=d.steps[d.i];
  const ch=st[2];
  if(ch&&d.shown>=st[1].length&&["KeyW","ArrowUp","KeyA","ArrowLeft"].includes(code)){d.sel=(d.sel+ch.length-1)%ch.length;sfx.click();return;}
  if(ch&&d.shown>=st[1].length&&["KeyS","ArrowDown","KeyD","ArrowRight"].includes(code)){d.sel=(d.sel+1)%ch.length;sfx.click();return;}
  if(code!=="Space"&&code!=="Enter") return;
  if(d.shown<st[1].length){d.shown=st[1].length;return;}
  if(ch){const sel=d.sel; G.dlg=null; st[3](sel); return;}
  if(d.i<d.steps.length-1){d.i++;d.shown=0;d.sel=0;stepPanel();return;}
  G.dlg=null; if(d.onDone) d.onDone();
}
/* ================= UI frames: one style for every box ================= */
// Thin border with rounded pixel corners and a faint top highlight.
function uiFrame(g,x,y,w,h,edge,fill,hi){
  px(g,fill||"rgba(5,5,5,.95)",x+1,y+1,w-2,h-2);
  px(g,edge,x+2,y,w-4,1); px(g,edge,x+2,y+h-1,w-4,1); px(g,edge,x,y+2,1,h-4); px(g,edge,x+w-1,y+2,1,h-4);
  px(g,edge,x+1,y+1); px(g,edge,x+w-2,y+1); px(g,edge,x+1,y+h-2); px(g,edge,x+w-2,y+h-2);
  if(hi) px(g,hi,x+2,y+2,w-4,1);
}
// Each speaker's colour, and a 24 x 24 close-up drawn with the same code as their sprite.
const SPEAKERS={ASH:{c:"#b48ad0"},WICK:{c:FLAME},GAUGE:{c:"#d0604a"},SMUDGE:{c:"#cfc6b0"},MOTH:{c:"#d8cfb8"},LISTENER:{c:COLD},NOTE:{c:INK2}};
const spC=mk(48,56), spG=spC.getContext("2d");
function speakerFace(who,x,y,t,talking){
  ctx.imageSmoothingEnabled=false;
  px(ctx,"#000",x,y,24,24);
  spG.clearRect(0,0,48,56);
  const crop=(sx,sy,sz)=>ctx.drawImage(spC,sx,sy,sz,sz,x,y,24,24);
  if(who==="ASH"){ if(portraitImg.complete) ctx.drawImage(portraitImg,(G&&G.sludge>66?2:G&&G.sludge>33?1:0)*PN,0,PN,PN,x,y,24,24); return; }
  if(who==="WICK"){ drawWick(spG,24,50,t); crop(12,2,24); return; }
  if(who==="GAUGE"){ drawGauge(spG,24,24,t,talking); crop(12,12,24); return; }
  if(who==="SMUDGE"){ drawSmudge(spG,24,36,t); crop(18,23,12); return; }
  if(who==="MOTH"){ drawMoth(spG,24,26,t); crop(12,14,24); return; }
  if(who==="LISTENER"){ drawListener(spG,24,40,t,talking&&Math.sin(t*18)>0); crop(17,16,12); return; }
  if(who==="NOTE"){ px(ctx,"#cfc6a8",x+5,y+3,14,18); px(ctx,"#a89f88",x+15,y+3,4,4); for(let i=0;i<5;i++) px(ctx,"#7a7262",x+7,y+9+i*2,i===4?6:10,1); }
}
function renderDialog(){
  const d=G.dlg, st=d.steps[d.i], who=st[0], face=!!SPEAKERS[who];
  const n=face?42:47, full=wrapText(st[1],n), lines=wrapText(st[1].slice(0,Math.floor(d.shown)),n);
  const done=d.shown>=st[1].length, ch=st[2]&&done?st[2]:null;
  const top=who?18:9, body=top+Math.max(full.length,1)*10+(st[2]?st[2].length*10+4:0)+4;
  const x=6, w=W-12, h=Math.max(face?40:0,body), y=H-h-5, tx=x+(face?40:9);
  uiFrame(ctx,x,y,w,h,INK3,"rgba(5,5,5,.95)","#1c1a17");
  if(face){ uiFrame(ctx,x+6,y+6,28,28,"#3a3530","#000"); speakerFace(who,x+8,y+8,titleT,!done); }
  if(who){ const c=SPEAKERS[who]?SPEAKERS[who].c:FLAME; text(ctx,who,tx,y+6,1,c); px(ctx,"#2a2622",tx,y+14,x+w-tx-9,1); }
  lines.forEach((l,i)=>text(ctx,l,tx,y+top+i*10,1,who==="NOTE"?"#cfc6a8":INK));
  const cy0=y+top+full.length*10+4;
  d.hits=ch?ch.map((c,i)=>({i,y0:cy0+i*10-2,y1:cy0+i*10+8})):null;
  if(ch) ch.forEach((c,i)=>{ const yy=cy0+i*10, on=i===d.sel;
    if(on){ px(ctx,"#2a1d0e",tx-2,yy-2,textW(c,1)+12,11); px(ctx,FLAME,tx-2,yy-2,1,11); }
    text(ctx,c,tx+4,yy,1,on?FLAME:INK2); });
  else if(done&&Math.floor(titleT*2.5)%2===0){ const ax=x+w-13, ay=y+h-9; px(ctx,FLAME,ax,ay,5,1); px(ctx,FLAME,ax+1,ay+1,3,1); px(ctx,FLAME,ax+2,ay+2,1,1); } // "next"
}

/* ================= the people: what they say ================= */
function dirWord(from,to){
  const dx=to.x-from.x, dy=to.y-from.y, ax=Math.abs(dx), ay=Math.abs(dy);
  const ns=dy<0?"NORTH":"SOUTH", ew=dx<0?"WEST":"EAST";
  if(ax===0&&ay===0) return "RIGHT HERE";
  if(ax<ay/2) return ns; if(ay<ax/2) return ew; return ns+"-"+ew;
}
function met(k){G.save.met[k]=1; writeSave(G.save);}
function summon(e,x,y){
  e.room=G.room; e.inRoom=true; e.x=x; e.y=y; e.calm=true; e.exitDir=null; e.safeT=2;
  if(e.kind==="lis") e.state="wander";
}
function release(e,hostile){
  e.calm=false;
  if(hostile){e.safeT=2.5; if(e.kind==="moth") e.interest=100; else {e.state="hunt"; e.tx=G.p.x; e.ty=G.p.y;}}
  else {e.safeT=99; leaveVia(e,randomDoor()); if(e.kind==="moth") e.interest=0;}
}
function help(kind){
  G.helped=kind;
  const e=kind==="moth"?G.moth:G.lis, other=kind==="moth"?G.lis:G.moth;
  e.gone=true; e.inRoom=false; e.calm=false; other.bonus=0.6;
  if(kind==="moth") G.burnMul=0.7; else G.exitSeen=true;
}
function talkWick(){
  const sv=G.save, pre=[];
  if(!G.metWick){
    G.metWick=true;
    if(!sv.met.wick) pre.push(["WICK","WELL NOW. A CUSTOMER. FIRST ONE SINCE 1889."],["WICK","THE NAME'S WICK. I SELL OIL. AND OTHER THINGS. MOSTLY OIL."],["ASH","DO YOU TAKE CARD?"],["WICK","I TAKE SCRIP. LITTLE BRASS TOKENS. THEY'RE ALL OVER THE FLOORS. NOBODY DOWN HERE HAS POCKETS ANYMORE."]);
    else pre.push(["WICK",(sv.deaths||0)>0?"BACK AGAIN. THE DARK LIKES YOU, I THINK.":"YOU AGAIN. GOOD FOR BUSINESS, YOU ARE."]);
    if(sv.met.wick&&(sv.wickLore||0)<WICK_LORE.length){pre.push(["WICK",WICK_LORE[sv.wickLore||0]]); sv.wickLore=(sv.wickLore||0)+1;}
    met("wick");
  }
  dialog(pre,shopMenu);
}
function shopMenu(){
  const lift=G.map.exits.some(e=>e.exitT==="lift");
  dialog([["WICK","WHAT'LL IT BE? YOU'VE GOT "+G.scrip+" SCRIP.",["OIL FLASK  3","SOFT BOOTS  5","BITTER TEA  4",lift?"FUSE  6":"FUSE  (NO USE TONIGHT)","LEAVE"],buy]]);
}
function buy(i){
  if(i===4){dialog([["WICK","MIND THE DARK. IT MINDS YOU."]]);return;}
  if(i===3&&!G.map.exits.some(e=>e.exitT==="lift")){dialog([["WICK","THE LIFT'S DEAD TONIGHT. I WOULDN'T SELL YOU SOMETHING USELESS. ...TONIGHT."]],shopMenu);return;}
  if(i===3&&G.fuses>=3){dialog([["WICK","YOU'VE GOT ALL THREE. THE CAGE ONLY TAKES THREE."]],shopMenu);return;}
  const cost=[3,5,4,6][i];
  if(G.scrip<cost){dialog([["WICK","NO SCRIP, NO DEAL. THOSE ARE THE RULES. I DIDN'T MAKE THEM. ...OKAY, I MADE THEM."]],shopMenu);return;}
  if(i===0&&G.flasks>=3){dialog([["WICK","YOU CAN'T CARRY MORE. I'M NOT A MIRACLE WORKER. I'M A WICK."]],shopMenu);return;}
  if(i===1&&G.boots){dialog([["WICK","YOU'RE ALREADY WEARING THEM. I CHECKED."]],shopMenu);return;}
  if(i===2&&G.tea>=3){dialog([["WICK","THREE CUPS IS PLENTY. ANY MORE AND YOU'LL SLOSH."]],shopMenu);return;}
  G.scrip-=cost; sfx.coin();
  if(i===0){G.flasks++; dialog([["WICK","ONE FLASK. DON'T DRINK IT."]],shopMenu);}
  if(i===1){G.boots=true; dialog([["WICK","SOFT BOOTS. BROKEN GLASS WON'T MAKE A SOUND UNDER YOU NOW."]],shopMenu);}
  if(i===2){G.tea++; dialog([["WICK","BITTER TEA. DRINK IT WHEN THE BLACK GETS BAD. IT PULLS SOME OUT."]],shopMenu);}
  if(i===3){G.fuses++; dialog([["WICK","A FUSE. DON'T ASK WHERE I GOT IT."]],shopMenu);}
}
function talkGauge(){
  const sv=G.save, deaths=sv.deaths||0, steps=[];
  if(!sv.met.gauge) steps.push(["GAUGE","HEY! HEY, YOU! OVER HERE. ON THE PIPE."],["GAUGE","I'M GAUGE. I USED TO MEASURE PRESSURE. NOW I MEASURE HOW BORED I AM."]);
  else if(G.jokeI===0) steps.push(["GAUGE",deaths>0?"YOU AGAIN! THAT'S "+deaths+" TIME"+(deaths>1?"S":"")+" THE DARK GOT YOU. YOU'RE PRACTICALLY STAFF.":"HEY, IT'S YOU! THE ONE WITH THE LANTERN!"]);
  met("gauge");
  const joke=JOKES[G.jokeI++%JOKES.length];
  const ex=G.map.exits.slice().sort((a,b)=>G.distCur[a.id]-G.distCur[b.id])[0];
  const need={hatch:"IT'S RUSTED SHUT. FIND A CRANK.",lift:"IT NEEDS THREE FUSES. AND IT'S LOUD.",chimney:"KEEP YOUR LIGHT BIG ALL THE WAY UP.",drain:"DON'T GO IN DIRTY. THE DARK GETS INTO THE WATER."}[ex.exitT];
  const tip=["GAUGE","FREE TIP: "+{hatch:"THE HATCH",lift:"THE LIFT",chimney:"THE CHIMNEY",drain:"THE DRAIN"}[ex.exitT]+" IS SOMEWHERE "+dirWord(G.room,ex)+" OF HERE. "+need];
  steps.push(["GAUGE","WANT TO HEAR A JOKE?",["SURE","ABSOLUTELY NOT"],i=>dialog((i?[["GAUGE","TOO BAD. I'M BOLTED TO A PIPE. THIS IS ALL I HAVE."]]:[]).concat(joke,[tip]))]);
  dialog(steps);
}
function talkSmudge(){
  const sv=G.save;
  if(G.smudge.follow){dialog([["SMUDGE",["I'M BEING VERY QUIET.","IS THE SUN WARM?","YOUR LANTERN IS PRETTY.","I DON'T LIKE THE FLUTTERY ONE."][Math.floor(Math.random()*4)]]]);return;}
  const steps=[];
  if(sv.smudgeSaved) steps.push(["SMUDGE","YOU CAME BACK FOR ME? ...WAIT. DIDN'T WE ALREADY LEAVE? I REMEMBER THE SUN."]);
  else if(sv.met.smudge) steps.push(["SMUDGE","YOU AGAIN. YOU SMELL LIKE THE DARK."]);
  else steps.push(["SMUDGE","...ARE YOU MADE OF LIGHT?"],["ASH","I'M MADE OF BAD DECISIONS. THE LIGHT'S THE LANTERN."],["SMUDGE","I'M SMUDGE. I WAS HERE WHEN THE LAMPS WENT OUT. I DON'T REMEMBER BEING ANYTHING ELSE."]);
  met("smudge");
  steps.push(["SMUDGE","THEY SAY THERE'S A SUN UP THERE. IS IT REAL?",["IT'S REAL. COME WITH ME.","STAY HERE. IT'S SAFER."],i=>{
    if(i===0){G.smudge.follow=true; G.smudge.x=OBJ.x; G.smudge.y=OBJ.y+4; dialog([["SMUDGE","OKAY. I'LL BE VERY QUIET. I'M GOOD AT QUIET."]]);}
    else dialog([["SMUDGE","...OKAY. IF YOU SEE IT, TELL IT I SAID HI."]]);
  }]);
  dialog(steps);
}
function talkOffice(){
  const m=G.moth, sv=G.save;
  if(G.helped==="lis"){dialog([["","THE FOREMAN'S LAMP IS COLD. HE KNOWS WHO YOU HELPED."]]);return;}
  if(G.helped==="moth"){dialog([["MOTH","IT'S STILL BURNING. GO ON. GO HOME."]]);return;}
  summon(m,OBJ.x+26,OBJ.y-10); met("moth");
  const steps=[[ "", "WINGS. SOMETHING LANDS ON THE DESK, RIGHT BESIDE THE DEAD LAMP." ]];
  steps.push(sv.lastHelped==="moth"?["MOTH","...YOU AGAIN. YOU LIT MY LAMP ONCE. DIDN'T YOU? IT FEELS LIKE A DREAM."]:["MOTH","...LIGHT. YOU BROUGHT LIGHT."]);
  steps.push(["MOTH","I WAS THE FOREMAN. I KEPT THE BIG LAMP BURNING. EVERY NIGHT. EVERY SHIFT."],
    ["MOTH","THEN THE OIL RAN OUT. SO I WENT LOOKING FOR MORE. AND I KEPT LOOKING. AND I KEPT LOOKING."],
    ["MOTH","GIVE MY LAMP ONE FLASK. JUST ONE. LET ME SEE IT BURN AGAIN.",["GIVE HIM A FLASK","NO"],i=>{
      if(i===1){dialog([["MOTH","THEN I'LL TAKE YOURS."]],()=>release(m,true));return;}
      if(G.flasks<1){dialog([["MOTH","YOU DON'T HAVE ANY. ...OF COURSE YOU DON'T. COME BACK WHEN YOU DO."]],()=>release(m,false));return;}
      G.flasks--; sfx.pour(); G.officeLit=true; help("moth");
      dialog([["","THE OLD LAMP CATCHES. THE MOTH FOLDS ITS WINGS AND JUST WATCHES IT BURN."],["MOTH","...THERE IT IS."],["MOTH","TRIM YOUR WICK LOW. IT BURNS LONGER THAT WAY. FOREMAN'S ORDERS."],["","SOMEWHERE FAR OFF, SOMETHING CLICKS. IT SOUNDS ANGRY."]]);
    }]);
  dialog(steps);
}
function talkWhistle(){
  const e=G.lis, sv=G.save;
  if(G.helped==="moth"){dialog([["","THE WHISTLE IS COLD. HE HEARD WHAT YOU CHOSE."]]);return;}
  if(G.helped==="lis"){dialog([["LISTENER","...SHHH. IT'S QUIET. KEEP IT THAT WAY."]]);return;}
  summon(e,OBJ.x+28,OBJ.y+14); met("lis");
  const steps=[["","CLICK. CLICK. SOMETHING TALL IS ALREADY STANDING BESIDE THE WHISTLE. IT WAS ALWAYS THERE."],["LISTENER","SHHH."]];
  if(sv.lastHelped==="lis") steps.push(["LISTENER","...I KNOW YOUR FOOTSTEPS. YOU SAT WITH ME ONCE."]);
  steps.push(["LISTENER","YOU HEAR IT? THE WHISTLE. IT NEVER STOPS. THE SHIFT NEVER ENDS."],["ASH","I DON'T HEAR ANYTHING."],["LISTENER","THEN YOU'RE LUCKY."],
    ["LISTENER","SIT WITH ME. NO LIGHT. NO NOISE. LET ME HEAR NOTHING. JUST ONCE.",["SIT IN THE DARK WITH HIM","NO"],i=>{
      if(i===1){dialog([["LISTENER","THEN BE LOUD. I'LL FIND YOU."]],()=>release(e,true));return;}
      G.sit={t:10}; toast("sit","SIT STILL. THE DARK WILL HURT. TEN SECONDS.");
    }]);
  dialog(steps);
}
function endSit(){
  G.sit=null; help("lis");
  if(G.smudge.follow&&G.save.notes.length>=NOTES.length){ // the secret: you know who he was
    G.secret=true; G.lis.gone=false; G.lis.calm=true; G.lis.follow=true;
    dialog([["LISTENER","...THERE. SILENCE."],["SMUDGE","...DADDY?"],["LISTENER","..."],["LISTENER","I KNOW THOSE FOOTSTEPS. I'D KNOW THEM ANYWHERE."],["LISTENER","YOU NEVER GOT YOUR LUNCH TO ME. I WAITED. I WAITED SO LONG."],["SMUDGE","CAN WE GO SEE THE SUN NOW?"],["","THE LISTENER STANDS UP. HE IS COMING WITH YOU."]]);
    return;
  }
  dialog([["LISTENER","...THERE. SILENCE."],["LISTENER","THANK YOU. I CAN HEAR THE WIND IN THE WAY OUT. I'VE MARKED IT ON YOUR MAP."],["","SOMEWHERE FAR OFF, WINGS BEAT FASTER. SOMETHING IS JEALOUS."]]);
}
function readNote(r){
  const i=r.note.i;
  if(!G.save.notes.includes(i)){G.save.notes.push(i); writeSave(G.save);}
  dialog([["NOTE",NOTES[i]]]);
}
function atExit(type){
  G.hatchCool=2.5;
  const back=()=>{const h=G.room.hatch, dx=G.p.x-h.x, dy=(G.p.y-h.y)||1, l=Math.hypot(dx,dy)||1; moveBox(G.room,G.p,dx/l*20,dy/l*20,4,3);};
  const stay="LEAVE THE LANTERN. STAY.";
  const go=(id)=>i=>{if(i===2){back();return;} if(i===1){endingSeq("stay");return;} id();};
  if(type==="hatch"){
    if(!G.crank){dialog([["","THE HATCH. IT'S RUSTED SHUT. THE SOCKET IN THE MIDDLE NEEDS A CRANK."],["ASH","OF COURSE IT DOES."]],back);return;}
    dialog([["","THE CRANK FITS. THE HATCH GROANS OPEN. COLD AIR COMES DOWN. DAYLIGHT, MAYBE."],["ASH",G.smudge.follow?"YOU READY, SMUDGE?":"...FINALLY.",["CLIMB OUT",stay,"NOT YET"],go(()=>endingSeq("hatch"))]]);
  }
  if(type==="lift"){
    if(G.liftReady){dialog([["","THE CAGE SITS THERE, RATTLING. THE DOOR IS OPEN."],["ASH","GOING UP.",["GET IN",stay,"NOT YET"],go(()=>endingSeq("lift"))]]);return;}
    if(G.liftT>0){dialog([["","THE CABLE IS SCREAMING. THE CAGE IS STILL COMING DOWN."]],back);return;}
    if(G.fuses<3){dialog([["","A LIFT CAGE. THE FUSE BOX BESIDE IT HAS THREE EMPTY SLOTS. YOU HAVE "+G.fuses+"."]],back);return;}
    dialog([["","THE FUSES SNAP IN. THE LEVER IS STIFF."],["","IF YOU PULL IT, EVERYTHING DOWN HERE WILL HEAR THE CABLE.",["PULL THE LEVER",stay,"NOT YET"],go(()=>{G.liftT=20; sfx.slam(); toast("lift","THE CAGE IS COMING. SURVIVE 20 SECONDS."); back();})]]);
  }
  if(type==="chimney"){
    dialog([["","A LADDER, BOLTED INTO THE CHIMNEY. FAR ABOVE, A COIN OF GREY SKY."],["","IT'S A LONG CLIMB. THE LANTERN WILL HAVE TO BURN ON FULL THE WHOLE WAY.",["CLIMB",stay,"NOT YET"],go(()=>{
      const m=G.moth, d=m.gone?99:(m.inRoom?0:G.distCur[m.room.id]);
      G.exitSeq={type:"chimney",t:0,dur:12,mothAt:m.gone?99:1.5+d*2.4}; G.p.x=G.room.hatch.x; G.p.y=G.room.hatch.y+6; G.level=3;
      toast("climb","CLIMB. KEEP THE LIGHT UP.");
    })]]);
  }
  if(type==="drain"){
    dialog([["","THE DRAIN. BLACK WATER, AND A TUNNEL UNDER IT. YOU CAN HEAR THE CREEK ON THE OTHER SIDE."],["","NO LANTERN WORKS UNDER WATER. IT'S A LONG WAY IN THE DARK.",["SWIM",stay,"NOT YET"],go(()=>{
      G.exitSeq={type:"drain",t:0,dur:15}; G.p.x=G.room.hatch.x; G.p.y=G.room.hatch.y; G.darkT=2; sfx.splash(G.p.x);
      toast("swim","HOLD YOUR BREATH. FIFTEEN SECONDS.");
    })]]);
  }
}
function atHatch(){atExit(G.room.exitT||"hatch");}
function oldAtHatch(){
  dialog([["","THE HATCH. COLD AIR COMES UP THROUGH THE CRACKS. DAYLIGHT, MAYBE."],
    ["ASH",G.smudge.follow?"YOU READY, SMUDGE?":"...FINALLY.",["CLIMB OUT","LEAVE THE LANTERN. STAY.","NOT YET"],i=>{
      if(i===2){G.hatchCool=2; const h=G.room.hatch, dx=G.p.x-h.x, dy=G.p.y-h.y, l=Math.hypot(dx,dy)||1; moveBox(G.room,G.p,dx/l*16,dy/l*16,4,3); return;}
      endingSeq(i===1?"stay":"hatch");
    }]]);
}
function endingSeq(kind){
  let id, steps;
  if(kind==="stay"){
    id="foreman"; steps=[["","ASH HANGS THE LANTERN ON THE FOREMAN'S OLD HOOK."],["ASH","SOMEBODY HAS TO KEEP THE LIGHTS ON DOWN HERE."]];
    if(G.smudge.follow) steps.push(["SMUDGE","...THEN I'LL STAY TOO. THE SUN CAN WAIT."]);
    if(G.helped==="lis") steps.push(["","THE WORKS ARE QUIET NOW. IT IS ALMOST PEACEFUL."]);
    if(G.helped==="moth") steps.push(["","ONE LAMP DOWN THE HALL BURNS BACK, LIKE AN ANSWER."]);
  } else if(G.secret){
    id="secret"; steps=[["",EXIT_TEXT[kind]],["","BEHIND HIM SOMETHING TALL CLIMBS OUT TOO, WITH A SMALL SOOTY GIRL ON ITS SHOULDERS."],["LISTENER","...IT'S SO QUIET UP HERE."],["SMUDGE","THAT'S THE SUN, DADDY."],["","THE LAST SHIFT OF THE HOLLOW CREEK OIL WORKS IS OVER."]];
  } else {
    const v=G.smudge.follow?"sun":G.helped==="moth"?"lamp":G.helped==="lis"?"quiet":"alone";
    id=kind+"_"+v; steps=[["",EXIT_TEXT[kind]]].concat(VAR_TEXT[v]);
  }
  G.ending=id;
  dialog(steps,()=>{sfx.win();stopLoops();finish(true,id);});
}
function intro(){
  const sv=G.save, runs=sv.runs||0;
  if(!runs){
    dialog([["","MOUNT HOLLOW. EVERYONE IN TOWN KNOWS THE RULE.",null,null,0],["","NOBODY GOES NEAR THE OLD OIL WORKS CHIMNEY."],
      ["","ASH WENT ANYWAY.",null,null,1],["ASH","A WHOLE TOWN SCARED OF A CHIMNEY. COME ON."],
      ["ASH","IT'S A HOLE. WHAT'S IT GONNA DO, BITE ME?",null,null,2],
      ["","AT THE BOTTOM, SOMETHING OPENED ITS EYES.",null,null,3],
      ["","IT DID NOT BITE.",null,null,4],["","IT WAS JUST VERY, VERY DEEP.",null,null,5],
      ["","...",null,null,6],
      ["","ASH WAKES UP ON A PILE OF OILY RAGS. A LANTERN IS BURNING BESIDE HIM.",null,null,7],["ASH","...I DEFINITELY DIDN'T BRING A LANTERN."],
      ["","SOMEWHERE IN THE DARK, SOMETHING NOTICED THE LIGHT.",null,null,8]],introDone);
    return;
  }
  const line={moth:["","YOU WAKE ON THE RAGS AGAIN. SOMEWHERE FAR OFF, SOMETHING FLUTTERS."],dark:["","YOU WAKE ON THE RAGS AGAIN. YOUR HANDS ARE STILL A LITTLE BLACK."],time:["","YOU WAKE ON THE RAGS AGAIN. THE LANTERN IS FULL. IT WASN'T, LAST TIME."]}[sv.lastDeath]
    ||["","YOU CLIMBED OUT. AND NOW YOU'RE BACK ON THE RAGS. WHY ARE YOU BACK ON THE RAGS?"];
  const ash={moth:"COOL. COOL COOL COOL.",dark:"GREAT. LOVE THAT FOR ME.",time:"...I'M NOT GONNA THINK ABOUT THAT."}[sv.lastDeath]||"FORGOT MY DIGNITY DOWN HERE.";
  dialog([[line[0],line[1],null,null,7],["ASH",ash]],introDone);
}
function introDone(){G.introPanel=null; if(EVENTS[G.ev]) toast("ev",EVENTS[G.ev]); else toast("talk",K("use")+" TO TALK, READ AND USE THINGS.");}

/* ================= main update ================= */
function update(dt){
  if(G&&G.toast&&!G.dlg){G.toast.t+=dt; if(G.toast.t>3.4) G.toast=null;} // a hint waits until the conversation ends
  if(notice) notice.t+=dt;
  titleT+=dt;
  if(mode!=="play") return;
  if(G.scare){G.scare.t+=dt; if(G.scare.t>0.75) G.scare=null;}
  G.shake=Math.max(0,G.shake-dt*14);
  if(G.dying){
    G.dying.t+=dt;
    if(G.dying.cause!=="moth") G.sludge=Math.min(100,G.sludge+60*dt);
    if(G.dying.t>1.6) finish(false);
    return;
  }
  if(G.slide){G.slide.t+=dt/0.32; if(G.slide.t>=1) G.slide=null; return;}
  if(G.dlg){updDialog(dt); return;}            // talking stops the clock
  if(G.ui) return;                              // so do the bag and the journal

  G.elapsed+=dt;
  if(G.flare){G.flare.t-=dt; if(G.flare.t<=0) G.flare=null;}
  if(G.cam) G.cam.flash=Math.max(0,G.cam.flash-dt);
  if(G.reloadT>0){G.reloadT-=dt; if(G.reloadT<=0){const n=Math.min(G.film,3-G.loaded); G.film-=n; G.loaded+=n; sfx.click();}}
  if(G.moth.inRoom&&!G.moth.gone) journalSeen("moth");
  if(G.lis.inRoom&&!G.lis.gone) journalSeen("listener");
  G.hatchCool=Math.max(0,G.hatchCool-dt);
  if(G.sit){G.sit.t-=dt; if(G.sit.t<=0){endSit(); return;}}
  if(G.exitSeq&&updExitSeq(dt)) return;
  const timeUp=G.elapsed>=TIME_LIMIT;
  if(timeUp&&G.fuel>0){G.fuel=0;sfx.out();}
  G.hitCool=Math.max(0,G.hitCool-dt);
  const p=G.p;

  // movement
  let mx=0,my=0;
  if(keys.has("KeyA")||keys.has("ArrowLeft")) mx-=1;
  if(keys.has("KeyD")||keys.has("ArrowRight")) mx+=1;
  if(keys.has("KeyW")||keys.has("ArrowUp")) my-=1;
  if(keys.has("KeyS")||keys.has("ArrowDown")) my+=1;
  const run=keys.has("ShiftLeft")||keys.has("ShiftRight");
  if(G.turn&&(mx||my)){G.turn=null; tell("YOU LET GO OF THE WHEEL.");}
  if(G.sit||G.exitSeq||G.cam){mx=0;my=0;} // a raised camera holds Ash still
  p.moving=!!(mx||my);
  if(p.moving){
    const l=Math.hypot(mx,my); mx/=l; my/=l;
    const wet=tileAt(G.room,p.x,p.y)===5;
    const sp=(G.pouring>0?18:run?78:46)*(wet?0.6:1)*dt;
    moveBox(G.room,p,mx*sp,my*sp,4,3);
    p.dir=Math.abs(mx)>Math.abs(my)?(mx<0?"l":"r"):(my<0?"u":"d");
    p.stepT-=dt;
    if(p.stepT<=0){
      p.stepT=run?0.22:0.32; p.step=!p.step;
      const glass=tileAt(G.room,p.x,p.y)===4;
      if(glass&&!G.boots){sfx.glass(run,p.x);noise(p.x,p.y,run?0.75:0.4);}
      else if(wet){sfx.splash(p.x);noise(p.x,p.y,run?0.6:0.25);}
      else{sfx.step(run,p.x);noise(p.x,p.y,run?0.5:0.06);}
      if(G.echo>0){const ex=W-p.x; setTimeout(()=>sfx.step(run,ex),170);} // your own footsteps, a beat late, from the wrong side
    }
  }

  updTurn(dt);
  // leaving the room through a door
  let dir=null;
  if(p.x<2&&G.room.nb.w) dir="w"; else if(p.x>W-2&&G.room.nb.e) dir="e";
  else if(p.y<4&&G.room.nb.n) dir="n"; else if(p.y>H-2&&G.room.nb.s) dir="s";
  if(dir){enterRoom(dir);return;}

  // lantern
  if(G.pouring>0){G.pouring-=dt; if(G.pouring<=0){G.fuel=Math.min(100,G.fuel+45);G.flasks--;}}
  if(lightOn()){
    G.fuel=Math.max(0,G.fuel-BURN[G.level]*G.burnMul*G.lan.burn*dt);
    if(G.fuel<=0){sfx.out();toast("out","The lantern went out. Press "+K("pour")+" to pour oil.");}
    else if(G.fuel<25) toast("low","The lantern is running low.");
  }

  // the dark
  const lvl=lightOn()?G.level:0;
  if(lvl===0) G.darkT+=dt; else G.darkT=0;
  let rate=SLUDGE_RATE[lvl];
  if(lvl===0&&G.darkT<1.5) rate=0;
  if(lvl===0&&!G.sit&&staticLights().some(l=>dist(l.x,l.y,p.x,p.y-8)<l.r*0.8)){rate=-2;G.darkT=0;} // safe in someone else's light
  if(rate>0) rate*=G.lan.sludge;
  // the Black Shift: the room edges fill with the dark
  if(G.blackShift){const e=shiftEdge(); if(p.x<T+e||p.x>W-T-e||p.y<T+e+6||p.y>H-T-e) rate+=6;}
  if(timeUp) rate=12;
  G.sludge=clamp(G.sludge+rate*dt,0,100);
  G.growing=rate>0;
  if(G.growing&&lvl===0) toast("dark","The dark is spreading. Get back into the light.");
  if(G.growing&&G.sludge>12){
    G.painT-=dt;
    if(G.painT<=0){G.painT=3.0-G.sludge*0.018+Math.random()*0.6;sfx.pain(G.sludge);noise(p.x,p.y,0.35+G.sludge/200);}
  }
  if(G.growing&&Math.random()<dt*G.sludge*0.08) G.drips.push({x:p.x+(Math.random()*12-6),y:p.y-6-Math.random()*14,v:8,life:0.8});
  if(G.sludge>=100){die(timeUp?"time":"dark");return;}

  // oil and the hatch
  G.room.oil=G.room.oil.filter(o=>{
    if(dist(o.x,o.y,p.x,p.y)<10){
      if(G.flasks>=3){toast("full","You can only carry 3 flasks.");return true;}
      G.flasks++; sfx.pickup(); toast("flask","Oil flask. Press "+K("pour")+" to pour it into the lantern."); return false;
    }
    return true;
  });
  G.room.scrip=G.room.scrip.filter(c=>{if(dist(c.x,c.y,p.x,p.y)<9){G.scrip++;sfx.coin();toast("scrip","BRASS SCRIP. WICK THE OIL SELLER TAKES THESE.");return false;}return true;});
  const it=G.room.item;
  if(it&&dist(it.x,it.y,p.x,p.y)<10){
    G.room.item=null; sfx.pickup();
    if(it.kind==="crank"){G.crank=true; toast("crank","A RUSTED CRANK. IT LOOKS LIKE IT FITS A HATCH.");}
    else if(it.kind==="fuse"){G.fuses++; G.toasts.fuse=0; toast("fuse","A FUSE. "+G.fuses+" OF 3.");}
    else pickUp(it.kind);
  }
  const h=G.room.hatch;
  if(h){
    if(lightOn()&&dist(h.x,h.y,p.x,p.y)<lightRadius()+20) G.room.exitSeen=true;
    if(dist(h.x,h.y,p.x,p.y)<14&&G.hatchCool<=0&&!G.exitSeq){atExit(G.room.exitT);return;}
  }
  // the lift, coming down
  if(G.liftT>0){
    G.liftT-=dt; G.liftClank-=dt;
    if(G.liftClank<=0){G.liftClank=1.1; sfx.clank(); const e=G.lis; if(!e.gone&&!e.calm){e.target=G.map.exits.find(r=>r.exitT==="lift"); if(e.inRoom){e.state="hunt";e.tx=p.x;e.ty=p.y;}}}
    if(G.liftT<=0){G.liftReady=true; sfx.slam(); toast("liftok","THE CAGE IS DOWN. GET IN.");}
  }
  updWorld(dt);
  // Smudge keeps a step behind you
  if(G.smudge.follow){
    const sm=G.smudge, tx=p.x-(p.dir==="r"?12:p.dir==="l"?-12:0), ty=p.y-(p.dir==="d"?10:p.dir==="u"?-10:0)+2, dd=dist(sm.x,sm.y,tx,ty);
    if(dd>3&&!isSolid(tileAt(G.room,tx,ty))){const sp=Math.min(90,dd*3)*dt; sm.x+=(tx-sm.x)/dd*sp; sm.y+=(ty-sm.y)/dd*sp;}
    if(G.moth.inRoom&&!G.moth.calm) toast("smudge","SMUDGE: IT'S HERE. MAKE THE LIGHT SMALL.");
  }
  if(G.lis.follow){const e=G.lis, tx=p.x+16, ty=p.y+4, dd=dist(e.x,e.y,tx,ty); e.room=G.room; e.inRoom=true; if(dd>3){const sp=Math.min(80,dd*3)*dt; e.x+=(tx-e.x)/dd*sp; e.y+=(ty-e.y)/dd*sp;}}

  updateMoth(dt);
  updateListener(dt);

  // warning sounds
  const m=G.moth;
  if(A.loops.flutter){
    let fv=0,pan=0;
    if(m.gone) fv=0;
    else if(m.inRoom){fv=(m.calm?0.08:0.28)*(1-clamp(dist(m.x,m.y,p.x,p.y)/320,0,1));pan=panOf(m.x);}
    else if(G.distCur[m.room.id]===1&&m.interest>35) fv=0.05;
    A.loops.flutter.gain.setTargetAtTime(fv,A.ctx.currentTime,0.1);
    if(A.loops.flutterPan.pan) A.loops.flutterPan.pan.setTargetAtTime(pan,A.ctx.currentTime,0.1);
    A.loops.drone.gain.setTargetAtTime(G.blackShift?0:0.05+G.elapsed/TIME_LIMIT*0.07,A.ctx.currentTime,G.blackShift?0.05:1);
  }
  let near=Infinity;
  if(m.inRoom&&!m.calm) near=Math.min(near,dist(m.x,m.y,p.x,p.y));
  if(G.lis.inRoom&&!G.lis.calm) near=Math.min(near,dist(G.lis.x,G.lis.y,p.x,p.y));
  if(G.other&&G.other.state!=="copy") near=Math.min(near,dist(G.other.x,G.other.y,p.x,p.y));
  if(G.blackShift) near=Math.min(near,120);
  G.heartT-=dt;
  if(near<130&&G.heartT<=0){G.heartT=0.45+near/130*0.7;sfx.heartbeat(0.25*(1-near/130)+0.05);}

  // drips and dust
  G.drips=G.drips.filter(d=>(d.life-=dt)>0&&(d.y+=d.v*dt,d.v+=40*dt,true));
}

function enterRoom(dir){
  const from=G.room, to=from.nb[dir], p=G.p;
  openShutDoor(); G.other=null; G.figure=null;
  G.enteredFrom={n:"s",s:"n",e:"w",w:"e"}[dir];
  [G.moth,G.lis].forEach(e=>{if(e.inRoom&&e.room===from&&!e.gone&&!e.follow){e.calm=false;e.inRoom=false;e.exitDir=null;e.moveT=e.kind==="moth"?Math.max(3,9/agg()):5;}});
  G.slide={from:roomCanvas(from),to:roomCanvas(to),dir,t:0};
  G.room=to;
  if(dir==="w") p.x=W-14; if(dir==="e") p.x=14; if(dir==="n") p.y=H-12; if(dir==="s") p.y=22;
  if(!to.visited){to.visited=true;}
  G.distCur=bfs(G.rooms,to);
  [G.moth,G.lis].forEach(e=>{if(!e.gone&&!e.follow&&e.room===to&&!e.inRoom){placeInside(e); if(e.kind==="lis"){e.state="wander";}}});
  if(G.smudge.follow){G.smudge.x=p.x+(dir==="e"?-14:dir==="w"?14:0); G.smudge.y=p.y+(dir==="s"?-12:dir==="n"?12:0);}
  if(G.lis.follow){G.lis.x=p.x+16; G.lis.y=p.y+4;}
  // the Other: late in a run, some rooms already have you in them
  const otherT=G.ev==="early"?180:OTHER_T;
  if(G.elapsed>otherT&&!to.special&&!to.exitT&&to!==G.map.start&&Math.random()<(G.blackShift?0.5:0.3)){
    let ox=clamp(W-p.x,48,W-48), oy=p.y; if(boxHits(to,ox,oy,4,3)){ox=160;oy=104;}
    G.other={x:ox,y:oy,hist:[],state:"copy",lit:0,t:0,dark:0,dir:"d"}; G.echo=Math.max(G.echo,4);
  }
  if(to.kind==="lockers") G.lockerT=2+Math.random()*6;
  G.critters=spawnCritters(to); G.turn=null; G.steam=[]; G.drops=[]; // steam and drips stay in the room they came from
  if(!G.toasts["z_"+to.zone]){G.toasts["z_"+to.zone]=1; tell(ZONE[to.zone].name);}
  else if(to.glitch&&G.blueprint) toast("glitch","THE MAP WON'T HOLD STILL IN HERE.");
}
// Rats and baby tarlings: harmless, and they run from Ash. Rats squeal as they go, and that carries.
function spawnCritters(r){
  const out=[]; if(r===G.map.start||r.special) return out;
  const add=k=>{const [x,y]=freeSpot(r,Math.random); out.push({k,x:x*T+8,y:y*T+10,run:false,wT:0,vx:0,vy:0,dir:1,stuck:0});};
  for(let i=0,n=r.kind==="rats"?5:Math.random()<0.18?1:0;i<n;i++) add("rat");
  if((r.zone==="sump"||r.zone==="drill")&&Math.random()<0.25) for(let i=0,n=Math.random()<0.4?2:1;i<n;i++) add("baby");
  return out;
}
function updCritters(dt){
  const p=G.p;
  G.critters=G.critters.filter(c=>{
    const d=dist(c.x,c.y,p.x,p.y);
    if(d<34&&!c.run){c.run=true;
      if(c.k==="rat"){sfx.squeal(c.x); noise(c.x,c.y,0.45); toast("rats","RATS. THEIR SQUEALING CARRIES.");}
      else toast("baby","A LITTLE ONE. IT'S MORE AFRAID OF YOU.");}
    let vx=c.vx, vy=c.vy, sp=c.k==="rat"?14:8;
    if(c.run){vx=(c.x-p.x)/(d||1); vy=(c.y-p.y)/(d||1); sp=c.k==="rat"?72:40;}
    else{c.wT-=dt; if(c.wT<=0){c.wT=0.6+Math.random()*1.6; const a=Math.random()*6.28; c.vx=Math.random()<0.4?0:Math.cos(a); c.vy=c.vx?Math.sin(a):0;}}
    if(vx||vy){ if(vx) c.dir=vx<0?-1:1;
      if(moveBox(G.room,c,vx*sp*dt,vy*sp*dt,2,1)&&c.run&&(c.stuck+=dt)>0.25) return false; } // into a crack in the wall
    return c.x>T&&c.x<W-T&&c.y>T&&c.y<H-T+4;
  });
}
function drawCritter(c,t){
  const x=Math.round(c.x), y=Math.round(c.y), s=c.dir, f=Math.floor(t*(c.run?16:6))%2;
  if(c.k==="baby"){ if(EA) EA.tarlingBaby(ctx,x,y,Math.floor(t*(c.run?14:5))); return; }
  px(ctx,"rgba(0,0,0,.35)",x-3,y,7,1); px(ctx,"#4a443c",x-3,y-3,6,3); px(ctx,"#5a5248",x-2,y-4,4,1);
  px(ctx,"#4a443c",s>0?x+3:x-5,y-3,2,2); px(ctx,"#c4473a",s>0?x+4:x-5,y-3);
  px(ctx,"#8a6a5a",s>0?x-6:x+3,y-2+f,3,1); px(ctx,"#2e2a24",x-2,y,1,1+f); px(ctx,"#2e2a24",x+1,y,1,2-f);
}
// Crates: open one to see what is in it. Valve wheels: hold still while one turns; it is loud.
function openCrate(r,c){
  if(!c.open){c.open=true; r.canvas=null; sfx.crate(c.x); noise(c.x,c.y,0.2); if(!c.item){tell("EMPTY."); return;}}
  if(c.item==="oil"&&G.flasks>=3){tell("YOU CAN ONLY CARRY 3 FLASKS."); return;}
  const k=c.item; c.item=null; sfx.pickup(); pickUp(k);
}
function startTurn(r,v){ if(G.turn) return; G.turn={r,v,t:0,dur:G.wrench?1.5:3,nT:0}; toast("valve","HOLD STILL TO TURN THE WHEEL. IT SCREAMS."); }
function updTurn(dt){
  const q=G.turn; if(!q) return;
  q.t+=dt; q.nT-=dt;
  if(q.nT<=0){q.nT=0.5; sfx.valve(q.v.x); noise(q.v.x,T+10,0.55);}
  if(q.t<q.dur) return;
  q.v.shut=true; q.v.a+=q.dur*4; G.turn=null; sfx.clank();
  const r=q.r, n=r.valves.filter(v=>v.shut).length;
  if(n===3){G.sealed[r.zone]=true; sfx.thud(); tell("ALL THREE SHUT. THE BROKEN PIPES GO QUIET.");}
  else tell(n+" OF 3 WHEELS SHUT.");
}
function useTerminal(){ sfx.click(); tell("THE SCREEN IS ALL STATIC. THE TAPE DECK IS EMPTY."); }
function lookHole(){ tell("900 FEET DOWN. SOMETHING DOWN THERE BREATHES."); }
function drawRoomProps(r,t){
  if(r.valves) for(const v of r.valves){ // the wheels turn while you turn them
    const a=v.a+(G.turn&&G.turn.v===v?G.turn.t*4:0), cx=v.x, cy=6, c=v.shut?"#5a1f17":"#9a3a2a";
    for(let k=0;k<14;k++){const aa=k/14*6.283; px(ctx,c,Math.round(cx+Math.cos(aa)*5)-1,Math.round(cy+Math.sin(aa)*5)-1,2,2);}
    for(let k=0;k<3;k++){const aa=a+k/3*2.094; for(let d=-4;d<=4;d++) px(ctx,v.shut?"#3e1410":"#7a2a1f",Math.round(cx+Math.cos(aa)*d),Math.round(cy+Math.sin(aa)*d));}
    px(ctx,v.shut?"#7a2a22":"#c4473a",cx-1,cy-1,2,2);
    if(v.shut){px(ctx,"#cfc6b0",cx+7,cy+1); px(ctx,"#cfc6b0",cx+8,cy+2); px(ctx,"#cfc6b0",cx+9,cy+1); px(ctx,"#cfc6b0",cx+10,cy); px(ctx,"#cfc6b0",cx+11,cy-1);} // chalked off
  }
  for(const c of r.crates) if(c.open&&c.item) drawIcon(ctx,c.item==="oil"?"flask":c.item,c.x-4,c.y-4,8);
  for(const d of r.decor) if(d.k==="corpse") for(let i=0;i<7;i++){ // flies
    const a=t*(2.5+i*0.6)+i*1.7, rr=4+(i*5)%8;
    px(ctx,(i+Math.floor(t*9))%4?"#4a463c":"#8f8778",Math.round(d.x+Math.cos(a)*rr),Math.round(d.y-5+Math.sin(a*1.3)*rr*0.5));
  }
}
function openShutDoor(){
  const d=G.doorShut; if(!d) return;
  for(const [i,v] of d.saved) d.room.tiles[i]=v;
  G.doorShut=null;
}
function shutDoor(dirKey){
  const r=G.room, t=r.tiles, idx={n:[9,10],s:[(RH-1)*RW+9,(RH-1)*RW+10],w:[5*RW,6*RW],e:[5*RW+RW-1,6*RW+RW-1]}[dirKey];
  G.doorShut={room:r,dir:dirKey,t:8,saved:idx.map(i=>[i,t[i]])};
  idx.forEach(i=>t[i]=1); sfx.slam(); G.shake=4;
}
function shiftEdge(){return clamp((G.elapsed-SHIFT_T)/(TIME_LIMIT-SHIFT_T),0,1)*40;}
function updExitSeq(dt){
  const q=G.exitSeq, p=G.p; q.t+=dt;
  if(q.type==="chimney"){
    G.level=3; G.fuel=Math.max(0,G.fuel-2.4*dt);
    p.y=G.room.hatch.y+6-q.t/q.dur*70; p.dir="u"; p.moving=true; p.stepT-=dt; if(p.stepT<=0){p.stepT=0.4;p.step=!p.step;sfx.step(false,p.x);}
    if(G.fuel<=0){ // the light dies on the ladder
      G.exitSeq=null; p.y=G.room.hatch.y+14; p.moving=false; G.sludge=clamp(G.sludge+30,0,100); G.shake=8; sfx.thud(); G.hatchCool=3;
      toast("slip","THE LANTERN DIED. YOU SLIPPED BACK DOWN."); return true;
    }
    if(q.t>=q.mothAt&&!q.came){ q.came=true; const m=G.moth; m.room=G.room; m.inRoom=true; m.calm=false; m.exitDir=null; m.x=DOOR.s.x; m.y=DOOR.s.y; m.safeT=0; m.interest=100; sfx.sting(); }
    updateMoth(dt); if(G.dying) return true;
  }
  if(q.type==="drain"){
    p.moving=false;
    G.darkT+=dt; G.sludge=clamp(G.sludge+5*G.lan.sludge*dt,0,100); G.growing=true;
    if(Math.random()<dt*3) G.drops.push({x:p.x+Math.random()*16-8,y:p.y-4,v:-12,life:0.8,bubble:true});
    G.painT-=dt; if(G.painT<=0){G.painT=2.2; sfx.pain(G.sludge);}
    if(G.sludge>=100){G.exitSeq=null; die("dark"); return true;}
  }
  if(q.t>=q.dur){G.exitSeq=null; endingSeq(q.type); return true;}
  updateListener(dt);
  return true;
}
function updWorld(dt){
  const p=G.p, r=G.room, t=G.elapsed;
  // the Black Shift
  if(!G.blackShift&&t>=SHIFT_T){G.blackShift=true; sfx.sting(); G.toasts.shift=0; toast("shift","THE BLACK SHIFT HAS STARTED.");}
  // wall lamps die over the night
  for(const l of r.lamps) if(!l.dead&&(t>l.dieAt||G.blackShift)){l.dead=true; sfx.out();}
  // dust in your light, drips from the ceiling, steam from the boilers
  if(lightOn()&&G.motes.length<10&&Math.random()<dt*8){const L=lanternPos(p.x,p.y,p.dir), a=Math.random()*6.28, d=Math.random()*lightRadius()*0.8; G.motes.push({x:L.x+Math.cos(a)*d,y:L.y+Math.sin(a)*d,vx:(Math.random()-0.5)*4,vy:(Math.random()-0.5)*3,life:2+Math.random()*2});}
  G.motes=G.motes.filter(m=>(m.life-=dt)>0&&(m.x+=m.vx*dt,m.y+=m.vy*dt,true));
  if((r.kind==="flooded"||r.kind==="pump"||r.kind==="boiler")&&Math.random()<dt*1.2) G.drops.push({x:T+Math.random()*(W-2*T),y:T,v:0,life:1.4,tgt:T*2+Math.random()*(H-T*4)});
  G.drops=G.drops.filter(d=>{d.life-=dt; if(d.bubble){d.y+=d.v*dt; return d.life>0;} d.v+=160*dt; d.y+=d.v*dt; if(d.y>=d.tgt){if(Math.random()<0.3) nz({dur:0.03,freq:3200,q:8,gain:0.03,pan:panOf(d.x)}); return false;} return d.life>0;});
  if(r.kind==="boiler"&&Math.random()<dt*2) G.steam.push({x:2*T+50+Math.random()*6,y:T*2-4,life:1.6});
  G.steam=G.steam.filter(s=>(s.life-=dt)>0&&(s.y+=(s.vy||-10)*dt,s.x+=(s.vx||0)*dt+Math.sin(s.life*4)*0.3,true));
  if(r.broken&&!G.sealed[r.zone]){ // a broken pipe hisses and spits until its zone's wheels are shut
    if(Math.random()<dt*14) G.steam.push({x:r.brokenX+2+Math.random()*6,y:14,life:1.6,w:3,vx:(Math.random()-0.5)*16,vy:12+Math.random()*16});
    if(Math.random()<dt*1.5) G.drops.push({x:r.brokenX+3+Math.random()*4,y:15,v:0,life:1.4,tgt:T+5+Math.random()*4});
    G.hissT-=dt; if(G.hissT<=0){G.hissT=1.4+Math.random(); nz({dur:1.2,freq:6000,q:0.6,gain:0.025,pan:panOf(r.brokenX),attack:0.1});}
  }
  if(r.hole&&Math.random()<dt*2.5) G.drops.push({x:r.hole.x+(Math.random()-0.5)*36,y:r.hole.y+(Math.random()-0.5)*32,v:-5,life:0.5,bubble:true});
  updCritters(dt);
  if(r.kind==="lockers"&&G.lockerT>0){G.lockerT-=dt; if(G.lockerT<=0){sfx.rattle(40+Math.random()*240); G.shake=1.5;}}
  // a shut door opens again
  if(G.doorShut){G.doorShut.t-=dt; if(G.doorShut.t<=0){openShutDoor(); sfx.clank();}}
  G.echo=Math.max(0,G.echo-dt); G.wrongFace=Math.max(0,G.wrongFace-dt);
  if(G.figure){G.figure.t-=dt; if(G.figure.t<=0) G.figure=null;}
  // the dark plays tricks
  if(t>150&&!G.exitSeq){G.hallT-=dt; if(G.hallT<=0){G.hallT=22+Math.random()*30; hallucinate();}}
  updOther(dt);
}
function hallucinate(){
  const p=G.p, opts=["steps","figure","voice","face","whisper","door","fake","fake"];
  const k=opts[Math.floor(Math.random()*opts.length)];
  if(k==="steps") G.echo=6;
  if(k==="figure"){ if(lightOn()){G.figure={t:0.45,a:Math.random()*6.28}; sfx.sting();} else G.echo=5; }
  if(k==="voice"){
    sfx.whisper(Math.random()*2-1);
    for(let i=0;i<6;i++) setTimeout(()=>sfx.blip("SMUDGE"),400+i*70);
    G.toast={msg:"???: OVER HERE. OVER HERE.",t:0};
    if(G.smudge.follow) setTimeout(()=>{if(G&&mode==="play"){G.toast={msg:"SMUDGE: ...THAT WASN'T ME.",t:0};}},2600);
  }
  if(k==="face") G.wrongFace=0.7;
  if(k==="whisper") sfx.whisper(Math.random()*2-1);
  if(k==="door"){ const d=G.enteredFrom; if(d&&G.room.nb[d]&&!G.doorShut&&dist(DOOR[d].x,DOOR[d].y,p.x,p.y)>50) shutDoor(d); else sfx.whisper(0); }
  if(k==="fake"){ const kinds=["moth","lis","other"], f=kinds[Math.floor(Math.random()*3)]; faces[f]=faces[f]||scareFace(f); G.scare={kind:f,t:0.32}; G.shake=5; sfx.scare(); }
}
function updOther(dt){
  const o=G.other; if(!o) return;
  const p=G.p; o.t+=dt;
  o.hist.push({t:o.t,x:p.x,y:p.y,dir:p.dir,f:p.moving?(p.step?1:2):0});
  while(o.hist.length&&o.hist[0].t<o.t-0.7) o.hist.shift();
  const on=lightOn(), L=lanternPos(p.x,p.y,p.dir), rr=lightRadius();
  const lit=on&&dist(o.x,o.y-12,L.x,L.y)<rr*0.85;
  if(o.state==="copy"){
    const h=o.hist[0]; // mirror of where you were a moment ago
    const tx=W-h.x, ty=h.y; if(!boxHits(G.room,tx,ty,4,3)){o.x=tx;o.y=ty;}
    o.dir=h.dir==="l"?"r":h.dir==="r"?"l":h.dir; o.f=h.f;
    o.lit=lit?o.lit+dt:Math.max(0,o.lit-dt*0.5);
    if(o.lit>2.5){o.state="turn"; o.t2=0; sfx.sting(); G.shake=2;}
  } else {
    o.t2+=dt;
    const dx=p.x-o.x, dy=p.y-o.y, d=Math.hypot(dx,dy)||1;
    o.dir=Math.abs(dx)>Math.abs(dy)?(dx<0?"l":"r"):(dy<0?"u":"d"); o.f=o.t2>0.8?(Math.floor(o.t2*5)%2?1:2):0;
    if(o.t2>0.8){const sp=(38+G.elapsed/TIME_LIMIT*30)*dt; moveBox(G.room,o,dx/d*sp,dy/d*sp,4,3);}
    o.dark=on?0:o.dark+dt;
    if(o.dark>3){G.other=null; sfx.whisper(0); return;}
    if(d<10){ faces.other=faces.other||scareFace("other"); G.scare={kind:"other",t:0}; G.shake=7; sfx.scare(); G.sludge=clamp(G.sludge+45,0,100); G.other=null; if(G.sludge>=100) die("dark"); }
  }
}

/* ================= render ================= */
function render(){
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle="#000"; ctx.fillRect(0,0,W,H);
  if(mode==="title") renderTitle();
  else if(G){
    renderGame();
    ctx.setTransform(1,0,0,1,0,0);
    if(G.cam&&mode!=="end") renderCamera();
    if(G.ui==="inv") renderInv(); else if(G.ui==="journal") renderJournal();
    if(mode==="pause") renderPause();
    if(mode==="end") renderEnd();
  }
  if(subMenu) renderKeys();
  drawPanels();
}
function staticLights(){
  const r=G.room, out=[];
  for(const l of r.lamps) if(!l.dead){const fl=Math.sin(G.elapsed*7+l.ph)>0.93?0.4:1; out.push({x:l.x,y:l.y+4,r:34*fl});}
  if(r.kind==="boiler") out.push({x:2*T+32,y:2*T+16,r:44+Math.sin(G.elapsed*9)*3});
  if(r.exitT==="chimney") out.push({x:r.hatch.x,y:18,r:30});
  if(r.special==="shop") out.push({x:OBJ.x,y:OBJ.y-46,r:58});
  if(r.special==="office"&&G.officeLit) out.push({x:OBJ.x+8,y:OBJ.y-12,r:64});
  if(G.flare&&G.flare.room===r) out.push({x:G.flare.x,y:G.flare.y-3,r:48+Math.sin(G.elapsed*31)*4});
  return out;
}
function interactables(){
  const r=G.room, out=[];
  if(r.special==="shop") out.push({x:OBJ.x,y:OBJ.y+12,fn:talkWick});
  if(r.special==="gauge") out.push({x:OBJ.x,y:OBJ.y+10,fn:talkGauge});
  if(r.special==="office") out.push({x:OBJ.x,y:OBJ.y+8,fn:talkOffice});
  if(r.special==="whistle") out.push({x:OBJ.x,y:OBJ.y+12,fn:talkWhistle});
  if(r.special==="smudge"&&!G.smudge.follow) out.push({x:OBJ.x,y:OBJ.y+4,fn:talkSmudge});
  if(G.smudge.follow) out.push({x:G.smudge.x,y:G.smudge.y,fn:talkSmudge,low:true});
  if(r.note) out.push({x:r.note.x,y:r.note.y,fn:()=>readNote(r)});
  for(const c of r.crates) if(!c.open||c.item) out.push({x:c.x,y:c.y+6,fn:()=>openCrate(r,c)});
  if(r.valves&&!G.turn) for(const v of r.valves) if(!v.shut) out.push({x:v.x,y:T+10,fn:()=>startTurn(r,v)});
  if(r.term) out.push({x:r.term.x,y:3*T+6,fn:useTerminal});
  if(r.hole) out.push({x:r.hole.x,y:7*T-4,fn:lookHole});
  return out;
}
function nearestThing(){
  let best=null,bd=24,low=null;
  for(const it of interactables()){const d=dist(it.x,it.y,G.p.x,G.p.y); if(it.low){if(d<24) low=it;} else if(d<bd){bd=d;best=it;}}
  return best||low; // Smudge only answers when nothing else is in reach
}
// Ash in the cutscene: always the front-facing idle frame (top-left of the sheet), scaled up
function bigAsh(x,y,k,rot){
  const f=sprites.d&&sprites.d[0]; if(!f) return;
  if(rot!==undefined){ctx.save(); ctx.translate(Math.round(x),Math.round(y)); ctx.rotate(rot); ctx.drawImage(f,-SPR_W*k/2,-SPR_H*k/2,SPR_W*k,SPR_H*k); ctx.restore();}
  else ctx.drawImage(f,Math.round(x-SPR_W*k/2),Math.round(y-SPR_H*k),SPR_W*k,SPR_H*k);
}
function poly(pts,c){ctx.fillStyle=c; ctx.beginPath(); pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y)); ctx.fill();}
function introSky(t,mx,my){
  const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,"#04050a"); g.addColorStop(1,"#13151d"); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  const r=mulberry(77);
  for(let i=0;i<90;i++){const x=Math.floor(r()*W), y=Math.floor(r()*130), sp=1+r()*3; px(ctx,Math.sin(t*sp+i)>0.9?"#e8e0cc":(i%3?"#4a463c":"#8f8778"),x,y);}
  ctx.fillStyle="rgba(217,207,184,.05)"; ctx.beginPath(); ctx.arc(mx,my,26,0,7); ctx.fill();
  ctx.fillStyle="#cfc6a8"; ctx.beginPath(); ctx.arc(mx,my,11,0,7); ctx.fill();
  px(ctx,"#a89f88",mx-5,my-3,3,2); px(ctx,"#a89f88",mx+2,my+2,4,3); px(ctx,"#a89f88",mx-1,my+5,2,2); px(ctx,"#a89f88",mx+4,my-6,2,2);
  ctx.fillStyle="rgba(9,10,15,.88)";
  for(let i=0;i<4;i++){const x=((i*97+t*(5+i*2))%(W+140))-70, y=14+i*16; ctx.beginPath(); ctx.ellipse(x,y,40+i*6,5+i,0,0,7); ctx.ellipse(x+24,y-3,22,4,0,0,7); ctx.fill();}
}
function wind(t,n,c){const r=mulberry(5); for(let i=0;i<n;i++){const y=Math.floor(r()*H), x=((r()*W+t*(160+r()*120))%(W+20))-10; px(ctx,c,Math.round(x),y,4+Math.floor(r()*6),1);}}
function chimneyRim(t,broken){
  const cx=160, cy=150;
  ctx.fillStyle="#2c2723"; ctx.beginPath(); ctx.ellipse(cx,cy,136,36,0,0,7); ctx.fill();
  ctx.fillStyle="#3a332c"; ctx.beginPath(); ctx.ellipse(cx,cy-3,136,33,0,Math.PI,0); ctx.fill();
  for(let a=0;a<6.28;a+=0.21){const x=cx+Math.cos(a)*120, y=cy+Math.sin(a)*30; px(ctx,"#1a1714",Math.round(x),Math.round(y)-2,1,5);}
  ctx.fillStyle="#010101"; ctx.beginPath(); ctx.ellipse(cx,cy+3,108,24,0,0,7); ctx.fill();
  ctx.fillStyle="#0b0908"; ctx.beginPath(); ctx.ellipse(cx,cy+3,108,24,0,Math.PI,0); ctx.fill();
  if(broken){ctx.fillStyle="#010101"; ctx.beginPath(); ctx.ellipse(cx,cy-24,26,10*broken,0,0,7); ctx.fill();}
  // soot streaks down the outside, and the painted year
  for(let i=0;i<9;i++) px(ctx,"#1a1714",30+i*31,cy+28,2,14);
  text(ctx,"1889",cx,cy+24,1,"#4a3f33","c");
}
function renderIntroPanel(n,t){
  ctx.fillStyle="#000"; ctx.fillRect(0,0,W,H);
  if(n===0){ // the town and the mountain
    introSky(t,262,30);
    px(ctx,"#07080b",0,148,W,44); ctx.save(); ctx.translate(0,-40);
    poly([[0,148],[60,118],[110,100],[150,76],[170,76],[205,96],[260,114],[320,128],[320,192],[0,192]],"#0d0e14");
    poly([[0,160],[90,140],[160,150],[240,138],[320,150],[320,192],[0,192]],"#0a0b10");
    px(ctx,"#16171d",151,40,18,38); px(ctx,"#1e1f26",149,37,22,4); for(let k=0;k<6;k++) px(ctx,"#121318",151,45+k*6,18,1);
    if(Math.sin(t*3)>0.55) px(ctx,"#c4473a",159,34,2,2);
    ctx.fillStyle="rgba(42,44,56,.2)"; for(let i=0;i<3;i++){const x=((t*9+i*140)%(W+220))-110; ctx.beginPath(); ctx.ellipse(x,150+i*7,95,6,0,0,7); ctx.fill();}
    const tr=mulberry(31);
    for(let x=-4;x<W;){
      const w=10+Math.floor(tr()*14), h=8+Math.floor(tr()*14), y=192-h;
      px(ctx,"#07080b",x,y,w,h); px(ctx,"#07080b",x+2,y-3,w-4,3);
      for(let k=0;k<2;k++) if(tr()<0.6){const wx=x+2+Math.floor(tr()*(w-4)), wy=y+3+Math.floor(tr()*Math.max(1,h-6)); if(Math.sin(t*0.6+wx*1.7)>-0.7) px(ctx,"#e8a94a",wx,wy,2,2);}
      x+=w+1+Math.floor(tr()*4);
    }
    ctx.restore();
  } else if(n===1){ // the fence. Ash walks through the gap
    introSky(t,64,26);
    ctx.save(); ctx.translate(0,-40);
    const cx=222;
    px(ctx,"#15161c",cx-36,0,72,150);
    for(let y=0;y<150;y+=5){px(ctx,"#0e0f13",cx-36,y,72,1); for(let x=(y/5)%2?0:8;x<72;x+=16) px(ctx,"#0e0f13",cx-36+x,y,1,5);}
    text(ctx,"1889",cx,52,2,"#26231f","c");
    px(ctx,"#0a0b0e",0,150,W,42);
    ctx.strokeStyle="#2a2c33"; ctx.lineWidth=1;
    for(let x=-40;x<W;x+=7){ if(x>78&&x<134) continue; ctx.beginPath(); ctx.moveTo(x,112); ctx.lineTo(x+40,152); ctx.moveTo(x+40,112); ctx.lineTo(x,152); ctx.stroke(); }
    for(let x=10;x<W;x+=64) if(x<78||x>134) px(ctx,"#3a3530",x,106,3,48);
    px(ctx,"#3a3530",0,111,78,2); px(ctx,"#3a3530",134,111,W-134,2);
    px(ctx,"#0a0b0e",0,192,W,40); px(ctx,"#3a2a1a",158,118,82,22); px(ctx,"#2c1f13",158,139,82,1);
    text(ctx,"KEEP OUT",199,122,1,BLOOD,"c"); text(ctx,"HOLLOW CREEK",199,131,1,INK3,"c");
    const k=clamp(t/1.8,0,1), x=-20+130*k, bob=k<1&&Math.floor(t*7)%2?1:0;
    bigAsh(x,182-bob,3);
    ctx.restore();
    wind(t,14,"rgba(143,135,120,.28)");
  } else if(n>=2&&n<=4){ // the rim of the chimney
    const sh=n===4&&t<1.2?(fxRnd()-0.5)*5:0;
    ctx.save(); ctx.translate(Math.round(sh),Math.round(sh*0.6));
    introSky(t,250,22);
    ctx.translate(0,-42); px(ctx,"#0a0908",0,150,W,90);
    const crumble=n===4?clamp(t/0.5,0,1):0;
    chimneyRim(t,crumble);
    if(n===3||n===4){ // eyes at the bottom of the hole
      const blink=Math.floor(t*10)%23===0;
      const a=n===3?clamp(t/1.2,0,1):1;
      if(!blink){ctx.fillStyle="rgba(232,228,220,"+(0.85*a)+")"; ctx.fillRect(150,160,3,2); ctx.fillRect(166,160,3,2); px(ctx,"#000",151,160); px(ctx,"#000",167,160);}
    }
    if(n===4){
      const f=clamp((t-0.35)/0.9,0,1);
      ctx.save(); ctx.beginPath(); ctx.rect(0,-50,W,178); ctx.ellipse(160,153,108,24,0,0,7); ctx.clip(); // he goes into the hole, not in front of it
      bigAsh(160,126-SPR_H*1.5+f*f*110,3,f*1.4);
      ctx.restore();
      const r=mulberry(9);
      for(let i=0;i<12;i++){const bx=134+r()*52, by=124+(t*(60+r()*90))+r()*8; if(by<190) px(ctx,i%2?"#3a332c":"#2c2723",Math.round(bx),Math.round(by),3+Math.floor(r()*3),2);}
      ctx.fillStyle="rgba(120,110,95,"+clamp(0.4-t*0.3,0,1)+")"; ctx.beginPath(); ctx.ellipse(160,126,30+t*20,6+t*4,0,0,7); ctx.fill();
    } else bigAsh(160,126+(Math.floor(t*2)%2),3);
    wind(t,10,"rgba(143,135,120,.25)");
    ctx.restore();
  } else if(n===5){ // the fall
    px(ctx,"#030303",0,0,W,H);
    const R=Math.max(3,34-t*16);
    ctx.fillStyle="#12141c"; ctx.beginPath(); ctx.ellipse(160,6,R*1.7,R*0.6,0,0,7); ctx.fill();
    const sc=(t*430)%10;
    for(let y=-10;y<H+10;y+=10){const yy=Math.round(y-sc); px(ctx,"#16130f",0,yy,44,9); px(ctx,"#16130f",276,yy,44,9); px(ctx,"#0a0908",0,yy+9,44,1); px(ctx,"#0a0908",276,yy+9,44,1); px(ctx,"#0a0908",((y/10)%2?20:6),yy,1,9); px(ctx,"#0a0908",((y/10)%2?296:310),yy,1,9);}
    const r=mulberry(3);
    for(let i=0;i<26;i++){const x=52+r()*216, y=(r()*H+H-((t*(380+r()*240))%(H+40)))%(H+40)-20; px(ctx,"#2a2724",Math.round(x),Math.round(y),1,7+Math.floor(r()*8));}
    for(let i=0;i<6;i++){const x=70+r()*180, y=H-((t*(40+r()*50)+r()*H)%(H+20)); px(ctx,"#3a332c",Math.round(x),Math.round(y),3,2);}
    bigAsh(160+Math.sin(t*2)*8,96,3,t*4.2);
  } else if(n===6){ // THUD
    px(ctx,"#000",0,0,W,H);
    if(t>0.12){const s2=t<0.5?(fxRnd()-0.5)*6:0; ctx.globalAlpha=clamp(1.6-t,0.25,1); text(ctx,"THUD.",W/2+s2,70,4,INK2,"c"); ctx.globalAlpha=1;}
    const r=mulberry(12); for(let i=0;i<30;i++){const x=r()*W, y=(r()*H*0.6+t*(14+r()*20))%H; px(ctx,"#2a2724",Math.round(x),Math.round(y));}
  } else { // waking up next to a lantern that isn't his
    if(!titleRoom){titleRoom={nb:{},seed:31337,kind:"plain"}; buildRoom(titleRoom,true,false); titleRoom.canvas=paintRoom(titleRoom);}
    ctx.drawImage(titleRoom.canvas,0,0);
    ctx.fillStyle="#3a3328"; ctx.beginPath(); ctx.ellipse(146,124,34,9,0,0,7); ctx.fill();
    ctx.fillStyle="#2a2620"; ctx.beginPath(); ctx.ellipse(132,121,12,5,0,0,7); ctx.ellipse(160,126,10,4,0,0,7); ctx.fill();
    px(ctx,"#4a3f33",120,118,8,2); px(ctx,"#1a1714",150,121,9,2);
    const passing=n===8&&t>0.3&&t<2.6;
    if(n===8&&passing) drawMoth(ctx,40+(t-0.3)/2.3*240,58+Math.sin(t*5)*6,t);
    bigAsh(140,126,2);
    const fl=passing?0.75+fxRnd()*0.35:1+Math.sin(t*13)*0.03+(fxRnd()-0.5)*0.05;
    const rr=(n===7?Math.min(60,20+t*40):60)*fl;
    dg.globalCompositeOperation="source-over"; dg.clearRect(0,0,W,H); dg.fillStyle="rgba(1,1,2,.985)"; dg.fillRect(0,0,W,H);
    dg.globalCompositeOperation="destination-out";
    const gr=dg.createRadialGradient(176,104,0,176,104,rr); gr.addColorStop(0,"rgba(0,0,0,1)"); gr.addColorStop(0.55,"rgba(0,0,0,.9)"); gr.addColorStop(1,"rgba(0,0,0,0)");
    dg.fillStyle=gr; dg.beginPath(); dg.arc(176,104,rr,0,7); dg.fill();
    ctx.drawImage(darkC,0,0);
    ctx.drawImage(lanternIcon(2,100,t),170,94,10,16);
    if(n===8&&t>2.8&&Math.floor(t*4)%9){px(ctx,"#f6e7a6",246,84); px(ctx,"#f6e7a6",249,84);}
    if(n===7){ // eyes opening: two lids, one blink
      const o=t<0.45?t/0.45*0.35:t<0.65?0.35-(t-0.45)/0.2*0.35:clamp((t-0.65)/0.9,0,1);
      const lid=Math.round((1-o)*H/2);
      px(ctx,"#000",0,0,W,lid); px(ctx,"#000",0,H-lid,W,lid);
    }
  }
  text(ctx,"ESC: SKIP",6,6,1,INK3,"l","#000");
}
function renderGame(){
  if(G.introPanel!=null){renderIntroPanel(G.introPanel,titleT-(G.panelAt||0)); if(G.dlg) renderDialog(); return;}
  const sh=G.shake>0?[(fxRnd()-0.5)*G.shake,(fxRnd()-0.5)*G.shake]:[0,0];
  ctx.setTransform(1,0,0,1,Math.round(sh[0]),Math.round(sh[1]));
  const p=G.p, t=G.elapsed;

  if(G.slide){
    const s=G.slide, k=1-Math.pow(1-s.t,3);
    const vx={w:1,e:-1,n:0,s:0}[s.dir], vy={n:1,s:-1,w:0,e:0}[s.dir];
    ctx.drawImage(s.from,Math.round(vx*W*k),Math.round(vy*H*k));
    ctx.drawImage(s.to,Math.round(vx*W*(k-1)),Math.round(vy*H*(k-1)));
    ctx.fillStyle="rgba(0,0,0,.97)"; ctx.fillRect(0,0,W,H);
    drawHud(); return;
  }

  ctx.drawImage(roomCanvas(G.room),0,0);
  const on=lightOn(), R=lightRadius();
  const flick=(G.fuel<20?0.12:0.04)+(G.moth.inRoom?0.08:0);
  const rr=R*(1+Math.sin(t*13)*flick*0.5+(fxRnd()-0.5)*flick);
  const L=lanternPos(p.x,p.y,p.dir);

  // the room's own things
  const rm=G.room, talkingWho=G.dlg?G.dlg.steps[G.dlg.i][0]:"";
  if(rm.special==="shop") drawWick(ctx,OBJ.x,OBJ.y,t);
  if(rm.special==="gauge") drawGauge(ctx,OBJ.x,OBJ.y,t,talkingWho==="GAUGE");
  if(rm.special==="office") drawOffice(ctx,OBJ.x,OBJ.y,t,G.officeLit);
  if(rm.special==="whistle") drawWhistle(ctx,OBJ.x,OBJ.y,t);
  // the one you helped stays home, at peace
  if(rm.special==="office"&&G.helped==="moth") drawMoth(ctx,OBJ.x+26,OBJ.y-10,t*0.2);
  if(rm.special==="whistle"&&G.helped==="lis") drawListener(ctx,OBJ.x+28,OBJ.y+14,t*0.3,false);
  if(rm.special==="smudge"&&!G.smudge.follow) drawSmudge(ctx,OBJ.x,OBJ.y+4,t);
  for(const l of rm.lamps){px(ctx,"#2a2622",l.x-3,l.y-6,6,2); px(ctx,"#3a3530",l.x-2,l.y-4,4,6); px(ctx,l.dead?"#141210":(Math.sin(t*7+l.ph)>0.93?"#8a6a2a":"#f2c35a"),l.x-1,l.y-3,2,4);}
  if(rm.kind==="boiler") px(ctx,Math.sin(t*9)>0?"#c4561e":"#a8401a",2*T+26,2*T+11,12,8);
  drawRoomProps(rm,t);
  if(G.flare&&G.flare.room===G.room) drawFlare(G.flare);
  if(rm.item&&FLOOR_ICONS.includes(rm.item.kind)) floorItem(ctx,rm.item);
  else if(rm.item){const it=rm.item; if(it.kind==="crank"){px(ctx,"#5a4f45",it.x-4,it.y-1,8,2); px(ctx,"#5a4f45",it.x+3,it.y-5,2,5); px(ctx,"#2a2622",it.x-5,it.y-2,2,4);} else {px(ctx,"#2a2622",it.x-2,it.y-4,4,7); px(ctx,"#c9a04a",it.x-2,it.y-4,4,1); px(ctx,"#c9a04a",it.x-2,it.y+2,4,1); px(ctx,"#e8e4dc",it.x-1,it.y-2,2,3);}}
  if(rm.exitT==="lift"){const x=rm.hatch.x, y=rm.hatch.y; for(let k=0;k<3;k++) px(ctx,k<G.fuses?"#c9a04a":"#0a0908",x+22+k*3,y-20,2,6); if(G.liftReady){px(ctx,"#3a3530",x-14,y-28,28,2);} if(G.liftT>0) px(ctx,"#8a6a2a",x-1,0,2,y-30);}
  if(rm.exitT==="drain"&&Math.sin(t*2)>0) px(ctx,"#22383c",rm.hatch.x-10+Math.floor((t*9)%20),rm.hatch.y-2,4,1);
  if(G.doorShut&&G.doorShut.room===rm){const d=G.doorShut.dir, D=DOOR[d], hor=d==="n"||d==="s"; for(let k=0;k<6;k++) hor?px(ctx,"#3a3530",D.x-16+k*6,d==="n"?0:H-T,3,T):px(ctx,"#3a3530",d==="w"?0:W-T,D.y-16+k*6,T,3);}
  for(const m of G.motes) px(ctx,"rgba(217,207,184,.22)",Math.round(m.x),Math.round(m.y));
  for(const s2 of G.steam) px(ctx,"rgba(150,145,135,"+(s2.life/1.6*0.5)+")",Math.round(s2.x),Math.round(s2.y),s2.w||2,s2.w||2);
  if(rm.note){const n=rm.note; px(ctx,"#cfc6a8",n.x-3,n.y-2,6,5); px(ctx,"#8a8170",n.x-2,n.y-1,4,1); px(ctx,"#8a8170",n.x-2,n.y+1,3,1);}
  for(const c of rm.scrip){px(ctx,"#8a6a2a",c.x-1,c.y-1,3,3); px(ctx,"#c9a04a",c.x-1,c.y-1,2,2); px(ctx,"#f0d080",c.x-1,c.y-1);}
  // floor items
  for(const o of G.room.oil){px(ctx,"#5a4630",o.x-1,o.y-6,2,2);px(ctx,"#8a6a44",o.x-1,o.y-7,2,1);px(ctx,"#6b4a22",o.x-3,o.y-4,6,6);px(ctx,"#d18b2a",o.x-2,o.y-3,4,4);px(ctx,"#f0c070",o.x-2,o.y-3);}
  if(G.room.hatch&&Math.sin(t*3)>0.2){const h=G.room.hatch;px(ctx,"#8fb4c4",h.x-3+Math.floor((t*7)%7),h.y-9-Math.floor((t*11)%4));}

  // actors, back to front
  const sinking=G.exitSeq&&G.exitSeq.type==="drain";
  const actors=sinking?[]:[{y:p.y,d:()=>drawPlayer(ctx,p.x,p.y,p.dir,p.moving?(p.step?1:2):0,on,G.sludge,t)}];
  if(G.lis.inRoom&&!G.lis.gone) actors.push({y:G.lis.y,d:()=>drawListener(ctx,G.lis.x,G.lis.y,t,G.lis.state==="hunt"&&!G.lis.calm)});
  if(G.smudge.follow) actors.push({y:G.smudge.y,d:()=>drawSmudge(ctx,G.smudge.x,G.smudge.y,t)});
  if(G.other) actors.push({y:G.other.y,d:()=>drawOther(ctx,G.other,t)});
  for(const c of G.critters) actors.push({y:c.y,d:()=>drawCritter(c,t)});
  actors.sort((a,b)=>a.y-b.y).forEach(a=>a.d());
  if(G.moth.inRoom&&!G.moth.gone) drawMoth(ctx,G.moth.x,G.moth.y,G.moth.calm?t*0.25:t);

  // warm light
  if(on&&rr>0){
    ctx.globalCompositeOperation="lighter";
    const wg=ctx.createRadialGradient(L.x,L.y,0,L.x,L.y,rr);
    wg.addColorStop(0,"rgba(255,170,80,.16)"); wg.addColorStop(1,"rgba(255,170,80,0)");
    ctx.fillStyle=wg; ctx.beginPath(); ctx.arc(L.x,L.y,rr,0,7); ctx.fill();
    ctx.globalCompositeOperation="source-over";
  }

  const nv=!!(G.cam&&G.cam.filter===1); // night vision
  // the dark
  dg.globalCompositeOperation="source-over"; dg.clearRect(0,0,W,H);
  dg.fillStyle="rgba(1,1,2,.985)"; dg.fillRect(0,0,W,H);
  dg.globalCompositeOperation="destination-out";
  if(on&&rr>0){
    const g=dg.createRadialGradient(L.x,L.y,0,L.x,L.y,rr);
    g.addColorStop(0,"rgba(0,0,0,1)"); g.addColorStop(0.5,"rgba(0,0,0,.95)"); g.addColorStop(0.8,"rgba(0,0,0,.5)"); g.addColorStop(1,"rgba(0,0,0,0)");
    dg.fillStyle=g; dg.beginPath(); dg.arc(L.x,L.y,rr,0,7); dg.fill();
  }
  for(const l of staticLights()){
    const sg=dg.createRadialGradient(l.x,l.y,0,l.x,l.y,l.r); sg.addColorStop(0,"rgba(0,0,0,1)"); sg.addColorStop(0.5,"rgba(0,0,0,.85)"); sg.addColorStop(1,"rgba(0,0,0,0)");
    dg.fillStyle=sg; dg.beginPath(); dg.arc(l.x,l.y,l.r,0,7); dg.fill();
  }
  const amb=dg.createRadialGradient(p.x,p.y-8,0,p.x,p.y-8,14);
  amb.addColorStop(0,"rgba(0,0,0,.22)"); amb.addColorStop(1,"rgba(0,0,0,0)");
  dg.fillStyle=amb; dg.fillRect(p.x-16,p.y-24,32,32);
  if(nv) nightVision(); else ctx.drawImage(darkC,0,0);

  // the dark reaching in: tendrils licking at the edge of the light
  const reach=nv?0:G.growing?clamp(G.sludge/100*0.6+0.15,0,0.7):(G.level===1&&on?0.12:0);
  if(reach>0){
    const cx=on?L.x:p.x, cy=on?L.y:p.y-8, base=on?rr+2:28;
    ctx.strokeStyle="#040305"; ctx.lineCap="round";
    for(let i=0;i<11;i++){
      const a=i/11*Math.PI*2+Math.sin(t*0.6+i*2.1)*0.25;
      const len=reach*(0.55+0.45*Math.sin(t*1.7+i*1.3));
      let prev=null;
      for(let k=0;k<=6;k++){
        const r=base*(1-len*k/6), aa=a+Math.sin(t*2.6+k*0.9+i)*0.09*k/6*3;
        const pt=[cx+Math.cos(aa)*r, cy+Math.sin(aa)*r];
        if(prev){ctx.lineWidth=Math.max(0.6,4*(1-k/6)); ctx.beginPath(); ctx.moveTo(prev[0],prev[1]); ctx.lineTo(pt[0],pt[1]); ctx.stroke();}
        prev=pt;
      }
    }
  }
  // the moth's eyes show even in the dark
  if(G.smudge.follow&&!on){px(ctx,"#e8e4dc",Math.round(G.smudge.x)-2,Math.round(G.smudge.y)-9,1,2);px(ctx,"#e8e4dc",Math.round(G.smudge.x)+1,Math.round(G.smudge.y)-9,1,2);}
  if(G.moth.inRoom&&!G.moth.gone&&dist(G.moth.x,G.moth.y,L.x,L.y)>rr*0.7){
    const a=0.35+Math.sin(t*2)*0.15;
    ctx.fillStyle="rgba(246,231,166,"+a+")"; ctx.fillRect(Math.round(G.moth.x)-1,Math.round(G.moth.y)-6,1,1); ctx.fillRect(Math.round(G.moth.x)+1,Math.round(G.moth.y)-6,1,1);
  }
  // a terminal screen glows through the dark
  if(rm.term){const s=rm.term; px(ctx,"#0e2a16",s.x-8,s.y-12,16,10); for(let i=0;i<10;i++) px(ctx,fxRnd()<0.5?"#2e6a3a":"#4a9a5a",s.x-8+Math.floor(fxRnd()*15),s.y-12+Math.floor(fxRnd()*10)); if(Math.sin(t*5)>0) px(ctx,"#8fd09a",s.x-6,s.y-5,3,1);}
  // the Black Shift: tar comes in from every wall
  if(G.blackShift){
    const e=shiftEdge();
    ctx.fillStyle="#050406";
    for(let i=0;i<W;i+=4){const w=e+Math.sin(i*0.21+t*1.5)*4+Math.sin(i*0.07)*5; ctx.fillRect(i,0,4,T+w); ctx.fillRect(i,H-T-w,4,T+w);}
    for(let j=0;j<H;j+=4){const w=e+Math.sin(j*0.23+t*1.3)*4; ctx.fillRect(0,j,T+w,4); ctx.fillRect(W-T-w,j,T+w,4);}
    for(let i=0;i<W;i+=9) px(ctx,"#1f2b2b",i,Math.round(T+e+Math.sin(i*0.21+t*1.5)*4)-1);
  }
  // something standing at the edge of your light
  if(G.figure&&on){const a=G.figure.a, fx=Math.round(L.x+Math.cos(a)*rr*0.92), fy=Math.round(L.y+Math.sin(a)*rr*0.92); px(ctx,"#050505",fx-3,fy-22,6,22); px(ctx,"#050505",fx-2,fy-26,4,4); px(ctx,"#e8e4dc",fx-1,fy-24); px(ctx,"#e8e4dc",fx+1,fy-24);}
  if(G.other&&!(on&&dist(G.other.x,G.other.y-12,L.x,L.y)<rr)){const o=G.other; px(ctx,"rgba(232,228,220,.55)",Math.round(o.x)-2,Math.round(o.y)-18); px(ctx,"rgba(232,228,220,.55)",Math.round(o.x)+1,Math.round(o.y)-18);}
  // in the dark you can only just make yourself out
  if(!on){ctx.globalAlpha=0.3; drawPlayer(ctx,p.x,p.y,p.dir,p.moving?(p.step?1:2):0,false,G.sludge,t); ctx.globalAlpha=1;}
  for(const d of G.drips) px(ctx,"#060508",Math.round(d.x),Math.round(d.y),1,2);
  for(const d of G.drops) px(ctx,d.bubble?"#22383c":"#3a4a4c",Math.round(d.x),Math.round(d.y),1,d.bubble?1:2);

  ctx.setTransform(1,0,0,1,0,0);
  drawHud();
  if(G.turn){const k=G.turn.t/G.turn.dur; px(ctx,"#1c1a17",Math.round(p.x)-10,Math.round(p.y)-36,20,3); px(ctx,BLOOD,Math.round(p.x)-10,Math.round(p.y)-36,Math.round(20*k),3);}
  if(!G.dlg&&!G.dying&&!G.sit&&!G.turn&&hintsOn()){const it=nearestThing(); if(it&&!it.low) text(ctx,K("use"),Math.round(p.x),Math.round(p.y)-36,1,INK,"c","#000");}
  if(G.sit) text(ctx,"SIT STILL  "+Math.ceil(G.sit.t),W/2,24,1,INK,"c","#000");
  if(G.exitSeq) text(ctx,(G.exitSeq.type==="chimney"?"CLIMB  ":"HOLD YOUR BREATH  ")+Math.ceil(G.exitSeq.dur-G.exitSeq.t),W/2,24,1,INK,"c","#000");
  if(G.liftT>0) text(ctx,"THE CAGE  "+Math.ceil(G.liftT),W/2,24,1,FLAME,"c","#000");
  if(G.dlg) renderDialog();

  // scare
  if(G.scare){
    const f=faces[G.scare.kind], k=G.scare.t;
    if(k<0.06){ctx.fillStyle="#d9cfb8";ctx.fillRect(0,0,W,H);}
    ctx.fillStyle="rgba(0,0,0,.6)"; ctx.fillRect(0,0,W,H);
    const s=Math.floor(H*0.95/48)+(k<0.2?1:0), j=(fxRnd()-0.5)*8;
    ctx.drawImage(f,Math.round(W/2-24*s+j),Math.round(H/2-24*s+j*0.6),48*s,48*s);
  }
  // being consumed
  if(G.dying&&G.dying.cause!=="moth"){
    const k=clamp(G.dying.t/1.4,0,1);
    ctx.fillStyle="#060508";
    for(let i=0;i<W;i+=4){const h=k*H*(0.55+0.45*Math.sin(i*0.31))+k*k*H; ctx.fillRect(i,0,4,h/2); ctx.fillRect(i,H-h/2,4,h/2);}
  }
}

const otherC=mk(SPR_W,SPR_H), otherG=otherC.getContext("2d");
function drawOther(g,o,t){
  const f=sprites[o.dir]&&sprites[o.dir][o.f||0]; if(!f) return;
  otherG.globalCompositeOperation="source-over"; otherG.clearRect(0,0,SPR_W,SPR_H); otherG.drawImage(f,0,0);
  otherG.globalCompositeOperation="source-atop"; otherG.fillStyle="rgba(8,6,10,.62)"; otherG.fillRect(0,0,SPR_W,SPR_H);
  const x=Math.round(o.x)-8, y=Math.round(o.y)-SPR_H+1;
  px(g,"rgba(0,0,0,.4)",x+3,y+SPR_H-2,11,3);
  g.drawImage(otherC,x,y);
  if(o.dir!=="u"){px(g,"#e8e4dc",x+6,y+8); px(g,"#e8e4dc",x+10,y+8);}
  if(o.state!=="copy"&&o.dir!=="u"){px(g,"#1a0505",x+5,y+12,7,1); px(g,"#ece6d6",x+6,y+12); px(g,"#ece6d6",x+8,y+12); px(g,"#ece6d6",x+10,y+12);}
}
/* ================= side panels: the HUD sits beside the room, never on it ================= */
const pl=document.getElementById("pl"), pr=document.getElementById("pr"), plc=pl.getContext("2d"), prc=pr.getContext("2d");
const PMIN=36, PMAX=92; let PW=PMIN, quickHits=[];
const faceC=mk(PN,PN), faceG=faceC.getContext("2d");
function drawPanels(){
  for(const [g,edge] of [[plc,PW-1],[prc,0]]){ g.imageSmoothingEnabled=false; g.fillStyle=G&&mode!=="title"?"#0b0a09":"#050505"; g.fillRect(0,0,PW,H); if(G&&mode!=="title") px(g,"#1c1a17",edge,0,1,H); }
  if(!G||mode==="title"||G.introPanel!=null) return;
  const slim=PW<60, c=Math.round(PW/2);
  // LEFT: map, lantern with fuel bar, quick slots
  const cw=slim?3:clamp(Math.floor((PW-10)/9),4,9), ch=slim?2:Math.max(3,Math.round(cw*0.66));
  const top=touchMode()?32:0; // room for the touch Pause button above the map
  const mx0=Math.round(c-(9*cw)/2), my0=(slim?6:16)+top;
  if(!slim) text(plc,ZONE[G.room.zone].tag,c,5+top,1,INK3,"c");
  px(plc,"rgba(0,0,0,.55)",mx0-2,my0-2,9*cw+3,7*ch+3);
  if(G.blueprint&&G.room.glitch){ // some rooms scramble it
    for(let i=0;i<70;i++) px(plc,["#2e2b26","#6f685c","#141210"][i%3],mx0+Math.floor(fxRnd()*9*cw),my0+Math.floor(fxRnd()*7*ch),Math.max(1,cw-1),1);
  } else if(G.blueprint){ // no map at all until the blueprint is found
  for(const r of G.rooms){
    const dx=r.x-G.room.x+4, dy=r.y-G.room.y+3;
    if(dx<0||dy<0||dx>8||dy>6) continue;
    const known=r.visited||r.neighbors.some(n=>n.visited)||(r.hatch&&(G.helped==="lis"||r.exitSeen));
    if(!known) continue;
    const x=mx0+dx*cw, y=my0+dy*ch, mw=Math.max(1,cw-1), mh=Math.max(1,ch-1), mc=Math.floor(cw/2), mr=Math.floor(ch/2);
    if(r===G.room) px(plc,"#e8d6a8",x,y,mw,mh);
    else if(r.visited) px(plc,ZONE[r.zone].mc,x,y,mw,mh);
    else px(plc,"#2e2b26",x,y,mw,mh);
    if(r.hatch&&(r.exitSeen||G.helped==="lis")) px(plc,"#8fb4c4",x+mc-(slim?1:0),y+mr-(slim?1:0),1,1);
    if(r.special&&r.visited&&r!==G.room) px(plc,r.special==="shop"?"#e8a94a":"#d9cfb8",x+mc-(slim?1:0),y+mr-(slim?1:0),1,1);
  }
  if(G.helped==="lis") for(const ex of G.map.exits){ // the Listener's marks, pinned to the map edge when out of view
    const dx=ex.x-G.room.x+4, dy=ex.y-G.room.y+3;
    if(dx<0||dy<0||dx>8||dy>6){const cx=clamp(dx,0,8), cy=clamp(dy,0,6); if(Math.sin(G.elapsed*5)>0) px(plc,"#8fb4c4",mx0+cx*cw,my0+cy*ch,Math.max(1,cw-2),Math.max(1,ch-1));}
  }
  } else text(plc,slim?"?":"NO MAP",c,my0+Math.round(7*ch/2)-3,1,INK3,"c");
  const lw=slim?10:20, lh=slim?16:32, ly=my0+7*ch+(slim?8:14), lx=c-Math.round(lw/2)-(slim?2:4);
  plc.drawImage(lanternIcon(lightOn()?G.level:0,G.fuel,G.elapsed),lx,ly,lw,lh);
  const bx=lx+lw+(slim?2:4), bw=slim?2:3, fh=Math.round(lh*clamp(G.fuel,0,100)/100); // fuel bar
  px(plc,"#1c1a17",bx,ly,bw,lh); px(plc,G.fuel<25?BLOOD:FLAME,bx,ly+lh-fh,bw,fh);
  if(G.pouring>0) px(plc,"#d18b2a",lx,ly+lh+2,Math.round((1-G.pouring/0.9)*(lw+bw+4)),1);
  if(!slim) text(plc,"LAMP",c,ly+lh+6,1,INK3,"c");
  // quick slots: oil, flares, camera; tap or click one to use it
  const sz=slim?10:14, gap=2, sx0=c-Math.round((3*sz+2*gap)/2), sy=ly+lh+(slim?6:16);
  quickHits=[];
  ["flask","flare","camera"].forEach((id,i)=>{
    const x=sx0+i*(sz+gap), n=ITEMS[id].n(), on=id==="camera"&&!!G.cam;
    px(plc,on?FLAME:"#1c1a17",x,sy,sz,sz); px(plc,"#0b0a09",x+1,sy+1,sz-2,sz-2);
    if(n>0){ drawIcon(plc,id,x+1,sy+1,sz-2);
      if(n>1){ if(slim) for(let k=0;k<Math.min(n,3);k++) px(plc,INK2,x+1+k*3,sy+sz+2,2,1); else text(plc,String(n),x+sz,sy+sz+2,1,INK2,"r"); } }
    quickHits.push({id,x,y:sy,w:sz,h:sz});
  });
  // RIGHT: Ash, the timer, scrip
  const rtop=touchMode()?32:0; // room for the touch Bag and Book buttons
  const ps=slim?32:Math.min(48,PW-12), pyy=(slim?6:16)+rtop;
  if(!slim) text(prc,"ASH",c,5+rtop,1,INK3,"c");
  faceG.clearRect(0,0,PN,PN);
  drawPortrait(faceG,0,0,G.sludge,G.elapsed,G.growing&&!G.dying?true:false,fxRnd);
  if(G.wrongFace>0){ // for a moment, the face beside the room isn't yours
    faceG.fillStyle="#000"; faceG.beginPath(); faceG.ellipse(30,23,5,4,0,0,7); faceG.ellipse(17,22,4,3,0,0,7); faceG.fill();
    px(faceG,"#e8e4dc",30,23); px(faceG,"#1a0505",14,34,20,3); for(let k=0;k<6;k++) px(faceG,"#ece6d6",15+k*3,34,2,2);
  }
  prc.drawImage(faceC,c-Math.round(ps/2),pyy,ps,ps);
  const left=TIME_LIMIT-G.elapsed, red=left<120, ty=pyy+ps+(slim?6:12);
  if(!slim) text(prc,"SHIFT",c,ty,1,INK3,"c");
  text(prc,fmt(left),c,ty+(slim?0:10),1,red?(Math.sin(G.elapsed*6)>0?BLOOD:"#7a2a22"):INK2,"c");
  if(G.scrip>0||G.metWick){const yy=ty+(slim?12:26), xx=c-(slim?8:12); px(prc,"#8a6a2a",xx,yy,5,5); px(prc,"#c9a04a",xx,yy,4,4); px(prc,"#f0d080",xx+1,yy+1); text(prc,String(G.scrip),xx+8,yy-1,1,INK2);}
}
// Messages still appear over the room: they are short and fade.
function drawHud(){
  // messages
  if(G.toast&&!G.dlg){
    const a=G.toast.t<0.2?G.toast.t/0.2:G.toast.t>3?(3.4-G.toast.t)/0.4:1;
    ctx.globalAlpha=clamp(a,0,1);
    const w=textW(G.toast.msg,1)+12;
    px(ctx,"rgba(0,0,0,.75)",Math.round(W/2-w/2),H-24,w,13);
    text(ctx,G.toast.msg,W/2,H-21,1,INK,"c");
    ctx.globalAlpha=1;
  }
}

const lanternC=mk(10,16), lg=lanternC.getContext("2d");
function lanternIcon(level,fuel,t){
  lg.clearRect(0,0,10,16);
  const lit=level>0&&fuel>0;
  px(lg,"#6b5233",4,0,2,1); px(lg,"#4a3a26",3,1,1,1); px(lg,"#4a3a26",6,1,1,1);
  px(lg,"#4a3a26",1,2,8,2); px(lg,"#6b5233",2,2,6,1);
  px(lg,"#4a3a26",1,4,1,7); px(lg,"#4a3a26",8,4,1,7);
  px(lg,lit?"#3a2a14":"#161412",2,4,6,7);
  if(lit){
    const h=[0,2,4,6][level]+(Math.sin(t*17)>0.6?1:0);
    px(lg,"#f2c35a",3,11-h,4,h); px(lg,"#fff1c8",4,11-Math.max(1,h-1),2,Math.max(1,h-1));
  } else px(lg,"#2a2622",4,9,2,2);
  px(lg,"#4a3a26",1,11,8,4);
  const low=fuel<25&&Math.sin(t*8)>0;
  px(lg,"#14110f",2,12,6,2); px(lg,low?BLOOD:"#d18b2a",2,12,Math.round(6*fuel/100),2);
  px(lg,"#2c2014",0,15,10,1);
  return lanternC;
}

/* ================= title, pause and end, drawn on the canvas ================= */
let titleT=0, titleRoom=null;
function owned(){const s=Object.assign({endings:{}},loadSave()); return LANTERNS.filter(l=>l.has(s));}
function curLantern(){const s=loadSave(), o=owned(); return o.find(l=>l.id===s.lantern)||o[0];}
function cycleLantern(d){const o=owned(), c=curLantern(), i=(o.indexOf(c)+d+o.length)%o.length; const s=loadSave(); s.lantern=o[i].id; writeSave(s);}
function hintsOn(){const s=G?G.save:loadSave(); return !(s.settings&&s.settings.hints===false);}
function setHints(on){const s=loadSave(); s.settings=Object.assign({},s.settings,{hints:on}); writeSave(s); if(G){G.save.settings=s.settings; if(!on) G.toast=null;}}
let settingsOpen=false;
const setMenu={sel:0,confirm:null,items:()=>[
  {label:"HINTS: "+(hintsOn()?"ON":"OFF"),fn:()=>setHints(!hintsOn()),left:()=>setHints(!hintsOn()),right:()=>setHints(!hintsOn())},
  {label:"CONTROLS: "+{auto:"AUTO",pc:"KEYBOARD",touch:"TOUCH"}[SW.inputMode in {auto:1,pc:1,touch:1}?SW.inputMode:"auto"],fn:()=>cycleInput(1),left:()=>cycleInput(-1),right:()=>cycleInput(1)},
  {label:"KEYS",fn:()=>{subMenu=keysMenu; keysMenu.sel=0; keysMenu.confirm=null; keysNotice="";}},
  {label:"BACK",fn:()=>{settingsOpen=false;}}
]};
// Shared with Shanoware's own Settings page.
function cycleInput(d){
  const order=["auto","pc","touch"], i=(order.indexOf(SW.inputMode)+d+3)%3;
  try{ const all=JSON.parse(localStorage.getItem("shanoware.settings"))||{}; all.inputMode=order[i]; localStorage.setItem("shanoware.settings",JSON.stringify(all)); }catch(e){}
  readSettings(); applyInput(); applyTouch(); keys.clear();
}
const openSettings=()=>{settingsOpen=true; setMenu.sel=0;};
const titleMenu={sel:0,confirm:null,items:()=>[
  {label:"LIGHT THE LANTERN",fn:begin},
  {label:"< "+curLantern().name+" >",fn:()=>cycleLantern(1),left:()=>cycleLantern(-1),right:()=>cycleLantern(1)},
  {label:"SETTINGS",fn:openSettings},
  {label:"EXPORT SAVE",confirm:"SAVE A FILE TO THIS DEVICE?",fn:exportSave},
  {label:"IMPORT SAVE",fn:importSave},
  {label:"COPY SAVE CODE",fn:copyCode},
  {label:"PASTE SAVE CODE",fn:pasteCode}
]};
const pauseMenu={sel:0,confirm:null,items:()=>[
  {label:"RESUME",fn:togglePause},
  {label:"JOURNAL",fn:()=>{togglePause(); G.ui="journal";}},
  {label:"SETTINGS",fn:openSettings},
  {label:"RESTART RUN",confirm:"RESTART? THIS RUN WILL BE LOST.",fn:begin},
  {label:"EXPORT SAVE",confirm:"SAVE A FILE TO THIS DEVICE?",fn:exportSave},
  {label:"MAIN MENU",confirm:"QUIT TO THE MAIN MENU? THIS RUN WILL BE LOST.",fn:toTitle},
  {label:"BACK TO SHANOWARE",confirm:"LEAVE FOR SHANOWARE? THIS RUN WILL BE LOST.",fn:()=>{location.href="../../index.html#last-light";}}
]};
function menuKey(m,code){
  if(m.confirm){
    if(["KeyA","ArrowLeft","KeyD","ArrowRight","KeyW","KeyS","ArrowUp","ArrowDown"].includes(code)){m.confirm.sel^=1;sfx.click();}
    else if(code==="Enter"||code==="Space"){const c=m.confirm; m.confirm=null; if(c.sel===0) c.yes();}
    else if(code==="Escape") m.confirm=null;
    return true;
  }
  const items=m.items(), it=items[m.sel];
  if(code==="KeyW"||code==="ArrowUp"){m.sel=(m.sel+items.length-1)%items.length;sfx.click();}
  else if(code==="KeyS"||code==="ArrowDown"){m.sel=(m.sel+1)%items.length;sfx.click();}
  else if((code==="KeyA"||code==="ArrowLeft")&&it.left){it.left();sfx.click();}
  else if((code==="KeyD"||code==="ArrowRight")&&it.right){it.right();sfx.click();}
  else if(code==="Enter"||code==="Space"){ m.pressT=performance.now(); if(it.confirm) m.confirm={msg:it.confirm,sel:1,yes:it.fn}; else it.fn(); }
  else return false;
  return true;
}
// One look for every menu: the chosen row gets a bar, and flashes when pressed.
function menuRow(label,cx,yy,on,pressed,minW){
  if(on){ const rw=Math.min(W-16,Math.max(textW(label,1)+16,minW===undefined?96:minW)), rx=Math.round(cx-rw/2);
    px(ctx,pressed?FLAME:"#2a1d0e",rx,yy-2,rw,11); px(ctx,FLAME,rx,yy-2,1,11); px(ctx,FLAME,rx+rw-1,yy-2,1,11); }
  text(ctx,label,cx,yy,1,on?(pressed?"#140c04":FLAME):INK2,"c",on?null:"#000");
}
function drawMenu(m,y0){
  const pressed=performance.now()-(m.pressT||0)<130;
  m.hits=m.items().map((it,i)=>({i,y0:y0+i*10-2,y1:y0+i*10+8}));
  m.items().forEach((it,i)=>menuRow(it.label,W/2,y0+i*10,i===m.sel,pressed&&i===m.sel));
  if(m.confirm){
    const w=Math.max(textW(m.confirm.msg,1)+24,140), x=Math.round(W/2-w/2), y=72;
    uiFrame(ctx,x,y,w,42,FLAME,"rgba(5,5,5,.97)","#2a1d0e");
    text(ctx,m.confirm.msg,W/2,y+9,1,INK,"c");
    menuRow("YES",W/2-28,y+26,m.confirm.sel===0,false,40); menuRow("NO",W/2+28,y+26,m.confirm.sel===1,false,40);
  }
}
function renderTitle(){
  if(!titleRoom){titleRoom={nb:{},seed:31337,kind:"plain"}; buildRoom(titleRoom,true,false); titleRoom.canvas=paintRoom(titleRoom);}
  ctx.drawImage(titleRoom.canvas,0,0);
  const lx=160, ly=92, t=titleT, lan=curLantern();
  const rr=40*lan.radius*(1+Math.sin(t*13)*0.03+(fxRnd()-0.5)*0.05);
  const mx=lx+Math.cos(t*1.3)*28+Math.sin(t*3.1)*6, my=ly-6+Math.sin(t*1.3)*12+Math.cos(t*2.3)*4;
  drawMoth(ctx,mx,my,t);
  dg.globalCompositeOperation="source-over"; dg.clearRect(0,0,W,H); dg.fillStyle="rgba(1,1,2,.985)"; dg.fillRect(0,0,W,H);
  dg.globalCompositeOperation="destination-out";
  const gr=dg.createRadialGradient(lx,ly,0,lx,ly,rr); gr.addColorStop(0,"rgba(0,0,0,1)"); gr.addColorStop(0.55,"rgba(0,0,0,.9)"); gr.addColorStop(1,"rgba(0,0,0,0)");
  dg.fillStyle=gr; dg.beginPath(); dg.arc(lx,ly,rr,0,7); dg.fill();
  ctx.drawImage(darkC,0,0);
  ctx.drawImage(lanternIcon(2,100,t),lx-10,ly-14,20,32);
  text(ctx,"LAST LIGHT",W/2,12,4,FLAME,"c",EMBER);
  text(ctx,"FIND A WAY OUT BEFORE THE LIGHT RUNS OUT.",W/2,47,1,INK2,"c");
  const sv=loadSave();
  const found=Object.keys(sv.endings||{}).filter(k=>ENDING_IDS.includes(k)).length, notes=(sv.notes||[]).length;
  if(sv.runs) text(ctx,"ENDINGS "+found+"/"+ENDING_IDS.length+"   NOTES "+notes+"/"+NOTES.length+"   LANTERNS "+owned().length+"/"+LANTERNS.length,W/2,57,1,INK3,"c");
  const tm=settingsOpen?setMenu:titleMenu, nI=tm.items().length, mny=settingsOpen?120:106;
  uiFrame(ctx,W/2-86,mny-7,172,nI*10+9,INK3,"rgba(5,5,5,.82)","#1c1a17");
  drawMenu(tm,mny);
  if(notice&&notice.t<4) text(ctx,notice.msg,W/2,184,1,FLAME,"c","#000");
  else if(settingsOpen) text(ctx,["TIPS LIKE: THE LANTERN IS RUNNING LOW.","AUTO PICKS KEYBOARD OR TOUCH FOR THIS DEVICE.","CHANGE WHICH KEY DOES WHAT.","ESC: BACK"][setMenu.sel]||"",W/2,184,1,INK3,"c");
  else if(titleMenu.sel===1) text(ctx,lan.perk,W/2,184,1,INK3,"c");
  else{const nxt=LANTERNS.find(l=>!owned().includes(l)); if(nxt&&sv.runs) text(ctx,"NEXT LANTERN: "+nxt.how,W/2,184,1,INK3,"c");}
}
function renderPause(){
  px(ctx,"rgba(0,0,0,.8)",0,0,W,H);
  const pm=settingsOpen?setMenu:pauseMenu, nP=pm.items().length;
  uiFrame(ctx,W/2-96,10,192,36+nP*10,INK3,"rgba(5,5,5,.95)","#1c1a17");
  text(ctx,settingsOpen?"SETTINGS":"PAUSED",W/2,17,2,INK,"c");
  px(ctx,"#2a2622",W/2-80,34,160,1);
  drawMenu(pm,40);
  const help=touchMode()?["JOYSTICK MOVE   HOLD RUN TO RUN","SMALL BUTTONS: LANTERN   POUR   USE"]:
    [moveKeys()+" MOVE   "+K("run")+" RUN   "+K("dim")+"/"+K("bright")+" LANTERN",K("pour")+" POUR OIL   "+K("use")+" TALK / READ / USE"];
  if(!settingsOpen){ const hw=Math.max(textW(help[0],1),textW(help[1],1))+20;
    uiFrame(ctx,Math.round(W/2-hw/2),122,hw,28,"#2a2622","rgba(5,5,5,.9)");
    text(ctx,help[0],W/2,127,1,INK3,"c"); text(ctx,help[1],W/2,137,1,INK3,"c");
    text(ctx,"LANTERN: "+G.lan.name+(EVENTS[G.ev]?"   "+EVENTS[G.ev].replace("TONIGHT: ","").split(".")[0]:""),W/2,158,1,INK3,"c"); }
  if(notice&&notice.t<4) text(ctx,notice.msg,W/2,176,1,FLAME,"c","#000");
}
const endPortrait=mk(PN,PN), epg=endPortrait.getContext("2d");
function renderEnd(){
  const e=G.end; if(!e) return;
  px(ctx,"rgba(0,0,0,.86)",0,0,W,H);
  const k=clamp(titleT/0.6,0,1);
  ctx.globalAlpha=k;
  uiFrame(ctx,W/2-51,11,102,102,e.cause==="won"?COLD:"#3a1414","#000");
  if(e.cause==="moth"){ faces.moth=faces.moth||scareFace("moth"); ctx.drawImage(faces.moth,W/2-48,14,96,96); }
  else {
    epg.clearRect(0,0,PN,PN);
    drawPortrait(epg,0,0,e.cause==="won"?0:93,titleT,false,fxRnd);
    if(e.cause!=="won"&&portraitImg.complete){ // the face, pressed up under the sludge
      epg.globalAlpha=0.14; epg.drawImage(portraitImg,2*PN,0,PN,PN,0,0,PN,PN); epg.globalAlpha=1;
    }
    ctx.drawImage(endPortrait,W/2-48,14,96,96);
    if(e.cause==="won"){ctx.globalCompositeOperation="lighter";px(ctx,"rgba(143,180,196,.10)",W/2-48,14,96,96);ctx.globalCompositeOperation="source-over";}
  }
  if(e.title.includes(": ")){const [a,b]=e.title.split(": "); text(ctx,a,W/2,114,1,INK2,"c"); text(ctx,b,W/2,124,textW(b,2)>W-12?1:2,FLAME,"c","#000");}
  else text(ctx,e.title,W/2,120,textW(e.title,2)>W-12?1:2,e.cause==="won"?FLAME:BLOOD,"c","#000");
  text(ctx,e.line,W/2,142,1,INK2,"c");
  text(ctx,e.stats,W/2,154,1,INK,"c");
  if(e.unlock) text(ctx,e.unlock,W/2,165,1,Math.floor(titleT*3)%2?FLAME:INK,"c");
  ctx.globalAlpha=1;
  if(titleT>0.8){ const msg=touchMode()?(e.cause==="won"?"TAP TO GO BACK DOWN":"TAP TO TRY AGAIN"):(e.cause==="won"?"ENTER: GO BACK DOWN":"ENTER: TRY AGAIN")+"   ESC: MAIN MENU", mw=textW(msg,1)+20;
    uiFrame(ctx,Math.round(W/2-mw/2),174,mw,15,Math.floor(titleT*1.6)%2===0?FLAME:INK3,"rgba(5,5,5,.95)");
    text(ctx,msg,W/2,178,1,INK,"c"); }
}

/* ================= items, the bag, the camera and the journal ================= */
function tell(msg){ if(G){ G.toast={msg,t:0}; say(msg); } }
// 12 x 12 icons drawn in code, in the game's own palette
function itemIcon(g,id,x,y){
  const P=(c,a,b,w,h)=>px(g,c,x+a,y+b,w,h);
  if(id==="flask"){P("#8a6a44",5,1,2,2); P("#6b4a22",3,3,6,8); P("#d18b2a",4,5,4,5); P("#f0c070",4,5,1,1);}
  else if(id==="tea"){P("#e8e4dc",3,5,6,5); P("#e8e4dc",9,6,2,2); P("#6b4a22",4,6,4,1); P("#8f8778",4,1,1,3); P("#8f8778",6,0,1,3); P("#5c564c",2,10,8,1);}
  else if(id==="flare"){P("#7a2a22",4,3,3,8); P("#c4473a",4,3,1,8); P("#e8e4dc",4,2,3,1); P("#f2c35a",5,0,1,2); P("#fff1c8",5,1,1,1);}
  else if(id==="camera"){P("#2a2826",1,3,10,7); P("#4a4744",1,3,10,1); P("#2a2826",3,2,3,1); P("#8f8778",4,5,4,4); P("#141210",5,6,2,2); P("#e8e4dc",9,4,1,1);}
  else if(id==="film"){P("#141210",3,2,6,9); P("#e8c040",3,3,6,7); P("#141210",3,6,6,1); P("#8a6a2a",5,0,2,2); P("#2a2622",8,8,3,2);}
  else if(id==="blueprint"){P("#3a5a8a",1,2,10,8); P("#5a7aaa",1,2,10,1); P("#cfe0f0",3,4,4,1); P("#cfe0f0",3,6,6,1); P("#cfe0f0",6,4,1,4); P("#2a4a6a",10,3,1,7);}
  else if(id==="boots"){P("#5a3a22",2,2,4,7); P("#5a3a22",2,8,8,2); P("#3a2614",2,10,8,1); P("#7a5233",3,2,2,1);}
  else if(id==="wrench"){for(let k=0;k<5;k++) P("#8f8778",2+k,8-k,2,2); P("#b8b0a0",7,1,4,2); P("#b8b0a0",7,3,1,2); P("#b8b0a0",10,3,1,2);}
  else if(id==="crank"){P("#5a4f45",2,7,8,2); P("#5a4f45",8,2,2,5); P("#2a2622",1,6,2,4);}
  else if(id==="fuse"){P("#2a2622",4,1,4,10); P("#c9a04a",4,1,4,1); P("#c9a04a",4,10,4,1); P("#e8e4dc",5,4,2,4);}
  else if(id==="scrip"){P("#8a6a2a",3,3,6,6); P("#c9a04a",3,3,5,5); P("#f0d080",4,4,1,1);}
}
const icC=mk(12,12), icG=icC.getContext("2d");
function drawIcon(g,id,x,y,sz){ icG.clearRect(0,0,12,12); itemIcon(icG,id,0,0); g.imageSmoothingEnabled=false; g.drawImage(icC,Math.round(x),Math.round(y),sz,sz); }
const FLOOR_ICONS=["blueprint","camera","film","flare","wrench"];
function floorItem(g,it){ drawIcon(g,it.kind,it.x-6,it.y-11,12); if(Math.sin(G.elapsed*3+it.x)>0.9) px(g,"#fff1c8",it.x+3,it.y-10); }
function drawFlare(f){
  const x=Math.round(f.x), y=Math.round(f.y);
  px(ctx,"#7a2a22",x-1,y-3,2,4); px(ctx,Math.sin(G.elapsed*40)>0?"#ffd0a0":"#f2c35a",x-1,y-5,2,2);
  if(Math.random()<0.6) px(ctx,"#ff7a4a",x-2+Math.floor(Math.random()*4),y-7-Math.floor(Math.random()*4));
}
function pickUp(kind){
  if(kind==="blueprint"){G.blueprint=true; tell("THE BLUEPRINT. NOW YOU HAVE A MAP.");}
  if(kind==="camera"){G.camera=true; G.loaded=Math.max(G.loaded,2); tell("A CAMERA. TWO SHOTS LEFT. RAISE IT FROM THE BAG.");}
  if(kind==="film"){G.film+=2; tell("TWO ROLLS OF FILM. "+K("reload")+" LOADS THEM.");}
  if(kind==="flare"){G.flares++; tell("A FLARE. THROW IT. THE MOTH WILL CHASE IT.");}
  if(kind==="wrench"){G.wrench=true; tell("A WRENCH. VALVE WHEELS WILL TURN FASTER.");}
  if(kind==="oil"){G.flasks++; tell("AN OIL FLASK.");}
  if(kind==="scrip"){G.scrip+=2; sfx.coin(); tell("TWO BRASS SCRIP.");}
}
// What each thing is, how many you have, and what using it does (a message means it couldn't be used).
const ITEMS={
  flask:{name:"OIL FLASK",desc:"POUR IT INTO THE LANTERN.",n:()=>G.flasks,use:()=>pourOil(),verb:"POUR"},
  tea:{name:"BITTER TEA",desc:"DRINK IT. IT PULLS SOME OF THE BLACK OUT OF YOU.",n:()=>G.tea,use:()=>drinkTea(),verb:"DRINK"},
  flare:{name:"FLARE",desc:"THROW IT. THE MOTH CHASES ITS LIGHT INSTEAD OF YOURS.",n:()=>G.flares,use:()=>throwFlare(),verb:"THROW"},
  camera:{name:"CAMERA",desc:"PHOTOS GO IN THE JOURNAL. ASH STANDS STILL WHILE IT IS UP.",n:()=>G.camera?1:0,use:()=>toggleCamera(),verb:"RAISE"},
  film:{name:"FILM",desc:"ONE PHOTO EACH. THE CAMERA HOLDS THREE.",n:()=>G.film},
  blueprint:{name:"BLUEPRINT",desc:"A MAP OF THE WORKS. IT SHOWS ON THE LEFT.",n:()=>G.blueprint?1:0},
  boots:{name:"SOFT BOOTS",desc:"BROKEN GLASS MAKES NO SOUND UNDER YOU.",n:()=>G.boots?1:0},
  wrench:{name:"WRENCH",desc:"TURNS VALVE WHEELS TWICE AS FAST.",n:()=>G.wrench?1:0},
  crank:{name:"CRANK",desc:"IT FITS A HATCH SOMEWHERE.",n:()=>G.crank?1:0},
  fuse:{name:"FUSES",desc:"THE LIFT NEEDS THREE.",n:()=>G.fuses},
  scrip:{name:"SCRIP",desc:"BRASS TOKENS. WICK TAKES THESE.",n:()=>G.scrip}
};
const invItems=()=>Object.keys(ITEMS).filter(id=>ITEMS[id].n()>0);
function pourOil(){ if(G.flasks<1) return "NO OIL FLASKS."; if(G.pouring>0) return "ALREADY POURING."; if(G.fuel>=100) return "THE LANTERN IS FULL.";
  G.pouring=0.9; sfx.pour(); noise(G.p.x,G.p.y,0.3); }
function drinkTea(){ if(G.tea<1) return "NO TEA."; G.tea--; G.sludge=Math.max(0,G.sludge-35); sfx.pickup(); tell("BITTER. SOME OF THE BLACK LETS GO."); }
function throwFlare(){
  if(G.flares<1) return "NO FLARES.";
  const d={u:[0,-1],d:[0,1],l:[-1,0],r:[1,0]}[G.p.dir]||[0,1];
  G.flares--; G.flare={x:clamp(G.p.x+d[0]*44,24,W-24),y:clamp(G.p.y+d[1]*36,30,H-14),t:8,room:G.room};
  nz({dur:0.7,freq:5200,q:0.6,gain:0.07}); noise(G.flare.x,G.flare.y,0.35); tell("THE FLARE CATCHES. LET IT HAVE THE ATTENTION.");
}
function toggleCamera(){ if(!G.camera) return "NO CAMERA."; G.cam=G.cam?null:{filter:0,flash:0}; sfx.click(); }
function reloadFilm(){
  if(!G.camera||G.reloadT>0) return;
  if(G.loaded>=3){ tell("THE CAMERA IS ALREADY FULL."); return; }
  if(G.film<1){ tell("NO FILM LEFT."); return; }
  G.reloadT=1.2; sfx.click(); noise(G.p.x,G.p.y,0.15);
}
// Who is in the picture. Later creatures add themselves here.
function photoTargets(){ const out=[]; if(G.moth.inRoom&&!G.moth.gone) out.push("moth"); if(G.lis.inRoom&&!G.lis.gone) out.push("listener"); return out; }
function takePhoto(){
  if(G.reloadT>0) return;
  if(G.loaded<1){ sfx.click(); tell(G.film?"NO FILM LOADED. "+K("reload")+" LOADS IT.":"OUT OF FILM."); return; }
  G.loaded--;
  nz({dur:0.05,freq:3200,q:2,gain:0.14}); setTimeout(()=>nz({dur:0.04,freq:1700,q:3,gain:0.09}),70);
  if(G.cam.filter===0){ // the flash: seen by everything, wanted by the Moth
    G.cam.flash=0.3; noise(G.p.x,G.p.y,0.5);
    const m=G.moth; if(!m.gone&&!m.calm){ m.interest=100; m.moveT=Math.min(m.moveT,0.5); m.flashT=5; }
  }
  const got=photoTargets(); got.forEach(journalPhoto);
  if(!got.length) tell("JUST DARK AND PIPES IN THAT ONE.");
}
function camKey(code){
  if(code==="KeyA"||code==="KeyD"){ G.cam.filter^=1; sfx.click(); return true; }
  if(code==="Space"){ takePhoto(); return true; }
  if(code==="KeyW"||code==="KeyS"){ G.cam=null; sfx.click(); return true; }
  return false;
}
function nightVision(){
  if(G.room.noNight){ for(let i=0;i<1400;i++) px(ctx,Math.random()<0.5?"#18241a":"#3e523f",Math.floor(Math.random()*W),Math.floor(Math.random()*H),2,1);
    text(ctx,"NO SIGNAL",W/2,H/2-4,1,"#9fdc9f","c","#000"); return; }
  ctx.globalCompositeOperation="multiply"; px(ctx,"#64ff86",0,0,W,H);
  ctx.globalCompositeOperation="lighter"; px(ctx,"rgba(18,54,24,.4)",0,0,W,H);
  ctx.globalCompositeOperation="source-over";
  for(let y=0;y<H;y+=2) px(ctx,"rgba(0,0,0,.2)",0,y,W,1);
  for(let i=0;i<70;i++) px(ctx,"rgba(170,255,180,.25)",Math.floor(Math.random()*W),Math.floor(Math.random()*H));
}
function renderCamera(){
  const c=G.cam, nvOn=c.filter===1, col=nvOn?"#9fdc9f":INK;
  for(const [x,y,sx,sy] of [[8,8,1,1],[W-9,8,-1,1],[8,H-9,1,-1],[W-9,H-9,-1,-1]]){ px(ctx,col,sx>0?x:x-9,y,10,1); px(ctx,col,x,sy>0?y:y-9,1,10); }
  text(ctx,"< "+(nvOn?"NIGHT VISION":"NORMAL")+" >",14,13,1,col,undefined,"#000");
  text(ctx,"FILM "+G.loaded+"/3"+(G.film?"   "+G.film+" SPARE":""),W-14,13,1,G.loaded?col:BLOOD,"r","#000");
  if(G.reloadT>0){ px(ctx,"#1c1a17",W/2-30,36,60,3); px(ctx,FLAME,W/2-30,36,Math.round(60*(1-G.reloadT/1.2)),3); text(ctx,"LOADING",W/2,42,1,INK2,"c","#000"); }
  const hint=touchMode()?"JOYSTICK: FILTER OR LOWER   USE: PHOTO   LOAD":K("left")+"/"+K("right")+" FILTER   "+K("use")+" PHOTO   "+K("reload")+" LOAD   "+K("up")+" LOWER";
  text(ctx,hint,W/2,24,1,col,"c","#000"); // at the top, clear of messages
  if(c.flash>0){ ctx.globalAlpha=Math.min(1,c.flash/0.3); px(ctx,"#fffbea",0,0,W,H); ctx.globalAlpha=1; }
}
function renderInv(){
  px(ctx,"rgba(0,0,0,.85)",0,0,W,H);
  uiFrame(ctx,12,8,W-24,H-16,INK3,"rgba(5,5,5,.96)","#1c1a17");
  text(ctx,"BAG",W/2,14,1,INK,"c"); px(ctx,"#2a2622",24,24,W-48,1);
  const items=invItems(), gx=24, gy=32, sz=28, gap=4; G.invSel=clamp(G.invSel,0,11); G.invHits=[]; G.invUseHit=null;
  for(let i=0;i<12;i++){
    const x=gx+(i%4)*(sz+gap), y=gy+Math.floor(i/4)*(sz+gap), id=items[i], on=i===G.invSel;
    uiFrame(ctx,x,y,sz,sz,on?FLAME:"#2a2622",on?"#1a1208":"#0b0a09");
    if(id){ drawIcon(ctx,id,x+2,y+2,24); const n=ITEMS[id].n(); if(n>1) text(ctx,String(n),x+sz-3,y+sz-9,1,INK,"r","#000"); }
    G.invHits.push({i,x,y,w:sz,h:sz});
  }
  const id=items[G.invSel], rx=gx+4*(sz+gap)+10, rw=W-24-rx;
  if(id){ const it=ITEMS[id];
    text(ctx,it.name,rx,gy,1,FLAME);
    wrapText(it.desc,Math.floor(rw/6)).forEach((l,i)=>text(ctx,l,rx,gy+14+i*10,1,INK2));
    if(it.use){ const lab=id==="camera"&&G.cam?"LOWER":it.verb; menuRow(lab,rx+38,gy+82,true,performance.now()-(G.invPressT||0)<130,70); G.invUseHit={x:rx+3,y:gy+80,w:70,h:11}; }
  } else text(ctx,items.length?"":"THE BAG IS EMPTY.",rx,gy,1,INK3);
  if(G.invMsg) text(ctx,G.invMsg,W/2,H-32,1,BLOOD,"c");
  text(ctx,touchMode()?"JOYSTICK: CHOOSE   USE: USE   BAG: CLOSE":"ARROWS: CHOOSE   "+K("use")+": USE   "+K("inventory")+": CLOSE",W/2,H-20,1,INK3,"c");
}
function uiKey(code){
  if(G.ui==="inv"){
    if(code==="Tab"||code==="Escape"){G.ui=null;return;}
    const mv={KeyA:-1,ArrowLeft:-1,KeyD:1,ArrowRight:1,KeyW:-4,ArrowUp:-4,KeyS:4,ArrowDown:4}[code];
    if(mv){G.invSel=clamp(G.invSel+mv,0,11); G.invMsg=""; sfx.click(); return;}
    if(code==="Space"||code==="Enter"){ const id=invItems()[G.invSel]; G.invPressT=performance.now();
      if(!id) return; const it=ITEMS[id]; if(!it.use){G.invMsg="NOTHING TO DO WITH IT RIGHT NOW."; return;}
      const msg=it.use(); if(msg){G.invMsg=msg; sfx.click();} else G.ui=null; }
    return;
  }
  if(G.ui==="journal"){
    if(code==="KeyB"||code==="Escape"){G.ui=null;return;}
    const n=journalEntries().length;
    if(code==="KeyW"||code==="ArrowUp"){G.jSel=(G.jSel+n-1)%n; sfx.click();}
    if(code==="KeyS"||code==="ArrowDown"){G.jSel=(G.jSel+1)%n; sfx.click();}
  }
}
function uiTap(x,y){
  if(G.ui==="inv"){
    const h=(G.invHits||[]).find(h=>x>=h.x&&x<h.x+h.w&&y>=h.y&&y<h.y+h.h);
    if(h){ if(h.i===G.invSel) uiKey("Space"); else {G.invSel=h.i; G.invMsg=""; sfx.click();} return; }
    const u=G.invUseHit; if(u&&x>=u.x&&x<u.x+u.w&&y>=u.y-2&&y<u.y+u.h) uiKey("Space");
    return;
  }
  const h=(G.jHits||[]).find(h=>x<158&&y>=h.y0&&y<h.y1); if(h){G.jSel=h.i; sfx.click();}
}
// ---------- the journal: one page per creature, plus the notes ----------
const EA=typeof ENEMY_ART!=="undefined"?ENEMY_ART:null;
const BESTIARY=[
  {id:"moth",name:"THE MOTH",desc:"IT WANTS YOUR LIGHT. A BRIGHT LANTERN CALLS IT. A SMALL ONE KEEPS IT GUESSING.",sz:32,draw:(g,t)=>drawMoth(g,16,16,t)},
  {id:"listener",name:"THE LISTENER",desc:"IT CANNOT SEE YOU. IT HEARS YOU. RUNNING, GLASS AND GEARS ALL CARRY.",sz:32,draw:(g,t)=>drawListener(g,16,30,t,false)},
  {id:"roughneck",name:"THE ROUGHNECK",desc:"A DRILL HAND, ON ALL FOURS NOW. IT CHASES ANYTHING THAT MOVES. STAND STILL.",sz:32,draw:(g,t)=>EA&&EA.roughneckDown(g,16,30,Math.floor(t*4)%3)},
  {id:"tarling",name:"THE TARLING",desc:"A PUDDLE THAT WATCHES. THE MORE BLACK ON YOU, THE BETTER IT FINDS YOU.",sz:32,draw:(g,t)=>EA&&EA.tarlingAttack(g,16,30,1)},
  {id:"knocker",name:"THE KNOCKER",desc:"WORKERS AND PIPE, GROWN TOGETHER. IT REACHES FROM BROKEN PIPES. TURN THE RED VALVES.",sz:64,draw:(g,t)=>EA&&EA.knockerReach(g,42,40,2,"rust")},
  {id:"smother",name:"THE SMOTHER",desc:"A DARKNESS THAT EATS LIGHT. PUT YOUR LANTERN OUT AND DO NOT MOVE.",sz:64,draw:(g,t)=>EA&&EA.smother(g,32,60,Math.floor(t*3))},
  {id:"tenant",name:"THE TENANT",desc:"IT LIVES IN ONE LOCKER. A CRACKED DOOR, EYES, FLIES. CHOOSE ANOTHER ONE.",sz:64,draw:(g,t)=>{if(EA){EA.tenantOpenLocker(g,24,20); EA.tenantFigure(g,24,20,true);}}},
  {id:"firedamp",name:"FIREDAMP",desc:"MINE GAS WITH SOMEONE INSIDE. OPEN FLAME SETS IT OFF. GO DIM TO PASS.",sz:64,draw:(g,t)=>EA&&EA.firedampDrift(g,32,46,t)},
  {id:"timekeeper",name:"THE TIMEKEEPER",desc:"THE SHIFT BOSS STILL KEEPS TIME. STAY IN ONE ROOM TOO LONG AND HE CLOCKS YOU IN.",sz:32,draw:(g,t)=>EA&&EA.timekeeperDown(g,16,30,Math.floor(t*4)%3)}
];
function journalSeen(id){
  const J=G.save.journal; if(J.seen.includes(id)) return;
  J.seen.push(id); writeSave(G.save);
  tell("NEW JOURNAL PAGE: "+BESTIARY.find(b=>b.id===id).name+".   "+K("journal")+" TO READ.");
}
function journalPhoto(id){
  journalSeen(id);
  const J=G.save.journal; if(J.photos.includes(id)) return;
  J.photos.push(id); writeSave(G.save);
  tell(J.photos.length>=JIDS.length?"THE JOURNAL IS COMPLETE. A NEW LANTERN WAITS.":"PHOTO OF "+BESTIARY.find(b=>b.id===id).name+" ADDED TO THE JOURNAL.");
}
function journalEntries(){
  const s=G.save, J=s.journal;
  return [...BESTIARY.map(b=>({kind:"enemy",b,seen:J.seen.includes(b.id),photo:J.photos.includes(b.id)})),
          ...NOTES.map((t,i)=>({kind:"note",i,found:s.notes.includes(i)}))];
}
const jpC=mk(64,64), jpG=jpC.getContext("2d");
function bestiaryPic(b,x,y,shadow){
  jpG.clearRect(0,0,64,64); b.draw(jpG,titleT);
  if(shadow){ jpG.globalCompositeOperation="source-atop"; jpG.fillStyle="#0b0a09"; jpG.fillRect(0,0,64,64); jpG.globalCompositeOperation="source-over"; }
  ctx.imageSmoothingEnabled=false; ctx.drawImage(jpC,0,0,b.sz,b.sz,x,y,64,64);
}
function renderJournal(){
  px(ctx,"rgba(0,0,0,.85)",0,0,W,H);
  const E=journalEntries(); G.jSel=clamp(G.jSel,0,E.length-1);
  for(const x of [10,162]) uiFrame(ctx,x,6,148,H-12,"#3a3026","#141008","#2a2014");
  text(ctx,"JOURNAL",84,12,1,FLAME,"c");
  const rows=14, start=clamp(G.jSel-7,0,Math.max(0,E.length-rows)); G.jHits=[];
  for(let k=0;k<rows&&start+k<E.length;k++){
    const i=start+k, e=E[i], y=26+k*10, on=i===G.jSel;
    const label=e.kind==="enemy"?(e.seen?e.b.name:"???"):(e.found?"NOTE "+(e.i+1):"NOTE ???");
    if(on){ px(ctx,"#2a1d0e",16,y-2,136,10); px(ctx,FLAME,16,y-2,1,10); }
    text(ctx,label,20,y,1,on?FLAME:(e.kind==="enemy"?(e.seen?INK:INK3):(e.found?"#cfc6a8":INK3)));
    if(e.kind==="enemy"&&e.photo){ px(ctx,INK2,143,y+1,6,5); px(ctx,"#141008",145,y+2,2,2); }
    G.jHits.push({i,y0:y-2,y1:y+8});
  }
  const J=G.save.journal;
  text(ctx,"PAGES "+J.seen.length+"/"+JIDS.length+"   PHOTOS "+J.photos.length+"/"+JIDS.length,84,H-20,1,INK3,"c");
  const e=E[G.jSel], rx=170, cx=rx+66;
  if(e.kind==="enemy"){
    uiFrame(ctx,cx-34,12,68,68,"#3a3026","#2e2a24"); // dim floor colour, so dark creatures still show
    if(e.seen) bestiaryPic(e.b,cx-32,14,!e.photo); else text(ctx,"?",cx,36,3,INK3,"c");
    text(ctx,e.seen?e.b.name:"???",cx,86,1,e.seen?FLAME:INK3,"c");
    wrapText(e.seen?e.b.desc:"YOU HAVEN'T MET THIS ONE. YET.",21).forEach((l,i)=>text(ctx,l,rx,100+i*10,1,INK2));
    if(e.seen) text(ctx,e.photo?"PHOTO TAKEN":"NO PHOTO YET",cx,H-30,1,e.photo?COLD:INK3,"c");
  } else {
    text(ctx,e.found?"NOTE "+(e.i+1):"NOTE ???",cx,14,1,FLAME,"c");
    wrapText(e.found?NOTES[e.i]:"NOT FOUND YET.",21).forEach((l,i)=>text(ctx,l,rx,30+i*10,1,e.found?"#cfc6a8":INK3));
  }
  text(ctx,(touchMode()?"BOOK":K("journal"))+": CLOSE",cx,H-20,1,INK3,"c");
}

/* ================= keys: every action can be rebound ================= */
// [id, label, canonical code the game reacts to, default keys]
const ACTIONS=[
  ["up","MOVE UP","KeyW",["KeyW","ArrowUp"]], ["down","MOVE DOWN","KeyS",["KeyS","ArrowDown"]],
  ["left","MOVE LEFT","KeyA",["KeyA","ArrowLeft"]], ["right","MOVE RIGHT","KeyD",["KeyD","ArrowRight"]],
  ["run","RUN","ShiftLeft",["ShiftLeft","ShiftRight"]], ["dim","LANTERN DIMMER","KeyQ",["KeyQ"]], ["bright","LANTERN BRIGHTER","KeyE",["KeyE"]],
  ["pour","POUR OIL","KeyF",["KeyF"]], ["use","USE / TALK / HIDE","Space",["Space","Enter"]], ["inventory","INVENTORY","Tab",["Tab"]],
  ["journal","JOURNAL","KeyB",["KeyB"]], ["reload","RELOAD FILM","KeyR",["KeyR"]], ["pause","PAUSE","Escape",["Escape","KeyP"]]
];
const KEYS_STORE="shanoware.keys.last-light";
const DEFAULT_BINDS=Object.fromEntries(ACTIONS.map(a=>[a[0],a[3].slice()]));
// Checked like a save: known actions only, 1 or 2 plain key codes each, and no key used by two actions.
function cleanBinds(o){
  const out={}, seen=new Set();
  for(const [id,,,def] of ACTIONS){
    const v=o&&typeof o==="object"&&Array.isArray(o[id])?o[id]:def;
    if(!(v.length>=1&&v.length<=2&&v.every(c=>typeof c==="string"&&/^[A-Za-z0-9]{1,24}$/.test(c)))) return null;
    for(const c of v){ if(seen.has(c)) return null; seen.add(c); }
    out[id]=v.slice();
  }
  return out;
}
let BINDS=(()=>{ try{ return cleanBinds(JSON.parse(localStorage.getItem(KEYS_STORE)))||cleanBinds(DEFAULT_BINDS); }catch(e){ return cleanBinds(DEFAULT_BINDS); } })();
function saveBinds(){ try{ localStorage.setItem(KEYS_STORE,JSON.stringify(BINDS)); }catch(e){} }
function canon(code){ for(const [id,,c] of ACTIONS) if(BINDS[id].includes(code)) return c; return null; }
const MENU_KEYS=new Set(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Enter","Escape"]); // always work in menus
const KEY_NAMES={Space:"SPACE",Escape:"ESC",Enter:"ENTER",Tab:"TAB",Backspace:"BACKSPACE",CapsLock:"CAPS",ShiftLeft:"L SHIFT",ShiftRight:"R SHIFT",
  ControlLeft:"L CTRL",ControlRight:"R CTRL",AltLeft:"L ALT",AltRight:"R ALT",ArrowUp:"UP",ArrowDown:"DOWN",ArrowLeft:"LEFT",ArrowRight:"RIGHT"};
function keyName(c){ let m; if(KEY_NAMES[c]) return KEY_NAMES[c]; if((m=/^Key([A-Z])$/.exec(c))) return m[1]; if((m=/^Digit(\d)$/.exec(c))) return m[1];
  if((m=/^Numpad(\d)$/.exec(c))) return "NUM "+m[1]; return c.toUpperCase().replace(/[^A-Z0-9 ]/g,"").slice(0,10); }
const TOUCH_NAMES={up:"JOYSTICK",down:"JOYSTICK",left:"JOYSTICK",right:"JOYSTICK",run:"RUN",dim:"LANTERN DOWN",bright:"LANTERN UP",pour:"POUR",use:"USE",inventory:"BAG",journal:"BOOK",reload:"LOAD",pause:"PAUSE"};
function K(id){ return touchMode()?TOUCH_NAMES[id]:keyName(BINDS[id][0]); }
function moveKeys(){ const k=["up","left","down","right"].map(K); return k.every(x=>x.length===1)?k.join(""):k.join("/"); }
let subMenu=null, keysNotice="", capture=null;
const keysMenu={sel:0,confirm:null,items:()=>[
  ...ACTIONS.map(([id,label])=>({label:label.padEnd(18)+BINDS[id].map(keyName).join("/").padStart(15),fn:()=>{capture=id; keysNotice="PRESS A KEY FOR "+label+".   ESC CANCELS.";}})),
  {label:"RESET TO DEFAULTS",confirm:"PUT EVERY KEY BACK?",fn:()=>{BINDS=cleanBinds(DEFAULT_BINDS); saveBinds(); keysNotice="EVERY KEY IS BACK TO DEFAULT.";}},
  {label:"BACK",fn:()=>{subMenu=null; keysNotice="";}}
]};
function bindKey(code){
  const id=capture, label=ACTIONS.find(a=>a[0]===id)[1]; capture=null;
  if(!code||code==="Escape"){ keysNotice="NOTHING CHANGED."; return; }
  if(!/^[A-Za-z0-9]{1,24}$/.test(code)){ keysNotice="THAT KEY CAN'T BE USED."; return; }
  const owner=ACTIONS.find(a=>a[0]!==id&&BINDS[a[0]].includes(code));
  if(owner){ keysNotice=keyName(code)+" IS ALREADY USED BY "+owner[1]+"."; sfx.click(); return; }
  BINDS[id]=[code]; saveBinds(); keysNotice=label+": "+keyName(code); sfx.click();
}
function renderKeys(){
  ctx.setTransform(1,0,0,1,0,0);
  px(ctx,"#050505",0,0,W,H);
  text(ctx,"KEYS",W/2,4,2,INK,"c");
  drawMenu(subMenu,24);
  text(ctx,capture||keysNotice?keysNotice:"ENTER: CHANGE   ESC: BACK",W/2,183,1,capture?FLAME:keysNotice?INK:INK3,"c");
}
// Real keys are turned into the game's own action codes here, so the rest of the game never sees a rebinding.
function onRawKey(e){
  if(capture){ e.preventDefault(); if(!e.repeat) bindKey(e.code); return; }
  const c=canon(e.code), menu=mode!=="play"||!!subMenu||!!(G&&(G.dlg||G.ui));
  const code=menu&&MENU_KEYS.has(e.code)?e.code:c;
  if(!code) return;
  e.preventDefault();
  onKeyDown({code,repeat:e.repeat,preventDefault(){}});
}
function onRawUp(e){ const c=canon(e.code); if(c) keys.delete(c); keys.delete(e.code); }

/* ================= input ================= */
function begin(){
  audioStart(); stopLoops(); newGame(); startLoops(); mode="play"; pauseMenu.sel=0; pauseMenu.confirm=null; intro();
}
function togglePause(){
  settingsOpen=false;
  if(mode==="play"&&!G.dying){mode="pause";pauseMenu.sel=0;pauseMenu.confirm=null;say("Paused.");if(A.ctx)A.ctx.suspend();}
  else if(mode==="pause"){mode="play";say("");if(A.ctx)A.ctx.resume();}
}
function toTitle(){
  settingsOpen=false;
  stopLoops(); if(A.ctx&&A.ctx.state==="suspended") A.ctx.resume();
  G=null; mode="title"; titleT=0; titleMenu.sel=0; titleMenu.confirm=null; say("Main menu.");
}
function onKeyDown(e){
  if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code)) e.preventDefault();
  if(e.repeat){keys.add(e.code);return;}
  keys.add(e.code);
  if(subMenu){ if(e.code==="Escape"&&!subMenu.confirm){ subMenu=null; keysNotice=""; } else menuKey(subMenu,e.code); return; }
  if(mode==="title"){audioStart(); if(settingsOpen&&e.code==="Escape") settingsOpen=false; else menuKey(settingsOpen?setMenu:titleMenu,e.code); return;}
  if(mode==="end"){ if(titleT>0.8&&(e.code==="Enter"||e.code==="Space")) begin(); else if(titleT>0.8&&e.code==="Escape") toTitle(); return; }
  if(mode==="pause"&&settingsOpen){ if(e.code==="Escape") settingsOpen=false; else menuKey(setMenu,e.code); return; }
  if(mode==="pause"){ if(!pauseMenu.confirm&&(e.code==="Escape"||e.code==="KeyP")) togglePause(); else menuKey(pauseMenu,e.code); return; }
  if(mode==="play"&&G.dlg&&G.introPanel!=null&&e.code==="Escape"){G.dlg=null;introDone();return;}
  if(mode==="play"&&G.ui){uiKey(e.code);return;}
  if(e.code==="Escape"||e.code==="KeyP"){togglePause();return;}
  if(mode!=="play"||G.dying||G.slide) return;
  if(G.dlg){dialogKey(e.code);return;}
  if(G.sit||G.exitSeq) return;
  if(e.code==="Tab"){G.ui="inv"; G.invMsg=""; sfx.click(); return;}
  if(e.code==="KeyB"){G.ui="journal"; sfx.click(); return;}
  if(e.code==="KeyR"){reloadFilm(); return;}
  if(G.cam&&camKey(e.code)) return;
  if(e.code==="Space"||e.code==="Enter"){const it=nearestThing(); if(it) it.fn(); return;}
  if(e.code==="KeyQ"||e.code==="KeyE"){
    const nl=clamp(G.level+(e.code==="KeyE"?1:-1),0,3);
    if(nl!==G.level){G.level=nl;sfx.click();noise(G.p.x,G.p.y,0.1);}
  }
  if(e.code==="KeyF") pourOil();
}
window.addEventListener("keydown",onRawKey);
window.addEventListener("keyup",onRawUp);
window.addEventListener("blur",()=>{keys.clear(); if(mode==="play") togglePause();});
document.addEventListener("visibilitychange",()=>{if(document.hidden&&mode==="play") togglePause();});
// a tap or click on the picture: menu rows, dialogue choices, or "next"
function tapAt(x,y){
  if(mode==="play"&&G&&G.ui&&!subMenu){uiTap(x,y);return;}
  if(mode==="end"&&!subMenu){ if(titleT>0.8) begin(); return; }
  if(capture) return;
  const m=subMenu||(settingsOpen?setMenu:mode==="title"?titleMenu:mode==="pause"?pauseMenu:null);
  if(m){
    if(m.confirm){ if(y>=90&&y<=112){m.confirm.sel=x<W/2?0:1; menuKey(m,"Enter");} return; }
    const h=(m.hits||[]).find(h=>y>=h.y0&&y<h.y1); if(!h) return;
    m.sel=h.i; const it=m.items()[h.i];
    if(it.left&&x<W/2-40){it.left(); sfx.click();} else menuKey(m,"Enter");
    return;
  }
  if(mode==="play"&&G&&G.dlg){
    const d=G.dlg, st=d.steps[d.i];
    if(st[2]&&d.shown>=st[1].length){const h=(d.hits||[]).find(h=>y>=h.y0&&y<h.y1); if(h){d.sel=h.i; dialogKey("Space");} return;}
    dialogKey("Space");
  }
}
cv.addEventListener("click",e=>{
  cv.focus(); audioStart();
  const r=cv.getBoundingClientRect(); tapAt((e.clientX-r.left)/r.width*W,(e.clientY-r.top)/r.height*H);
});
addEventListener("contextmenu",e=>e.preventDefault());

/* ================= sizing and loop ================= */
const wrap=document.getElementById("wrap");
pl.addEventListener("click",e=>{
  if(mode!=="play"||!G||G.dlg||G.ui||G.dying) return;
  const r=pl.getBoundingClientRect(), x=(e.clientX-r.left)/r.width*PW, y=(e.clientY-r.top)/r.height*H;
  const q=quickHits.find(q=>x>=q.x-1&&x<=q.x+q.w+1&&y>=q.y-1&&y<=q.y+q.h+4);
  if(q&&ITEMS[q.id].n()>0){ const msg=ITEMS[q.id].use(); if(msg) tell(msg); }
});
// The room keeps its 320 x 192 grid; side panels fill the extra width, never less than slim strips.
function fit(){
  const iw=innerWidth, ih=innerHeight, s=Math.min(ih/H, iw/(W+2*PMIN)), k=s>=2?Math.floor(s):s;
  PW=clamp(Math.floor((iw/k-W)/2),PMIN,PMAX);
  for(const c of [pl,pr]){ c.width=PW; c.height=H; c.style.width=Math.floor(PW*k)+"px"; c.style.height=Math.floor(H*k)+"px"; }
  cv.style.width=Math.floor(W*k)+"px"; cv.style.height=Math.floor(H*k)+"px";
}
addEventListener("resize",fit); fit();

/* ================= touch controls and landscape ================= */
// Every control presses the same keys as the keyboard, so the game logic is untouched.
const keyDown=code=>{ buzz(10); onKeyDown({code,repeat:false,preventDefault(){}}); };
const touchEl=document.getElementById("touch");
function applyTouch(){
  touchEl.style.setProperty("--tc-alpha",Math.min(0.95,Math.max(0.2,+SW.touchAlpha||0.75)));
  touchEl.style.setProperty("--tc-zoom",{s:0.85,m:1,l:1.2}[SW.touchSize]||1);
  touchEl.classList.toggle("lefty",!!SW.leftHanded);
}
applyTouch();
const keyUp=code=>keys.delete(code);
document.querySelectorAll("#touch button").forEach(b=>{
  const code=b.dataset.key;
  b.addEventListener("pointerdown",e=>{e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add("on"); keyDown(code);});
  const up=()=>{if(!b.classList.contains("on")) return; b.classList.remove("on"); keyUp(code); audioStart(); landscape();};
  b.addEventListener("pointerup",up); b.addEventListener("pointercancel",up); b.addEventListener("lostpointercapture",up);
});
const stick=document.getElementById("stick"), knob=document.getElementById("knob");
let stickId=null; const held={x:null,y:null};
function stickAxis(axis,code){ if(held[axis]===code) return; if(held[axis]) keyUp(held[axis]); held[axis]=code; if(code) keyDown(code); }
function stickMove(e){
  const r=stick.getBoundingClientRect(), R=r.width/2;
  let dx=e.clientX-(r.left+R), dy=e.clientY-(r.top+R); const d=Math.hypot(dx,dy);
  if(d>R){dx*=R/d; dy*=R/d;}
  knob.style.transform="translate("+(SW.leftHanded?-dx:dx)+"px,"+dy+"px)"; // the mirrored layout flips x on screen
  const dead=R*0.3;
  stickAxis("x",dx<-dead?"KeyA":dx>dead?"KeyD":null);
  stickAxis("y",dy<-dead?"KeyW":dy>dead?"KeyS":null);
}
function stickEnd(){ stickId=null; knob.style.transform=""; stickAxis("x",null); stickAxis("y",null); }
stick.addEventListener("pointerdown",e=>{e.preventDefault(); stickId=e.pointerId; stick.setPointerCapture(e.pointerId); stickMove(e);});
stick.addEventListener("pointermove",e=>{if(e.pointerId===stickId) stickMove(e);});
["pointerup","pointercancel","lostpointercapture"].forEach(t=>stick.addEventListener(t,e=>{if(e.pointerId===stickId){stickEnd(); landscape();}}));
window.addEventListener("blur",stickEnd);

// Ask for landscape. Chrome only locks orientation in fullscreen, which needs a tap first.
function landscape(){
  if(!touchMode()||!screen.orientation||!screen.orientation.lock) return;
  const lock=()=>screen.orientation.lock("landscape").catch(()=>{});
  if(!document.fullscreenElement&&document.documentElement.requestFullscreen) document.documentElement.requestFullscreen({navigationUI:"hide"}).then(lock,lock);
  else lock();
}
landscape(); // works straight away in the installed app; otherwise the first tap does it
addEventListener("pointerup",landscape,{once:true});
// Turning the phone upright mid-run pauses the game under the "Turn your phone" screen.
const portrait=matchMedia("(orientation:portrait)");
portrait.addEventListener("change",()=>{ if(portrait.matches&&touchMode()&&mode==="play"&&!G.dying){ stickEnd(); keys.clear(); togglePause(); } });
let shownMode=null, playSecs=0, playFlushAt=0;
function flushPlaytime(){
  const add=Math.floor(playSecs); if(add<1) return;
  playSecs-=add; const s=loadSave(); s.playtime=(s.playtime||0)+add; writeSave(s);
  if(G&&G.save) G.save.playtime=s.playtime; // G.save is written later; keep it in step
}
addEventListener("pagehide",flushPlaytime);
document.addEventListener("visibilitychange",()=>{ if(document.hidden) flushPlaytime(); });
addEventListener("pageshow",e=>{ if(e.persisted){ readSettings(); applyInput(); applyAudio(); applyTouch(); } });
function loop(now){
  const dt=Math.min(0.05,(now-last)/1000); last=now;
  update(dt); render();
  if(mode==="play"&&!G.dying){ playSecs+=dt; if(now>playFlushAt){ playFlushAt=now+30000; flushPlaytime(); } }
  if(mode!==shownMode){ if(shownMode==="play") flushPlaytime(); shownMode=mode; document.body.dataset.mode=mode; }
  const camUp=G&&G.cam?"1":""; if(document.body.dataset.cam!==camUp) document.body.dataset.cam=camUp;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ================= self-check (run LastLight.selfTest() in the console) ================= */
if(/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.LastLight={
  get state(){return G;}, get mode(){return mode;}, key:k=>dialogKey(k), talk:k=>({wick:talkWick,gauge:talkGauge,smudge:talkSmudge,office:talkOffice,whistle:talkWhistle,hatch:atHatch})[k](), exit:t=>atExit(t), payload:()=>savePayload(), apply:o=>applyPayload(o), code:()=>saveCode(), hall:()=>hallucinate(), map:seed=>genMap(seed),
  selfTest(n){
    n=n||40;
    for(let i=0;i<n;i++){
      const m=genMap(1000+i);
      console.assert(m.rooms.length===ROOMS,"room count");
      console.assert(m.rooms.every(r=>isFinite(r.dist)),"every room reachable");
      console.assert(m.exit&&m.exit.hatch&&m.exit!==m.start,"exit placed");
      console.assert(m.exits.length===2&&m.exits[0]!==m.exits[1]&&m.exits.every(e=>e.exitT&&e.hatch),"two different exits");
      if(m.exits.some(e=>e.exitT==="hatch")) console.assert(m.rooms.filter(r=>r.item&&r.item.kind==="crank").length===1,"one crank");
      if(m.exits.some(e=>e.exitT==="lift")) console.assert(m.rooms.filter(r=>r.item&&r.item.kind==="fuse").length===3,"three fuses");
      for(const e of m.exits) console.assert(!isSolid(tileAt(e,e.hatch.x,e.hatch.y+14)),"exit reachable");
      ["shop","gauge","smudge","office","whistle"].forEach(k=>console.assert(m.rooms.filter(r=>r.special===k).length===1,"one "+k));
      console.assert(m.rooms.filter(r=>r.note).length===NOTES.length,"all notes placed");
      console.assert(!m.exit.special&&!m.start.special,"exit and start stay plain");
      for(const r of m.rooms){
        for(const [d,o] of Object.entries(r.nb)) console.assert(o.nb[{n:"s",s:"n",e:"w",w:"e"}[d]]===r,"doors are two-way");
        console.assert(!isSolid(r.tiles[5*RW+9])&&!isSolid(r.tiles[6*RW+10]),"centre stays open");
        // the wall blocks that used to sit under the map, the face and the lantern are gone
        for(const [x0,y0,x1,y1] of [[1,1,3,3],[16,1,18,4],[1,9,3,10]]){ let wall=true; for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) if(r.tiles[y*RW+x]!==1) wall=false; console.assert(!wall,"old HUD corner is open"); }
        for(const o of r.oil.concat(r.scrip,r.note?[r.note]:[],r.item?[r.item]:[])) console.assert(!isSolid(tileAt(r,o.x,o.y)),"item on open floor");
        if(r.hatch) console.assert(!isSolid(tileAt(r,r.hatch.x,r.hatch.y)),"hatch on floor");
      }
    }
    // a save survives a round trip, and junk is refused
    const good={game:"last-light",v:1,data:{runs:3,endings:{hatch_alone:1,fake:1},notes:[0,2,99],met:{wick:1},lantern:"miner"}};
    console.assert(cleanSave(good.data).notes.length===2&&!cleanSave(good.data).endings.fake,"save cleaned");
    console.assert(!applyPayload({game:"other",v:1,data:{}})&&!applyPayload(null)&&!applyPayload({game:"last-light",v:1,data:[1]}),"bad saves refused");
    console.assert(ENDING_IDS.length===18,"18 endings");
    const count=(m,k)=>m.rooms.reduce((a,r)=>a+(r.item&&r.item.kind===k?1:0)+r.crates.filter(c=>c.item===k).length,0);
    for(let i=0;i<n;i++){ const m=genMap(3000+i), bp=m.rooms.filter(r=>(r.item&&r.item.kind==="blueprint")||r.crates.some(c=>c.item==="blueprint"));
      console.assert(count(m,"blueprint")===1&&bp[0].dist>=1&&bp[0].dist<=3,"blueprint within 3 rooms of the start");
      console.assert(count(m,"camera")===1,"one camera");
      console.assert(count(m,"film")===3&&count(m,"flare")===2&&count(m,"wrench")===1,"film, flares and the wrench placed");
      console.assert(new Set(m.rooms.map(r=>r.zone)).size===ZONES.length&&m.start.zone==="storage","seven zones, the start in Storage");
      for(const z of ZONES){
        const zr=m.rooms.filter(r=>r.zone===z.id), seen=new Set([zr[0]]), q=[zr[0]];
        while(q.length){const r=q.pop(); for(const o of r.neighbors) if(o.zone===z.id&&!seen.has(o)){seen.add(o); q.push(o);}}
        console.assert(seen.size===zr.length,"zone "+z.id+" is one piece");
        for(const k of MUST[z.id]) console.assert(zr.filter(r=>r.kind===k).length>=MUST[z.id].filter(x=>x===k).length,z.id+" has its "+k);
      }
      for(const zid of PIPE_ZONES) console.assert(m.rooms.some(r=>r.broken&&r.zone===zid),"broken pipes in "+zid);
      for(const r of m.rooms){
        const reach=(x,y)=>r.reach[Math.floor(y/T)*RW+Math.floor(x/T)];
        for(const d of Object.keys(r.nb)) console.assert(r.reach[{n:9,s:(RH-1)*RW+9,w:5*RW,e:5*RW+RW-1}[d]],"every door can be reached");
        for(const c of r.crates) console.assert(r.tiles[c.ty*RW+c.tx]===7&&DIRS.some(([dx,dy])=>r.reach[(c.ty+dy)*RW+c.tx+dx]),"every crate can be reached");
        for(const o of r.oil.concat(r.scrip,r.note?[r.note]:[],r.item?[r.item]:[])) console.assert(reach(o.x,o.y),"every item can be reached");
        if(r.kind==="valve") console.assert(r.valves.length===3&&r.valves.every(v=>reach(v.x,T+10)),"three wheels, all in reach");
        if(r.term) console.assert(reach(r.term.x,3*T+6),"terminal in reach");
        if(r.hole) console.assert(reach(r.hole.x,7*T-4),"bore hole in reach");
        if(r.broken) console.assert(PIPE_ZONES.includes(r.zone)&&(r.brokenX+12<9*T-3||r.brokenX-2>=11*T+3),"broken pipe clear of the door");
      }
    }
    const cj=cleanSave({journal:{seen:["moth","dragon","moth"],photos:["listener","moth",7]}}).journal;
    console.assert(cj.seen.join()==="moth"&&cj.photos.join()==="moth","journal cleaned: known creatures, photos only of met ones");
    console.assert(JIDS.length===BESTIARY.length&&BESTIARY.every(b=>JIDS.includes(b.id)),"every journal page has art");
    console.assert(cleanBinds({use:["KeyW"]})===null&&cleanBinds({pause:[]})===null&&cleanBinds({run:["<script>"]})===null,"bad key bindings refused");
    console.assert(cleanBinds(null).use[0]==="Space"&&canon("ArrowUp")!==undefined,"default key bindings");
    return "ok";
  }
};
})();

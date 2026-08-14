import { readFileSync, writeFileSync } from "node:fs";

const buf = readFileSync("rolo.stl");
const n = buf.readUInt32LE(80);
const P = new Float64Array(n*9);
for(let i=0;i<n;i++){const o=84+i*50+12; for(let k=0;k<9;k++)P[i*9+k]=buf.readFloatLE(o+k*4);}
const lo=[1e9,1e9,1e9],hi=[-1e9,-1e9,-1e9];
for(let i=0;i<P.length;i+=3)for(let a=0;a<3;a++){if(P[i+a]<lo[a])lo[a]=P[i+a];if(P[i+a]>hi[a])hi[a]=P[i+a];}

const CELL=1.5,dim=hi.map((v,i)=>Math.max(1,Math.ceil((v-lo[i])/CELL)+1));
const cellOf=(v,a)=>Math.min(dim[a]-1,Math.max(0,Math.floor((v-lo[a])/CELL)));
const cidx=(x,y,z)=>(z*dim[1]+y)*dim[0]+x;
const bucket=new Map();
for(let t=0;t<n;t++){const o=t*9;
  const x0=cellOf(Math.min(P[o],P[o+3],P[o+6]),0),x1=cellOf(Math.max(P[o],P[o+3],P[o+6]),0);
  const y0=cellOf(Math.min(P[o+1],P[o+4],P[o+7]),1),y1=cellOf(Math.max(P[o+1],P[o+4],P[o+7]),1);
  const z0=cellOf(Math.min(P[o+2],P[o+5],P[o+8]),2),z1=cellOf(Math.max(P[o+2],P[o+5],P[o+8]),2);
  for(let z=z0;z<=z1;z++)for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    const k=cidx(x,y,z);let b=bucket.get(k);if(!b){b=[];bucket.set(k,b);}b.push(t);}}
function hitTri(t,ox,oy,oz,dx,dy,dz){const o=t*9,ax=P[o],ay=P[o+1],az=P[o+2];
  const e1x=P[o+3]-ax,e1y=P[o+4]-ay,e1z=P[o+5]-az,e2x=P[o+6]-ax,e2y=P[o+7]-ay,e2z=P[o+8]-az;
  const px=dy*e2z-dz*e2y,py=dz*e2x-dx*e2z,pz=dx*e2y-dy*e2x,det=e1x*px+e1y*py+e1z*pz;
  if(Math.abs(det)<1e-12)return -1;const inv=1/det,tx=ox-ax,ty=oy-ay,tz=oz-az;
  const u=(tx*px+ty*py+tz*pz)*inv;if(u<0||u>1)return -1;
  const qx=ty*e1z-tz*e1y,qy=tz*e1x-tx*e1z,qz=tx*e1y-ty*e1x;
  const v=(dx*qx+dy*qy+dz*qz)*inv;if(v<0||u+v>1)return -1;
  return (e2x*qx+e2y*qy+e2z*qz)*inv;}
function cast(ox,oy,oz,dx,dy,dz){let best=Infinity;const seen=new Set();const step=CELL*0.5;
  for(let s=0;s<300;s++){const px=ox+dx*s*step,py=oy+dy*s*step,pz=oz+dz*s*step;
    if(px<lo[0]-CELL||px>hi[0]+CELL||py<lo[1]-CELL||py>hi[1]+CELL||pz<lo[2]-CELL||pz>hi[2]+CELL)break;
    const k=cidx(cellOf(px,0),cellOf(py,1),cellOf(pz,2));if(seen.has(k))continue;seen.add(k);
    const b=bucket.get(k);if(!b)continue;
    for(const t of b){const h=hitTri(t,ox,oy,oz,dx,dy,dz);if(h>1e-4&&h<best)best=h;}
    if(best<s*step)break;}
  return best;}

// ---- 1. local thickness, median over a cone (one ray is fooled by every crease)
const RAYS=9,CONE=Math.PI/5;
let thick=new Float32Array(n);
let cached=false;
try { const c=readFileSync("_thick.bin"); if(c.length===n*4){ thick=new Float32Array(c.buffer,c.byteOffset,n); cached=true; console.log("(reusing cached thickness)"); } } catch {}
for(let t=0;cached?false:t<n;t++){
  const o=t*9,ax=P[o],ay=P[o+1],az=P[o+2],bx=P[o+3],by=P[o+4],bz=P[o+5],cx=P[o+6],cy=P[o+7],cz=P[o+8];
  let nx=(by-ay)*(cz-az)-(bz-az)*(cy-ay),ny=(bz-az)*(cx-ax)-(bx-ax)*(cz-az),nz=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
  const L=Math.hypot(nx,ny,nz)||1;nx/=L;ny/=L;nz/=L;
  const gx=(ax+bx+cx)/3,gy=(ay+by+cy)/3,gz=(az+bz+cz)/3,ix=-nx,iy=-ny,iz=-nz;
  let ux=0,uy=0;if(Math.abs(ix)<0.9)ux=1;else uy=1;
  let sx=uy*iz-0*iy,sy=0*ix-ux*iz,sz=ux*iy-uy*ix;const SL=Math.hypot(sx,sy,sz)||1;sx/=SL;sy/=SL;sz/=SL;
  const txx=iy*sz-iz*sy,tyy=iz*sx-ix*sz,tzz=ix*sy-iy*sx;
  const hits=[];
  for(let r=0;r<RAYS;r++){const a=CONE*Math.sqrt(r/RAYS),ph=r*2.399963;
    const dx=ix*Math.cos(a)+(sx*Math.cos(ph)+txx*Math.sin(ph))*Math.sin(a);
    const dy=iy*Math.cos(a)+(sy*Math.cos(ph)+tyy*Math.sin(ph))*Math.sin(a);
    const dz=iz*Math.cos(a)+(sz*Math.cos(ph)+tzz*Math.sin(ph))*Math.sin(a);
    const h=cast(gx+ix*1e-3,gy+iy*1e-3,gz+iz*1e-3,dx,dy,dz);
    if(isFinite(h))hits.push(h*Math.cos(a));}
  hits.sort((a,b)=>a-b);
  // No hit at all means the ray went INWARD and left the model without ever
  // meeting the far wall. On a closed mesh that does not happen to solid
  // material — it happens to a sliver so fine the ray slips past its own far
  // side. Scoring that 1e9 called the thinnest whiskers the most solid thing
  // on the rabbit, which is why the finest ones survived every threshold.
  thick[t]=hits.length?hits[Math.floor(hits.length/2)]:0;
}

if(!cached) writeFileSync("_thick.bin", Buffer.from(thick.buffer, thick.byteOffset, n*4));

// ---- 2. welded topology
const key=(x,y,z)=>`${Math.round(x*1000)},${Math.round(y*1000)},${Math.round(z*1000)}`;
const vid=new Map(), VX=[]; const tri=new Int32Array(n*3);
for(let i=0;i<n*3;i++){const x=P[i*3],y=P[i*3+1],z=P[i*3+2],k=key(x,y,z);
  let id=vid.get(k); if(id===undefined){id=vid.size;vid.set(k,id);VX.push(x,y,z);} tri[i]=id;}

// ---- 3. seed, then CHASE THE ROOT
//
// A whisker is not a constant-thickness rod. It flares where it meets the
// cheek, so a flat "thickness <= 2mm" cut stops partway down and leaves a
// little cone standing proud of the face — the stubs that survived the first
// pass. Thin triangles only SEED the cut; it then grows along the surface into
// anything still thinner than GROW, which walks the taper down to where the
// whisker actually merges with the head and stops there, because the cheek
// behind it is tens of millimetres thick.
//
// The growth is fenced by distance from its own seed as well as by thickness.
// Thin-and-connected would otherwise be free to wander off across any thin
// region that happens to touch, and the failure mode of a runaway shave is a
// hole in the model.
const THIN=Number(process.env.THIN||2.0), SLENDER=Number(process.env.SLENDER||3.0);
const GROW=Number(process.env.GROW||6.0), REACH=Number(process.env.REACH||7.0);
// NOT a muzzle box. Whiskers hang off the chin and the far cheek too, and a
// band tight enough to spare the toes was always going to miss them. The thing
// that must be protected is the FEET — thin, slender webbing between the toes,
// all of it down at the plate — so the guard is a floor, and everything above
// it is fair game. On this model that is head and body, where thin + slender
// really does mean whisker.
// The feet are the only thin, slender thing that must survive: webbing between
// the toes, on a model whose whiskers hang down past the chin to nearly the
// same height. A plain height floor cannot tell them apart — it spared the toes
// and the low whiskers together. They separate in the OTHER axis: the paws sit
// at y -35..-27 and y 6..12, while the muzzle those whiskers grow from is at
// y -50..-36, in front of the front paws. So the protected zone is low AND
// behind the muzzle, and a whisker hanging off the chin is neither.
const YBOX=Number(process.env.YBOX||-31);   // the muzzle pad's back edge
// A hard floor, on top of the foot test above. "Keep the shaving above the
// feet and legs" is a promise the tool should KEEP rather than one this model
// happens to satisfy: nothing below this height is ever cut, whatever it looks
// like. The whiskers all root at z >= -8; the legs and toes live below -20.
const ZKEEP=Number(process.env.ZKEEP||-15);
const MIDMAX=Number(process.env.MIDMAX||0);  // a rod is thin in TWO directions
const DISH=Number(process.env.DISH||0.4);   // sink the patch so no mound is left

const isThin=(t)=>thick[t]<=THIN;
const par=new Int32Array(vid.size);for(let i=0;i<par.length;i++)par[i]=i;
const find=a=>{while(par[a]!==a){par[a]=par[par[a]];a=par[a];}return a;};
const uni=(a,b)=>{a=find(a);b=find(b);if(a!==b)par[b]=a;};
for(let t=0;t<n;t++) if(isThin(t)){uni(tri[t*3],tri[t*3+1]);uni(tri[t*3+1],tri[t*3+2]);}
const isl=new Map();
for(let t=0;t<n;t++) if(isThin(t)){const r=find(tri[t*3]);
  let c=isl.get(r); if(!c){c={tris:[],lo:[1e9,1e9,1e9],hi:[-1e9,-1e9,-1e9]};isl.set(r,c);}
  c.tris.push(t);
  for(let k=0;k<3;k++)for(let a=0;a<3;a++){const v=P[t*9+k*3+a];if(v<c.lo[a])c.lo[a]=v;if(v>c.hi[a])c.hi[a]=v;}}

// triangle adjacency across shared edges
const eMap=new Map();
for(let t=0;t<n;t++)for(let e=0;e<3;e++){
  const a=tri[t*3+e],b=tri[t*3+(e+1)%3],k=a<b?`${a}_${b}`:`${b}_${a}`;
  let l=eMap.get(k); if(!l){l=[];eMap.set(k,l);} l.push(t);
}
const nbrs=(t)=>{const out=[];
  for(let e=0;e<3;e++){const a=tri[t*3+e],b=tri[t*3+(e+1)%3],k=a<b?`${a}_${b}`:`${b}_${a}`;
    for(const q of eMap.get(k)) if(q!==t) out.push(q);}
  return out;};
const cen=(t)=>[(P[t*9]+P[t*9+3]+P[t*9+6])/3,(P[t*9+1]+P[t*9+4]+P[t*9+7])/3,(P[t*9+2]+P[t*9+5]+P[t*9+8])/3];

const kill=new Uint8Array(n);
let islandsCut=0, seeded=0, grown=0;
for(const c of isl.values()){
  const s=c.hi.map((v,i)=>v-c.lo[i]);
  const slender=Math.max(...s)/Math.max(Math.min(...s),0.05);
  if(process.env.DUMP){
    const foot = ((c.lo[2]+c.hi[2])/2 < ZFLOOR && (c.lo[1]+c.hi[1])/2 > YSNOUT);
    console.log(`  island ${String(c.tris.length).padStart(5)} tris  ext ${s.map(v=>v.toFixed(1)).join("x")}  ` +
      `slender ${slender.toFixed(1)}  y ${c.lo[1].toFixed(0)}..${c.hi[1].toFixed(0)} z ${c.lo[2].toFixed(0)}..${c.hi[2].toFixed(0)}  ` +
      `${slender<SLENDER?"REJECT blob":foot?"REJECT foot":"CUT"}`);
  }
  // 4.5, not 3. The EAR EDGE scores 3.0 — a broad thin patch, 10mm across —
  // and at a threshold of 3 it was cut, leaving a hole the fan-capper turned
  // into a starburst across the flank. Every real whisker here scores 5.2 to
  // 14.4, so the gap is wide and the line belongs inside it.
  if(slender < SLENDER) continue;                 // a blob or a flap, not a whisker
  // A whisker is a ROD: small in two directions, long in the third. A flap is
  // small in one. Checking the middle extent is what tells them apart when the
  // ratio alone cannot.
  // MIDMAX is OFF by default now. It existed to spare the ear flap, and the
  // muzzle box does that job properly. Left on, it rejected the LONGEST
  // whiskers — one sweeping 30mm across space has a big bounding box in two
  // directions, so "thin in two directions" describes a straight rod and libels
  // a curved one.
  if(MIDMAX > 0){ const mid=[...s].sort((a,b)=>a-b)[1]; if(mid > MIDMAX) continue; }
  // THE WHOLE ISLAND must sit inside the muzzle pad. Every previous guard was
  // a rule about what a whisker looks like, and each one was wrong about
  // something else that looks the same: the toe webbing (thin, slender), the
  // ear edge (thin, slender, and 10mm across — cutting it blew a starburst
  // across the flank). Naming the region instead makes those unreachable
  // rather than merely unlikely, and lets the test inside it be aggressive.
  // The island's CENTRE, not its far end. A whisker that sweeps back past the
  // boundary failed a whole-island test and survived at the outer cheek — the
  // strands still visible there. The ear starts at y -26, so judging by centre
  // with the line at -31 still leaves 5mm of clearance to it.
  if((c.lo[1]+c.hi[1])/2 > YBOX) continue;        // behind the muzzle: ears, body
  // The floor is applied PER TRIANGLE below, not to the whole island. A whisker
  // that hangs down past the legs was being spared entirely because one end of
  // it dipped below the line — so the strand stayed. Cutting only its part
  // above the floor severs it, and the tail below is then attached to nothing
  // and gets dropped with the other severed pieces. Nothing under the floor is
  // ever cut directly, which is the promise that matters.
  islandsCut++;
  const q=c.tris.filter(t=>Math.min(P[t*9+2],P[t*9+5],P[t*9+8])>=ZKEEP);
  for(const t of c.tris){
    if(Math.min(P[t*9+2],P[t*9+5],P[t*9+8]) < ZKEEP) continue;   // never below the floor
    if(!kill[t]){kill[t]=1;seeded++;}
  }
  while(q.length){
    const t=q.pop(), p=cen(t);
    for(const u of nbrs(t)){
      if(kill[u] || thick[u] > GROW) continue;
      if(Math.min(P[u*9+2],P[u*9+5],P[u*9+8]) < ZKEEP) continue;   // and the growth stops there too
      const g=cen(u);
      // still within reach of the seed island it belongs to
      let d=0; for(let a=0;a<3;a++){ const v=g[a];
        d+=Math.pow(Math.max(0, Math.max(c.lo[a]-v, v-c.hi[a])),2); }
      if(Math.sqrt(d) > REACH) continue;
      kill[u]=1; grown++; q.push(u);
    }
  }
}
console.log(`shaved ${islandsCut} whiskers: ${seeded} seed triangles + ${grown} grown down the root = ${seeded+grown}`);

// A whisker cut at its ROOT leaves the rest of it floating: the tail that hung
// below the foot floor is now a shell touching nothing. That is a gift, not a
// problem — it means the low-hanging strands do not need a region rule of their
// own. Anything that is no longer joined to the main body simply goes.
{
  const par2=new Int32Array(vid.size);for(let i=0;i<par2.length;i++)par2[i]=i;
  const f2=a=>{while(par2[a]!==a){par2[a]=par2[par2[a]];a=par2[a];}return a;};
  const u2=(a,b)=>{a=f2(a);b=f2(b);if(a!==b)par2[b]=a;};
  for(let t=0;t<n;t++) if(!kill[t]){u2(tri[t*3],tri[t*3+1]);u2(tri[t*3+1],tri[t*3+2]);}
  const size=new Map();
  for(let t=0;t<n;t++) if(!kill[t]){const r=f2(tri[t*3]);size.set(r,(size.get(r)||0)+1);}
  let main=-1,best=-1;
  for(const [r,c] of size) if(c>best){best=c;main=r;}
  let dropped=0, shells=0;
  for(const [r,c] of size){ if(r===main) continue; shells++; dropped+=c; }
  if(shells){
    for(let t=0;t<n;t++) if(!kill[t] && f2(tri[t*3])!==main){ kill[t]=1; }
    console.log(`dropped ${shells} severed piece(s), ${dropped} triangles — whisker tails left floating by the cut`);
  }
}

// ---- 4. cap the holes left behind (the mesh was closed; it must stay closed)
//
// Directed half-edges, not undirected counts. In a manifold with boundary each
// boundary vertex has exactly ONE outgoing boundary half-edge, so the loops
// walk themselves. The first attempt marked vertices used across ALL loops and
// picked the next by search, which truncated any loop meeting another and left
// 101 edges open.
const keep=[]; for(let t=0;t<n;t++) if(!kill[t]) keep.push(t);
const half=new Set();
for(const t of keep) for(let e=0;e<3;e++) half.add(`${tri[t*3+e]}>${tri[t*3+(e+1)%3]}`);
// A vertex can carry MORE THAN ONE outgoing rim edge where two shaved features
// met at a point. Storing one "next" per vertex silently dropped the others and
// left those loops open, so the rim is kept as a bag of half-edges that get
// CONSUMED as the loops are walked.
const outEdges=new Map(); const rimTri=new Map();
for(const t of keep) for(let e=0;e<3;e++){
  const a=tri[t*3+e], b=tri[t*3+(e+1)%3];
  if(half.has(`${b}>${a}`)) continue;            // has a twin, so not a rim
  let l=outEdges.get(a); if(!l){l=[];outEdges.set(a,l);} l.push(b);
  rimTri.set(`${a}>${b}`, t);                    // the surface this rim belongs to
}
let rimCount=0; for(const l of outEdges.values()) rimCount+=l.length;
const caps=[];
for(const [start,list] of outEdges){
  while(list.length){
    const loop=[start];
    let cur=list.shift();
    for(let g=0;g<100000 && cur!==start;g++){
      loop.push(cur);
      const l=outEdges.get(cur);
      if(!l || !l.length){ cur=undefined; break; }
      cur=l.shift();
    }
    if(cur===start && loop.length>=3) caps.push(loop);
  }
}
let capTris=0; const extra=[];
for(const loop of caps){
  let cx=0,cy=0,cz=0;
  for(const v of loop){cx+=VX[v*3];cy+=VX[v*3+1];cz+=VX[v*3+2];}
  cx/=loop.length;cy/=loop.length;cz/=loop.length;
  // Sink the patch centre into the solid. Which way that IS has to come from
  // the surviving SURFACE, not from the loop's winding: a rim traced the other
  // way round flips the winding normal, and dishing along that pushed those
  // patches outward instead — the little spikes that appeared along the muzzle.
  // The triangle each rim edge came from knows which side is outside.
  {
    let nx=0,ny=0,nz=0;
    for(let i=0;i<loop.length;i++){
      const t=rimTri.get(`${loop[i]}>${loop[(i+1)%loop.length]}`);
      if(t===undefined) continue;
      const o=t*9,ax=P[o],ay=P[o+1],az=P[o+2];
      const ux=P[o+3]-ax,uy=P[o+4]-ay,uz=P[o+5]-az,wx=P[o+6]-ax,wy=P[o+7]-ay,wz=P[o+8]-az;
      nx+=uy*wz-uz*wy; ny+=uz*wx-ux*wz; nz+=ux*wy-uy*wx;
    }
    const L=Math.hypot(nx,ny,nz);
    if(L>1e-9){ cx-=nx/L*DISH; cy-=ny/L*DISH; cz-=nz/L*DISH; }
  }
  // Wound to match the rim: the surviving surface saw a->b, so the patch must
  // see b->a, or the cap faces inward and the solid reads as inside-out there.
  for(let i=0;i<loop.length;i++){
    const a=loop[i], b=loop[(i+1)%loop.length];
    extra.push(VX[b*3],VX[b*3+1],VX[b*3+2], VX[a*3],VX[a*3+1],VX[a*3+2], cx,cy,cz);
    capTris++;
  }
}
console.log(`capped ${caps.length} of ${rimCount} rim edges with ${capTris} triangles`);

const total=keep.length+capTris;
const out=Buffer.alloc(84+total*50); out.writeUInt32LE(total,80);
let w=0;
for(const t of keep){const o=84+w*50; for(let k=0;k<3;k++)out.writeFloatLE(0,o+k*4);
  for(let k=0;k<9;k++)out.writeFloatLE(P[t*9+k],o+12+k*4); w++;}
for(let i=0;i<extra.length;i+=9){const o=84+w*50; for(let k=0;k<3;k++)out.writeFloatLE(0,o+k*4);
  for(let k=0;k<9;k++)out.writeFloatLE(extra[i+k],o+12+k*4); w++;}
writeFileSync("_shaved.stl", out);
console.log(`wrote _shaved.stl — ${total} triangles (was ${n})`);

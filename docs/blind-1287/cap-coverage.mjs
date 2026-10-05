// Evidence for docs/blind-1287/dispositions.md U15/U16/U22 (point 1287): run with `node docs/blind-1287/cap-coverage.mjs`.
// Ground footprint of the travel camera (offset y42 z24, fov 50) with aim shift s,
// traveller at origin, south=+z. Area of frame outside / inside disc r around the traveller.
const Y=42,Z=24,FOV=50*Math.PI/180;
function inFrame(x,z,s,aspect){ // project ground point
  const cx=0,cy=Y,cz=s+Z; const fx=0,fy=-Y,fz=-Z; const fl=Math.hypot(fy,fz);
  const f=[fx,fy/fl,fz/fl]; const r=[1,0,0]; const u=[0, -f[2]*1, f[1]*1].map(v=>-v); // up = r x f ... sign fixed below
  const d=[x-cx,0-cy,z-cz]; const depth=d[0]*f[0]+d[1]*f[1]+d[2]*f[2]; if(depth<=0)return false;
  const up=[0, f[2], -f[1]]; // perpendicular to f in y-z plane, pointing up
  const upy = up[1]>0?up:[0,-up[1],-up[2]];
  const vy=(d[0]*upy[0]+d[1]*upy[1]+d[2]*upy[2])/depth, vx=d[0]/depth;
  const t=Math.tan(FOV/2); return Math.abs(vy)<=t && Math.abs(vx)<=t*aspect;
}
const shiftFull=(()=>{const p=Math.atan2(Y,Z),h=FOV/2;const far=Y/Math.tan(p-h),near=Y/Math.tan(p+h);return ((far-Z)-(Z-near))/2})();
for (const aspect of [16/9, 9/16, 4/3]) {
  const step=0.25, pts={0:[],[shiftFull]:[]};
  for (const s of [0,shiftFull]) for(let x=-120;x<=120;x+=step)for(let z=-120;z<=120;z+=step) if(inFrame(x,z,s,aspect)) pts[s].push(Math.hypot(x,z));
  let worse=[], rows=[];
  for(let r=0;r<=70;r+=1){const out0=pts[0].filter(d=>d>r).length*step*step, out1=pts[shiftFull].filter(d=>d>r).length*step*step;
    if(out1>out0+1e-9)worse.push(r); if(r%5==0)rows.push(`r${r}: ${out0.toFixed(0)}→${out1.toFixed(0)}`);}
  const in45=s=>pts[s].filter(d=>d<=45).length*step*step;
  console.log(`aspect ${aspect.toFixed(2)} shift ${shiftFull.toFixed(2)} | frame area ${(pts[0].length*step*step).toFixed(0)}→${(pts[shiftFull].length*step*step).toFixed(0)} | r where outside-area grows: ${worse.length?worse.join(','):'none'} | frame∩disc45 ${in45(0).toFixed(0)}→${in45(shiftFull).toFixed(0)}`);
  console.log('  '+rows.join('  '));
}

/* Duo Quest V7 – self-contained WebGL 3D refuge renderer. No network libraries. */
(()=>{'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const rgb=(hex)=>{hex=hex.replace('#','');return [0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255)};
const mix=(a,b,t)=>a.map((v,i)=>v*(1-t)+b[i]*t);
const hexMix=(a,b,t)=>mix(rgb(a),rgb(b),t);
const tint=(hex,amount)=>mix(rgb(hex),amount>0?[1,1,1]:[0,0,0],Math.abs(amount));
const CATEGORY=['lit','murs','sol','lumiere','plante','deco','fenetre','souvenir'];
const slot={lit:[0,0.5,0.6],plante:[3.5,0.9,0.0],lumiere:[-3.3,1.0,-0.8],deco:[-3.2,1.1,2],souvenir:[0,2.8,-3.66]};
let active=null;
const V={
 identity:()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
 mul:(a,b)=>{let r=Array(16).fill(0);for(let c=0;c<4;c++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)r[c*4+row]+=a[k*4+row]*b[c*4+k];return r},
 perspective:(fov,aspect,near,far)=>{let f=1/Math.tan(fov/2);return [f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]},
 lookAt:(eye,target)=>{let z=norm(sub(eye,target)),x=norm(cross([0,1,0],z)),y=cross(z,x);return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]}
};
function sub(a,b){return a.map((x,i)=>x-b[i])}
function dot(a,b){return a.reduce((sum,v,i)=>sum+v*b[i],0)}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
function norm(a){let l=Math.hypot(...a)||1;return a.map(v=>v/l)}
const vert=`attribute vec3 aPosition; attribute vec3 aNormal; attribute vec3 aColor;
uniform mat4 uVP; uniform vec3 uLamp; uniform float uLampOn; uniform float uNight;
varying vec3 vColor;
void main(){
  vec3 sunlight=normalize(vec3(-0.7,1.3,1.0));
  float lambert=max(dot(normalize(aNormal),sunlight),0.0);
  float glow=1.0/(1.0+0.11*dot(aPosition-uLamp,aPosition-uLamp));
  float lum=(uNight>0.5?0.32:0.65)+lambert*(uNight>0.5?0.20:0.38)+glow*uLampOn*0.52;
  vColor=aColor*lum + vec3(0.055,0.033,0.012)*glow*uLampOn;
  gl_Position=uVP*vec4(aPosition,1.0);
}`;
const frag=`precision mediump float; varying vec3 vColor; void main(){gl_FragColor=vec4(pow(clamp(vColor,0.0,1.0),vec3(0.88)),1.0);}`;
class Scene{
  constructor(canvas){this.canvas=canvas;this.gl=canvas.getContext('webgl',{antialias:true,alpha:false,preserveDrawingBuffer:true});if(!this.gl)throw Error('WebGL indisponible');this.config={};this.mesh=[];this.verts=[];this.nrms=[];this.colors=[];this.ang=.63;this.elev=.54;this.dist=11.7;this.target=[0,1.55,0];this.position={};this.lampOn=true;this.night=false;this.edit=false;this.selection='lit';this.running=true;this.dirty=true;this.lastTap=0;this.initGL();this.attachEvents();this.renderLoop();}
  shader(type,src){const g=this.gl,s=g.createShader(type);g.shaderSource(s,src);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(s));return s}
  initGL(){const g=this.gl;let p=g.createProgram();g.attachShader(p,this.shader(g.VERTEX_SHADER,vert));g.attachShader(p,this.shader(g.FRAGMENT_SHADER,frag));g.linkProgram(p);if(!g.getProgramParameter(p,g.LINK_STATUS))throw Error(g.getProgramInfoLog(p));this.program=p;g.useProgram(p);this.aPos=g.getAttribLocation(p,'aPosition');this.aNorm=g.getAttribLocation(p,'aNormal');this.aColor=g.getAttribLocation(p,'aColor');this.uVP=g.getUniformLocation(p,'uVP');this.uNight=g.getUniformLocation(p,'uNight');this.uLampOn=g.getUniformLocation(p,'uLampOn');this.uLamp=g.getUniformLocation(p,'uLamp');this.buffer=g.createBuffer();g.enable(g.DEPTH_TEST);g.depthFunc(g.LEQUAL);g.enable(g.CULL_FACE);g.cullFace(g.BACK);g.clearColor(.9,.85,.77,1);}
  addTri(a,b,c,color){const n=norm(cross(sub(b,a),sub(c,a)));for(const v of [a,b,c]){this.verts.push(...v);this.nrms.push(...n);this.colors.push(...color)}}
  quad(a,b,c,d,color){this.addTri(a,b,c,color);this.addTri(a,c,d,color)}
  box(x,y,z,w,h,d,col){const color=Array.isArray(col)?col:rgb(col);const x0=x-w/2,x1=x+w/2,y0=y-h/2,y1=y+h/2,z0=z-d/2,z1=z+d/2;
    this.quad([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0],tintColor(color,.15));
    this.quad([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],tintColor(color,-.18));
    this.quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],color);
    this.quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],tintColor(color,-.12));
    this.quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],tintColor(color,-.08));
    this.quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],tintColor(color,.08));
  }
  cyl(x,y,z,rx,ry,rz,color,segments=12){let c=Array.isArray(color)?color:rgb(color);for(let i=0;i<segments;i++){const a=i*2*Math.PI/segments,b=(i+1)*2*Math.PI/segments;const p=(ang,up)=>[x+Math.cos(ang)*rx,y+(up?ry:-ry),z+Math.sin(ang)*rz];this.quad(p(a,true),p(b,true),p(b,false),p(a,false),c);this.addTri([x,y+ry,z],p(b,true),p(a,true),tintColor(c,.15));this.addTri([x,y-ry,z],p(a,false),p(b,false),tintColor(c,-.12));}}
  cone(x,y,z,r,h,color,segments=10){const c=Array.isArray(color)?color:rgb(color);for(let i=0;i<segments;i++){const a=i*2*Math.PI/segments,b=(i+1)*2*Math.PI/segments;this.addTri([x+Math.cos(b)*r,y-h/2,z+Math.sin(b)*r],[x+Math.cos(a)*r,y-h/2,z+Math.sin(a)*r],[x,y+h/2,z],c)}}
  sphere(x,y,z,r,col){const c=Array.isArray(col)?col:rgb(col),rings=5,segments=10;for(let j=0;j<rings;j++){let t0=Math.PI*j/rings,t1=Math.PI*(j+1)/rings;for(let i=0;i<segments;i++){let a=i*2*Math.PI/segments,b=(i+1)*2*Math.PI/segments;let f=(t,p)=>[x+Math.sin(t)*Math.cos(p)*r,y+Math.cos(t)*r,z+Math.sin(t)*Math.sin(p)*r];this.quad(f(t0,a),f(t0,b),f(t1,b),f(t1,a),c);}}}
  torus(x,y,z,r,thickness,c){for(let i=0;i<18;i++){let a=i*2*Math.PI/18;this.sphere(x+Math.cos(a)*r,y,z+Math.sin(a)*r,thickness,c)}}
  build(){this.verts=[];this.nrms=[];this.colors=[];const c=this.config,sel=c.selected||{},id=(cat)=>(sel[cat]||'').split('_').slice(1).join('_'),p=(key,defaultValue)=>this.position[key]||defaultValue;
    const wallId=id('murs'),floorId=id('sol'),bedId=id('lit'),windowId=id('fenetre'),lightId=id('lumiere'),plantId=id('plante'),decId=id('deco');
    const walls={mousse:'#677f6c',lin:'#d2c4ac',fleuri:'#b99c9f',brique:'#b17e68',nuit:'#536078',bois:'#9b8266',rose:'#c79e9f',aurore:'#c8a19e',bibliotheque:'#7e7968',jade:'#749887'};
    const floors={bois:'#9b7556',tapis:'#9b7556',orient:'#88654e',nuage:'#aa998b',herbe:'#78856a',etoiles:'#657389',rose:'#b49a8e',mosaique:'#afa17d',cocon:'#927b61'};
    const beds={sage:'#597c67',terracotta:'#a96958',ivoire:'#ddd1b8',royal:'#826482',lune:'#58718f',rose:'#bc8490',bois:'#9c7659',neon:'#91609c',velours:'#484865',nuage_rose:'#dcaebb',aventure:'#517675'};
    const main=walls[wallId]||'#677f6c',ground=floors[floorId]||'#9b7556',blanket=beds[bedId]||'#597c67';
    this.box(0,-.21,0,10,.42,8.4,ground);for(let i=-4;i<=4;i++)this.box(i+.35,.013,0,.025,.018,8.35,'#70553e');
    this.box(0,2.75,-4.1,10,5.55,.22,main);this.box(-4.9,2.75,0,.22,5.55,8.4,tintColor(rgb(main),-.13));
    this.box(0,.25,-3.97,9.5,.26,.13,'#d5be9d');this.box(-4.7,.25,0,.16,.26,8,'#d5be9d');
    // Detailed wall panelling.
    for(let x=-4.3;x<4.8;x+=1.25){this.box(x,1.7,-3.96,.035,2.2,.045,'#b89c77');this.box(x,3.5,-3.96,.035,1.9,.045,'#b89c77');}
    this.box(0,2.66,-3.93,9.6,.045,.07,'#d6bb91');this.box(0,4.9,-3.93,9.6,.07,.07,'#d6bb91');
    // Door left-wall silhouette
    this.box(-4.76,2.3,-2.0,.09,3.75,1.95,'#88664f');this.box(-4.68,2.3,-2,.1,3.45,1.65,'#bb9471');this.sphere(-4.55,2.2,-1.44,.08,'#ebc87b');
    // Window is real geometry with glass plane, mullions and outdoor geometry.
    const sky=windowId==='nuit'?'#3c527d':windowId==='pluie'?'#8595a5':windowId==='orage'?'#57677d':windowId==='mer'?'#8eb8c4':windowId==='aurore'?'#dfad99':'#e7b693';
    this.box(2.15,3.35,-3.92,2.65,2.35,.06,'#d7bd91');this.box(2.15,3.35,-3.86,2.32,2.0,.08,sky);
    this.box(2.15,2.53,-3.80,2.28,.40,.04,windowId==='mer'?'#6d9c9f':'#6c8b79');
    this.box(2.15,3.35,-3.73,.065,2.35,.15,'#d9b484');this.box(2.15,3.35,-3.72,2.56,.055,.15,'#d9b484');
    this.box(2.15,2.15,-3.68,3,.14,.31,'#ab8058');
    this.box(0,2.88,-3.84,2.15,1.36,.13,'#bc926b');this.box(0,2.88,-3.75,1.86,1.09,.09,'#e2cfac');this.box(0,2.88,-3.68,1.55,.81,.055,wallId==='fleuri'?'#b48086':'#62775d');
    this.box(0,2.88,-3.61,1.17,.055,.1,'#ead7af');
    // Bed: mattress, upholstered headboard, sturdy wooden base, pillows, bedding.
    const bed=p('lit',[0,0,0.5]);const [bx,,bz]=bed;
    this.box(bx,.34,bz,3.36,.38,3.92,'#6d4b38');this.box(bx,.64,bz,3.18,.34,3.72,'#e4d9c5');
    this.box(bx,1.18,bz-1.84,3.55,1.7,.34,bedId==='royal'?'#7d5d75':'#9b775e');
    for(let x of [-1,1])this.box(bx+x*1.57,.56,bz-1.8,.16,1.12,.24,'#c6a078');
    this.box(bx,1.31,bz-1.64,3.1,1.1,.11,tintColor(rgb(blanket),-.14));
    this.box(bx,1.03,bz+.37,3.25,.24,2.78,blanket);
    this.box(bx,.96,bz+1.63,3.28,.11,.4,'#e3ceab');
    this.box(bx-0.77,.99,bz-1.18,1.17,.25,.85,'#eee5d7');this.box(bx+0.77,.99,bz-1.18,1.17,.25,.85,'#e5dacb');
    this.box(bx,.96,bz+.25,1.05,.21,.83,tintColor(rgb(blanket),.24));
    for(let x of [-1.3,1.3])for(let z of [-1.72,1.7])this.box(bx+x,.1,bz+z,.12,.20,.12,'#b18b68');
    if(['royal','lune','nuage_rose'].includes(bedId)){
      for(let x of [-1.6,1.6])for(let z of [-1.76,1.76])this.cyl(bx+x,1.9,bz+z,.07,1.85,.07,'#d5b47f');
      this.box(bx,3.71,bz,3.4,.12,3.65,'#cfab85');this.box(bx,3.61,bz,3.4,.08,3.6,'#b09c94');
    }
    // Rug woven fibers and edge details, intentionally offset from bed.
    this.cyl(0,.025,2.1,2.92,.027,1.6,floorId==='etoiles'?'#4c567b':floorId==='rose'?'#bb8895':'#c6ad89',28);
    this.cyl(0,.063,2.1,2.72,.018,1.43,'#e5d2b2',28);
    this.cyl(0,.08,2.1,2.49,.012,1.27,'#b79f80',28);
    // Side tables; walnut finish, drawers and handles.
    for(let x of [-2.42,2.4]){this.box(x,.51,-.98,1.12,.95,.88,'#83614a');this.box(x,.64,-.51,.88,.31,.07,'#a77c56');this.sphere(x,.64,-.448,.057,'#e3be79');this.box(x,1.05,-.98,1.21,.08,.99,'#bc956c');}
    const lampp=p('lumiere',[-3.05,0,1.0]);
    if(lightId.includes('lanterne')||lightId.includes('bougie')||lightId.includes('luciole')){
      this.cyl(lampp[0],1.64,lampp[2],.22,.36,.22,this.lampOn?'#f8d391':'#8a7a69');
      this.box(lampp[0],2.09,lampp[2],.52,.10,.5,'#98744d');this.cyl(lampp[0],1.17,lampp[2],.05,.18,.05,'#bd9866');
    } else {
      this.cyl(lampp[0],.13,lampp[2],.32,.08,.32,'#8e6b51');this.cyl(lampp[0],1.07,lampp[2],.085,.93,.085,'#b58c60');this.cone(lampp[0],2.06,lampp[2],.64,.85,this.lampOn?'#eed2a2':'#947c6b',14);
    }
    // A realistic modular plant (cylinder pot, stems, multiple leafy clusters).
    let pp=p('plante',[3.60,0,1.78]);
    this.cyl(pp[0],.35,pp[2],.36,.35,.36,'#c49673');this.cyl(pp[0],.69,pp[2],.40,.07,.40,'#e1b48d');
    for(let i=0;i<9;i++){let a=i*2.4,rx=Math.cos(a)*(.28+(i%3)*.08),rz=Math.sin(a)*(.30+(i%3)*.04);this.cyl(pp[0]+rx*.25,1.0+i*.075,pp[2]+rz*.2,.07,.34,.07,'#607756');this.sphere(pp[0]+rx,1.24+i*.09,pp[2]+rz,.28+(i%2)*.08,plantId.includes('rose')?'#bd8994':i%2?'#60805d':'#82956e');}
    if(plantId.includes('fleurs')||plantId.includes('rose'))for(let i=0;i<5;i++){let a=i*1.9;this.sphere(pp[0]+Math.cos(a)*.33,1.55+Math.sin(i)*.23,pp[2]+Math.sin(a)*.3,.105,i%2?'#f5c1ab':'#f3dbb2');}
    // Bookshelf or sideboard object, true 3D with interior shelves.
    const dpp=p('deco',[-3.47,0,-2.1]);
    this.box(dpp[0],1.16,dpp[2],1.64,2.25,.65,'#7d5b44');
    for(let y of [.48,1.05,1.62,2.2])this.box(dpp[0],y,dpp[2]+.30,1.56,.07,.73,'#bd966a');
    for(let shelf=0;shelf<3;shelf++)for(let j=0;j<5;j++){let col=['#b57e64','#718271','#d4b18b','#a1847c','#8a9a80'][j];this.box(dpp[0]-.57+j*.29,.66+shelf*.57,dpp[2]+.40,.16+(j%2)*.07,.33+(j%3)*.08,.25,col);}
    if(decId.includes('horloge')||decId.includes('reveil')){this.cyl(dpp[0],2.37,dpp[2]+.28,.24,.1,.24,'#ead0a0');this.box(dpp[0],2.36,dpp[2]+.40,.32,.045,.04,'#5c5544');}
    else if(decId.includes('tasse'))this.cyl(dpp[0],2.37,dpp[2]+.34,.18,.13,.18,'#d2c5ae');
    else this.sphere(dpp[0],2.4,dpp[2]+.34,.18,'#e2c9a1');
    // Curtains and curtain rail.
    this.box(2.16,4.73,-3.72,3.12,.085,.13,'#c7a06c');
    for(let x of [.72,3.57])this.box(x,3.4,-3.64,.38,2.25,.16,wallId==='fleuri'?'#d1a4a6':'#e5d5b7');
    // Picture frames on back wall.
    for(let x of [-2.8,-1.8]){this.box(x,3.24,-3.77,.79,.91,.12,'#b68c60');this.box(x,3.24,-3.68,.64,.75,.08,x< -2.3?'#b4bc9c':'#e2b7a5');this.box(x,3.2,-3.62,.38,.3,.045,'#698774');}
    // Ceiling pendant lamp.
    this.cyl(-.1,5.18,0,.05,.39,.05,'#b9a07b');this.cone(-.1,4.52,0,.68,.75,this.lampOn?'#edcb96':'#a49483',18);
    // Low bedside candle / mini lantern.
    this.cyl(2.43,1.22,-.98,.16,.18,.16,this.lampOn?'#f7dbac':'#a99b88');
    // Bedding detail folds.
    for(let i=0;i<6;i++)this.box(bx-1.2+i*.47,1.11,bz+1.45,.012,.018,.25,tintColor(rgb(blanket),i%2?.23:-.12));
    this.count=this.verts.length/3;
    const stride=9,data=new Float32Array(this.count*stride);for(let i=0;i<this.count;i++){data.set(this.verts.slice(i*3,i*3+3),i*9);data.set(this.nrms.slice(i*3,i*3+3),i*9+3);data.set(this.colors.slice(i*3,i*3+3),i*9+6)}
    const g=this.gl;g.bindBuffer(g.ARRAY_BUFFER,this.buffer);g.bufferData(g.ARRAY_BUFFER,data,g.STATIC_DRAW);this.dirty=false;
  }
  configSet(c){this.config=c;this.position=c.positions||{};this.lampOn=c.lampOn!==false;this.night=!!c.night;this.edit=!!c.edit;this.selection=c.selection||'lit';this.dirty=true;}
  makeVP(){let r=this.dist,ey=this.elev,ca=this.ang;const eye=[Math.sin(ca)*Math.cos(ey)*r,Math.sin(ey)*r+this.target[1],Math.cos(ca)*Math.cos(ey)*r];this.eye=eye;return V.mul(V.perspective(Math.PI/3,this.canvas.width/this.canvas.height,.1,80),V.lookAt(eye,this.target));}
  project(p){let vp=this.makeVP(),v=[p[0],p[1],p[2],1],r=[0,0,0,0];for(let row=0;row<4;row++)for(let col=0;col<4;col++)r[row]+=vp[col*4+row]*v[col];if(r[3]<=0)return [999,999];return [(r[0]/r[3]*.5+.5)*this.canvas.clientWidth,(-r[1]/r[3]*.5+.5)*this.canvas.clientHeight];}
  draw(){const g=this.gl,c=this.canvas,rect=c.getBoundingClientRect(),w=Math.min(1000,Math.max(240,Math.round(rect.width*Math.min(devicePixelRatio||1,1.8)))),h=Math.min(1050,Math.max(240,Math.round(rect.height*Math.min(devicePixelRatio||1,1.8))));if(c.width!==w||c.height!==h){c.width=w;c.height=h;g.viewport(0,0,w,h)}if(this.dirty)this.build();g.clearColor(this.night?.075:.83,this.night?.105:.78,this.night?.15:.67,1);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);g.useProgram(this.program);g.uniformMatrix4fv(this.uVP,false,new Float32Array(this.makeVP()));g.uniform1f(this.uNight,this.night?1:0);g.uniform1f(this.uLampOn,this.lampOn?1:0);g.uniform3fv(this.uLamp,new Float32Array([this.position.lumiere?.[0]??-3,2.2,this.position.lumiere?.[2]??1]));g.bindBuffer(g.ARRAY_BUFFER,this.buffer);for(let [attr,index] of [[this.aPos,0],[this.aNorm,3],[this.aColor,6]]){g.enableVertexAttribArray(attr);g.vertexAttribPointer(attr,3,g.FLOAT,false,36,index*4)}g.drawArrays(g.TRIANGLES,0,this.count)}
  renderLoop(){if(!this.running)return;if(this.canvas.isConnected&&this.canvas.offsetWidth>0)this.draw();this.raf=requestAnimationFrame(()=>this.renderLoop())}
  attachEvents(){let c=this.canvas,pointers=new Map(),start=null,moved=false,lastDist=0;
    c.addEventListener('pointerdown',e=>{c.setPointerCapture(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);start=[e.clientX,e.clientY];moved=false;});
    c.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;let prev=pointers.get(e.pointerId),dx=e.clientX-prev[0],dy=e.clientY-prev[1];pointers.set(e.pointerId,[e.clientX,e.clientY]);if(Math.abs(e.clientX-start[0])+Math.abs(e.clientY-start[1])>5)moved=true;
      if(pointers.size===2){let ps=[...pointers.values()],dist=Math.hypot(ps[0][0]-ps[1][0],ps[0][1]-ps[1][1]);if(lastDist)this.dist=clamp(this.dist-(dist-lastDist)*.035,7.7,17);lastDist=dist;return;}
      if(this.edit&&['lit','plante','lumiere','deco'].includes(this.selection)){
        let key=this.selection, old=this.position[key]||slot[key].slice(),factor=.015*(this.dist/12);let a=this.ang;
        let wx=(Math.cos(a)*dx+Math.sin(a)*dy)*factor,wz=(-Math.sin(a)*dx+Math.cos(a)*dy)*factor;
        const next=[clamp(old[0]+wx,-3.45,3.45),old[1],clamp(old[2]+wz,-2.5,2.6)];
        if(key==='lit'){next[0]=clamp(next[0],-1.6,1.6);next[2]=clamp(next[2],-.05,1.3)}
        this.position[key]=next;this.dirty=true;this.config.positions[key]=next;this.config.onPosition?.(key,next);
      }else {this.ang+=dx*.009;this.elev=clamp(this.elev+dy*.006,.20,1.06)}
    });
    c.addEventListener('pointerup',e=>{pointers.delete(e.pointerId);lastDist=0;if(!moved&&start){const rect=c.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;let items=[['lit',this.position.lit||slot.lit],['lumiere',this.position.lumiere||slot.lumiere],['plante',this.position.plante||slot.plante],['deco',this.position.deco||slot.deco]];items=items.map(([id,pos])=>[id,this.project([pos[0],id==='lit'?1.3:id==='lumiere'?1.8:1.45,pos[2]])]);let selected=items.map(([id,pos])=>({id,dist:Math.hypot(x-pos[0],y-pos[1])})).sort((a,b)=>a.dist-b.dist)[0];if(selected&&selected.dist<70)this.config.onSelect?.(selected.id);else this.config.onSceneTap?.();}start=null;});
    c.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);lastDist=0;});
    c.addEventListener('wheel',e=>{e.preventDefault();this.dist=clamp(this.dist+e.deltaY*.007,7.7,17);},{passive:false});
  }
  dispose(){this.running=false;cancelAnimationFrame(this.raf);this.gl.deleteBuffer(this.buffer);this.gl.deleteProgram(this.program)}
}
function tintColor(color,amount){return mix(color,amount>0?[1,1,1]:[0,0,0],Math.abs(amount))}
window.DuoRefuge3D={
  mount(config){const canvas=document.getElementById('duo-refuge-webgl');if(!canvas)return false;if(active?.canvas!==canvas){const previous=active;previous?.dispose();try{active=new Scene(canvas);if(previous){active.ang=previous.ang;active.elev=previous.elev;active.dist=previous.dist;}}catch(e){canvas.insertAdjacentHTML('afterend','<p class="v7-error">Votre navigateur ne prend pas en charge WebGL. Ouvrez Duo Quest dans Safari à jour.</p>');console.error(e);return false;}}active.configSet(config);return true;},
  get(){return active},
  unmount(){active?.dispose();active=null}
};
})();

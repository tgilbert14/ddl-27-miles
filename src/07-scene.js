/* One canvas, one scheduler, one route state. The highway is the visual spine. */
window.MountainScene=(function(){
  var canvas,ctx,w=1,h=1,dpr=1,raf=0,dirty=true,lastTs=0,visible=true,travelOffset=0;
  var S={progress:0,band:0,pointerX:.5,pointerY:.5,targetX:.5,targetY:.5,lookback:.72,compare:.5,compareActive:false,velocity:0,traveling:false};
  var M=window.M27,reduce=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function mix(a,b,t){return a+(b-a)*t;}
  function smooth(t){t=clamp(t,0,1);return t*t*(3-2*t);}
  function seeded(n){var x=Math.sin(n*127.13+19.71)*43758.5453;return x-Math.floor(x);}
  function rgb(hex){hex=hex.replace("#","");return[parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16)];}
  function color(a,b,t){var x=rgb(a),y=rgb(b);return"rgb("+Math.round(mix(x[0],y[0],t))+","+Math.round(mix(x[1],y[1],t))+","+Math.round(mix(x[2],y[2],t))+")";}
  function bandColor(key,slot,f){var s=clamp(f,0,5),lo=Math.floor(s),hi=Math.min(5,lo+1),t=s-lo;return color(M.bands[lo][key][slot],M.bands[hi][key][slot],smooth(t));}
  function floraColor(f){var s=clamp(f,0,5),lo=Math.floor(s),hi=Math.min(5,lo+1),t=s-lo;return color(M.bands[lo].flora,M.bands[hi].flora,smooth(t));}

  function invalidate(){dirty=true;if(!raf&&visible)raf=requestAnimationFrame(frame);}
  function resize(){if(!canvas)return;var r=canvas.getBoundingClientRect();dpr=Math.min(window.devicePixelRatio||1,w<700?1.5:2);w=Math.max(1,Math.round(r.width));h=Math.max(1,Math.round(r.height));canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);invalidate();}

  function ridge(seed,base,amp,fill,drift,jag){
    var shift=(S.pointerX-.5)*drift+(S.lookback-.5)*drift*.7;
    ctx.beginPath();ctx.moveTo(-100,h+30);ctx.lineTo(-100,base);
    var n=11;
    for(var i=0;i<=n;i++){
      var x=i/n*(w+200)-100+shift;
      var spike=seeded(seed*19+i)*(amp*(.55+jag*.4));
      var wave=Math.sin(i*(1.1+jag*.25)+seed)*amp*.28;
      var y=base-spike-wave;
      if(i===0)ctx.lineTo(x,y);else{var px=(i-1)/n*(w+200)-100+shift;ctx.quadraticCurveTo((px+x)/2,y-amp*.08*seeded(i+seed),x,y);}
    }
    ctx.lineTo(w+100,h+30);ctx.closePath();ctx.fillStyle=fill;ctx.fill();
  }

  function topo(f,alpha){ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle="#fff";ctx.lineWidth=1;var look=(S.lookback-.5)*45;
    for(var j=0;j<9;j++){ctx.beginPath();for(var x=-80;x<=w+80;x+=18){var y=h*(.13+j*.068)+Math.sin(x*.006+j*.83+f*.75)*(14+j*4)+look;if(x===-80)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();}ctx.restore();}

  function sun(f){var t=clamp(f/5,0,1),x=mix(w*.78,w*.22,t)+(S.pointerX-.5)*18+(S.lookback-.5)*w*.08,y=mix(h*.2,h*.25,t)+(S.pointerY-.5)*10,r=mix(Math.min(w,h)*.07,Math.min(w,h)*.038,t);
    var halo=ctx.createRadialGradient(x,y,0,x,y,r*5);halo.addColorStop(0,t>.7?"rgba(202,229,255,.38)":"rgba(255,216,132,.52)");halo.addColorStop(1,"rgba(255,255,255,0)");ctx.fillStyle=halo;ctx.fillRect(x-r*5,y-r*5,r*10,r*10);ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=t>.72?"#d8edff":"#ffd07a";ctx.fill();}

  function roadPoint(t,f){var horizon=mix(h*.58,h*.5,clamp(f/5,0,1));var vanish=w*(.5+(S.lookback-.5)*.26+Math.sin(f*.88)*.035);var y=horizon+Math.pow(t,1.38)*(h-horizon+20);var curve=Math.sin(t*3.6+f*.72)*w*.045*t+(S.pointerX-.5)*18*t;var width=mix(1,w*.32,Math.pow(t,1.9));return{x:vanish+curve,y:y,width:width};}
  function road(f){var pts=[],n=46,routeProgress=S.progress+travelOffset;for(var i=0;i<=n;i++)pts.push(roadPoint(i/n,f));
    ctx.beginPath();for(i=0;i<=n;i++){var a=pts[i];if(i===0)ctx.moveTo(a.x-a.width,a.y);else ctx.lineTo(a.x-a.width,a.y);}for(i=n;i>=0;i--){a=pts[i];ctx.lineTo(a.x+a.width,a.y);}ctx.closePath();var g=ctx.createLinearGradient(0,h*.5,0,h);g.addColorStop(0,"rgba(12,18,22,.6)");g.addColorStop(1,"#151b1e");ctx.fillStyle=g;ctx.fill();
    ctx.strokeStyle="rgba(246,240,229,.65)";ctx.lineWidth=1.3;ctx.beginPath();pts.forEach(function(p,k){if(k===0)ctx.moveTo(p.x-p.width,p.y);else ctx.lineTo(p.x-p.width,p.y);});ctx.stroke();ctx.beginPath();pts.forEach(function(p,k){if(k===0)ctx.moveTo(p.x+p.width,p.y);else ctx.lineTo(p.x+p.width,p.y);});ctx.stroke();
    ctx.save();ctx.strokeStyle="#ffd07a";ctx.shadowColor="#ffd07a";ctx.shadowBlur=8;ctx.lineCap="round";
    var phase=Math.floor(routeProgress*220);for(i=3;i<n-1;i++){if((i+phase)%6<3){var p0=pts[i],p1=pts[i+1];ctx.lineWidth=mix(.5,5,Math.pow(i/n,2));ctx.beginPath();ctx.moveTo(p0.x,p0.y);ctx.lineTo(p1.x,p1.y);ctx.stroke();}}ctx.restore();
  }

  function saguaro(x,y,s,a){ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.globalAlpha*=a;ctx.strokeStyle=floraColor(0);ctx.lineCap="round";ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-72);ctx.stroke();ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-1,-43);ctx.lineTo(-14,-43);ctx.lineTo(-14,-58);ctx.moveTo(1,-31);ctx.lineTo(15,-31);ctx.lineTo(15,-49);ctx.stroke();ctx.restore();}
  function yucca(x,y,s,a,tm){ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.globalAlpha*=a;ctx.strokeStyle=floraColor(1);ctx.lineWidth=2.4;ctx.lineCap="round";for(var i=-4;i<=4;i++){ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(i*3+Math.sin(tm*.001+i)*3,-20,i*8,-31-Math.abs(i));ctx.stroke();}ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,-4);ctx.lineTo(0,-64);ctx.stroke();ctx.restore();}
  function oak(x,y,s,a){ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.globalAlpha*=a;ctx.fillStyle=floraColor(2);ctx.fillRect(-2,-42,4,44);[[-16,-43,15],[15,-44,17],[0,-60,22],[-5,-72,14]].forEach(function(c){ctx.beginPath();ctx.arc(c[0],c[1],c[2],0,6.3);ctx.fill();});ctx.restore();}
  function pine(x,y,s,a,aspen){ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.globalAlpha*=a;if(aspen){ctx.fillStyle="rgba(240,235,215,.87)";ctx.fillRect(-2,-86,4,88);ctx.fillStyle="#72835f";ctx.beginPath();ctx.arc(0,-88,13,0,6.3);ctx.fill();}else{ctx.fillStyle=floraColor(5);ctx.fillRect(-2,-72,4,74);for(var i=0;i<4;i++){var yy=-34-i*17,half=24-i*3;ctx.beginPath();ctx.moveTo(0,yy-37);ctx.lineTo(-half,yy+7);ctx.lineTo(half,yy+7);ctx.closePath();ctx.fill();}}ctx.restore();}
  function hoodoo(x,y,s,a){ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.globalAlpha*=a;ctx.fillStyle="#685650";ctx.beginPath();ctx.moveTo(-13,0);ctx.lineTo(-9,-47);ctx.lineTo(-15,-61);ctx.lineTo(-8,-72);ctx.lineTo(-5,-103);ctx.lineTo(5,-98);ctx.lineTo(8,-70);ctx.lineTo(15,-62);ctx.lineTo(9,-49);ctx.lineTo(14,0);ctx.closePath();ctx.fill();ctx.restore();}
  function plant(b,x,y,s,a,tm,i){if(b===0)saguaro(x,y,s,a);else if(b===1)yucca(x,y,s,a,tm);else if(b===2)oak(x,y,s*.82,a);else if(b===3){if(i%5===0)hoodoo(x,y,s*1.1,a);else if(i%2)pine(x,y,s*.9,a,false);else oak(x,y,s*.7,a);}else if(b===4)pine(x,y,s*1.08,a,false);else pine(x,y,s*1.08,a,i%6===0);}
  function roadside(f,tm){var lo=Math.floor(clamp(f,0,5)),fr=clamp(f,0,5)-lo,routeProgress=S.progress+travelOffset;for(var i=0;i<30;i++){var t=(seeded(i*3+4)+routeProgress*3.7)%1,p=roadPoint(t,f),side=i%2?-1:1;var margin=p.width+mix(9,w*.14,t)*(.38+seeded(i+8)*.75);var x=p.x+side*margin,y=p.y+mix(2,20,t)*seeded(i+16),sc=.13+Math.pow(t,2.05)*2.5;plant(lo,x,y,sc,1-fr,tm,i);if(lo<5)plant(lo+1,x,y,sc,fr,tm,i);}}

  function canopy(f){var oakA=clamp(1-Math.abs(f-2),0,1)*.9,forestA=clamp((f-3.65)*1.5,0,1);if(oakA){ctx.save();ctx.globalAlpha=oakA;ctx.fillStyle=floraColor(2);for(var i=0;i<13;i++){ctx.beginPath();ctx.arc(i/12*w+Math.sin(i)*22,-8+seeded(i)*28,45+seeded(i+9)*40,0,6.3);ctx.fill();}ctx.restore();}if(forestA){ctx.save();ctx.globalAlpha=forestA*.58;ctx.fillStyle=floraColor(5);for(i=0;i<10;i++){var x=i/9*w+(seeded(i+44)-.5)*70,ww=10+seeded(i)*13;ctx.fillRect(x-ww/2,0,ww,h);};ctx.restore();}}
  function particles(f,tm){var mode=f<.8?0:f<2?1:f>4.5?2:-1;if(mode<0)return;ctx.save();var baseAlpha=ctx.globalAlpha;for(var i=0;i<(w<700?20:36);i++){var x=(seeded(i*7+2)*w+Math.sin(tm*.0005+i)*18)%w,y=(seeded(i*11+5)*h+tm*(mode===2?.004:.002)*(1+seeded(i)))%h;ctx.globalAlpha=baseAlpha*(.1+seeded(i+2)*.25);if(mode===0){ctx.fillStyle="#ffd08a";ctx.fillRect(x,y,1.5,1.5);}else if(mode===1){ctx.strokeStyle="#d7c885";ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+6+S.velocity*12,y+2);ctx.stroke();}else{ctx.fillStyle=i%4===0?"#e9e2ca":"#aecbd8";ctx.beginPath();ctx.ellipse(x,y,2.5,1,tm*.0003+i,0,6.3);ctx.fill();}}ctx.restore();}

  function normalScene(f,tm){var sky=ctx.createLinearGradient(0,0,0,h);sky.addColorStop(0,bandColor("sky",0,f));sky.addColorStop(1,bandColor("sky",1,f));ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);sun(f);topo(f,.1);var hf=clamp(f/5,0,1),base=mix(h*.65,h*.59,hf),jag=clamp((f-2.4)*.45,0,1);ridge(1.2,base,h*.2,bandColor("ridge",0,f),10,jag);ridge(2.7,base+h*.1,h*.18,bandColor("ridge",0,f),20,jag);ridge(4.1,base+h*.19,h*.16,bandColor("ridge",1,f),32,jag);road(f);roadside(f,tm);canopy(f);particles(f,tm);}

  function overview(tm){var sky=ctx.createLinearGradient(0,0,0,h);sky.addColorStop(0,"#203b5a");sky.addColorStop(1,"#07131f");ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);topo(5,.15);var peakX=w*.73,peakY=h*.16,baseY=h*.88;ctx.save();ctx.beginPath();ctx.moveTo(-40,baseY);ctx.lineTo(w*.1,h*.79);ctx.lineTo(w*.28,h*.64);ctx.lineTo(w*.44,h*.5);ctx.lineTo(w*.59,h*.35);ctx.lineTo(peakX,peakY);ctx.lineTo(w*.82,h*.29);ctx.lineTo(w+40,h*.54);ctx.lineTo(w+40,h+30);ctx.lineTo(-40,h+30);ctx.closePath();ctx.clip();var colors=["#b84e3e","#af7e4d","#557058","#315b60","#214750","#102b3a"];for(var i=0;i<6;i++){var y0=baseY-(i+1)*(baseY-peakY)/6,y1=baseY-i*(baseY-peakY)/6;var g=ctx.createLinearGradient(0,y0,w,y1);g.addColorStop(0,colors[i]);g.addColorStop(1,color(colors[i],"#07131f",.4));ctx.fillStyle=g;ctx.fillRect(0,y0-3,w,y1-y0+6);}ctx.restore();ctx.strokeStyle="rgba(246,240,229,.34)";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-40,baseY);ctx.lineTo(w*.1,h*.79);ctx.lineTo(w*.28,h*.64);ctx.lineTo(w*.44,h*.5);ctx.lineTo(w*.59,h*.35);ctx.lineTo(peakX,peakY);ctx.lineTo(w*.82,h*.29);ctx.lineTo(w+40,h*.54);ctx.stroke();
    var route=[[.08,.82],[.26,.76],[.17,.68],[.39,.62],[.31,.54],[.56,.47],[.47,.4],[.68,.32],[.6,.25],[.73,.17]];ctx.save();ctx.strokeStyle="#ffd07a";ctx.shadowColor="#ffd07a";ctx.shadowBlur=12;ctx.lineWidth=2.5;ctx.beginPath();route.forEach(function(p,k){var x=p[0]*w,y=p[1]*h;if(k===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();ctx.fillStyle="#f6f0e5";route.forEach(function(p){ctx.beginPath();ctx.arc(p[0]*w,p[1]*h,2.5,0,6.3);ctx.fill();});ctx.restore();particles(5,tm);}

  function draw(tm){ctx.globalAlpha=1;ctx.clearRect(0,0,w,h);if(S.compareActive){ctx.save();ctx.beginPath();ctx.rect(0,0,w*S.compare,h);ctx.clip();normalScene(0,tm);ctx.restore();ctx.save();ctx.beginPath();ctx.rect(w*S.compare,0,w*(1-S.compare),h);ctx.clip();overview(tm);ctx.restore();}else{normalScene(S.band,tm);var ov=smooth((S.progress-.88)/.12);if(ov>0){ctx.save();ctx.globalAlpha=ov;overview(tm);ctx.restore();}}ctx.globalAlpha=1;}

  function frame(ts){raf=0;if(!visible)return;var dt=lastTs?Math.min(50,ts-lastTs):0,dx=S.targetX-S.pointerX,dy=S.targetY-S.pointerY;if(S.traveling&&!reduce)travelOffset+=dt*.00001;if(!reduce){S.pointerX+=dx*.07;S.pointerY+=dy*.07;}else{S.pointerX=S.targetX;S.pointerY=S.targetY;}draw(ts);dirty=false;S.velocity*=.86;var moving=Math.abs(dx)+Math.abs(dy)>.003||Math.abs(S.velocity)>.015||S.traveling;if(moving)raf=requestAnimationFrame(frame);lastTs=ts;}
  function setState(next){for(var k in next)S[k]=next[k];invalidate();}
  function setTraveling(next){next=!!next;if(S.traveling===next)return;S.traveling=next;lastTs=0;invalidate();}
  function point(x,y){S.targetX=clamp(x,0,1);S.targetY=clamp(y,0,1);if(!reduce)invalidate();}
  function init(){canvas=document.querySelector(".landscape");if(!canvas)return;ctx=canvas.getContext("2d");window.addEventListener("resize",resize,{passive:true});document.addEventListener("visibilitychange",function(){visible=!document.hidden;lastTs=0;if(!visible&&raf){cancelAnimationFrame(raf);raf=0;}else invalidate();});resize();}
  return{init:init,setState:setState,setTraveling:setTraveling,point:point,resize:resize};
})();

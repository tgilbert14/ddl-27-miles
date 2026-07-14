/* A single data-driven timeline controls copy, landscape, route, and instruments. */
window.Climb=(function(){
  var M=window.M27,nodes=[],chapters=[],centers=[],nodeMiles=[],raf=0,lastY=0,lastBand=-1,compare=.5,lookback=.72;
  var reduce=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches,els={},cache={};
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function mix(a,b,t){return a+(b-a)*t;}
  function comma(n){return Math.round(n).toLocaleString("en-US");}
  function setText(el,key,value){if(el&&cache[key]!==value){cache[key]=value;el.textContent=value;}}
  function sampleProfile(m){var p=M.profile;if(m<=p[0][0])return p[0][1];for(var i=0;i<p.length-1;i++){if(m<=p[i+1][0]){var t=(m-p[i][0])/(p[i+1][0]-p[i][0]);return mix(p[i][1],p[i+1][1],t);}}return p[p.length-1][1];}
  function measure(){centers=nodes.map(function(n){return n.offsetTop+n.offsetHeight*.5;});nodeMiles=nodes.map(function(n){return parseFloat(n.dataset.mile)||0;});requestRender();}
  function mileAt(ref){if(!centers.length||ref<=centers[0])return nodeMiles[0]||0;for(var i=0;i<centers.length-1;i++){if(ref<=centers[i+1]){var t=(ref-centers[i])/(centers[i+1]-centers[i]);return mix(nodeMiles[i],nodeMiles[i+1],t);}}return nodeMiles[nodeMiles.length-1];}
  function bandAt(ref){var bc=chapters.map(function(n){return n.offsetTop+n.offsetHeight*.5;});if(!bc.length||ref<=bc[0])return 0;for(var i=0;i<bc.length-1;i++){if(ref<=bc[i+1])return i+(ref-bc[i])/(bc[i+1]-bc[i]);}return 5;}
  function activeAt(ref){var best=0,d=Infinity;chapters.forEach(function(n,i){var x=Math.abs((n.offsetTop+n.offsetHeight*.5)-ref);if(x<d){d=x;best=i;}});var summit=document.getElementById("summit");if(summit&&ref>summit.offsetTop+summit.offsetHeight*.18)return 6;return best;}
  function nodeFocus(ref){nodes.forEach(function(n){var local=(ref-n.offsetTop)/Math.max(1,n.offsetHeight),focus=clamp(1-Math.abs(local-.5)*2.4,0,1);n.style.setProperty("--local",local.toFixed(3));n.style.setProperty("--focus",focus.toFixed(3));});}
  function gradeAt(m){var a=sampleProfile(clamp(m-.06,0,28.8)),b=sampleProfile(clamp(m+.06,0,28.8));return b-a;}

  function render(){raf=0;var y=window.pageYOffset||0,vh=window.innerHeight,ref=y+vh*.5,mile=clamp(mileAt(ref),0,28.8),p=mile/28.8,bf=bandAt(ref),elev=sampleProfile(mile),temp=M.baseTemperature-((elev-M.baseElevation)/1000)*M.lapseRate,grade=gradeAt(mile),band=activeAt(ref),velocity=clamp((y-lastY)/Math.max(vh,1),-.18,.18);lastY=y;
    var departure=clamp(y/(vh*.68),0,1),chrome=clamp((y-vh*.16)/(vh*.34),0,1),ep=document.querySelector(".epilogue"),retire=ep?clamp((y-ep.offsetTop+vh*.25)/(vh*.45),0,1):0;chrome*=1-retire;
    document.documentElement.style.setProperty("--departure",departure.toFixed(3));document.documentElement.style.setProperty("--chrome",chrome.toFixed(3));document.documentElement.style.setProperty("--progress",p.toFixed(4));
    document.documentElement.style.setProperty("--journey-ui",(1-retire).toFixed(3));document.documentElement.classList.toggle("journey-retired",retire>.96);
    nodeFocus(ref);
    setText(els.mile,"mile",mile.toFixed(1));setText(els.elevation,"elev",comma(elev));setText(els.temp,"temp",Math.round(temp)+"°");
    var down=grade<-.5;setText(els.grade,"grade",down?"▼":"▲");els.grade.classList.toggle("down",down);els.grade.classList.toggle("up",!down);
    if(band!==lastBand){lastBand=band;var name=band===6?"Mount Lemmon summit":M.bands[band].name;setText(els.zone,"zone",name);setText(els.announcement,"announce",(down?"Descending through ":"Entering ")+name+", about "+comma(elev)+" feet.");document.querySelectorAll(".route-rail a").forEach(function(a,i){if(i===band)a.setAttribute("aria-current","step");else a.removeAttribute("aria-current");});}
    var summit=document.getElementById("summit"),compareActive=!!(summit&&ref>summit.offsetTop&&ref<summit.offsetTop+summit.offsetHeight);document.documentElement.style.setProperty("--compare-active",compareActive?"1":"0");document.documentElement.style.setProperty("--compare",(compare*100).toFixed(1)+"%");
    var sceneProgress=reduce?(band===6?1:[2.7,5.5,9.1,14,17,19.6][band]/28.8):p,sceneBand=reduce?Math.min(band,5):bf;
    window.MountainScene.setState({progress:sceneProgress,band:sceneBand,lookback:lookback,compare:compare,compareActive:compareActive,velocity:reduce?0:velocity});
  }
  function requestRender(){if(!raf)raf=requestAnimationFrame(render);}
  function bind(){window.addEventListener("scroll",requestRender,{passive:true});window.addEventListener("resize",measure,{passive:true});window.addEventListener("pointermove",function(e){if(!reduce)window.MountainScene.point(e.clientX/window.innerWidth,e.clientY/window.innerHeight);},{passive:true});
    var look=document.getElementById("lookback-range"),lookVal=document.getElementById("lookback-value");look.addEventListener("input",function(){lookback=parseInt(look.value,10)/100;lookVal.textContent=lookback>.58?"Toward the desert":"Road ahead";requestRender();});
    var comp=document.getElementById("compare-range");comp.addEventListener("input",function(){compare=parseInt(comp.value,10)/100;requestRender();});
    document.querySelectorAll("details").forEach(function(d){d.addEventListener("toggle",measure);});
    if("ResizeObserver" in window){var ro=new ResizeObserver(measure);ro.observe(document.getElementById("story"));}
  }
  function init(){nodes=Array.prototype.slice.call(document.querySelectorAll(".timeline-node[data-mile]"));chapters=Array.prototype.slice.call(document.querySelectorAll(".chapter[data-band]"));els={mile:document.getElementById("live-mile"),elevation:document.getElementById("live-elevation"),temp:document.getElementById("live-temp"),grade:document.getElementById("live-grade"),zone:document.getElementById("live-zone"),announcement:document.getElementById("live-announcement")};measure();bind();render();}
  return{init:init};
})();

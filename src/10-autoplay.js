/* Slow, interruptible cruise control for the full ascent. */
window.AutoJourney=(function(){
  var button,label,status,raf=0,last=0,state="idle",reduce=false,stops=[],nextStop=0;
  var dwelling=false,dwellUntil=0,dwellRemaining=0,routeDirty=true;
  var SPEED_IN_VIEWPORTS_PER_SECOND=.105;
  var STOP_DWELL_MS=3000;
  function targetY(){var summit=document.getElementById("summit");return summit?Math.max(0,summit.offsetTop+summit.offsetHeight*.5-window.innerHeight*.5):document.documentElement.scrollHeight-window.innerHeight;}
  function now(){return window.performance&&window.performance.now?window.performance.now():Date.now();}
  function stopLabel(node){var heading=node.querySelector("h2"),eyebrow=node.querySelector(".zone-index,.eyebrow");return(heading||eyebrow)?(heading||eyebrow).textContent.replace(/\s+/g," ").trim():"the next stop";}
  function collectStops(y){var target=targetY();stops=Array.prototype.slice.call(document.querySelectorAll(".timeline-node[data-mile]")).map(function(node){return{node:node,y:Math.max(0,Math.min(target,node.offsetTop+node.offsetHeight*.5-window.innerHeight*.5)),label:stopLabel(node)};}).filter(function(stop,i,list){return stop.y<=target+1&&(i===0||Math.abs(stop.y-list[i-1].y)>1);});nextStop=0;while(nextStop<stops.length&&stops[nextStop].y<y-1)nextStop++;routeDirty=false;}
  function keepRoadMoving(next){if(window.MountainScene&&window.MountainScene.setTraveling)window.MountainScene.setTraveling(next);}
  function dwellStatus(){var stop=stops[nextStop];status.textContent="Taking in "+(stop?stop.label:"this stop")+" · road still moving";}
  function setState(next,message){state=next;var playing=next==="playing";document.documentElement.classList.toggle("auto-driving",playing);button.setAttribute("aria-pressed",playing?"true":"false");button.setAttribute("aria-label",playing?"Pause the automatic ascent":"Begin or resume the slow automatic ascent to the summit");
    if(next==="playing"){label.textContent="Pause ascent";status.textContent="Cruising · take the wheel anytime";}
    else if(next==="paused"){label.textContent="Resume ascent";status.textContent=message||"Journey paused";}
    else if(next==="complete"){label.textContent="Replay ascent";status.textContent="Summit reached · 9,157 ft";}
    else{label.textContent=reduce?"Jump to summit":"Auto ascent";status.textContent=reduce?"Reduced-motion shortcut":"Cruise to the summit · about 2 min";}}
  function beginDwell(ts){dwelling=true;dwellRemaining=STOP_DWELL_MS;dwellUntil=ts+STOP_DWELL_MS;last=0;keepRoadMoving(true);dwellStatus();}
  function stop(message){if(raf)cancelAnimationFrame(raf);raf=0;last=0;if(dwelling&&dwellUntil)dwellRemaining=Math.max(0,dwellUntil-now());dwellUntil=0;keepRoadMoving(false);if(state==="playing")setState("paused",message||"You took the wheel");}
  function finish(){if(raf)cancelAnimationFrame(raf);raf=0;last=0;dwelling=false;dwellUntil=0;dwellRemaining=0;keepRoadMoving(false);setState("complete");}
  function setDriveProgress(target){var pct=target?Math.min(1,(window.pageYOffset||0)/target):1;document.documentElement.style.setProperty("--drive-deg",Math.round(pct*360)+"deg");}
  function frame(ts){if(state!=="playing")return;var target=targetY(),y=window.pageYOffset||0;if(routeDirty)collectStops(y);
    if(dwelling){if(!dwellUntil)dwellUntil=ts+dwellRemaining;keepRoadMoving(true);dwellStatus();if(ts<dwellUntil){raf=requestAnimationFrame(frame);return;}keepRoadMoving(false);dwelling=false;dwellUntil=0;dwellRemaining=0;nextStop++;last=ts;y=window.pageYOffset||0;}
    var next=stops[nextStop];if(next&&y>=next.y-1){window.scrollTo(0,next.y);setDriveProgress(target);beginDwell(ts);raf=requestAnimationFrame(frame);return;}if(y>=target-1){window.scrollTo(0,target);finish();return;}
    if(!last)last=ts;var dt=Math.min(50,ts-last)/1000;last=ts;var speed=window.innerHeight*SPEED_IN_VIEWPORTS_PER_SECOND,nextY=Math.min(target,y+speed*dt),reachedStop=next&&nextY>=next.y-1;if(reachedStop)nextY=next.y;window.scrollTo(0,nextY);setDriveProgress(target);if(reachedStop)beginDwell(ts);raf=requestAnimationFrame(frame);}
  function start(){var target=targetY(),y=window.pageYOffset||0;if(reduce){window.scrollTo({top:target,behavior:"auto"});setState("complete");return;}if(state==="complete"||y>=target-4){window.scrollTo(0,0);document.documentElement.style.setProperty("--drive-deg","0deg");dwelling=false;dwellUntil=0;dwellRemaining=0;routeDirty=true;y=0;}if(routeDirty||!stops.length)collectStops(y);setState("playing");last=0;raf=requestAnimationFrame(frame);}
  function toggle(){state==="playing"?stop("Journey paused"):start();}
  function syncProgress(){if(state==="playing")return;routeDirty=true;if(dwelling){dwelling=false;dwellUntil=0;dwellRemaining=0;}var target=targetY(),pct=target?clamp01((window.pageYOffset||0)/target):0;document.documentElement.style.setProperty("--drive-deg",Math.round(pct*360)+"deg");}
  function clamp01(v){return Math.max(0,Math.min(1,v));}
  function takeWheel(e){if(state!=="playing")return;if(e&&button.contains(e.target))return;stop("You took the wheel");}
  function init(){button=document.getElementById("drive-control");label=document.getElementById("drive-label");status=document.getElementById("drive-status");if(!button)return;reduce=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;setState("idle");syncProgress();button.addEventListener("click",toggle);window.addEventListener("scroll",syncProgress,{passive:true});window.addEventListener("wheel",takeWheel,{passive:true});window.addEventListener("touchstart",takeWheel,{passive:true});window.addEventListener("pointerdown",takeWheel,{passive:true});window.addEventListener("keydown",function(e){if(e.target===button)return;if(e.key==="Escape"||state==="playing")takeWheel(e);});document.addEventListener("visibilitychange",function(){if(document.hidden&&state==="playing")stop("Paused while you were away");});
    var mq=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)");if(mq&&mq.addEventListener)mq.addEventListener("change",function(e){reduce=e.matches;if(state==="playing")stop("Motion preference changed");dwelling=false;dwellUntil=0;dwellRemaining=0;routeDirty=true;keepRoadMoving(false);setState("idle");});}
  return{init:init,stop:stop};
})();

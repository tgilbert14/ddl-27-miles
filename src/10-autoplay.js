/* Slow, interruptible cruise control for the full ascent. */
window.AutoJourney=(function(){
  var button,label,status,raf=0,last=0,state="idle",reduce=false;
  var SPEED_IN_VIEWPORTS_PER_SECOND=.105;
  function targetY(){var summit=document.getElementById("summit");return summit?Math.max(0,summit.offsetTop+summit.offsetHeight*.5-window.innerHeight*.5):document.documentElement.scrollHeight-window.innerHeight;}
  function setState(next,message){state=next;var playing=next==="playing";document.documentElement.classList.toggle("auto-driving",playing);button.setAttribute("aria-pressed",playing?"true":"false");button.setAttribute("aria-label",playing?"Pause the automatic ascent":"Begin or resume the slow automatic ascent to the summit");
    if(next==="playing"){label.textContent="Pause ascent";status.textContent="Cruising · take the wheel anytime";}
    else if(next==="paused"){label.textContent="Resume ascent";status.textContent=message||"Journey paused";}
    else if(next==="complete"){label.textContent="Replay ascent";status.textContent="Summit reached · 9,157 ft";}
    else{label.textContent=reduce?"Jump to summit":"Auto ascent";status.textContent=reduce?"Reduced-motion shortcut":"Cruise to the summit · about 100 sec";}}
  function stop(message){if(raf)cancelAnimationFrame(raf);raf=0;last=0;if(state==="playing")setState("paused",message||"You took the wheel");}
  function finish(){if(raf)cancelAnimationFrame(raf);raf=0;last=0;setState("complete");}
  function frame(ts){if(state!=="playing")return;var target=targetY(),y=window.pageYOffset||0;if(y>=target-1){window.scrollTo(0,target);finish();return;}if(!last)last=ts;var dt=Math.min(50,ts-last)/1000;last=ts;var speed=window.innerHeight*SPEED_IN_VIEWPORTS_PER_SECOND;window.scrollTo(0,Math.min(target,y+speed*dt));var pct=target?Math.min(1,(window.pageYOffset||0)/target):1;document.documentElement.style.setProperty("--drive-deg",Math.round(pct*360)+"deg");raf=requestAnimationFrame(frame);}
  function start(){var target=targetY();if(reduce){window.scrollTo({top:target,behavior:"auto"});setState("complete");return;}if(state==="complete"||(window.pageYOffset||0)>=target-4){window.scrollTo(0,0);document.documentElement.style.setProperty("--drive-deg","0deg");}setState("playing");last=0;raf=requestAnimationFrame(frame);}
  function toggle(){state==="playing"?stop("Journey paused"):start();}
  function syncProgress(){if(state==="playing")return;var target=targetY(),pct=target?clamp01((window.pageYOffset||0)/target):0;document.documentElement.style.setProperty("--drive-deg",Math.round(pct*360)+"deg");}
  function clamp01(v){return Math.max(0,Math.min(1,v));}
  function takeWheel(e){if(state!=="playing")return;if(e&&button.contains(e.target))return;stop("You took the wheel");}
  function init(){button=document.getElementById("drive-control");label=document.getElementById("drive-label");status=document.getElementById("drive-status");if(!button)return;reduce=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;setState("idle");syncProgress();button.addEventListener("click",toggle);window.addEventListener("scroll",syncProgress,{passive:true});window.addEventListener("wheel",takeWheel,{passive:true});window.addEventListener("touchstart",takeWheel,{passive:true});window.addEventListener("pointerdown",takeWheel,{passive:true});window.addEventListener("keydown",function(e){if(e.target===button)return;if(e.key==="Escape"||state==="playing")takeWheel(e);});document.addEventListener("visibilitychange",function(){if(document.hidden&&state==="playing")stop("Paused while you were away");});
    var mq=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)");if(mq&&mq.addEventListener)mq.addEventListener("change",function(e){reduce=e.matches;if(state==="playing")stop("Motion preference changed");setState("idle");});}
  return{init:init,stop:stop};
})();

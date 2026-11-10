(function(){
  document.documentElement.classList.add("js");
  function start(){
    fetch("data/route.json").then(function(r){ if(!r.ok) throw new Error("route.json "+r.status); return r.json(); })
      .catch(function(err){ if(window.console) console.warn("Road data unavailable; the profile falls back to the measured stops.",err); return null; })
      .then(function(route){
        window.M27.route=route;
        try {
          window.Profile.init();
          window.Climb.init();
          if(window.AutoJourney) window.AutoJourney.init();
        } catch (error) {
          document.documentElement.classList.remove("js");
          if(window.console) console.error("The climb fell back to its static edition.",error);
          return;
        }
        window.MountainScene.init(route);
      });
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",start); else start();
})();

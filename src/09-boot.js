(function(){
  document.documentElement.classList.add("js");
  function start(){
    try {
      window.MountainScene.init();
      window.Climb.init();
      if(window.AutoJourney) window.AutoJourney.init();
    } catch (error) {
      document.documentElement.classList.remove("js");
      if(window.console) console.error("The climb fell back to its static edition.",error);
    }
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",start); else start();
})();

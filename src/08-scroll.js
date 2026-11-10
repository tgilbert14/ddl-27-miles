/* One timeline: scroll position -> mile -> measured elevation, modelled temperature, community.
   Scroll stays the single source of truth; the profile control writes scroll through yForMile. */
window.Climb = (function () {
  var M = window.M27, nodes = [], chapters = [], centers = [], nodeMiles = [], raf = 0, lastBand = -1, lookback = 0.72;
  var windy = null, summit = null, els = {}, cache = {};
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function mix(a, b, t) { return a + (b - a) * t; }
  function smooth(e0, e1, x) { var t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
  function comma(n) { return Math.round(n).toLocaleString("en-US"); }
  function setText(el, key, value) { if (el && cache[key] !== value) { cache[key] = value; el.textContent = value; } }
  function top(el) { var y = 0; while (el) { y += el.offsetTop; el = el.offsetParent; } return y; }

  function measure() {
    centers = nodes.map(function (n) { return top(n) + n.offsetHeight * 0.5; });
    nodeMiles = nodes.map(function (n) { return parseFloat(n.dataset.mile) || 0; });
    requestRender();
  }
  function mileAt(ref) {
    if (!centers.length || ref <= centers[0]) return nodeMiles[0] || 0;
    for (var i = 0; i < centers.length - 1; i++) {
      if (ref <= centers[i + 1]) return mix(nodeMiles[i], nodeMiles[i + 1], (ref - centers[i]) / Math.max(1, centers[i + 1] - centers[i]));
    }
    return nodeMiles[nodeMiles.length - 1];
  }
  /* The inverse: the scroll position that puts a given mile at the centre of the viewport. */
  function yForMile(mile) {
    var vh = window.innerHeight, maxY = document.documentElement.scrollHeight - vh;
    if (!centers.length || mile <= nodeMiles[0]) return 0;
    var c = centers[centers.length - 1];
    for (var i = 0; i < centers.length - 1; i++) {
      if (mile <= nodeMiles[i + 1]) { c = mix(centers[i], centers[i + 1], (mile - nodeMiles[i]) / Math.max(1e-6, nodeMiles[i + 1] - nodeMiles[i])); break; }
    }
    return clamp(Math.round(c - vh * 0.5), 0, maxY);
  }
  function activeAt(ref) {
    var best = 0, d = Infinity;
    chapters.forEach(function (n, i) { var x = Math.abs(top(n) + n.offsetHeight * 0.5 - ref); if (x < d) { d = x; best = i; } });
    if (summit && ref > top(summit) + summit.offsetHeight * 0.18) return 6;
    return best;
  }
  function nodeFocus(ref) {
    nodes.forEach(function (n) {
      var local = (ref - top(n)) / Math.max(1, n.offsetHeight), focus = clamp((1 - Math.abs(local - 0.5) * 2) * 1.6, 0, 1);
      n.style.setProperty("--focus", focus.toFixed(3));
    });
  }

  function render() {
    raf = 0;
    var y = window.pageYOffset || 0, vh = window.innerHeight, ref = y + vh * 0.5;
    var mile = clamp(mileAt(ref), 0, M.miles), ft = M.feetAt(mile), temp = M.tempAt(ft), band = activeAt(ref);
    nodeFocus(ref);
    var overview = 0, look = 0;
    if (summit) overview = smooth(top(summit) - vh * 0.1, top(summit) + vh * 0.6, ref);
    if (windy) { var wt = top(windy), wb = wt + windy.offsetHeight; look = lookback * smooth(wt - vh * 0.05, wt + vh * 0.35, ref) * (1 - smooth(wb - vh * 0.35, wb + vh * 0.05, ref)); }
    var name = band === 6 ? "Mount Lemmon summit" : M.bands[band].name;
    if (band !== lastBand) {
      lastBand = band;
      setText(els.zone, "zone", name);
      setText(els.announcement, "announce", "Entering " + name + ", about " + comma(ft) + " feet.");
    }
    var state = { mile: mile, ft: ft, temp: temp, band: band, community: name, overview: overview, lookback: look };
    if (window.Profile) window.Profile.update(state);
    if (window.MountainScene) window.MountainScene.setState({ mile: mile, lookback: look, overview: overview });
  }
  function requestRender() { if (!raf) raf = requestAnimationFrame(render); }
  function bind() {
    window.addEventListener("scroll", requestRender, { passive: true });
    window.addEventListener("resize", measure, { passive: true });
    var range = document.getElementById("lookback-range"), out = document.getElementById("lookback-value");
    if (range) {
      var sync = function () { lookback = parseInt(range.value, 10) / 100; if (out) out.textContent = lookback > 0.58 ? "Toward the desert" : "Road ahead"; requestRender(); };
      range.addEventListener("input", sync); sync();
    }
    document.querySelectorAll("details").forEach(function (d) { d.addEventListener("toggle", measure); });
    if ("ResizeObserver" in window) new ResizeObserver(measure).observe(document.getElementById("story"));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  }
  function init() {
    nodes = Array.prototype.slice.call(document.querySelectorAll(".timeline-node[data-mile]"));
    chapters = Array.prototype.slice.call(document.querySelectorAll(".chapter[data-band]"));
    windy = document.getElementById("zone-4"); summit = document.getElementById("summit");
    els = { zone: document.getElementById("live-zone"), announcement: document.getElementById("live-announcement") };
    measure(); bind(); render();
  }
  return { init: init, yForMile: yForMile, refresh: requestRender };
})();

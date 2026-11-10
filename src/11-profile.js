/* The one control: the measured elevation profile of the road, fixed to the bottom of the screen.
   Dragging, clicking, tapping or using the keyboard on it scrolls the page; scroll stays the source of truth. */
window.Profile = (function () {
  var M = window.M27, NS = "http://www.w3.org/2000/svg";
  var bar, box, svg, range, stopsEl, els = {}, cache = {}, W = 1, H = 1, top = 0, padL = 8, padR = 8, padB = 6;
  var lo = 2700, hi = 9300, mile = 0, ft = M.stops[0].ft, drag = null, labels = true;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var parts = {};
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function comma(n) { return Math.round(n).toLocaleString("en-US"); }
  function setText(el, key, value) { if (el && cache[key] !== value) { cache[key] = value; el.textContent = value; } }
  function el(name, attrs, parent) { var n = document.createElementNS(NS, name); for (var k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; }
  function xOf(m) { return padL + (m / M.miles) * (W - padL - padR); }
  function yOf(f) { return H - padB - (f - lo) / (hi - lo) * (H - padB - top); }
  function mileOfX(x) { return clamp((x - padL) / Math.max(1, W - padL - padR) * M.miles, 0, M.miles); }
  function series() {
    if (M.route) {
      var out = [], r = M.route, step = Math.max(1, Math.floor(r.mi.length / Math.max(120, Math.round(W))));
      for (var i = 0; i < r.mi.length; i += step) out.push([r.mi[i], r.ft[i]]);
      out.push([r.mi[r.mi.length - 1], r.ft[r.ft.length - 1]]);
      return out;
    }
    return M.coarseProfile;
  }

  function draw() {
    var rect = box.getBoundingClientRect();
    W = Math.max(40, Math.round(rect.width)); H = Math.max(24, Math.round(rect.height));
    labels = window.matchMedia("(min-width: 761px)").matches;
    top = labels ? 34 : 4;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("width", W); svg.setAttribute("height", H);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var pts = series(), line = "", i;
    for (i = 0; i < pts.length; i++) line += (i ? "L" : "M") + xOf(pts[i][0]).toFixed(1) + " " + yOf(pts[i][1]).toFixed(1);
    var area = line + "L" + xOf(M.miles).toFixed(1) + " " + (H - padB) + "L" + xOf(0).toFixed(1) + " " + (H - padB) + "Z";
    var defs = el("defs", {}, svg), clip = el("clipPath", { id: "profile-area" }, defs);
    el("path", { d: area }, clip);
    var driven = el("clipPath", { id: "profile-driven" }, defs);
    parts.drivenRect = el("rect", { x: 0, y: 0, width: xOf(mile), height: H }, driven);
    /* six communities as horizontal elevation bands under the line */
    var g = el("g", { "clip-path": "url(#profile-area)" }, svg), edges = [lo].concat(M.bandEdges, [hi]);
    var dim = el("g", {}, g), lit = el("g", { class: "pf-driven", "clip-path": "url(#profile-driven)" }, g);
    [dim, lit].forEach(function (layer) {
      for (var b = 0; b < 6; b++) el("rect", { x: 0, y: yOf(edges[b + 1]), width: W, height: Math.max(0, yOf(edges[b]) - yOf(edges[b + 1])), fill: M.bands[b].ridge[0], class: "pf-band" }, layer);
    });
    el("path", { d: line, class: "pf-line" }, svg);
    el("path", { d: line, class: "pf-line-driven", "clip-path": "url(#profile-driven)" }, svg);
    /* stop ticks */
    M.stops.forEach(function (s) {
      if (!s.tick) return;
      var x = xOf(s.mile);
      el("line", { x1: x, x2: x, y1: labels ? 30 : top - 4, y2: yOf(s.ft), class: "pf-tick" }, svg);
    });
    parts.handleLine = el("line", { x1: 0, x2: 0, y1: top - 6, y2: H - padB, class: "pf-handle-line" }, svg);
    parts.handle = el("circle", { cx: 0, cy: 0, r: 6, class: "pf-handle" }, svg);
    placeStops();
    place();
  }
  function placeStops() {
    var buttons = stopsEl.querySelectorAll("button");
    Array.prototype.forEach.call(buttons, function (b, i) {
      var s = M.stops[+b.dataset.index];
      b.style.left = xOf(s.mile) + "px";
      b.classList.toggle("low", i % 2 === 1);
      b.classList.toggle("end", s.mile > M.miles - 1.5);
    });
  }
  function place() {
    var x = xOf(mile), y = yOf(ft);
    if (!parts.handle) return;
    parts.handle.setAttribute("cx", x.toFixed(1)); parts.handle.setAttribute("cy", y.toFixed(1));
    parts.handleLine.setAttribute("x1", x.toFixed(1)); parts.handleLine.setAttribute("x2", x.toFixed(1));
    parts.drivenRect.setAttribute("width", Math.max(0, x).toFixed(1));
  }
  function placeName(m, community) {
    var best = null, d = Infinity;
    M.stops.forEach(function (s) { var x = Math.abs(s.mile - m); if (x < d) { d = x; best = s; } });
    return d <= 0.35 ? best.name : community;
  }

  function update(state) {
    mile = state.mile; ft = state.ft;
    var m1 = mile.toFixed(1), name = placeName(mile, state.community);
    setText(els.mile, "mile", m1);
    setText(els.feet, "feet", comma(ft));
    setText(els.temp, "temp", Math.round(state.temp) + "°");
    setText(els.place, "place", name);
    var v = String(Math.round(mile * 10));
    if (range.value !== v && document.activeElement !== range) range.value = v;
    var text = "Mile " + m1 + ", " + comma(ft) + " feet, " + name;
    if (cache.vt !== text) { cache.vt = text; range.setAttribute("aria-valuetext", text); }
    Array.prototype.forEach.call(stopsEl.querySelectorAll("button"), function (b) {
      var s = M.stops[+b.dataset.index], here = Math.abs(s.mile - mile) <= 0.35;
      if (here) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
    place();
  }

  function goTo(m, smooth) {
    var y = window.Climb.yForMile(clamp(m, 0, M.miles));
    window.scrollTo({ top: y, behavior: smooth && !reduce ? "smooth" : "auto" });
  }
  function xFromEvent(e) { return e.clientX - box.getBoundingClientRect().left; }
  function onDown(e) {
    if (e.button && e.button !== 0) return;
    if (e.target.closest && e.target.closest("button")) return;
    drag = { id: e.pointerId, x0: e.clientX, moved: false };
    try { box.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
    box.classList.add("dragging");
    e.preventDefault();
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (Math.abs(e.clientX - drag.x0) > 4) drag.moved = true;
    if (drag.moved) goTo(mileOfX(xFromEvent(e)), false);
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var x = xFromEvent(e), m = mileOfX(x);
    if (!drag.moved) {
      /* a tap near a stop tick lands exactly on the stop */
      M.stops.forEach(function (s) { if (s.tick && Math.abs(xOf(s.mile) - x) < 14) m = s.mile; });
      goTo(m, true);
    }
    drag = null; box.classList.remove("dragging");
  }

  function init() {
    bar = document.getElementById("ascent-bar"); box = document.getElementById("profile");
    if (!bar || !box) return;
    svg = box.querySelector("svg"); range = document.getElementById("mile-range"); stopsEl = box.querySelector(".profile-stops");
    els = { mile: document.getElementById("live-mile"), feet: document.getElementById("live-elevation"), temp: document.getElementById("live-temp"), place: document.getElementById("live-place") };
    if (M.route) M.miles = M.route.stats.miles;
    range.max = String(Math.round(M.miles * 10));
    M.stops.forEach(function (s, i) {
      if (!s.tick) return;
      var b = document.createElement("button");
      b.type = "button"; b.dataset.index = i; b.textContent = s.name;
      b.setAttribute("aria-label", "Jump to " + s.name + ", mile " + s.mile.toFixed(1));
      b.addEventListener("click", function () { goTo(s.mile, true); });
      stopsEl.appendChild(b);
    });
    range.addEventListener("input", function () { goTo(parseInt(range.value, 10) / 10, false); });
    range.addEventListener("focus", function () { box.classList.add("focused"); });
    range.addEventListener("blur", function () { box.classList.remove("focused"); });
    box.addEventListener("pointerdown", onDown);
    box.addEventListener("pointermove", onMove);
    box.addEventListener("pointerup", onUp);
    box.addEventListener("pointercancel", function () { drag = null; box.classList.remove("dragging"); });
    var redraw = function () { draw(); };
    if ("ResizeObserver" in window) new ResizeObserver(redraw).observe(box); else window.addEventListener("resize", redraw);
    draw();
  }
  return { init: init, update: update };
})();

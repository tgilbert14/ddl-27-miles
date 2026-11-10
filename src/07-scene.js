/* The real mountain and the real road, drawn with three.js and rendered only when something changes.
   Terrain: data/height.webp (Mapzen Terrain Tiles). Road: data/route.json (OpenStreetMap contributors).
   World units are metres, y is up, x is east, z is south. */
window.MountainScene = (function () {
  var VERTICAL_EXAGGERATION = 1;          /* true scale; the page says so */
  var FT = 3.28084, MILE = 1609.344;
  var ROAD_WIDTH = 14, ROAD_WIDTH_OVERVIEW = 90, ROAD_COLOR = "#ffd07a";
  var CAM_BEHIND = 350, CAM_ABOVE = 90, CAM_AHEAD = 600, CAM_FLOOR = 40, SMOOTH_TIME = 0.7, JUMP_MILES = 0.75;
  var PLANT_SCALE = 1.9;                   /* plants are drawn larger than life so they read from the camera */

  var M = window.M27, THREE = null, renderer, scene, camera, canvas, stage, fog, hemi, sunLight, roadMat, plantGroup;
  var ready = false, failed = false, raf = 0, lastTs = 0, visible = !document.hidden, snapNext = true;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var phone = window.matchMedia && window.matchMedia("(max-width: 760px), (pointer: coarse)").matches;
  var S = { mile: 0, lookback: 0, overview: 0 };
  var sheet = null, heights = null, grid = null, route = null, overviewPose = null, basin = null, lookSign = 1;
    var lastSky = "";

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function mix(a, b, t) { return a + (b - a) * t; }
  function smooth(e0, e1, x) { var t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hexMix(a, b, t) {
    var x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    var r = Math.round(mix(x >> 16, y >> 16, t)), g = Math.round(mix(x >> 8 & 255, y >> 8 & 255, t)), bl = Math.round(mix(x & 255, y & 255, t));
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }
  function bandHex(key, slot, f) { f = clamp(f, 0, 5); var lo = Math.floor(f), hi = Math.min(5, lo + 1), t = f - lo; var a = M.bands[lo][key], b = M.bands[hi][key]; return hexMix(slot == null ? a : a[slot], slot == null ? b : b[slot], t * t * (3 - 2 * t)); }
  function bandOfFeet(ft) { var e = M.bandEdges, b = 0; for (var i = 0; i < e.length; i++) if (ft >= e[i]) b = i + 1; return b; }

  /* ---------- data ---------- */
  function loadJSON(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(url + " " + r.status); return r.json(); }); }
  function loadHeights(info) {
    return fetch("data/height.webp").then(function (r) { if (!r.ok) throw new Error("height.webp " + r.status); return r.blob(); })
      .then(function (blob) {
        if (window.createImageBitmap) return createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
        return new Promise(function (res, rej) { var img = new Image(); img.onload = function () { res(img); }; img.onerror = rej; img.src = URL.createObjectURL(blob); });
      })
      .then(function (img) {
        var c = document.createElement("canvas"); c.width = info.w; c.height = info.h;
        var x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0);
        var d = x.getImageData(0, 0, info.w, info.h).data, out = new Float32Array(info.w * info.h);
        for (var i = 0; i < out.length; i++) out[i] = (d[i * 4] * 256 + d[i * 4 + 1]) * info.step + info.lo;
        return out;
      });
  }

  /* Sheet pixel <-> world. Pixel centres sit at (i + 0.5) / w of the 0..1 sheet. */
  function pxToX(px) { return ((px + 0.5) / sheet.w - 0.5) * sheet.W; }
  function pyToZ(py) { return ((py + 0.5) / sheet.h - 0.5) * sheet.D; }
  function uToX(u) { return (u - 0.5) * sheet.W; }
  function vToZ(v) { return (v - 0.5) * sheet.D; }
  function sheetHeight(px, py) {
    var w = sheet.w, h = sheet.h; px = clamp(px, 0, w - 1); py = clamp(py, 0, h - 1);
    var x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1), fx = px - x0, fy = py - y0;
    var a = heights[y0 * w + x0], b = heights[y0 * w + x1], c = heights[y1 * w + x0], d = heights[y1 * w + x1];
    return mix(mix(a, b, fx), mix(c, d, fx), fy);
  }
  /* Height of the rendered mesh itself (same triangles), so the road and the camera sit on what is drawn. */
  function groundAt(x, z) {
    var gi = clamp(((x / sheet.W + 0.5) * sheet.w - 0.5) / (sheet.w - 1) * grid.nx, 0, grid.nx - 1e-6);
    var gj = clamp(((z / sheet.D + 0.5) * sheet.h - 0.5) / (sheet.h - 1) * grid.nz, 0, grid.nz - 1e-6);
    var i = Math.floor(gi), j = Math.floor(gj), fx = gi - i, fy = gj - j, row = grid.nx + 1, H = grid.y;
    var a = H[j * row + i], b = H[j * row + i + 1], c = H[(j + 1) * row + i], d = H[(j + 1) * row + i + 1];
    if (fx + fy <= 1) return a + (b - a) * fx + (c - a) * fy;
    return d + (c - d) * (1 - fx) + (b - d) * (1 - fy);
  }

  /* ---------- terrain ---------- */
  function buildTerrain() {
    var nx = phone ? 256 : 384, nz = Math.round(nx * (sheet.h - 1) / (sheet.w - 1)), row = nx + 1, count = row * (nz + 1);
    var pos = new Float32Array(count * 3), col = new Float32Array(count * 3), ys = new Float32Array(count);
    for (var j = 0; j <= nz; j++) for (var i = 0; i <= nx; i++) {
      var k = j * row + i, px = i * (sheet.w - 1) / nx, py = j * (sheet.h - 1) / nz, y = sheetHeight(px, py) * VERTICAL_EXAGGERATION;
      pos[k * 3] = pxToX(px); pos[k * 3 + 1] = y; pos[k * 3 + 2] = pyToZ(py); ys[k] = y;
    }
    grid = { nx: nx, nz: nz, y: ys };
    var idx = new Uint32Array(nx * nz * 6), n = 0;
    for (j = 0; j < nz; j++) for (i = 0; i < nx; i++) {
      var a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      idx[n++] = a; idx[n++] = c; idx[n++] = b; idx[n++] = b; idx[n++] = c; idx[n++] = d;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    var nor = geo.getAttribute("normal").array;
    /* Six communities by elevation, edges blended over about 150 ft; steep slopes lean to the darker ridge tone. */
    var lit = M.bands.map(function (b) { return new THREE.Color(b.ridge[0]); });
    var shade = M.bands.map(function (b) { return new THREE.Color(b.ridge[1]); });
    var tmpA = new THREE.Color(), tmpB = new THREE.Color(), half = M.bandBlendFt / 2;
    for (k = 0; k < count; k++) {
      var ft = ys[k] / VERTICAL_EXAGGERATION * FT;
      tmpA.copy(lit[0]); tmpB.copy(shade[0]);
      for (var e = 0; e < M.bandEdges.length; e++) {
        var t = smooth(M.bandEdges[e] - half, M.bandEdges[e] + half, ft);
        if (t > 0) { tmpA.lerp(lit[e + 1], t); tmpB.lerp(shade[e + 1], t); }
      }
      var steep = clamp((1 - nor[k * 3 + 1]) * 1.6, 0, 0.55);
      tmpA.lerp(tmpB, steep);
      col[k * 3] = tmpA.r; col[k * 3 + 1] = tmpA.g; col[k * 3 + 2] = tmpA.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    var mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  /* ---------- the road ---------- */
  function buildRoute(data) {
    var n = data.mi.length, x = new Float32Array(n), z = new Float32Array(n), y = new Float32Array(n), s = new Float32Array(n);
    var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, sumY = 0;
    for (var i = 0; i < n; i++) {
      x[i] = uToX(data.u[i]); z[i] = vToZ(data.v[i]); s[i] = data.mi[i] * MILE;
      y[i] = Math.max(groundAt(x[i], z[i]), data.ft[i] / FT * VERTICAL_EXAGGERATION);
      minX = Math.min(minX, x[i]); maxX = Math.max(maxX, x[i]); minZ = Math.min(minZ, z[i]); maxZ = Math.max(maxZ, z[i]); sumY += y[i];
    }
    route = { n: n, x: x, z: z, y: y, s: s, box: { minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ, y: sumY / n } };
  }
  function buildRoad() {
    var r = route, n = r.n, pos = new Float32Array(n * 6), lat = new Float32Array(n * 6), side = new Float32Array(n * 2), dist = new Float32Array(n * 2);
    var half = ROAD_WIDTH / 2;
    for (var i = 0; i < n; i++) {
      var a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), dx = r.x[b] - r.x[a], dz = r.z[b] - r.z[a], L = Math.hypot(dx, dz) || 1;
      var lx = -dz / L, lz = dx / L;
      for (var sdx = 0; sdx < 2; sdx++) {
        var sg = sdx ? 1 : -1, v = i * 2 + sdx, ex = r.x[i] + lx * sg * half, ez = r.z[i] + lz * sg * half;
        pos[v * 3] = r.x[i]; pos[v * 3 + 1] = Math.max(groundAt(ex, ez), r.y[i]) + 3; pos[v * 3 + 2] = r.z[i];
        lat[v * 3] = lx; lat[v * 3 + 1] = 0; lat[v * 3 + 2] = lz; side[v] = sg; dist[v] = r.s[i];
      }
    }
    var idx = [];
    for (i = 0; i < n - 1; i++) { var p = i * 2; idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3); }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("lateral", new THREE.BufferAttribute(lat, 3));
    geo.setAttribute("side", new THREE.BufferAttribute(side, 1));
    geo.setAttribute("dist", new THREE.BufferAttribute(dist, 1));
    geo.setIndex(idx);
    roadMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uColor: { value: new THREE.Color(ROAD_COLOR) }, uHalf: { value: half }, uLift: { value: 0 }, uDriven: { value: 0 }, uDim: { value: 0.32 }
      }]),
      vertexShader: [
        "attribute vec3 lateral; attribute float side; attribute float dist;",
        "uniform float uHalf; uniform float uLift; varying float vDist; varying float vSide;",
        "#include <fog_pars_vertex>",
        "void main(){",
        "  vec3 p = position + lateral * side * uHalf + vec3(0.0, uLift, 0.0);",
        "  vDist = dist; vSide = side;",
        "  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);",
        "  gl_Position = projectionMatrix * mvPosition;",
        "  #include <fog_vertex>",
        "}"].join("\n"),
      fragmentShader: [
        "uniform vec3 uColor; uniform float uDriven; uniform float uDim; varying float vDist; varying float vSide;",
        "#include <fog_pars_fragment>",
        "void main(){",
        "  float driven = 1.0 - smoothstep(uDriven - 25.0, uDriven + 25.0, vDist);",
        "  float edge = 1.0 - smoothstep(0.55, 1.0, abs(vSide));",
        "  vec3 c = uColor * mix(0.62, 1.15, driven);",
        "  gl_FragColor = vec4(c, mix(uDim, 1.0, driven) * (0.55 + 0.45 * edge));",
        "  #include <colorspace_fragment>",
        "  #include <fog_fragment>",
        "}"].join("\n"),
      fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
    });
    var mesh = new THREE.Mesh(geo, roadMat);
    mesh.frustumCulled = false; mesh.renderOrder = 2;
    scene.add(mesh);
  }

  /* ---------- plants: one stylized, faceted set, placed by band, seeded. Drawn, not surveyed. ---------- */
  function merge(parts) {
    var list = parts.map(function (g) { var o = g.index ? g.toNonIndexed() : g; o.userData.shade = g.userData.shade; return o; }), total = 0;
    list.forEach(function (g) { total += g.getAttribute("position").count; });
    var pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3), o = 0;
    list.forEach(function (g) {
      var n = g.getAttribute("position").count, sh = g.userData.shade || [1, 1, 1];
      pos.set(g.getAttribute("position").array, o * 3); nor.set(g.getAttribute("normal").array, o * 3);
      for (var i = 0; i < n; i++) { col[(o + i) * 3] = sh[0]; col[(o + i) * 3 + 1] = sh[1]; col[(o + i) * 3 + 2] = sh[2]; }
      o += n;
    });
    var out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3)); out.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); out.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return out;
  }
  /* a piece of a plant: optional squash, tilt, then where it sits; shade multiplies the plant's own colour (bark, stalks) */
  function part(geo, x, y, z, o) {
    o = o || {};
    if (o.sc) geo.scale(o.sc[0], o.sc[1], o.sc[2]);
    if (o.rz) geo.rotateZ(o.rz);
    if (o.ry) geo.rotateY(o.ry);
    geo.translate(x, y, z); if (o.shade) geo.userData.shade = o.shade;
    return geo;
  }
  function shapes() {
    var C = THREE.CylinderGeometry, K = THREE.ConeGeometry, I = THREE.IcosahedronGeometry, TAU = Math.PI * 2;
    var BARK = [1.25, .72, .6], PALE = [1.5, 1.35, 2.3], STRAW = [1.5, 1.25, .8];
    function ring(n, make) { var out = []; for (var i = 0; i < n; i++) out.push(make(i, i / n * TAU)); return out; }
    function arm(side, reach, base, len) {
      return [part(new C(.042, .042, reach, 6), side * (reach / 2 + .03), base, 0, { rz: Math.PI / 2 }),
        part(new C(.04, .044, len, 6), side * (reach + .03), base + len / 2, 0), part(new I(.04, 1), side * (reach + .03), base + len, 0)];
    }
    return {
      saguaro: merge([part(new C(.058, .066, .94, 7), 0, .47, 0), part(new I(.058, 1), 0, .94, 0)].concat(arm(1, .15, .42, .34), arm(-1, .12, .55, .22))),
      spear: merge([part(new C(.07, .085, .9, 7), 0, .45, 0), part(new I(.07, 1), 0, .9, 0)]),
      ocotillo: merge(ring(9, function (i, a) { var g = new C(.014, .034, 1, 4); g.translate(0, .5, 0); return part(g, 0, 0, 0, { rz: .16 + (i % 3) * .13, ry: a }); })),
      sotol: merge(ring(12, function (i, a) { var g = new K(.03, .42, 3); g.translate(0, .21, 0); return part(g, 0, .04, 0, { rz: .35 + (i % 3) * .38, ry: a }); })
        .concat([part(new C(.012, .02, .95, 4), 0, .5, 0, { shade: STRAW }), part(new C(.03, .014, .32, 5), 0, .9, 0, { shade: STRAW })])),
      grass: merge(ring(6, function (i, a) { var g = new K(.1, 1, 3); g.translate(0, .5, 0); return part(g, 0, 0, 0, { rz: .1 + (i % 3) * .22, ry: a }); })),
      shrub: merge([part(new I(.5, 0), 0, .3, 0, { sc: [1, .62, 1] }), part(new I(.3, 0), .38, .22, .1, { sc: [1, .7, 1] })]),
      oak: merge([part(new C(.045, .075, .4, 5), 0, .2, 0, { shade: BARK }), part(new I(.36, 0), 0, .62, 0, { sc: [1.2, .8, 1.2] }),
        part(new I(.27, 0), .3, .5, .1, { sc: [1.1, .8, 1.1] }), part(new I(.25, 0), -.24, .52, -.18, { sc: [1.1, .8, 1.1] })]),
      pine: merge([part(new C(.026, .044, .6, 5), 0, .3, 0, { shade: BARK }), part(new K(.2, .34, 7), 0, .62, 0), part(new K(.16, .3, 7), 0, .8, 0), part(new K(.1, .26, 7), 0, .95, 0)]),
      fir: merge([part(new C(.02, .03, .2, 5), 0, .1, 0, { shade: BARK }), part(new K(.175, .34, 7), 0, .3, 0), part(new K(.14, .32, 7), 0, .5, 0), part(new K(.105, .3, 7), 0, .69, 0), part(new K(.07, .3, 7), 0, .88, 0)]),
      aspen: merge([part(new C(.016, .024, .66, 5), 0, .33, 0, { shade: PALE }), part(new I(.2, 0), 0, .74, 0, { sc: [.85, 1.35, .85] }), part(new I(.13, 0), .1, .56, .05, { sc: [1, 1.1, 1] })])
    };
  }
  /* height in metres before PLANT_SCALE, and the drawn colour */
  var SPECIES = {
    saguaro: [10, "#6f8f58"], spear: [4.5, "#6f8f58"], ocotillo: [5, "#8c8f63"], sotol: [3.6, "#93a585"], grass: [2.2, "#d3bd74"], shrub: [2.6, "#8a8c57"],
    oak: [9, "#5d7446"], pine: [24, "#47683f"], fir: [26, "#355a45"], aspen: [17, "#a9bd5c"]
  };
  /* how thickly each band is planted (share of tries kept), then what grows there */
  var COVER = [.95, 1, .9, .9, 1, 1];
  function pick(band, r) {
    if (band === 0) return r < .15 ? "saguaro" : r < .21 ? "spear" : r < .36 ? "ocotillo" : "shrub";
    if (band === 1) return r < .18 ? "sotol" : r < .26 ? "ocotillo" : r < .8 ? "grass" : "shrub";
    if (band === 2) return r < .5 ? "oak" : r < .56 ? "sotol" : r < .9 ? "grass" : "shrub";
    if (band === 3) return r < .42 ? "oak" : r < .84 ? "pine" : "grass";
    if (band === 4) return r < .86 ? "pine" : r < .95 ? "oak" : "grass";
    return r < .1 ? "aspen" : (r < .34 ? "pine" : "fir");
  }
  function buildPlants() {
    var target = phone ? 6000 : 12000, rand = rng(27), r = route, cell = 60, roadGrid = {};
    for (var i = 0; i < r.n; i++) { var key = Math.floor(r.x[i] / cell) + "," + Math.floor(r.z[i] / cell); (roadGrid[key] = roadGrid[key] || []).push(i); }
    function nearRoad(x, z) {
      var cx = Math.floor(x / cell), cz = Math.floor(z / cell);
      for (var a = -1; a <= 1; a++) for (var b = -1; b <= 1; b++) { var l = roadGrid[(cx + a) + "," + (cz + b)]; if (!l) continue; for (var q = 0; q < l.length; q++) { if (Math.hypot(r.x[l[q]] - x, r.z[l[q]] - z) < 30) return true; } }
      return false;
    }
    var picks = {}, placed = 0, tries = 0;
    Object.keys(SPECIES).forEach(function (sp) { picks[sp] = []; });
    while (placed < target && tries < target * 6) {
      tries++;
      var k = Math.floor(rand() * (r.n - 1)), a2 = Math.max(0, k - 1), b2 = Math.min(r.n - 1, k + 1), dx = r.x[b2] - r.x[a2], dz = r.z[b2] - r.z[a2], L = Math.hypot(dx, dz) || 1;
      var sg = rand() < .5 ? -1 : 1, d = 34 + 400 * Math.pow(rand(), 1.3), along = (rand() - .5) * 40;
      var x = r.x[k] + (-dz / L) * sg * d + dx / L * along, z = r.z[k] + (dx / L) * sg * d + dz / L * along;
      if (Math.abs(x) > sheet.W / 2 - 50 || Math.abs(z) > sheet.D / 2 - 50 || nearRoad(x, z)) continue;
      var y = groundAt(x, z), ft = y / VERTICAL_EXAGGERATION * FT, band = bandOfFeet(ft), keep = rand(), sp = pick(band, rand());
      if (keep > COVER[band]) continue;
      if ((sp === "saguaro" || sp === "spear") && ft >= 4000) continue;
      if ((sp === "pine" || sp === "fir" || sp === "aspen") && ft < 6000) continue;
      picks[sp].push({ x: x, y: y - 0.4, z: z, s: SPECIES[sp][0] * PLANT_SCALE * (0.7 + rand() * 0.6), rot: rand() * Math.PI * 2, tone: 0.86 + rand() * 0.28 });
      placed++;
      /* shrubs and grass grow in patches: a few more of the same close by */
      if (sp === "grass" || sp === "shrub") for (var extra = (sp === "grass" ? 6 : 2) + Math.floor(rand() * (sp === "grass" ? 6 : 4)), spread = sp === "grass" ? 70 : 46; extra > 0; extra--) {
        var ex = x + (rand() - .5) * spread, ez = z + (rand() - .5) * spread;
        if (nearRoad(ex, ez)) continue;
        picks[sp].push({ x: ex, y: groundAt(ex, ez) - 0.4, z: ez, s: SPECIES[sp][0] * PLANT_SCALE * (0.6 + rand() * 0.6), rot: rand() * Math.PI * 2, tone: 0.86 + rand() * 0.28 });
      }
    }
    /* the grassland gets its own pass: tufts scattered thickly beside every stretch of road between 4,000 and 6,000 feet */
    var perSample = phone ? 26 : 60;
    for (i = 1; i < r.n - 1; i++) {
      var rf = r.y[i] * FT; if (rf < 3900 || rf > 6100) continue;
      var tx = r.x[i + 1] - r.x[i - 1], tz = r.z[i + 1] - r.z[i - 1], tl = Math.hypot(tx, tz) || 1;
      for (var g = 0; g < perSample; g++) {
        var gd = (rand() < .5 ? -1 : 1) * (32 + 420 * Math.pow(rand(), 1.5)), ga = (rand() - .5) * 44;
        var gx = r.x[i] - tz / tl * gd + tx / tl * ga, gz = r.z[i] + tx / tl * gd + tz / tl * ga, gy = groundAt(gx, gz), gf = gy * FT;
        if (gf < 4000 || gf >= 6000 || nearRoad(gx, gz)) continue;
        if (gf >= 5000 && rand() < .45) continue;
        picks.grass.push({ x: gx, y: gy - 0.4, z: gz, s: SPECIES.grass[0] * PLANT_SCALE * (0.55 + rand() * 0.8), rot: rand() * Math.PI * 2, tone: 0.78 + rand() * 0.42 });
      }
    }
    var geos = shapes(), mat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true });
    var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    plantGroup = new THREE.Group();
    Object.keys(picks).forEach(function (sp) {
      var list = picks[sp]; if (!list.length) return;
      var mesh = new THREE.InstancedMesh(geos[sp], mat, list.length);
      list.forEach(function (p, idx) {
        e.set(0, p.rot, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.s, p.s, p.s)); mesh.setMatrixAt(idx, m4);
        c.set(SPECIES[sp][1]).multiplyScalar(p.tone); mesh.setColorAt(idx, c);
      });
      mesh.frustumCulled = false; plantGroup.add(mesh);
    });
    scene.add(plantGroup);
  }

  /* ---------- camera ---------- */
  /* The camera does not copy every bend of the road. It rides a rail worked out once from the road:
     a lightly smoothed position, a heading whose turning is spread over about a mile, and a height that
     clears the ground. Hairpins become one slow pan instead of a whip. */
  var RAIL_POS = 120, RAIL_YAW = 700, RAIL_Y = 200, rail = null;
  function gauss(arr, sigma) {
    var s = route.s, n = route.n, out = new Float32Array(n), lo = 0, hi = 0;
    for (var i = 0; i < n; i++) {
      while (s[i] - s[lo] > 3 * sigma) lo++;
      while (hi < n - 1 && s[hi + 1] - s[i] <= 3 * sigma) hi++;
      var a = 0, w = 0;
      for (var j = lo; j <= hi; j++) { var d = (s[j] - s[i]) / sigma, g = Math.exp(-0.5 * d * d); a += arr[j] * g; w += g; }
      out[i] = a / w;
    }
    return out;
  }
  function sees(ax, ay, az, bx, by, bz) {
    for (var k = 1; k < 16; k++) { var f = k / 16; if (mix(ay, by + 6, f) < groundAt(mix(ax, bx, f), mix(az, bz, f)) + 3) return false; }
    return true;
  }
  function buildRail() {
    var r = route, n = r.n, i, tx = new Float32Array(n), tz = new Float32Array(n), raw = new Float32Array(n);
    for (i = 0; i < n; i++) { var a = Math.min(n - 1, i + 1), b = Math.max(0, i - 1); tx[i] = r.x[a] - r.x[b]; tz[i] = r.z[a] - r.z[b]; }
    tx = gauss(tx, 60); tz = gauss(tz, 60);
    for (i = 0; i < n; i++) {
      var y = Math.atan2(tz[i], tx[i]);
      if (i) { while (y - raw[i - 1] > Math.PI) y -= 2 * Math.PI; while (y - raw[i - 1] < -Math.PI) y += 2 * Math.PI; }
      raw[i] = y;
    }
    var yaw = gauss(raw, RAIL_YAW), px = gauss(r.x, RAIL_POS), pz = gauss(r.z, RAIL_POS), ry = gauss(r.y, RAIL_Y);
    var cx = new Float32Array(n), cz = new Float32Array(n), cy = new Float32Array(n), lean = new Float32Array(n);
    for (i = 0; i < n; i++) {
      cx[i] = px[i] - Math.cos(yaw[i]) * CAM_BEHIND; cz[i] = pz[i] - Math.sin(yaw[i]) * CAM_BEHIND;
      /* how far the road 240 m on sits to one side of the heading; the view leans part of the way toward it */
      var q = Math.min(n - 1, i + 6), off = Math.atan2(r.z[q] - cz[i], r.x[q] - cx[i]) - yaw[i];
      while (off > Math.PI) off -= 2 * Math.PI; while (off < -Math.PI) off += 2 * Math.PI; lean[i] = off;
      cy[i] = Math.max(groundAt(cx[i], cz[i]) + CAM_ABOVE, r.y[i] + CAM_ABOVE * 0.7);
      /* climb until the road here and 320 m on can be seen over the ground in between */
      var ahead = Math.min(n - 1, i + 8), lift = 0;
      while (lift < 450 && !(sees(cx[i], cy[i] + lift, cz[i], r.x[i], r.y[i], r.z[i]) && sees(cx[i], cy[i] + lift, cz[i], r.x[ahead], r.y[ahead], r.z[ahead]))) lift += 15;
      cy[i] += lift;
    }
    /* hold the high points for a while either side, then round them off, so the height never bobs */
    var held = new Float32Array(n);
    for (i = 0; i < n; i++) { var m = cy[i]; for (var j = Math.max(0, i - 5); j <= Math.min(n - 1, i + 5); j++) if (cy[j] > m) m = cy[j]; held[i] = m; }
    lean = gauss(lean, 250);
    for (i = 0; i < n; i++) lean[i] = yaw[i] + 0.6 * lean[i];
    rail = { cx: cx, cz: cz, cy: gauss(held, RAIL_Y), yaw: lean, ry: ry };
  }
  function railAt(arr, dist) {
    var s = route.s, n = route.n;
    if (dist <= 0) return arr[0];
    if (dist >= s[n - 1]) return arr[n - 1];
    var lo = 0, hi = n - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (s[mid] <= dist) lo = mid; else hi = mid; }
    return mix(arr[lo], arr[hi], (dist - s[lo]) / Math.max(1e-6, s[hi] - s[lo]));
  }
  function drivePose(outP, outT) {
    var s = sm.v[0] * MILE, look = sm.v[1];
    var cx = railAt(rail.cx, s), cy = railAt(rail.cy, s), cz = railAt(rail.cz, s), yaw = railAt(rail.yaw, s);
    /* tilt toward the road a little way on, so a camera lifted over a ridge still looks down at it */
    var far = CAM_BEHIND + CAM_AHEAD, pitch = Math.atan2(railAt(rail.ry, s + 200) + 12 - cy, CAM_BEHIND + 200);
    if (look < 0.001) lookSign = (Math.cos(yaw) * (basin[1] - cz) - Math.sin(yaw) * (basin[0] - cx)) >= 0 ? 1 : -1;
    else { yaw += lookSign * look * Math.PI; pitch = mix(pitch, -0.14, look); far = mix(far, 2400, look); }
    outP[0] = cx; outP[1] = cy; outP[2] = cz;
    outT[0] = cx + Math.cos(yaw) * Math.cos(pitch) * far; outT[1] = cy + Math.sin(pitch) * far; outT[2] = cz + Math.sin(yaw) * Math.cos(pitch) * far;
  }
  function computeOverview() {
    var b = route.box, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    /* a narrow (portrait) screen needs the camera further back to keep the whole road in frame */
    var k = Math.max(1, 0.9 / Math.max(0.3, camera.aspect));
    var dir = [-0.55, 0, 0.84], dist = span * 1.0 * k;
    overviewPose = { p: [cx + dir[0] * dist, b.y + span * 0.55 * k, cz + dir[2] * dist], t: [cx, b.y - 150 - span * 0.2 * (k - 1), cz - span * 0.04] };
  }
  function damp(cur, vel, target, i, dt) {
    var omega = 2 / SMOOTH_TIME, x = omega * dt, ex = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    var change = cur[i] - target[i], temp = (vel[i] + omega * change) * dt;
    vel[i] = (vel[i] - omega * temp) * ex; cur[i] = target[i] + (change + temp) * ex;
  }
  /* What gets eased is the place on the road, the look-back and the pull-back, never the camera in space,
     so the camera always stays on its rail. */
  var sm = { v: [0, 0, 0], vel: [0, 0, 0] }, want = [0, 0, 0], dp = [0, 0, 0], dt3 = [0, 0, 0];
  function updateCamera(dt) {
    var i, moving = false;
    want[0] = S.mile; want[1] = S.lookback; want[2] = S.overview;
    /* a long jump (a stop button, a tap far along the profile) cuts to the new view */
    if (Math.abs(want[0] - sm.v[0]) > JUMP_MILES) snapNext = true;
    if (snapNext || reduce) { for (i = 0; i < 3; i++) { sm.v[i] = want[i]; sm.vel[i] = 0; } snapNext = false; }
    else for (i = 0; i < 3; i++) {
      damp(sm.v, sm.vel, want, i, dt);
      if (Math.abs(sm.v[i] - want[i]) > 0.0004 || Math.abs(sm.vel[i]) > 0.0004) moving = true; else { sm.v[i] = want[i]; sm.vel[i] = 0; }
    }
    drivePose(dp, dt3);
    var ov = smooth(0, 1, sm.v[2]);
    if (ov > 0) for (i = 0; i < 3; i++) { dp[i] = mix(dp[i], overviewPose.p[i], ov); dt3[i] = mix(dt3[i], overviewPose.t[i], ov); }
    var floor = groundAt(dp[0], dp[2]) + CAM_FLOOR;
    if (dp[1] < floor) dp[1] = floor;
    camera.position.set(dp[0], dp[1], dp[2]);
    camera.lookAt(dt3[0], dt3[1], dt3[2]);
    /* depth precision follows the shot: close and fine on the road, far and coarse in the overview */
    var near = mix(6, 120, ov), far = mix(60000, 160000, ov);
    if (camera.near !== near || camera.far !== far) { camera.near = near; camera.far = far; camera.updateProjectionMatrix(); }
    roadMat.uniforms.uDriven.value = sm.v[0] * MILE;
    /* the line only thickens once the camera is well clear of the road */
    var wide = smooth(0.45, 0.95, ov);
    roadMat.uniforms.uHalf.value = mix(ROAD_WIDTH, ROAD_WIDTH_OVERVIEW, wide) / 2;
    roadMat.uniforms.uLift.value = wide * 40;
    plantGroup.visible = ov < 0.6;
    fog.near = mix(5000, 38000, ov); fog.far = mix(42000, 130000, ov);
    updateSky(ov);
    return moving;
  }
  function updateSky(ov) {
    var ft = M.feetAt(sm.v[0]), f = clamp((ft - 3500) / 1000, 0, 5);
    f = mix(f, 4, ov);
    var top = bandHex("sky", 0, f), bottom = bandHex("sky", 1, f), key = top + bottom;
    if (key === lastSky) return;
    lastSky = key;
    stage.style.setProperty("--sky-top", top); stage.style.setProperty("--sky-bottom", bottom);
    fog.color.set(hexMix(top, bottom, 0.6));
    hemi.color.set(hexMix(top, "#ffffff", 0.75)); hemi.groundColor.set(bandHex("ridge", 1, f));
  }

  /* ---------- loop ---------- */
  function frame(ts) {
    raf = 0;
    var dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 1 / 60; lastTs = ts;
    var moving = updateCamera(dt);
    renderer.render(scene, camera);
    if (moving && visible) raf = requestAnimationFrame(frame); else lastTs = 0;
  }
  function invalidate() { if (ready && visible && !raf) raf = requestAnimationFrame(frame); }
  function resize() {
    if (!ready) return;
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h); camera.fov = w < h ? 62 : 48;
    /* on a tall screen the copy sits low, so the road is framed in the upper part of the view */
    if (w < h) camera.setViewOffset(w, h, 0, Math.round(h * 0.2), w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    computeOverview();
    invalidate();
  }
  function fail(err) {
    failed = true; ready = false;
    document.documentElement.classList.add("no-gl");
    if (window.console) console.warn("3D view unavailable; the story continues without it.", err);
  }

  function init(routeData) {
    stage = document.querySelector(".stage"); canvas = document.querySelector(".landscape");
    if (!canvas || !routeData) { fail(new Error("route data missing")); return Promise.resolve(); }
    document.addEventListener("visibilitychange", function () {
      visible = !document.hidden;
      if (!visible && raf) { cancelAnimationFrame(raf); raf = 0; lastTs = 0; } else invalidate();
    });
    return Promise.all([import("./vendor/three.module.min.js"), loadJSON("data/meta.json")])
      .then(function (res) {
        THREE = res[0]; sheet = res[1].sheet;
        sheet.W = sheet.w * sheet.metersPerPixel; sheet.D = sheet.h * sheet.metersPerPixel;
        return loadHeights(sheet);
      })
      .then(function (h) {
        heights = h;
        renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
        renderer.setClearColor(0x000000, 0);
        canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); fail(new Error("WebGL context lost")); });
        scene = new THREE.Scene();
        fog = new THREE.Fog(0xd15d47, 2500, 30000); scene.fog = fog;
        camera = new THREE.PerspectiveCamera(48, 1, 6, 60000);
        hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 1.1); scene.add(hemi);
        sunLight = new THREE.DirectionalLight(0xfff1dc, 3.2); sunLight.position.set(-0.75, 0.9, 0.55); scene.add(sunLight);
        buildTerrain(); buildRoute(routeData); buildRail(); buildRoad(); buildPlants();
        basin = [uToX(0.15), vToZ(0.85)];
        ready = true; snapNext = true; visible = !document.hidden;
        resize();
        window.addEventListener("resize", resize, { passive: true });
        document.documentElement.classList.add("gl-ready");
      })
      .catch(fail);
  }
  function setState(next) {
    var changed = false;
    for (var k in next) if (S[k] !== next[k]) { S[k] = next[k]; changed = true; }
    if (changed) invalidate();
  }
  function setReduce(v) { reduce = v; invalidate(); }
  return { init: init, setState: setState, render: invalidate, resize: resize, setReduce: setReduce };
})();

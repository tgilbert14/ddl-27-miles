window.M27 = {
  bands: [
    { name: "Sonoran Desertscrub", sky: ["#f7a260", "#d15d47"], ridge: ["#a83e34", "#5f292d"], flora: "#173f38", accent: "#ffd07a" },
    { name: "Semidesert Grassland", sky: ["#d9aa68", "#8b8b68"], ridge: ["#7d6948", "#3f5548"], flora: "#243f34", accent: "#e8d087" },
    { name: "Madrean Oak Woodland", sky: ["#97a984", "#58756b"], ridge: ["#496b56", "#253f3b"], flora: "#152e2c", accent: "#a9d09a" },
    { name: "Pine-Oak Woodland", sky: ["#789ca3", "#436476"], ridge: ["#385c5c", "#1f3942"], flora: "#102c30", accent: "#9ed0cc" },
    { name: "Ponderosa Pine Forest", sky: ["#557c91", "#29495b"], ridge: ["#244e50", "#152f39"], flora: "#0d272b", accent: "#b9d6b3" },
    { name: "Mixed-Conifer Forest", sky: ["#294361", "#101f38"], ridge: ["#183746", "#091d29"], flora: "#061a23", accent: "#bfe1ff" }
  ],
  /* Band edges in feet. The bands are drawn at fixed elevations; real boundaries move. */
  bandEdges: [4000, 5000, 6000, 7000, 8000],
  bandBlendFt: 150,
  /* Measured stops on the road (route.json), at the sample where the printed elevation is read.
     `tick` marks the seven stops on the profile. */
  stops: [
    { id: "top", mile: 0, ft: 2860, name: "Highway start" },
    { id: "zone-1", mile: 2.635, ft: 3579, name: "Babad Do'ag", tick: true },
    { id: "zone-2", mile: 5.617, ft: 4368, name: "Molino Basin", tick: true },
    { id: "zone-3", mile: 9.122, ft: 5337, name: "Seven Cataracts", tick: true },
    { id: "zone-4", mile: 13.919, ft: 6575, name: "Windy Point", tick: true },
    { id: "zone-5", mile: 16.976, ft: 7229, name: "Rose Canyon", tick: true },
    { id: "zone-6", mile: 19.61, ft: 7947, name: "Palisades", tick: true },
    { id: "dip", mile: 22.518, ft: 7734, name: "below Summerhaven" },
    { id: "summit", mile: 28.06, ft: 9148, name: "Summit", tick: true }
  ],
  /* Used only if data/route.json cannot be loaded: the measured stops plus crest, dip and Ski Run Road. */
  coarseProfile: [[0, 2860], [2.6, 3579], [5.6, 4368], [9.1, 5337], [13.9, 6575], [17.0, 7229], [19.6, 7947], [20.43, 8180], [22.52, 7734], [24.63, 7863], [28.06, 9148]],
  route: null,
  miles: 28.06,
  summitElevation: 9157,
  baseElevation: 2700,
  baseTemperature: 100,
  lapseRate: 3.5,
  /* Road elevation in feet at a highway mile, interpolated between the 40 m samples. */
  feetAt: function (mile) {
    var r = this.route, mi, ft;
    if (r) { mi = r.mi; ft = r.ft; }
    else { mi = this.coarseProfile.map(function (p) { return p[0]; }); ft = this.coarseProfile.map(function (p) { return p[1]; }); }
    var n = mi.length, lo = 0, hi = n - 1;
    if (mile <= mi[0]) return ft[0];
    if (mile >= mi[hi]) return ft[hi];
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (mi[mid] <= mile) lo = mid; else hi = mid; }
    var t = (mile - mi[lo]) / Math.max(1e-9, mi[hi] - mi[lo]);
    return ft[lo] + (ft[hi] - ft[lo]) * t;
  },
  /* Modelled air temperature: 100°F at 2,700 ft, falling 3.5°F per 1,000 ft. */
  tempAt: function (ft) { return this.baseTemperature - ((ft - this.baseElevation) / 1000) * this.lapseRate; }
};

/**
 * Mountain Studio: deterministic concept geometry in metres, XY plans and Z-up.
 * No load, member capacity, seismic, wind response or code compliance analysis.
 * This module has no browser or rendering dependencies.
 */
export const SCHEMA_VERSION = 'mountain-studio/1';
export const SHAPE_OPTIONS = [
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'rounded_rectangle', label: 'Rounded rectangle' },
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'capsule', label: 'Capsule' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'hexagon', label: 'Hexagon' },
  { id: 'clover', label: 'Clover' },
  { id: 'custom', label: 'Draw a plan' }
];
export const STRUCTURE_OPTIONS = [
  { id: 'core_columns', label: 'Core + columns' },
  { id: 'diagrid', label: 'Diagrid' },
  { id: 'perimeter_x', label: 'Perimeter X bracing' }
];
export const TRUSS_OPTIONS = [
  { id: 'warren', label: 'Warren truss' }, { id: 'pratt', label: 'Pratt truss' },
  { id: 'howe', label: 'Howe truss' }, { id: 'vierendeel', label: 'Vierendeel frame' }
];
export const SITE = {
  width: 144.78, depth: 79.248,
  polygon: [[-72.39, -39.624], [72.39, -39.624], [72.39, 39.624], [-72.39, 39.624]],
  source: 'Supplied Rhino site boundary, translated to its local centre; no geographic rotation.'
};
export const DEFAULT_STATE = {
  schema: SCHEMA_VERSION,
  name: 'Mountain',
  shape: 'ellipse', width: 50, depth: 50,
  height: 276, storeys: 68, nonresidentialFloors: 44,
  podiumFloors: 4, podiumWidth: 90, podiumDepth: 60,
  podiumShape: 'rounded_rectangle', podiumCustomPlan: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]],
  publicSpace: { enabled: false, layout: 'open_plaza', lift: 6, courtyardRadius: 6 }, placement: { x: 0, y: 0 },
  vancouver: { podiumStepback: 0, stepDirection: 'front', rainCover: false, canopyDepth: 2.4, canopyHeight: 3.6, gallerySide: 'front' },
  coreWidth: 12, coreDepth: 12, coreWall: 0.6,
  slabThickness: 0.25, columnSpacing: 8, columnSection: 0.75,
  diagonalSection: 0.45, beamSection: 0.32,
  structure: 'core_columns', diagridModule: 4, perimeterNodes: 16,
  social: { enabled: false, typology: 'sky_bridge', separation: 48, deckWidth: 8, levels: [0.45, 0.72] },
  trussPattern: 'warren', megaFloors: { enabled: false, bands: 2, depthStoreys: 2, columnSection: 1.2 },
  landscape: { enabled: false, mode: 'level_terraces', width: 3, turns: 3, stepFloors: 3, thickness: 0.45, beamDepth: 0.8, beamWidth: 0.35, span: 120, supportType: 'beam', trussDepth: 1.2 },
  profile: [
    { t: 0, scaleX: 1, scaleY: 1, twist: 0 },
    { t: 0.35, scaleX: 1.08, scaleY: 1.04, twist: 0 },
    { t: 0.7, scaleX: 0.82, scaleY: 0.82, twist: 0 },
    { t: 1, scaleX: 0.62, scaleY: 0.62, twist: 0 }
  ],
  customPlan: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]
};

const copy = value => JSON.parse(JSON.stringify(value));
const EPS = 1e-7;
const TAU = Math.PI * 2;
const round = (v, places = 3) => Number(v.toFixed(places));
const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
const number = (value, fallback, low, high) => clamp(Number.isFinite(Number(value)) ? Number(value) : fallback, low, high);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const point3 = (p, z) => [p[0], p[1], z];

export const PRESETS = {
  vertical: { ...copy(DEFAULT_STATE), name: 'Vertical', shape: 'rounded_rectangle', width: 46, depth: 38,
    profile: [{ t: 0, scaleX: 1, scaleY: 1, twist: 0 }, { t: 0.35, scaleX: 1, scaleY: 1, twist: 0 }, { t: 0.7, scaleX: 1, scaleY: 1, twist: 0 }, { t: 1, scaleX: 1, scaleY: 1, twist: 0 }] },
  mountain: copy(DEFAULT_STATE),
  twisted: { ...copy(DEFAULT_STATE), name: 'Twisted', shape: 'rounded_rectangle', width: 48, depth: 38, structure: 'diagrid',
    profile: [{ t: 0, scaleX: 1, scaleY: 1, twist: 0 }, { t: 0.35, scaleX: 1.08, scaleY: 1.08, twist: 18 }, { t: 0.7, scaleX: 0.9, scaleY: 0.9, twist: 43 }, { t: 1, scaleX: 0.74, scaleY: 0.78, twist: 65 }] },
  diagrid: { ...copy(DEFAULT_STATE), name: 'Diagrid', shape: 'hexagon', width: 52, depth: 44, structure: 'diagrid',
    profile: [{ t: 0, scaleX: 1, scaleY: 1, twist: 0 }, { t: 0.35, scaleX: 1.06, scaleY: 1.06, twist: 0 }, { t: 0.7, scaleX: 0.91, scaleY: 0.91, twist: 6 }, { t: 1, scaleX: 0.76, scaleY: 0.76, twist: 12 }] },
  babel: { ...copy(DEFAULT_STATE), name: 'Babel · Spiral terraces', shape: 'ellipse', width: 52, depth: 44, structure: 'diagrid', coreWidth: 10, coreDepth: 10,
    publicSpace: { enabled: true, layout: 'courtyard', lift: 6, courtyardRadius: 6 },
    landscape: { enabled: true, mode: 'level_terraces', width: 3, turns: 3.25, stepFloors: 3, thickness: 0.45, beamDepth: 0.8, beamWidth: 0.35, span: 120 },
    profile: [{ t: 0, scaleX: 1.06, scaleY: 1.06, twist: 0 }, { t: 0.35, scaleX: 0.96, scaleY: 0.98, twist: 30 }, { t: 0.7, scaleX: 0.72, scaleY: 0.76, twist: 78 }, { t: 1, scaleX: 0.52, scaleY: 0.6, twist: 120 }] }
};

export const SOCIAL_TYPOLOGIES = [
  {id: 'sky_bridge', label: 'Sky-bridge pair'}, {id: 'sky_plaza', label: 'Sky-plaza cluster'},
  {id: 'vertical_campus', label: 'Vertical campus'}, {id: 'sky_outlook', label: 'Outlook-deck pair'}
];
// Editable architectural studies, not zoning envelopes or dimensional rules.
const vancouverProfile = [{t:0,scaleX:1,scaleY:1,twist:0},{t:.35,scaleX:1,scaleY:1,twist:0},{t:.7,scaleX:.94,scaleY:.94,twist:0},{t:1,scaleX:.88,scaleY:.88,twist:0}];
PRESETS.vancouver_point = {...copy(DEFAULT_STATE), name:'Vancouver · Point tower', shape:'rounded_rectangle', width:28, depth:26, height:252, storeys:64, coreWidth:8, coreDepth:8, columnSpacing:6, podiumWidth:90, podiumDepth:56, podiumShape:'rectangle', profile:copy(vancouverProfile)};
PRESETS.vancouver_civic = {...copy(DEFAULT_STATE), name:'Vancouver · Civic terraces', shape:'rounded_rectangle', width:44, depth:34, height:268, storeys:66, coreWidth:10, coreDepth:10, columnSpacing:6, podiumWidth:108, podiumDepth:68, podiumShape:'rectangle', profile:copy(vancouverProfile), publicSpace:{enabled:true,layout:'garden_islands',lift:6,courtyardRadius:6}, vancouver:{...copy(DEFAULT_STATE.vancouver),podiumStepback:7.5,rainCover:true}};
PRESETS.vancouver_waterfront = {...copy(DEFAULT_STATE), name:'Vancouver · Waterfront terraces', shape:'ellipse', width:46, depth:36, height:276, storeys:68, coreWidth:10, coreDepth:10, columnSpacing:6, podiumWidth:104, podiumDepth:64, podiumShape:'rounded_rectangle', profile:copy(vancouverProfile), publicSpace:{enabled:true,layout:'open_plaza',lift:6,courtyardRadius:6}, vancouver:{...copy(DEFAULT_STATE.vancouver),podiumStepback:10,rainCover:true}};
const clusterProfile = [{t:0,scaleX:1,scaleY:1,twist:0},{t:.35,scaleX:1,scaleY:1,twist:0},{t:.7,scaleX:.94,scaleY:.94,twist:4},{t:1,scaleX:.9,scaleY:.9,twist:8}];
for (const [id, label, count, width, spacing, deckWidth, levels] of [
  ['sky_bridge','Sky-bridge pair',2,28,48,8,[.45,.72]],
  ['sky_plaza','Sky-plaza cluster',3,26,42,12,[.55]],
  ['vertical_campus','Vertical campus',3,26,42,9,[.3,.65]],
  ['sky_outlook','Outlook-deck pair',2,30,50,14,[.86]]
]) PRESETS[id] = {...copy(DEFAULT_STATE), name: label, shape: id === 'sky_outlook' ? 'ellipse' : 'rounded_rectangle', width, depth: 30, coreWidth: 8, coreDepth: 8, columnSpacing: 6, podiumWidth: count === 3 ? 128 : 106, podiumDepth: 66, profile: copy(clusterProfile), publicSpace: {enabled:true,layout:'open_plaza',lift:6,courtyardRadius:6}, social:{enabled:true,typology:id,separation:spacing,deckWidth,levels}};

/** Normalize dimensions and control points; invalid custom plans remain invalid. */
export function normalizeState(input = {}) {
  const s = { ...copy(DEFAULT_STATE), ...copy(input) };
  if (!SHAPE_OPTIONS.some(x => x.id === s.shape)) s.shape = DEFAULT_STATE.shape;
  if (!SHAPE_OPTIONS.some(x => x.id === s.podiumShape)) s.podiumShape = DEFAULT_STATE.podiumShape;
  if (!STRUCTURE_OPTIONS.some(x => x.id === s.structure)) s.structure = DEFAULT_STATE.structure;
  if (!TRUSS_OPTIONS.some(x => x.id === s.trussPattern)) s.trussPattern = DEFAULT_STATE.trussPattern;
  const limits = {
    width: [18, 100], depth: [18, 90], height: [48, 400], storeys: [12, 100],
    podiumFloors: [0, 10], podiumWidth: [30, 140], podiumDepth: [24, 78], nonresidentialFloors: [0, 100],
    coreWidth: [4, 28], coreDepth: [4, 28], coreWall: [0.25, 1.5],
    slabThickness: [0.15, 0.65], columnSpacing: [4, 12], columnSection: [0.3, 1.8],
    diagonalSection: [0.2, 1.4], beamSection: [0.15, 1.2], diagridModule: [2, 8], perimeterNodes: [8, 32]
  };
  Object.entries(limits).forEach(([k, [lo, hi]]) => { s[k] = number(s[k], DEFAULT_STATE[k], lo, hi); });
  ['storeys', 'podiumFloors', 'diagridModule', 'nonresidentialFloors'].forEach(k => { s[k] = Math.round(s[k]); });
  s.podiumFloors = Math.min(s.podiumFloors, s.storeys - 2);
  s.nonresidentialFloors = Math.min(s.nonresidentialFloors, s.storeys);
  // A divisor of 64 preserves the same perimeter indices through every floor.
  s.perimeterNodes = [8, 16, 32].reduce((a, b) => Math.abs(b - s.perimeterNodes) < Math.abs(a - s.perimeterNodes) ? b : a, 16);
  s.coreWall = Math.min(s.coreWall, s.coreWidth / 4, s.coreDepth / 4);
  s.profile = normalizeProfile(input.profile ?? DEFAULT_STATE.profile);
  const landscape = { ...DEFAULT_STATE.landscape, ...(input.landscape || {}) };
  s.landscape = { enabled: Boolean(landscape.enabled), mode: 'level_terraces', width: number(landscape.width, 3, 1, 8), turns: number(landscape.turns, 3, 1, 6),
    stepFloors: Math.round(number(landscape.stepFloors, 3, 1, 8)), thickness: number(landscape.thickness, 0.45, 0.2, 1.2),
    beamDepth: number(landscape.beamDepth, 0.8, 0.3, 1.8), beamWidth: number(landscape.beamWidth, 0.35, 0.2, 0.8), span: number(landscape.span, 120, 60, 240),
    supportType: landscape.supportType === 'truss' ? 'truss' : 'beam', trussDepth: number(landscape.trussDepth, 1.2, 0.6, 3) };
  const mega = { ...DEFAULT_STATE.megaFloors, ...(input.megaFloors || {}) };
  s.megaFloors = { enabled: Boolean(mega.enabled), bands: Math.round(number(mega.bands, 2, 1, 4)), depthStoreys: Math.round(number(mega.depthStoreys, 2, 1, 3)), columnSection: number(mega.columnSection, 1.2, 0.6, 2.4) };
  const custom = input.customPlan ?? DEFAULT_STATE.customPlan;
  s.customPlan = Array.isArray(custom) ? custom.map(p => Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [NaN, NaN]) : [];
  const podiumCustom = input.podiumCustomPlan ?? DEFAULT_STATE.podiumCustomPlan;
  s.podiumCustomPlan = Array.isArray(podiumCustom) ? podiumCustom.map(p => Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [NaN, NaN]) : [];
  const publicSpace = { ...DEFAULT_STATE.publicSpace, ...(input.publicSpace || {}) };
  s.publicSpace = { enabled: Boolean(publicSpace.enabled), layout: ['open_plaza', 'courtyard', 'garden_islands'].includes(publicSpace.layout) ? publicSpace.layout : 'open_plaza',
    lift: number(publicSpace.lift, 6, 3, 12), courtyardRadius: number(publicSpace.courtyardRadius, 6, 2, 12) };
  const vancouver = {...DEFAULT_STATE.vancouver, ...(input.vancouver || {})};
  const sides = ['front','back','left','right'];
  s.vancouver = {podiumStepback:number(vancouver.podiumStepback,0,0,12),stepDirection:sides.includes(vancouver.stepDirection)?vancouver.stepDirection:'front',rainCover:Boolean(vancouver.rainCover),canopyDepth:number(vancouver.canopyDepth,2.4,1.2,6),canopyHeight:number(vancouver.canopyHeight,3.6,2.4,6),gallerySide:sides.includes(vancouver.gallerySide)?vancouver.gallerySide:'front'};
  s.placement = { x: number(input.placement?.x, 0, -SITE.width / 2, SITE.width / 2), y: number(input.placement?.y, 0, -SITE.depth / 2, SITE.depth / 2) };
  const social = { ...DEFAULT_STATE.social, ...(input.social || {}) };
  s.social = { enabled: Boolean(social.enabled), typology: ['sky_bridge', 'sky_plaza', 'vertical_campus', 'sky_outlook'].includes(social.typology) ? social.typology : 'sky_bridge', separation: number(social.separation, 48, 30, 64), deckWidth: number(social.deckWidth, 8, 3, 16), levels: (Array.isArray(social.levels) && social.levels.length ? social.levels : [0.45, 0.72]).slice(0, 3).map(t => number(t, .5, .15, .94)).sort((a, b) => a - b) };
  s.schema = SCHEMA_VERSION;
  s.name = String(s.name || 'Untitled tower').slice(0, 80);
  return s;
}

function normalizeProfile(profile) {
  const valid = (Array.isArray(profile) ? profile : []).filter(p => p && Number.isFinite(Number(p.t))).map(p => ({
    t: number(p.t, 0, 0, 1),
    scaleX: number(p.scaleX ?? p.scale, 1, 0.3, 1.6),
    scaleY: number(p.scaleY ?? p.scale, 1, 0.3, 1.6),
    twist: number(p.twist ?? p.twistDegrees, 0, -180, 180)
  })).sort((a, b) => a.t - b.t);
  if (!valid.length) return copy(DEFAULT_STATE.profile);
  const knots = [];
  valid.forEach(p => {
    if (knots.length && Math.abs(knots.at(-1).t - p.t) < EPS) knots[knots.length - 1] = p;
    else knots.push(p);
  });
  if (knots[0].t > 0) knots.unshift({ ...knots[0], t: 0 });
  if (knots.at(-1).t < 1) knots.push({ ...knots.at(-1), t: 1 });
  return knots;
}

/** Piecewise-linear profiles keep the handle position and generated geometry identical. */
export function sampleProfile(profile, t) {
  const knots = normalizeProfile(profile);
  t = clamp(t, 0, 1);
  const i = Math.max(0, knots.findIndex(p => p.t >= t) - 1);
  const a = knots[i], b = knots[Math.min(i + 1, knots.length - 1)];
  const f = b.t === a.t ? 0 : clamp((t - a.t) / (b.t - a.t), 0, 1);
  return { t, scaleX: a.scaleX + (b.scaleX - a.scaleX) * f, scaleY: a.scaleY + (b.scaleY - a.scaleY) * f, twist: a.twist + (b.twist - a.twist) * f };
}

export function polygonArea(points) {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function onSegment(p, a, b, epsilon = EPS) {
  return Math.abs(cross(a, b, p)) <= epsilon && p[0] >= Math.min(a[0], b[0]) - epsilon && p[0] <= Math.max(a[0], b[0]) + epsilon && p[1] >= Math.min(a[1], b[1]) - epsilon && p[1] <= Math.max(a[1], b[1]) + epsilon;
}

function segmentsIntersect(a, b, c, d) {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (((abC > EPS && abD < -EPS) || (abC < -EPS && abD > EPS)) && ((cdA > EPS && cdB < -EPS) || (cdA < -EPS && cdB > EPS))) return true;
  return Math.abs(abC) <= EPS && onSegment(c, a, b) || Math.abs(abD) <= EPS && onSegment(d, a, b) || Math.abs(cdA) <= EPS && onSegment(a, c, d) || Math.abs(cdB) <= EPS && onSegment(b, c, d);
}

export function validatePlan(points) {
  if (!Array.isArray(points) || points.length < 3 || points.length > 32) return { valid: false, message: 'Draw 3–32 vertices for a closed plan.' };
  if (points.some(p => !Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return { valid: false, message: 'Every plan vertex must have two finite coordinates.' };
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (dist(a, b) < EPS) return { valid: false, message: 'Remove coincident adjacent plan vertices.' };
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      if (segmentsIntersect(a, b, points[j], points[(j + 1) % points.length])) return { valid: false, message: 'The plan crosses or touches itself. Move the vertices to make a simple boundary.' };
    }
  }
  const area = Math.abs(polygonArea(points));
  if (area < 1e-6) return { valid: false, message: 'The plan has no usable area.' };
  return { valid: true, area, message: 'A simple closed plan.' };
}

export function pointInPolygon(p, polygon, includeBoundary = true) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    if (onSegment(p, a, b)) return includeBoundary;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function cleanPolygon(points) {
  const cleaned = points.filter((p, i) => i === 0 || dist(p, points[i - 1]) > EPS);
  if (cleaned.length > 1 && dist(cleaned[0], cleaned.at(-1)) < EPS) cleaned.pop();
  if (polygonArea(cleaned) < 0) cleaned.reverse();
  return cleaned;
}

/** Uniform edge subdivisions preserve every corner and exactly preserve polygon area. */
function resampleCorners(points, count = 64) {
  const p = cleanPolygon(points);
  const lengths = p.map((a, i) => dist(a, p[(i + 1) % p.length]));
  const total = lengths.reduce((a, b) => a + b, 0);
  const free = count - p.length;
  const ideal = lengths.map(l => l / total * free);
  const subdivisions = ideal.map(x => 1 + Math.floor(x));
  let remaining = count - subdivisions.reduce((a, b) => a + b, 0);
  const rank = ideal.map((x, i) => ({ i, remainder: x % 1 })).sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < remaining; i++) subdivisions[rank[i % rank.length].i]++;
  return p.flatMap((a, i) => {
    const b = p[(i + 1) % p.length];
    return Array.from({ length: subdivisions[i] }, (_, j) => [a[0] + (b[0] - a[0]) * j / subdivisions[i], a[1] + (b[1] - a[1]) * j / subdivisions[i]]);
  });
}

function rectangle(w, d) { return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]; }

function roundedRectangle(w, d) {
  const r = Math.min(w, d) * 0.16;
  const centres = [[w / 2 - r, -d / 2 + r], [w / 2 - r, d / 2 - r], [-w / 2 + r, d / 2 - r], [-w / 2 + r, -d / 2 + r]];
  return centres.flatMap((p, k) => Array.from({ length: 16 }, (_, j) => {
    const a = -Math.PI / 2 + k * Math.PI / 2 + j / 15 * Math.PI / 2;
    return [p[0] + r * Math.cos(a), p[1] + r * Math.sin(a)];
  }));
}

function capsule(w, d) {
  const swap = d > w;
  const length = Math.max(w, d), radius = Math.min(w, d) / 2, offset = length / 2 - radius;
  const points = [1, -1].flatMap(side => Array.from({ length: 32 }, (_, j) => {
    const a = -Math.PI / 2 + (side < 0 ? Math.PI : 0) + j / 31 * Math.PI;
    const p = [side * offset + radius * Math.cos(a), radius * Math.sin(a)];
    return swap ? [-p[1], p[0]] : p;
  }));
  return cleanPolygon(points);
}

export function makePlan(shape, width, depth, customPlan = DEFAULT_STATE.customPlan) {
  let p;
  switch (shape) {
    case 'rectangle': p = resampleCorners(rectangle(width, depth)); break;
    case 'rounded_rectangle': p = roundedRectangle(width, depth); break;
    case 'capsule': p = capsule(width, depth); break;
    case 'triangle': p = resampleCorners([[-width / 2, -depth / 3], [width / 2, -depth / 3], [0, depth * 2 / 3]]); break;
    case 'hexagon': p = resampleCorners(Array.from({ length: 6 }, (_, i) => [width / 2 * Math.cos(i / 6 * TAU), depth / 2 * Math.sin(i / 6 * TAU) / Math.sin(Math.PI / 3)])); break;
    case 'clover': p = Array.from({ length: 64 }, (_, i) => {
      const a = i / 64 * TAU, r = 0.85 + 0.15 * Math.cos(4 * a);
      return [width / 2 * r * Math.cos(a), depth / 2 * r * Math.sin(a)];
    }); break;
    case 'custom': {
      const valid = validatePlan(customPlan);
      if (!valid.valid) return [];
      const xs = customPlan.map(x => x[0]), ys = customPlan.map(x => x[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      if (maxX - minX < EPS || maxY - minY < EPS) return [];
      p = resampleCorners(customPlan.map(x => [(x[0] - (minX + maxX) / 2) / (maxX - minX) * width, (x[1] - (minY + maxY) / 2) / (maxY - minY) * depth]));
      break;
    }
    default: p = Array.from({ length: 64 }, (_, i) => [width / 2 * Math.cos(i / 64 * TAU), depth / 2 * Math.sin(i / 64 * TAU)]);
  }
  p = cleanPolygon(p);
  // Equal perimeter count is required for the shared structural node identities.
  return p.length === 64 ? p : resampleCorners(p);
}

function transformPlan(plan, profile) {
  const a = profile.twist * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return plan.map(p => { const x = p[0] * profile.scaleX, y = p[1] * profile.scaleY; return [x * c - y * s, x * s + y * c]; });
}

/** Corners alone are insufficient for concave plans: also test core-edge intersections. */
function polygonContainsRectangle(plan, rect, clearance = 0) {
  const expanded = rectangle(Math.abs(rect[1][0] - rect[0][0]) + 2 * clearance, Math.abs(rect[2][1] - rect[1][1]) + 2 * clearance);
  return polygonContainsFootprint(plan, expanded);
}

function polygonContainsFootprint(plan, footprint) {
  if (footprint.some(p => !pointInPolygon(p, plan, false))) return false;
  for (let i = 0; i < footprint.length; i++) {
    for (let j = 0; j < plan.length; j++) {
      if (segmentsIntersect(footprint[i], footprint[(i + 1) % footprint.length], plan[j], plan[(j + 1) % plan.length])) return false;
    }
  }
  return true;
}

function insideSite(plan, placement = { x: 0, y: 0 }) {
  return plan.every(p => Math.abs(p[0] + placement.x) <= SITE.width / 2 + EPS && Math.abs(p[1] + placement.y) <= SITE.depth / 2 + EPS);
}

function projectedWidth(plan, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const d = plan.map(p => p[0] * c + p[1] * s);
  return Math.max(...d) - Math.min(...d);
}

function buildStructure(state, floors, roof, core, podiumRoof = null) {
  const columns = [], members = [], nodes = [];
  const towerFloors = floors.filter(f => !f.isPodium);
  const towerLevels = [...towerFloors.map(f => ({ z: f.z, polygon: f.polygon, floorIndex: f.index })), { z: roof.z, polygon: roof.polygon, floorIndex: state.storeys + 1 }];
  const coreClearance = Math.max(0.4, state.columnSection / 2 + 0.15);
  const g = state.columnSpacing;
  const extentX = Math.ceil(state.width / 2 / g), extentY = Math.ceil(state.depth / 2 / g);
  for (let ix = -extentX; ix <= extentX; ix++) {
    for (let iy = -extentY; iy <= extentY; iy++) {
      const p = [ix * g, iy * g];
      if (Math.abs(p[0]) < core.width / 2 + coreClearance && Math.abs(p[1]) < core.depth / 2 + coreClearance) continue;
      const half = state.columnSection / 2;
      const footprint = [[p[0] - half, p[1] - half], [p[0] + half, p[1] - half], [p[0] + half, p[1] + half], [p[0] - half, p[1] + half]];
      // Every column section fits every plate, not just its centre or endpoint.
      const fits = floors.every(f => polygonContainsFootprint(f.polygon, footprint)) && polygonContainsFootprint(roof.polygon, footprint) && (!podiumRoof || polygonContainsFootprint(podiumRoof.polygon, footprint));
      if (fits) columns.push({ id: `column-${ix}-${iy}`, start: point3(p, 0), end: point3(p, state.height), section: state.columnSection, role: 'gravity' });
    }
  }
  const addMember = (start, end, kind, role, section, extra = {}) => members.push({ id: `${role}-${members.length}`, start, end, kind, role, section, ...extra });
  // Each slab has a real boundary ring. Lines follow its sampled plan exactly.
  floors.forEach(f => {
    for (let j = 0; j < state.perimeterNodes; j++) {
      const i = j * 64 / state.perimeterNodes, k = (j + 1) % state.perimeterNodes * 64 / state.perimeterNodes;
      addMember(point3(f.polygon[i], f.z), point3(f.polygon[k], f.z), 'beam', 'diaphragm', state.beamSection, { floorIndex: f.index });
    }
  });
  // Central frame beams connect the fixed gravity grid to the wall-face reservation.
  floors.forEach(f => columns.forEach(column => {
    const p = column.start, target = [clamp(p[0], -core.width / 2, core.width / 2), clamp(p[1], -core.depth / 2, core.depth / 2)];
    addMember([p[0], p[1], f.z], point3(target, f.z), 'beam', 'gravity', state.beamSection, { floorIndex: f.index });
  }));
  if (state.structure !== 'core_columns') {
    const seamIndices = [];
    for (let i = 0; i < towerLevels.length - 1; i += state.diagridModule) seamIndices.push(i);
    seamIndices.push(towerLevels.length - 1);
    seamIndices.forEach((i, seam) => {
      const level = towerLevels[i];
      for (let j = 0; j < state.perimeterNodes; j++) nodes.push({ id: `seam-${seam}-node-${j}`, point: point3(level.polygon[j * 64 / state.perimeterNodes], level.z), seam, perimeterIndex: j * 64 / state.perimeterNodes, floorIndex: level.floorIndex });
    });
    for (let seam = 0; seam < seamIndices.length - 1; seam++) {
      for (let j = 0; j < state.perimeterNodes; j++) {
        const lower = nodes[seam * state.perimeterNodes + j];
        const upRight = nodes[(seam + 1) * state.perimeterNodes + (j + 1) % state.perimeterNodes];
        const upLeft = nodes[(seam + 1) * state.perimeterNodes + (j - 1 + state.perimeterNodes) % state.perimeterNodes];
        addMember(lower.point, upRight.point, 'diagonal', state.structure, state.diagonalSection, { startNode: lower.id, endNode: upRight.id, module: seam });
        addMember(lower.point, upLeft.point, 'diagonal', state.structure, state.diagonalSection, { startNode: lower.id, endNode: upLeft.id, module: seam });
      }
    }
  }
  return { columns, members, nodes };
}

function simpleBoundary(points) {
  if (points.length < 3 || points.some(p => !p.every(Number.isFinite)) || polygonArea(points) <= EPS) return false;
  for (let i = 0; i < points.length; i++) {
    if (dist(points[i], points[(i + 1) % points.length]) < EPS) return false;
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      if (segmentsIntersect(points[i], points[(i + 1) % points.length], points[j], points[(j + 1) % points.length])) return false;
    }
  }
  return true;
}

/** Exact closed strip solids are consumed unchanged by both browser and Rhino. */
function terraceSolid(inner, outer, thickness) {
  const vertices = [], faces = [];
  inner.forEach((p, i) => vertices.push([p[0], p[1], p[2] - thickness], [outer[i][0], outer[i][1], outer[i][2] - thickness], [...p], [...outer[i]]));
  const quad = (a, b, c, d) => faces.push([a, b, c], [a, c, d]);
  for (let i = 0; i < inner.length - 1; i++) {
    const a = i * 4, b = a + 4;
    faces.push([a + 2, a + 3, b + 2], [a + 3, b + 3, b + 2], [a, b, a + 1], [a + 1, b, b + 1]);
    quad(a, a + 2, b + 2, b); quad(a + 1, b + 1, b + 3, a + 3);
  }
  quad(0, 1, 3, 2); const a = (inner.length - 1) * 4; quad(a, a + 2, a + 3, a + 1);
  return { vertices, faces };
}

function rectangularSolid(start, end, width, depth, axes) {
  const vertices = [], faces = [[2, 1, 0], [3, 2, 0], [4, 5, 6], [4, 6, 7]];
  for (const p of [start, end]) for (const [x, y] of [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]]) {
    vertices.push(p.map((v, i) => v + axes.u[i] * x + axes.v[i] * y));
  }
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; faces.push([i, j, j + 4], [i, j + 4, i + 4]); }
  return { vertices, faces };
}

function rectangularMember(id, start, end, width, depth, role, extra = {}) {
  const dx = end[0] - start[0], dy = end[1] - start[1], dz = end[2] - start[2], length = Math.hypot(dx, dy), totalLength = Math.hypot(dx, dy, dz);
  const axes = length > EPS ? { u: [-dy / length, dx / length, 0], v: [-dz * dx / totalLength / length, -dz * dy / totalLength / length, length / totalLength] } : { u: [1, 0, 0], v: [0, 1, 0] };
  // u × v must point along the member so every closed box has outward faces.
  if (length <= EPS && end[2] < start[2]) axes.v = [0, -1, 0];
  return { id, start, end, width, depth, section: Math.max(width, depth), axes, kind: 'beam', role, ...extra, solid: rectangularSolid(start, end, width, depth, axes) };
}

function perimeterSample(polygon, index) {
  const n = polygon.length, wrapped = ((index % n) + n) % n, j = Math.floor(wrapped), f = wrapped - j;
  const a = polygon[j], b = polygon[(j + 1) % n], before = polygon[(j - 1 + n) % n];
  const edgeLength = dist(a, b), previousLength = dist(before, a);
  const edgeNormal = [(b[1] - a[1]) / edgeLength, -(b[0] - a[0]) / edgeLength];
  let normal = edgeNormal;
  if (f < EPS) {
    const previous = [(a[1] - before[1]) / previousLength, -(a[0] - before[0]) / previousLength];
    const sum = [previous[0] + edgeNormal[0], previous[1] + edgeNormal[1]], l = Math.hypot(...sum);
    if (l > EPS) normal = sum.map(v => v / l);
  }
  return { point: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], normal, tangent: [-normal[1], normal[0]] };
}

function boundaryParameters(start, end, polygon) {
  const dx = end[0] - start[0], dy = end[1] - start[1], ts = [];
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length], ex = b[0] - a[0], ey = b[1] - a[1], determinant = dx * ey - dy * ex;
    if (Math.abs(determinant) < EPS) return;
    const ax = a[0] - start[0], ay = a[1] - start[1], t = (ax * ey - ay * ex) / determinant, u = (ax * dy - ay * dx) / determinant;
    if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS) ts.push(clamp(t, 0, 1));
  });
  return ts;
}

/** Test every interval formed by all boundary intersections, not only ray endpoints. */
function segmentInUnion(start, end, polygons) {
  const ts = [0, 1, ...polygons.flatMap(p => boundaryParameters(start, end, p))].sort((a, b) => a - b);
  for (let i = 1; i < ts.length; i++) {
    if (ts[i] - ts[i - 1] < EPS) continue;
    const t = (ts[i] + ts[i - 1]) / 2, p = [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t];
    if (!polygons.some(polygon => pointInPolygon(p, polygon))) return false;
  }
  return true;
}

function beamCoreStart(core, end, z) {
  const l = Math.hypot(end[0], end[1]), u = l > EPS ? [end[0] / l, end[1] / l] : [1, 0];
  const tx = Math.abs(u[0]) > EPS ? core.width / 2 / Math.abs(u[0]) : Infinity;
  const ty = Math.abs(u[1]) > EPS ? core.depth / 2 / Math.abs(u[1]) : Infinity;
  const faceAxis = tx < ty ? 0 : 1, faceDistance = Math.min(tx, ty), embedDistance = core.wall / 2 / Math.abs(u[faceAxis]);
  return { start: [u[0] * (faceDistance - embedDistance), u[1] * (faceDistance - embedDistance), z], faceAxis, embedDepth: core.wall / 2 };
}

function buildLandscape(state, floors, roof, core) {
  const empty = { enabled: false, mode: 'level_terraces', decks: [], guards: [], supportMembers: [], inner: [], outer: [], path: [], ribbon: [], positions: [], indices: [], plants: [], planters: [], externalArea: 0, supportFailures: [] };
  if (!state.landscape.enabled) return empty;
  const towerFloors = floors.filter(f => !f.isPodium), selected = towerFloors.filter((f, i) => i % state.landscape.stepFloors === 0);
  if (selected.at(-1) !== towerFloors.at(-1)) selected.push(towerFloors.at(-1));
  const result = { ...empty, enabled: true, width: state.landscape.width, thickness: state.landscape.thickness, beamDepth: state.landscape.beamDepth, beamWidth: state.landscape.beamWidth,
    turns: state.landscape.turns, span: state.landscape.span, stepFloors: state.landscape.stepFloors, pitchFloors: towerFloors.length / state.landscape.turns,
    baseZ: towerFloors[0].z, rise: towerFloors.at(-1).z - towerFloors[0].z, length: 0, horizontalLength: 0, slopePercent: 0, continuousRoute: false,
    role: 'Level occupied-terrace reservations, reached from their own floors; external area is separate from occupied floor GFA',
    limits: 'Geometric deck → radial/edge beams → continuous core → grade. Connections, capacity, door detailing, egress, accessible routes, planting loads, drainage and waterproofing require design.' };
  selected.forEach(floor => {
    const id = `terrace-floor-${floor.index}`, phase = floor.t * state.landscape.turns * 360, startIndex = phase / 360 * 64, spanIndices = state.landscape.span / 360 * 64;
    const samples = [startIndex];
    for (let j = Math.floor(startIndex) + 1; j < startIndex + spanIndices - EPS; j++) samples.push(j);
    samples.push(startIndex + spanIndices);
    const zTop = floor.z + state.slabThickness, zBottom = zTop - state.landscape.thickness, overlap = 0.2;
    const edge = samples.map(index => perimeterSample(floor.polygon, index));
    const offset = (p, j, distance) => {
      // A radial fan retains every core-to-edge beam beneath its deck. The
      // normal projection scales it to the requested local outward depth.
      const l = Math.hypot(...p.point), normal = l > EPS ? p.point.map(v => v / l) : p.normal;
      const factor = 1 / Math.max(0.2, normal[0] * p.normal[0] + normal[1] * p.normal[1]);
      return [p.point[0] + normal[0] * distance * factor, p.point[1] + normal[1] * distance * factor, zTop];
    };
    const inner = edge.map((p, j) => offset(p, j, -overlap));
    const outer = edge.map((p, j) => offset(p, j, state.landscape.width));
    const polygon = [...outer.map(p => p.slice(0, 2)), ...inner.slice().reverse().map(p => p.slice(0, 2))];
    const middle = perimeterSample(floor.polygon, startIndex + spanIndices / 2), plantingZone = 0.8, clearWidth = Math.max(0, state.landscape.width - plantingZone - 0.12);
    const externalPolygon = [...outer.map(p => p.slice(0, 2)), ...edge.slice().reverse().map(p => p.point)];
    const deck = { id, floorIndex: floor.index, zTop, zBottom, thickness: state.landscape.thickness, inner, outer, polygon, solid: terraceSolid(inner, outer, state.landscape.thickness), area: polygonArea(polygon), externalArea: Math.max(0, polygonArea(externalPolygon)), phase,
      attachmentPolyline: edge.map(p => [...p.point, zTop]), overlap, access: { center: [...middle.point, zTop], tangent: [...middle.tangent, 0], normal: [...middle.normal, 0], width: 1.6, height: 2.1, floorIndex: floor.index }, clearWidth, plantingZone };
    const failures = [];
    if (!simpleBoundary(polygon)) failures.push('The offset terrace boundary crosses itself.');
    if (inner.some(p => !pointInPolygon(p, floor.polygon))) failures.push('The inset attachment does not remain inside its assigned floor.');
    const beamZ = zBottom - state.landscape.beamDepth / 2, beamWidth = state.landscape.beamWidth;
    outer.forEach((p, j) => {
      const end = [p[0], p[1], beamZ], connection = beamCoreStart(core, end, beamZ);
      if (!segmentInUnion(connection.start, end, [floor.polygon, polygon])) failures.push(`Radial beam ${j + 1} leaves its floor and terrace.`);
      const radial = rectangularMember(`${id}-radial-${j}`, connection.start, end, beamWidth, state.landscape.beamDepth, 'terrace_radial', { deckId: id, floorIndex: floor.index, coreFaceAxis: connection.faceAxis, coreEmbedDepth: connection.embedDepth, deckBottom: zBottom });
      result.supportMembers.push(radial);
      if (floor.z > zBottom + EPS) {
        const crossings = boundaryParameters(connection.start, end, floor.polygon), boundaryT = crossings.length ? Math.max(...crossings) : 1, beamLength = dist(connection.start, end);
        const t = clamp(boundaryT - 0.8 / beamLength, 0.05, 0.95), x = connection.start[0] + (end[0] - connection.start[0]) * t, y = connection.start[1] + (end[1] - connection.start[1]) * t;
        if (pointInPolygon([x, y], floor.polygon)) result.supportMembers.push(rectangularMember(`${id}-bearing-${j}`, [x, y, zBottom], [x, y, floor.z], beamWidth, beamWidth, 'terrace_bearing', { deckId: id, floorIndex: floor.index, radialId: radial.id, note: 'Bearing block bridges radial-beam top to occupied-floor underside.' }));
        else failures.push(`Radial beam ${j + 1} lacks an underside bearing contact.`);
      }
      if (j < outer.length - 1) result.supportMembers.push(rectangularMember(`${id}-edge-${j}`, end, [outer[j + 1][0], outer[j + 1][1], beamZ], beamWidth, state.landscape.beamDepth, 'terrace_edge', { deckId: id, floorIndex: floor.index, deckBottom: zBottom }));
    });
    const guardZ = zTop + 0.55, addGuard = (a, b, label) => result.guards.push(rectangularMember(`${id}-guard-${label}`, [a[0], a[1], guardZ], [b[0], b[1], guardZ], 0.04, 1.1, 'terrace_guard', { deckId: id, floorIndex: floor.index }));
    outer.slice(0, -1).forEach((p, j) => addGuard(p, outer[j + 1], j));
    addGuard(inner[0], outer[0], 'start'); addGuard(outer.at(-1), inner.at(-1), 'end');
    for (let j = 2; j < edge.length - 2; j += 4) {
      const sample = edge[j], width = 0.9, depth = 0.6, height = 0.5, center = [outer[j][0] - sample.normal[0] * 0.45, outer[j][1] - sample.normal[1] * 0.45, zTop + height / 2];
      const footprint = [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]].map(([x, y]) => [center[0] + sample.tangent[0] * x + sample.normal[0] * y, center[1] + sample.tangent[1] * x + sample.normal[1] * y]);
      if (!footprint.every(p => pointInPolygon(p, polygon))) continue;
      result.planters.push({ id: `${id}-planter-${j}`, deckId: id, floorIndex: floor.index, center, width, depth, height, rotation: Math.atan2(sample.tangent[1], sample.tangent[0]), polygon: footprint });
      result.plants.push([...center]);
    }
    deck.supportFits = failures.length === 0; if (failures.length) result.supportFailures.push({ deckId: id, floorIndex: floor.index, messages: [...new Set(failures)] });
    result.decks.push(deck); result.inner.push(...inner); result.outer.push(...outer); result.externalArea += deck.externalArea;
    for (let j = 1; j < inner.length; j++) result.horizontalLength += dist(inner[j - 1], inner[j]);
  });
  result.length = result.horizontalLength; result.clearWidth = Math.min(...result.decks.map(d => d.clearWidth));
  return result;
}

function polygonsOverlap(a, b) {
  if (a.some(p => pointInPolygon(p, b)) || b.some(p => pointInPolygon(p, a))) return true;
  return a.some((p, i) => b.some((q, j) => segmentsIntersect(p, a[(i + 1) % a.length], q, b[(j + 1) % b.length])));
}

function circlePolygon(center, radius, count = 32) {
  return Array.from({ length: count }, (_, i) => [center[0] + radius * Math.cos(i / count * TAU), center[1] + radius * Math.sin(i / count * TAU)]);
}

function buildPublicSpace(state, floors, roof, core, podium, podiumHeight, lift) {
  const enabled = state.publicSpace.enabled && state.podiumFloors > 0;
  const result = { enabled, layout: state.publicSpace.layout, lift, clearHeight: lift, minimumClearHeight: Math.max(0, lift - state.landscape.beamDepth), ground: { polygon: copy(podium), holes: [copy(core.polygon)], z: -0.12, thickness: 0.12 },
    courtyard: { center: [0, 0], radius: state.publicSpace.courtyardRadius, polygon: [], valid: true, requested: enabled && state.publicSpace.layout !== 'open_plaza' && !(state.vancouver.podiumStepback > 0 && state.publicSpace.layout === 'garden_islands') }, gardens: [], routes: [], pilotisCount: 0,
    limits: 'Ground-space reservations; circulation, grade, entrance and fire access, planting, pilotis capacity and transfer design require coordination.' };
  if (!enabled) return result;
  if (result.courtyard.requested) {
    const towerPolygons = [...floors.filter(f => !f.isPodium).map(f => f.polygon), roof.polygon], r = result.courtyard.radius;
    const candidates = [[state.podiumWidth * 0.39, 0], [-state.podiumWidth * 0.39, 0], [0, state.podiumDepth * 0.35], [0, -state.podiumDepth * 0.35]];
    for (let x = -state.podiumWidth / 2 + r + 1; x < state.podiumWidth / 2 - r; x += 5) for (let y = -state.podiumDepth / 2 + r + 1; y < state.podiumDepth / 2 - r; y += 5) candidates.push([x, y]);
    const center = candidates.find(candidate => {
      const polygon = circlePolygon(candidate, r);
      return polygonContainsFootprint(podium, polygon) && !polygonsOverlap(polygon, core.polygon) && !towerPolygons.some(tower => polygonsOverlap(polygon, tower));
    });
    result.courtyard.valid = Boolean(center);
    if (center) { result.courtyard.center = center; result.courtyard.polygon = circlePolygon(center, r); }
  }
  // A perimeter promenade leaves the fixed central core as a separate obstacle.
  const y = -state.podiumDepth * 0.32, x1 = -state.podiumWidth * 0.38, x2 = state.podiumWidth * 0.38;
  const routeFootprint = [[x1, y - 1], [x2, y - 1], [x2, y + 1], [x1, y + 1]];
  if (polygonContainsFootprint(podium, routeFootprint) && !polygonsOverlap(routeFootprint, core.polygon)) result.routes.push({ id: 'ground-promenade', start: [x1, y], end: [x2, y], width: 2 });
  result.podiumRoofElevation = lift + podiumHeight;
  return result;
}

function segmentInRegion(start, end, polygon, holes = []) {
  const ts = [0, 1, ...[polygon, ...holes].flatMap(p => boundaryParameters(start, end, p))].sort((a, b) => a - b);
  for (let i = 1; i < ts.length; i++) {
    if (ts[i] - ts[i - 1] < EPS) continue;
    const t = (ts[i] + ts[i - 1]) / 2, p = [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t];
    if (!pointInPolygon(p, polygon) || holes.some(h => pointInPolygon(p, h, false))) return false;
  }
  return true;
}

function addPodiumStructure(state, floors, podiumRoof, core, publicSpace, columns, members) {
  if (!publicSpace.enabled || !podiumRoof) return;
  const podiumFloors = floors.filter(f => f.isPodium), courtyard = publicSpace.courtyard.polygon, half = state.columnSection / 2, g = state.columnSpacing;
  const extents = [Math.ceil(state.podiumWidth / 2 / g), Math.ceil(state.podiumDepth / 2 / g)];
  const floorHoles = courtyard.length ? [courtyard] : [];
  for (let ix = -extents[0]; ix <= extents[0]; ix++) for (let iy = -extents[1]; iy <= extents[1]; iy++) {
    const p = [ix * g, iy * g], footprint = [[p[0] - half, p[1] - half], [p[0] + half, p[1] - half], [p[0] + half, p[1] + half], [p[0] - half, p[1] + half]];
    if (Math.abs(p[0]) < core.width / 2 + half + 0.4 && Math.abs(p[1]) < core.depth / 2 + half + 0.4) continue;
    if (columns.some(column => dist(column.start, p) < state.columnSection + 0.1)) continue;
    if (![...podiumFloors,podiumRoof].every(f => polygonContainsFootprint(f.polygon, footprint)) || floorHoles.some(hole => polygonsOverlap(footprint, hole))) continue;
    // Discard a pilotis that cannot also be tied to a core-led floor beam; this
    // keeps custom concave podiums and courtyard holes from gaining false paths.
    if (![...podiumFloors,podiumRoof].every(f => {const connection=beamCoreStart(core,p,f.z-state.landscape.beamDepth/2);return segmentInRegion(connection.start,p,f.polygon,floorHoles);})) continue;
    columns.push({ id: `podium-column-${ix}-${iy}`, start: [...p, 0], end: [...p, podiumRoof.z], section: state.columnSection, role: 'podium_gravity' });
  }
  publicSpace.pilotisCount = columns.filter(c => c.role === 'podium_gravity').length;
  for (const floor of [...podiumFloors, podiumRoof]) for (const column of columns.filter(c => c.role === 'podium_gravity')) {
    const z = floor.z - state.landscape.beamDepth / 2, end = [column.start[0], column.start[1], z], connection = beamCoreStart(core, end, z);
    members.push(rectangularMember(`podium-floor-${floor.index ?? 'roof'}-${column.id}`, connection.start, end, state.landscape.beamWidth, state.landscape.beamDepth, 'podium_floor_beam', { floorIndex: floor.index ?? 'podium_roof', columnId: column.id, coreEmbedDepth: connection.embedDepth }));
  }
  const routePolygons = publicSpace.routes.map(route => [[route.start[0], route.start[1] - route.width / 2], [route.end[0], route.end[1] - route.width / 2], [route.end[0], route.end[1] + route.width / 2], [route.start[0], route.start[1] + route.width / 2]]);
  const columnFootprints = columns.map(column => { const [x, y] = column.start; return [[x - half, y - half], [x + half, y - half], [x + half, y + half], [x - half, y + half]]; });
  const candidates = publicSpace.layout === 'garden_islands' ? [[-state.podiumWidth * 0.31, state.podiumDepth * 0.24], [0, state.podiumDepth * 0.31], [state.podiumWidth * 0.31, state.podiumDepth * 0.24], [-state.podiumWidth * 0.31, -state.podiumDepth * 0.08], [state.podiumWidth * 0.31, -state.podiumDepth * 0.08]] : [];
  if (publicSpace.courtyard.requested && publicSpace.courtyard.valid) candidates.push(publicSpace.courtyard.center);
  candidates.forEach((center, i) => {
    const polygon = rectangle(4, 3).map(p => [p[0] + center[0], p[1] + center[1]]);
    if (!polygonContainsFootprint(podiumRoof.polygon, polygon) || polygonsOverlap(polygon, core.polygon) || routePolygons.some(route => polygonsOverlap(route, polygon)) || columnFootprints.some(column => polygonsOverlap(column, polygon))) return;
    publicSpace.gardens.push({ id: `ground-garden-${i}`, polygon, baseZ: 0, thickness: 0.45 });
  });
  publicSpace.routeColumnConflicts = columnFootprints.filter(column => routePolygons.some(route => polygonsOverlap(route, column))).length;
}

function addSharedNode(nodes, id, point, extra = {}) {
  const previous = nodes.find(node => node.id === id);
  if (previous) return previous;
  const node = { id, point: [...point], ...extra }; nodes.push(node); return node;
}

/** Deterministic topology; no member force or resistance is inferred from it. */
function buildTrussFrame(options, nodes) {
  const { id, startTop, endTop, startBottom, endBottom, pattern, width, depth, role, extra = {}, endPostNode } = options;
  const panels = 4, top = [], bottom = [], members = [];
  const interpolate = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  for (let j = 0; j <= panels; j++) {
    const topId = j === 0 ? options.startTopId : j === panels ? options.endTopId : null;
    const bottomId = j === 0 ? options.startBottomId : j === panels ? options.endBottomId : null;
    top.push(addSharedNode(nodes, topId || `${id}-top-${j}`, interpolate(startTop, endTop, j / panels), { frameId: id, role, ...extra }));
    bottom.push(addSharedNode(nodes, bottomId || `${id}-bottom-${j}`, interpolate(startBottom, endBottom, j / panels), { frameId: id, role, ...extra }));
  }
  const add = (a, b, component) => {
    if (Math.hypot(...a.point.map((v, i) => v - b.point[i])) < EPS) return;
    const member = rectangularMember(`${id}-${component}-${members.length}`, a.point, b.point, width, depth, role, { frameId: id, pattern, component, startNode: a.id, endNode: b.id, ...extra });
    member.kind = component === 'diagonal' ? 'diagonal' : 'beam'; members.push(member);
  };
  for (let j = 0; j < panels; j++) { add(top[j], top[j + 1], 'top_chord'); add(bottom[j], bottom[j + 1], 'bottom_chord'); }
  for (let j = 0; j <= panels; j++) {
    if (j !== 0 && j !== panels && pattern === 'warren') continue;
    if (j === panels && endPostNode) {
      const middle = addSharedNode(nodes, endPostNode.id, endPostNode.point, { frameId: id, role, ...extra });
      if (middle.point[2] > bottom[j].point[2] + EPS && middle.point[2] < top[j].point[2] - EPS) { add(bottom[j], middle, 'post'); add(middle, top[j], 'post'); }
      else { add(bottom[j], top[j], 'post'); if (middle.point[2] < bottom[j].point[2] - EPS) add(middle, bottom[j], 'post'); else if (middle.point[2] > top[j].point[2] + EPS) add(top[j], middle, 'post'); }
    } else add(bottom[j], top[j], 'post');
  }
  if (pattern !== 'vierendeel') for (let j = 0; j < panels; j++) {
    const rises = pattern === 'warren' ? j % 2 === 0 : pattern === 'pratt' ? j >= panels / 2 : j < panels / 2;
    add(rises ? bottom[j] : top[j], rises ? top[j + 1] : bottom[j + 1], 'diagonal');
  }
  return { members, nodeIds: [...new Set(members.flatMap(member => [member.startNode, member.endNode]))], panels };
}

function convertTerraceTrusses(state, landscape, core, nodes) {
  landscape.supportType = state.landscape.supportType; landscape.trussDepth = state.landscape.trussDepth; landscape.pattern = state.trussPattern; landscape.trussFrames = [];
  if (!landscape.enabled || state.landscape.supportType !== 'truss') return;
  const replaced = new Set(), additional = [];
  landscape.decks.forEach(deck => {
    const radials = landscape.supportMembers.filter(member => member.deckId === deck.id && member.role === 'terrace_radial');
    const selected = radials.filter((member, index) => index % 4 === 0 || index === radials.length - 1);
    const section = Math.min(state.landscape.beamWidth, state.landscape.trussDepth / 4), topZ = deck.zBottom - section / 2, bottomZ = deck.zBottom - state.landscape.trussDepth + section / 2;
    const edges = landscape.supportMembers.filter(member => member.deckId === deck.id && member.role === 'terrace_edge');
    radials.forEach((radial, j) => {
      const id = `${deck.id}-collector-${j}`; addSharedNode(nodes, id, radial.end, { deckId: deck.id, floorIndex: deck.floorIndex, role: 'terrace_collector' });
      radial.endNode = id;
      if (j < edges.length) edges[j].startNode = id;
      if (j) edges[j - 1].endNode = id;
    });
    selected.forEach(radial => {
      const endTop = [radial.end[0], radial.end[1], topZ], endBottom = [radial.end[0], radial.end[1], bottomZ], startTop = beamCoreStart(core, endTop, topZ).start, startBottom = beamCoreStart(core, endBottom, bottomZ).start;
      const frameId = `${radial.id}-truss`, frame = buildTrussFrame({ id: frameId, startTop, endTop, startBottom, endBottom,
        endTopId: Math.abs(radial.end[2] - topZ) < EPS ? radial.endNode : undefined, endBottomId: Math.abs(radial.end[2] - bottomZ) < EPS ? radial.endNode : undefined, endPostNode: { id: radial.endNode, point: radial.end },
        pattern: state.trussPattern, width: state.landscape.beamWidth, depth: section, role: 'terrace_truss', extra: { deckId: deck.id, floorIndex: deck.floorIndex, coreEmbedDepth: core.wall / 2, deckBottom: deck.zBottom, originalRadialId: radial.id } }, nodes);
      replaced.add(radial.id); additional.push(...frame.members);
      landscape.trussFrames.push({ id: frameId, deckId: deck.id, floorIndex: deck.floorIndex, pattern: state.trussPattern, nodeIds: frame.nodeIds, memberIds: frame.members.map(member => member.id), collectorNode: radial.endNode, zTop: deck.zBottom, zBottom: deck.zBottom - state.landscape.trussDepth, panels: frame.panels });
    });
  });
  landscape.supportMembers = [...landscape.supportMembers.filter(member => !replaced.has(member.id)), ...additional];
}

function convexHullColumns(columns) {
  const points = columns.slice().sort((a, b) => a.start[0] - b.start[0] || a.start[1] - b.start[1]);
  const half = sequence => { const hull = []; for (const column of sequence) { while (hull.length > 1 && cross(hull.at(-2).start, hull.at(-1).start, column.start) <= EPS) hull.pop(); hull.push(column); } return hull; };
  if (points.length < 3) return points;
  return [...half(points).slice(0, -1), ...half(points.slice().reverse()).slice(0, -1)];
}

function buildMegaFloors(state, floors, roof, core, columns, members, nodes) {
  const result = { enabled: state.megaFloors.enabled, pattern: state.trussPattern, bands: [], columnIds: [], omittedBands: 0, strengtheningFailures: [], supportFailures: [],
    limits: 'Actual floor-level outrigger and belt reservations join the core to continuous columns. Lateral response, load redistribution, stiffness, joints and capacity are not calculated. Deep bands need a coordinated service or mechanical zone; programme is not reassigned.' };
  if (!result.enabled) return result;
  const hull = convexHullColumns(columns.filter(column => column.role === 'gravity')), tower = floors.filter(f => !f.isPodium);
  if (hull.length < 3 || tower.length < 2) { result.omittedBands = state.megaFloors.bands; result.supportFailures.push('At least three continuous outer columns and two tower levels are needed.'); return result; }
  result.columnIds = hull.map(column => column.id);
  for (const column of hull) {
    const section = Math.max(column.section, state.megaFloors.columnSection), half = section / 2, [x, y] = column.start;
    const footprint = [[x - half, y - half], [x + half, y - half], [x + half, y + half], [x - half, y + half]];
    const fits = [...floors, roof].every(level => polygonContainsFootprint(level.polygon, footprint) && !(level.holes || []).some(hole => polygonsOverlap(footprint, hole)));
    column.mega = true; column.requestedMegaSection = section;
    if (fits) column.section = section; else result.strengtheningFailures.push(column.id);
    column.megaSection = column.section;
  }
  const depth = Math.min(state.megaFloors.depthStoreys, tower.length - 1), available = tower.length - depth - 1;
  let previousTop = -1;
  for (let index = 0; index < state.megaFloors.bands; index++) {
    const bottomIndex = Math.max(previousTop + 1, Math.round(available * (index + 1) / (state.megaFloors.bands + 1))), topIndex = bottomIndex + depth;
    if (topIndex >= tower.length) { result.omittedBands++; continue; }
    previousTop = topIndex;
    const lower = tower[bottomIndex], upper = tower[topIndex], id = `mega-band-${result.bands.length + 1}`, bandMembers = [], nodeIds = new Set();
    const band = { id, pattern: state.trussPattern, bottomFloorIndex: lower.index, topFloorIndex: upper.index, zBottom: lower.z, zTop: upper.z, depthStoreys: upper.index - lower.index,
      columnIds: hull.map(column => column.id), nodeIds: [], memberIds: [], mechanicalZone: { bottomFloorIndex: lower.index, topFloorIndex: upper.index, programmeReserved: false, floorIndices: tower.slice(bottomIndex, topIndex).map(f => f.index) } };
    const addFrame = options => { const frame = buildTrussFrame({ ...options, pattern: state.trussPattern, width: state.landscape.beamWidth, depth: state.landscape.beamWidth, extra: { ...options.extra, bandId: id, bottomFloorIndex: lower.index, topFloorIndex: upper.index } }, nodes); bandMembers.push(...frame.members); frame.nodeIds.forEach(nodeId => nodeIds.add(nodeId)); };
    hull.forEach(column => {
      const endTop = [column.start[0], column.start[1], upper.z], endBottom = [column.start[0], column.start[1], lower.z], topConnection = beamCoreStart(core, endTop, upper.z), startTop = topConnection.start, startBottom = beamCoreStart(core, endBottom, lower.z).start;
      if (!segmentInRegion(startTop, endTop, upper.polygon) || !segmentInRegion(startBottom, endBottom, lower.polygon)) result.supportFailures.push(`${id} outrigger to ${column.id} leaves its assigned floor.`);
      addFrame({ id: `${id}-outrigger-${column.id}`, startTop, endTop, startBottom, endBottom, endTopId: `${id}-${column.id}-top`, endBottomId: `${id}-${column.id}-bottom`, role: 'mega_outrigger', extra: { columnId: column.id, columnSection: column.section, coreFaceAxis: topConnection.faceAxis, coreEmbedDepth: topConnection.embedDepth } });
    });
    hull.forEach((column, j) => {
      const next = hull[(j + 1) % hull.length], startTop = [column.start[0], column.start[1], upper.z], endTop = [next.start[0], next.start[1], upper.z], startBottom = [column.start[0], column.start[1], lower.z], endBottom = [next.start[0], next.start[1], lower.z];
      if (!segmentInRegion(startTop, endTop, upper.polygon) || !segmentInRegion(startBottom, endBottom, lower.polygon)) result.supportFailures.push(`${id} belt between ${column.id} and ${next.id} leaves its assigned floor.`);
      addFrame({ id: `${id}-belt-${j}`, startTop, endTop, startBottom, endBottom, startTopId: `${id}-${column.id}-top`, endTopId: `${id}-${next.id}-top`, startBottomId: `${id}-${column.id}-bottom`, endBottomId: `${id}-${next.id}-bottom`, role: 'mega_belt', extra: { columnId: column.id, nextColumnId: next.id } });
    });
    // A changing or concave outline can cut across a deep web at an intermediate
    // actual slab even when its end levels and continuous columns still fit.
    const crossingMembers = bandMembers.filter(member => tower.slice(bottomIndex, topIndex + 1).some(floor => {
      const dz = member.end[2] - member.start[2];
      if (Math.abs(dz) < EPS) return false;
      const t = (floor.z - member.start[2]) / dz; if (t < -EPS || t > 1 + EPS) return false;
      const p = member.start.map((v, i) => v + (member.end[i] - v) * t);
      return !pointInPolygon(p, floor.polygon);
    }));
    if (crossingMembers.length) result.supportFailures.push(`${id} has ${crossingMembers.length} web members outside an intermediate floor envelope.`);
    members.push(...bandMembers); band.memberIds = bandMembers.map(member => member.id); band.nodeIds = [...nodeIds]; result.bands.push(band);
  }
  result.memberCount = result.bands.reduce((sum, band) => sum + band.memberIds.length, 0);
  return result;
}

// Remove only redundant collinear samples before planar clipping. The occupied
// floor rings retain their original 64 ordered perimeter points.
function clippingRing(polygon) {
  const ring=cleanPolygon(polygon.map(p=>p.slice(0,2)));
  return ring.filter((p,i)=>Math.abs(cross(ring[(i+ring.length-1)%ring.length],p,ring[(i+1)%ring.length]))>EPS);
}
function halfPlane(polygon,a,b,inside) {
  const output=[];
  const side=p=>cross(a,b,p), fits=p=>inside?side(p)>=-EPS:side(p)<=EPS;
  for(let i=0;i<polygon.length;i++) {
    const p=polygon[i],q=polygon[(i+1)%polygon.length],pin=fits(p),qin=fits(q);
    if(pin)output.push(p);
    if(pin!==qin){const sp=side(p),sq=side(q),t=sp/(sp-sq);output.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
  }
  return clippingRing(output);
}
function podiumDifferenceBoundary(lower,upper) {
  const a=clippingRing(lower),b=clippingRing(upper),edges=[];
  const key=p=>p.map(v=>Math.round(v*1e7)).join(',');
  for(const [ring,other,reverse] of [[a,b,false],[b,a,true]])for(let i=0;i<ring.length;i++) {
    const p=ring[i],q=ring[(i+1)%ring.length],dx=q[0]-p[0],dy=q[1]-p[1],length2=dx*dx+dy*dy;
    const ts=[0,1,...boundaryParameters(p,q,other),...other.filter(r=>onSegment(r,p,q)).map(r=>((r[0]-p[0])*dx+(r[1]-p[1])*dy)/length2)].sort((x,y)=>x-y);
    for(let j=1;j<ts.length;j++) {
      if(ts[j]-ts[j-1]<EPS)continue;
      const point=t=>[p[0]+dx*t,p[1]+dy*t],mid=point((ts[j]+ts[j-1])/2);
      if(reverse?!pointInPolygon(mid,other,false):pointInPolygon(mid,other,true))continue;
      const start=point(ts[j-1]),end=point(ts[j]);
      edges.push(reverse?{start:end,end:start}:{start,end});
    }
  }
  const remaining=new Set(edges),loops=[];
  while(remaining.size) {
    const first=remaining.values().next().value,loop=[first.start],startKey=key(first.start);let edge=first;
    for(let guard=0;guard<=edges.length;guard++) {
      remaining.delete(edge);
      if(key(edge.end)===startKey)break;
      loop.push(edge.end);
      const next=[...remaining].filter(candidate=>key(candidate.start)===key(edge.end));
      // A touching branch needs the exact convex partition below.
      if(next.length!==1)return null;
      edge=next[0];
      if(guard===edges.length)return null;
    }
    if(polygonArea(loop)<-EPS)return null; // A hole needs a partition, not a fan.
    const ring=clippingRing(loop);if(ring.length>=3&&polygonArea(ring)>EPS)loops.push(ring);
  }
  return loops;
}
// Partition A minus each convex triangle of B. The nonoverlapping convex
// pieces have no touching holes or uncapped fan faces, even for concave plans.
function exposedPodiumPieces(lower,upper) {
  const boundaries=podiumDifferenceBoundary(lower,upper);
  if(boundaries)return boundaries;
  let pieces=triangulatePolygon(clippingRing(lower));
  for(const triangle of triangulatePolygon(clippingRing(upper))) {
    const next=[];
    for(const piece of pieces) {
      let inside=piece;
      for(let i=0;i<3&&inside.length>=3;i++) {
        const a=triangle[i],b=triangle[(i+1)%3],outside=halfPlane(inside,a,b,false);
        if(outside.length>=3&&polygonArea(outside)>EPS)next.push(outside);
        inside=halfPlane(inside,a,b,true);
      }
    }
    pieces=next;
  }
  return pieces;
}
function podiumCapSolid(polygon,bottom,thickness) {
  const n=polygon.length,vertices=[...polygon.map(p=>[...p,bottom]),...polygon.map(p=>[...p,bottom+thickness])],faces=[];
  for(const triangle of triangulatePolygon(polygon)) {
    const [a,b,c]=triangle.map(p=>polygon.indexOf(p));faces.push([c,b,a],[n+a,n+b,n+c]);
  }
  for(let i=0;i<n;i++){const j=(i+1)%n;faces.push([i,j,n+j],[i,n+j,n+i]);}
  return {vertices,faces};
}
function podiumRetreat(polygon,amount,direction) {
  if(amount<=EPS)return copy(polygon);
  const axis=['left','right'].includes(direction)?0:1, values=polygon.map(p=>p[axis]),low=Math.min(...values),high=Math.max(...values);
  const anchor=['front','left'].includes(direction)?high:low,scale=Math.max(.1,1-amount/(high-low));
  return polygon.map(p=>p.map((value,i)=>i===axis?anchor+(value-anchor)*scale:value));
}
function vancouverSteps(state,podium) {
  const requestedStepback=state.vancouver.podiumStepback;
  const pausedReason=requestedStepback>0?(state.social.enabled?'Podium retreat is paused in tower-cluster mode.':state.publicSpace.enabled&&state.publicSpace.layout==='courtyard'?'Podium retreat is paused while an open courtyard passes through the podium.':state.podiumFloors===0?'Podium retreat is paused because no podium floors are present.':null):null;
  return {requestedStepback,appliedStepback:pausedReason?0:requestedStepback,stepDirection:state.vancouver.stepDirection,pausedReason,terraces:[],canopy:null};
}
function addPodiumCaps(state,floors,podiumRoof,vancouver) {
  if(!vancouver.appliedStepback||!podiumRoof)return;
  const tiers=[...floors.filter(f=>f.isPodium),podiumRoof];
  for(let i=0;i<tiers.length-1;i++)for(const [j,polygon] of exposedPodiumPieces(tiers[i].polygon,tiers[i+1].polygon).entries()) {
    const thickness=state.slabThickness,z=tiers[i+1].z-thickness;
    vancouver.terraces.push({id:`podium-terrace-${i+1}-${j+1}`,polygon,holes:[],z,thickness,area:polygonArea(polygon),floorIndex:tiers[i].index,role:'podium_terrace',solid:podiumCapSolid(polygon,z,thickness)});
  }
}
function addRainGallery(model) {
  const {state}=model,vancouver=model.vancouver;
  if(!model.valid||!state.vancouver.rainCover)return;
  const plan=model.floors.find(f=>f.isPodium)?.polygon||model.floors.find(f=>!f.isPodium)?.polygon;
  if(!plan?.length)return;
  const side=state.vancouver.gallerySide,alongX=['front','back'].includes(side),axis=alongX?0:1,crossAxis=1-axis;
  const low=Math.min(...plan.map(p=>p[axis])),high=Math.max(...plan.map(p=>p[axis])),sign=['front','left'].includes(side)?-1:1;
  const edge=(sign<0?Math.min(...plan.map(p=>p[crossAxis])):Math.max(...plan.map(p=>p[crossAxis])))+sign*.35;
  const depth=state.vancouver.canopyDepth,z=state.vancouver.canopyHeight,thickness=.18,length=high-low;
  const point=(along,out)=>alongX?[along,edge+sign*out]:[edge+sign*out,along];
  const polygon=cleanPolygon([point(low,0),point(high,0),point(high,depth),point(low,depth)]),postIds=[],beamIds=[];
  const beamDepth=.2,beamZ=z-beamDepth/2,stationCount=Math.ceil((length-.5)/6)+1;
  const rowDepths=[.22,depth-.22],stations=Array.from({length:stationCount},(_,i)=>low+.25+(length-.5)*i/(stationCount-1));
  for(const [i,along] of stations.entries()) {
    const rowPoints=rowDepths.map(out=>point(along,out));
    for(const [row,p] of rowPoints.entries()) {
      const id=`rain-gallery-post-${i+1}-${row+1}`,post=rectangularMember(id,[...p,0],[...p,beamZ],.18,.18,'rain_gallery',{kind:'column',component:'post',canopyId:'rain-gallery'});
      model.columns.push(post);postIds.push(id);
    }
    const id=`rain-gallery-transverse-${i+1}`;
    model.members.push(rectangularMember(id,[...rowPoints[0],beamZ],[...rowPoints[1],beamZ],.18,beamDepth,'rain_gallery',{component:'transverse_beam',canopyId:'rain-gallery'}));beamIds.push(id);
  }
  for(const [row,out] of rowDepths.entries()) {
    const id=`rain-gallery-longitudinal-${row+1}`;
    model.members.push(rectangularMember(id,[...point(stations[0],out),beamZ],[...point(stations.at(-1),out),beamZ],.18,beamDepth,'rain_gallery',{component:'longitudinal_beam',canopyId:'rain-gallery'}));beamIds.push(id);
  }
  vancouver.canopy={id:'rain-gallery',polygon,holes:[],z,thickness,length,area:polygonArea(polygon),side,depth,gap:.35,postIds,beamIds,role:'rain_gallery',solid:simplePrism(polygon,z,thickness),limits:'Independent concept rain gallery beside the chosen local bounding-box edge. Street alignment, accessibility, drainage, foundations, loads and detailing need coordination.'};
  model.summary.coveredFrontage=length;model.summary.coveredRainArea=vancouver.canopy.area;
  model.summary.columnCount=model.columns.length;model.summary.memberCount=model.members.length;
  const points=[...vancouver.canopy.solid.vertices,...model.columns.filter(c=>c.role==='rain_gallery').flatMap(c=>c.solid.vertices),...model.members.filter(c=>c.role==='rain_gallery').flatMap(c=>c.solid.vertices)];
  for(let axis=0;axis<3;axis++){model.bounds.min[axis]=Math.min(model.bounds.min[axis],...points.map(p=>p[axis]));model.bounds.max[axis]=Math.max(model.bounds.max[axis],...points.map(p=>p[axis]));}
  if(!insideSite(points,state.placement)) {
    const check=model.checks.find(c=>c.id==='site-fit');
    if(check){check.status='block';check.message+=' The rain-gallery roof or supports extend beyond the supplied site; revise its side/depth or building placement.';}
    model.summary.status='blocked';
  }
  model.checks.push({id:'rain-gallery',status:'review',title:'Independent rain gallery',message:`${round(length,1)} m of chosen-edge frontage and ${round(vancouver.canopy.area,1)} m² of separate rain-cover roof have two rows of posts, transverse beams and longitudinal collectors. This roof is excluded from occupied GFA.`,limits:vancouver.canopy.limits});
}

function buildSingleModel(input = {}) {
  const state = normalizeState(input);
  const plan = makePlan(state.shape, state.width, state.depth, state.customPlan);
  const podium = makePlan(state.podiumShape, state.podiumWidth, state.podiumDepth, state.podiumCustomPlan);
  const vancouver=vancouverSteps(state,podium);
  const checks = [];
  const addCheck = (id, status, title, message, extra = {}) => checks.push({ id, status, title, message, ...extra });
  if (!plan.length || (state.podiumFloors > 0 && !podium.length)) {
    addCheck(!plan.length ? 'plan-valid' : 'podium-plan-valid', 'block', !plan.length ? 'Plan boundary' : 'Podium boundary', validatePlan(!plan.length ? state.customPlan : state.podiumCustomPlan).message);
    return { schema: SCHEMA_VERSION, state, valid: false, floors: [], roof: null, core: null, columns: [], members: [], nodes: [], landscape: { enabled: false, inner: [], outer: [] }, checks,
      site: copy(SITE), bounds: { min: [-state.width / 2, -state.depth / 2, 0], max: [state.width / 2, state.depth / 2, state.height] },
      summary: { height: state.height, storeys: state.storeys, gfa: 0, fsr: 0, memberCount: 0, columnCount: 0, footprintArea: 0, netPlateArea: 0, minWidth: 0, slenderness: 0, maxTwist: 0, status: 'blocked' } };
  }
  addCheck('plan-valid', 'pass', 'Plan boundary', 'The floor boundary is simple and closed. All storeys use the same ordered perimeter points.');
  const core = { width: state.coreWidth, depth: state.coreDepth, wall: state.coreWall, height: state.height, polygon: rectangle(state.coreWidth, state.coreDepth), innerPolygon: rectangle(state.coreWidth - state.coreWall * 2, state.coreDepth - state.coreWall * 2) };
  // Four 4.8m podium storeys by default; remaining height is distributed over tower storeys.
  const podiumStoreyHeight = Math.min(4.8, state.height / state.storeys * 1.35);
  const podiumHeight = state.podiumFloors * podiumStoreyHeight;
  const towerStoreys = state.storeys - state.podiumFloors;
  const lift = state.publicSpace.enabled && state.podiumFloors > 0 ? state.publicSpace.lift : 0;
  const towerStoreyHeight = (state.height - lift - podiumHeight) / towerStoreys;
  const floors = [];
  for (let i = 0; i < state.storeys; i++) {
    const isPodium = i < state.podiumFloors;
    const t = isPodium ? 0 : (i - state.podiumFloors) / towerStoreys;
    const profile = sampleProfile(state.profile, t);
    const polygon = isPodium ? podiumRetreat(podium,vancouver.appliedStepback*i/state.podiumFloors,vancouver.stepDirection) : transformPlan(plan, profile);
    const z = lift + (isPodium ? i * podiumStoreyHeight : podiumHeight + (i - state.podiumFloors) * towerStoreyHeight);
    const height = isPodium ? podiumStoreyHeight : towerStoreyHeight;
    const grossArea = Math.abs(polygonArea(polygon));
    const coreFits = polygonContainsRectangle(polygon, core.polygon, 0.1);
    floors.push({ index: i + 1, z, bottom: z, top: z + height, height, t, polygon, holes: [copy(core.polygon)], grossArea, area: grossArea, netArea: Math.max(0, grossArea - state.coreWidth * state.coreDepth), width: projectedWidth(polygon, 0), depth: projectedWidth(polygon, Math.PI / 2),
      twist: isPodium ? 0 : profile.twist, scaleX: isPodium ? 1 : profile.scaleX, scaleY: isPodium ? 1 : profile.scaleY,
      isPodium, occupancy: i < state.nonresidentialFloors ? 'nonresidential' : 'residential', coreFits });
  }
  const roofPolygon = transformPlan(plan, sampleProfile(state.profile, 1));
  const roof = { z: state.height, polygon: roofPolygon, holes: [copy(core.polygon)], coreFits: polygonContainsRectangle(roofPolygon, core.polygon, 0.1), grossArea: Math.abs(polygonArea(roofPolygon)) };
  const publicSpace = buildPublicSpace(state, floors, roof, core, podium, podiumHeight, lift);
  const courtyard = publicSpace.courtyard.polygon;
  if (courtyard.length) floors.filter(f => f.isPodium).forEach(f => {
    f.holes.push(copy(courtyard)); f.grossArea -= polygonArea(courtyard); f.area = f.grossArea; f.netArea = Math.max(0, f.grossArea - core.width * core.depth);
  });
  const steppedPodium=podiumRetreat(podium,vancouver.appliedStepback,vancouver.stepDirection);
  const podiumRoof = state.podiumFloors > 0 ? { z: lift + podiumHeight, polygon: steppedPodium, holes: [copy(core.polygon), ...(courtyard.length ? [copy(courtyard)] : [])], coreFits: polygonContainsRectangle(steppedPodium, core.polygon, 0.1), grossArea: polygonArea(steppedPodium) - (courtyard.length ? polygonArea(courtyard) : 0), role: 'podium_roof' } : null;
  addPodiumCaps(state,floors,podiumRoof,vancouver);
  const { columns, members, nodes } = buildStructure(state, floors, roof, core,podiumRoof);
  addPodiumStructure(state, floors, podiumRoof, core, publicSpace, columns, members);
  const landscape = buildLandscape(state, floors, roof, core);
  convertTerraceTrusses(state, landscape, core, nodes);
  members.push(...landscape.supportMembers);
  const megaFloors = buildMegaFloors(state, floors, roof, core, columns, members, nodes);
  const allLevels = [...floors, roof, ...(podiumRoof ? [podiumRoof] : [])];
  const podiumTowerFit=!vancouver.appliedStepback||!podiumRoof||polygonContainsFootprint(podiumRoof.polygon,floors[state.podiumFloors].polygon);
  const badCore = allLevels.filter(f => !f.coreFits);
  const badSite = allLevels.filter(f => !insideSite(f.polygon, state.placement));
  const landscapeSiteFit = !landscape.enabled || insideSite([...landscape.outer, ...landscape.guards.flatMap(g => g.solid.vertices)], state.placement);
  const area = SITE.width * SITE.depth;
  const gfa = floors.reduce((sum, f) => sum + f.grossArea, 0);
  const briefNominalSiteArea = 11468.16;
  const nonresidentialGfa = floors.filter(f => f.occupancy === 'nonresidential').reduce((sum, f) => sum + f.grossArea, 0);
  // Conservative concept screen: minimum height-weighted projected width over 36 headings.
  const weights = floors.map(f => Math.max(f.z + f.height / 2, f.height / 2) * f.height);
  const weightTotal = weights.reduce((a, b) => a + b, 0);
  const effectiveWidths = Array.from({ length: 36 }, (_, j) => floors.reduce((sum, f, i) => sum + projectedWidth(f.polygon, j * Math.PI / 36) * weights[i], 0) / weightTotal);
  const minWidth = Math.min(...effectiveWidths);
  const maxTwist = Math.max(...state.profile.map(p => Math.abs(p.twist)));
  const twistRange = Math.max(...state.profile.map(p => p.twist)) - Math.min(...state.profile.map(p => p.twist));
  const summary = {
    height: state.height, storeys: state.storeys, podiumHeight, podiumRoofHeight: lift + podiumHeight, publicSpaceHeight: lift, pilotisCount: publicSpace.pilotisCount, typicalStoreyHeight: towerStoreyHeight,
    gfa, fsr: gfa / area, siteArea: area, briefNominalSiteArea, nonresidentialGfa, nonresidentialFsrNominal: nonresidentialGfa / briefNominalSiteArea,
    footprintArea: floors[0].grossArea, towerBaseArea: floors[state.podiumFloors].grossArea,
    roofArea: roof.grossArea, minPlateArea: Math.min(...floors.filter(f => !f.isPodium).map(f => f.grossArea), roof.grossArea),
    maxPlateArea: Math.max(...floors.filter(f => !f.isPodium).map(f => f.grossArea)), netPlateArea: floors.at(-1).netArea,
    minWidth, slenderness: state.height / minWidth, maxTwist, twistRange, memberCount: members.length,
    diagonalCount: members.filter(m => m.kind === 'diagonal').length, columnCount: columns.length,
    externalLandscapeArea: landscape.externalArea, landscapeSlopePercent: 0, terraceCount: landscape.decks.length, terraceSupportCount: landscape.supportMembers.length, terraceTrussCount: landscape.trussFrames.length, terraceClearWidth: landscape.clearWidth || 0,
    megaFloorCount: megaFloors.bands.length, megaColumnCount: megaFloors.columnIds.length, megaMemberCount: megaFloors.memberCount || 0,
    highestOccupiedFloor: floors.at(-1).z + state.slabThickness, coreArea: core.width * core.depth,
    coveredFrontage:0,coveredRainArea:0,podiumTerraceArea:vancouver.terraces.reduce((sum,t)=>sum+t.area,0),
    structuralCapacity: 'not computed', status: badCore.length || badSite.length || !landscapeSiteFit || landscape.supportFailures.length || !publicSpace.courtyard.valid || megaFloors.supportFailures.length || !podiumTowerFit ? 'blocked' : 'concept'
  };
  addCheck('site-fit', badSite.length || !landscapeSiteFit ? 'block' : 'pass', 'Site envelope', badSite.length || !landscapeSiteFit ? `${badSite.length} level boundaries${!landscapeSiteFit ? ' and the exterior landscape band' : ''} extend beyond the supplied site. Reduce the plate, podium, twist, swelling or band width.` : 'Every floor, roof and exterior landscape boundary fits inside the supplied Rhino site rectangle.', { affectedFloors: badSite.map(f => f.index ?? 'roof'), limits: 'Boundary fit only; setbacks, height limits, view cones, access and zoning are not evaluated.' });
  addCheck('core-fit', badCore.length ? 'block' : 'pass', 'Fixed core fits', badCore.length ? `The fixed core does not fit ${badCore.length} levels with a 0.10 m modelling clearance. Widen the upper plate, reduce taper or revise the core.` : 'The fixed core corners and edges fit every plate, including the roof, with a 0.10 m modelling clearance.', { affectedFloors: badCore.map(f => f.index ?? 'roof'), limits: 'No core capacity, stair or lift planning check.' });
  if(vancouver.pausedReason)addCheck('podium-stepback','review','Podium retreat paused',vancouver.pausedReason+' The existing occupied podium and roof are retained; no retreat caps are generated.');
  else if(vancouver.appliedStepback) {
    addCheck('podium-stepback','review','Stepped occupied podium',`${round(vancouver.appliedStepback,1)} m total ${vancouver.stepDirection}-edge retreat changes the actual occupied podium plates and roof. ${round(summary.podiumTerraceArea,1)} m² of closed exposed caps closes the occupied lower tiers and is separate from occupied GFA.`,{limits:'Editable architectural study. The affine retreat can leave schematic slab cantilevers beyond the continuous pilotis; transfer framing and its load path require engineering. Roof gardens, guards, walkable routes, accessibility, drainage and load capacity need design; these dimensions are not City zoning rules.'});
    addCheck('podium-tower-fit',podiumTowerFit?'pass':'block','Tower bearing on podium roof',podiumTowerFit?'The complete tower-base boundary fits inside the stepped podium roof.':'The tower-base boundary extends beyond the stepped podium roof. Reduce the retreat or tower, or enlarge the podium.',{limits:'Plan containment only. Tower-to-podium transfer capacity is not computed.'});
  }
  const continuousColumns = columns.filter(c => c.role === 'gravity');
  addCheck('gravity-path', continuousColumns.length ? 'pass' : 'review', 'Continuous gravity columns', continuousColumns.length ? `${continuousColumns.length} fixed vertical column sections remain inside every plate and outside the core. They continue from grade to roof.` : 'No fixed grid columns fit every plate. Revise the plan/core/grid or engineer another gravity support arrangement.', { limits: 'Only geometric continuity is checked; gravity capacity, spans and foundations are unresolved.' });
  if (publicSpace.enabled) {
    addCheck('courtyard-fit', publicSpace.courtyard.valid ? 'pass' : 'block', 'Open courtyard geometry', publicSpace.courtyard.requested ? (publicSpace.courtyard.valid ? 'The circular courtyard fits inside the podium and outside the projected tower and core. Its aperture continues through each podium slab and the podium roof.' : 'The requested courtyard cannot fit clear of the tower/core projection inside this podium. Enlarge or reshape the podium, reduce its radius, or choose the sheltered plaza.') : 'The sheltered plaza has a complete podium roof; no open courtyard is requested.', { limits: 'Plan overlap and slab apertures only; smoke control, drainage, fire strategy and safe access are unresolved.' });
    addCheck('public-space', 'review', 'Ground public space and pilotis', `The podium starts ${round(lift, 1)} m above grade. ${publicSpace.pilotisCount} additional pilotis reach its roof; radial floor-beam reservations tie them to the core. Nominal underside clearance is ${round(lift, 1)} m, reduced to ${round(publicSpace.minimumClearHeight, 1)} m below the beam reservations.`, { limits: `Pilotis capacity, podium transfer, entrances, egress, fire access and grade need design.${publicSpace.routeColumnConflicts ? ` ${publicSpace.routeColumnConflicts} columns intersect the reserved ground promenade; its alignment needs revision.` : ''}` });
  }
  addCheck('diagonal-path', 'review', 'Diagonal load path', state.structure === 'core_columns' ? 'The core and continuous columns are reserved. Choose a diagonal system to explore an external lateral frame.' : `${summary.diagonalCount} diagonal members join shared perimeter nodes between ${state.diagridModule}-storey module seams. Podium transfer, intermediate slab connections, joints, buckling and lateral capacity require engineering.`, { limits: 'Diagrid and X geometry represent force-path intent. No shear force, stiffness, drift or resistance has been computed.' });
  if (twistRange > 0.01) addCheck('twist-path', 'review', 'Twist and torsion', `The plate rotates ${round(twistRange, 1)}° across the tower. Core and gravity columns stay vertical; rotating perimeter seams need torsional, connection and diaphragm analysis.`, { limits: 'No twisted core or unsupported spiral gravity column is generated.' });
  if (landscape.enabled) {
    addCheck('terrace-load-path', landscape.supportFailures.length ? 'block' : 'pass', 'Terrace connection geometry', landscape.supportFailures.length ? `${landscape.supportFailures.length} terrace decks have crossing offsets or radial beams that leave their floor/deck. Revise the plan, terrace span or width.` : `${landscape.decks.length} horizontal decks overlap their assigned slabs. Their ${landscape.supportMembers.length} ${state.landscape.supportType === 'truss' ? 'truss, secondary radial, edge and bearing' : 'radial, edge and bearing'} reservations connect the deck underside to the continuous core wall.`, {
      affectedFloors: landscape.supportFailures.map(f => f.floorIndex), failures: landscape.supportFailures, limits: 'Checks shared geometry and contact only; beam capacity, cantilever deflection, anchorage, punching, torsion, joints, core and foundation loads are not calculated.'
    });
    addCheck('landscape-band', 'review', 'Level terrace access', `${landscape.decks.length} level terraces rotate around the tower. Each is reached from its own floor; no continuous upward walking ramp connects them. ${round(landscape.externalArea)} m² is reported separately from occupied floor area.`, {
      limits: `The nominal clear strip is ${round(landscape.clearWidth, 2)} m after the planting zone. Door openings, threshold details, guard adequacy, accessible circulation and exits remain preliminary.${landscape.clearWidth < 1.6 ? ' The selected terrace depth leaves less than the 1.6 m access reservation; widen it.' : ''}`
    });
    addCheck('terrace-engineering', 'review', 'Terrace gravity design', 'Deck and saturated planting weight are intended to reach radial and edge beams, then the continuous core and foundations. The support volumes represent that arrangement without sizing its resistance.', { limits: 'Soil and water loads, occupancy loads, thermal movement, drainage, waterproofing, fire strategy and every connection require coordinated engineering.' });
    if (state.landscape.supportType === 'truss') addCheck('terrace-truss', 'review', 'Terrace truss reservations', `${landscape.trussFrames.length} ${state.trussPattern === 'vierendeel' ? 'Vierendeel frames' : `${state.trussPattern} trusses`} replace selected primary radial beams. Secondary beams, slab bearings and the connected edge collector remain. The ${round(state.landscape.trussDepth, 2)} m-deep frames occupy space below the deck.`, { limits: `Core anchors, chords and collector posts share modelled nodes; joints, loads, member stability and lower-floor headroom are unresolved.${state.trussPattern === 'vierendeel' ? ' Vierendeel uses rigid moment joints and has no diagonal truss web.' : ''}` });
    if (state.structure !== 'core_columns') addCheck('terrace-frame-interface', 'review', 'Terraces and diagonal frame', 'The diagonal frame follows the occupied-floor edge while terraces project outward. Facade entry/headroom and deck-to-frame intersections require coordination; no diagonal crossing is treated as a designed support joint.', { limits: 'Terrace gravity support is modelled to the core. Diagrid capacity, slab attachments and unobstructed facade entrances are unresolved.' });
  }
  if (megaFloors.enabled) {
    addCheck('mega-load-path', megaFloors.supportFailures.length ? 'block' : 'pass', 'Mega-floor connection geometry', megaFloors.supportFailures.length ? megaFloors.supportFailures.join(' ') : `${megaFloors.bands.length} actual floor-level outrigger/belt bands join the core to ${megaFloors.columnIds.length} continuous outer columns. Their shared nodes and closed member volumes represent the connection arrangement.`, { limits: 'Geometry only: no forces, drift, stiffness, column loads, seismic or wind response, foundations or capacity are calculated.' });
    const actualDepths = [...new Set(megaFloors.bands.map(band => band.depthStoreys))].join(' / ');
    addCheck('mega-zone', 'review', 'Deep mega-floor coordination', `${megaFloors.bands.length} ${state.trussPattern === 'vierendeel' ? 'Vierendeel frame' : state.trussPattern + ' truss'} bands ${megaFloors.bands.length ? `occupy ${actualDepths}-storey zones` : 'could not be reserved'}. A service/mechanical reservation needs to be coordinated; the programme has not been reassigned.`, { affectedFloors: megaFloors.bands.flatMap(band => band.mechanicalZone.floorIndices), limits: `Doors, lifts, circulation, structure/fire resistance, transfer and joints require design.${megaFloors.omittedBands ? ` ${megaFloors.omittedBands} requested bands could not fit without overlapping; increase tower storeys or reduce count/depth.` : ''}${megaFloors.bands.some(band => band.depthStoreys !== state.megaFloors.depthStoreys) ? ' The requested band depth was reduced to the available actual tower levels.' : ''}${megaFloors.strengtheningFailures.length ? ` ${megaFloors.strengtheningFailures.length} requested enlarged column sections did not fit all levels and retain their original sections.` : ''}${state.trussPattern === 'vierendeel' ? ' Vierendeel requires rigid moment joints; it is a frame rather than a triangulated truss.' : ''}` });
  }
  addCheck('floor-height', towerStoreyHeight < 3 || towerStoreyHeight > 5 ? 'review' : 'pass', 'Storey coordination', `Tower storeys are ${round(towerStoreyHeight, 2)} m floor to floor. Slabs are ${round(state.slabThickness, 2)} m schematic reservations.`, { limits: 'Slab thickness, beam depths, service zones and clear headroom are not sized.' });
  addCheck('competition-height', state.height < 244 || state.height > 305 ? 'review' : 'pass', 'Competition height', `The tower roof is ${round(state.height, 1)} m above schematic grade. ${state.height < 244 || state.height > 305 ? 'Revise it to the brief’s 244–305 m range.' : 'It falls within the brief’s 244–305 m range.'}`, { kind: 'competition_screen', limits: 'Height range screen only; grade, roof definition, zoning and the complete competition brief still require review.' });
  addCheck('competition-nonresidential', nonresidentialGfa < 103213.44 ? 'review' : 'pass', 'Nonresidential programme', `${round(nonresidentialGfa)} m² across ${state.nonresidentialFloors} assigned floors gives ${round(nonresidentialGfa / briefNominalSiteArea, 2)} nominal FSR. ${nonresidentialGfa < 103213.44 ? 'The brief’s minimum 9 nonresidential FSR (103,213.44 m²) is not reached.' : 'The geometric area reaches the brief’s minimum 9 nonresidential FSR (103,213.44 m²).'} `, {
    kind: 'competition_screen', limits: 'Uses the brief’s nominal 11,468.16 m² site area, separately from measured Rhino site area. Gross plate area is preliminary; FSR exclusions, mixed uses and full programme compliance are not evaluated.'
  });
  addCheck('high-building', 'review', 'High-building measures', summary.highestOccupiedFloor > 18 ? `The top-storey floor is ${round(summary.highestOccupiedFloor, 1)} m above assumed grade, exceeding the >18 m amended height trigger. High-building provisions and exemption conditions need review.` : 'The >18 m top-storey-floor trigger is not reached. Occupancy triggers and exemption conditions still need review.', {
    kind: 'code_applicability', applicability: summary.highestOccupiedFloor > 18 ? 'triggered' : 'review_required', clause: 'VBBL 2025 Div B 3.2.6.1.(1), By-law 14688 s.15', sourceUrl: 'https://bylaws.vancouver.ca/consolidated/14688.pdf', verifiedOn: '2026-10-11',
    limits: 'Grade is assumed z=0. Group B2/B3 above the third storey and Sentence (3) exemption conditions are not evaluated.'
  });
  addCheck('dynamic-wind', 'review', 'Dynamic wind study', `Height / concept effective width is ${round(summary.slenderness, 2)}. ${state.height > 60 || state.height > 4 * minWidth ? 'The geometric dynamic-wind screen is triggered.' : 'Natural frequency is needed to complete the screen.'} ${state.height > 6 * minWidth ? 'The >6 width ratio also flags a wind-tunnel procedure review.' : 'Frequency and surrounding-building effects remain unresolved.'}`, {
    kind: 'code_applicability', clause: 'VBBL Div B 4.1.7.1.–4.1.7.2.', sourceUrl: 'https://vancouver.ca/files/cov/vbbl-2025-volume-1-v4-01.pdf',
    limits: 'Projected width is a 36-direction, height-weighted concept approximation for changing nonrectangular plates. Current full consolidated clauses, frequency, wind response and wake effects remain unverified.'
  });
  addCheck('part-4', 'review', 'Engineering analysis', 'Wind and seismic loads, load combinations, gravity, drift, stability, foundations, fire resistance and member capacity have not been calculated.', { kind: 'code_coordination', clause: 'VBBL Division B Part 4', sourceUrl: 'https://vancouver.ca/your-government/vancouver-building-bylaw.aspx' });
  const points = [...allLevels.flatMap(f => f.polygon), ...landscape.outer.map(p => p.slice(0, 2)), ...landscape.guards.flatMap(g => g.solid.vertices.map(p => p.slice(0, 2)))];
  const bounds = { min: [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), 0], max: [Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1])), state.height] };
  return { schema: SCHEMA_VERSION, valid: true, state, floors, roof, podiumRoof, publicSpace, vancouver, megaFloors, placement: copy(state.placement), core, columns, members, nodes, landscape, checks, summary, site: copy(SITE), bounds };
}

// Studio interpretations of the publisher-described tower-cluster / vertical-campus
// idea. These labels are not represented as the book's unverified full taxonomy.
const translatePoint = (p, offset) => [p[0] + offset[0], p[1] + offset[1], ...p.slice(2)];
const translateLoop = (loop, offset) => loop.map(p => translatePoint(p, offset));
function translateSolid(solid, offset) { return solid ? {vertices: translateLoop(solid.vertices, offset), faces: copy(solid.faces)} : undefined; }
function translateLevel(floor, offset, towerId) {
  return {...copy(floor), towerId, polygon: translateLoop(floor.polygon, offset), holes: (floor.holes || []).map(h => translateLoop(h, offset))};
}
function translateMember(member, offset, towerId) {
  const m = {...copy(member), id: `${towerId}-${member.id}`, towerId, start: translatePoint(member.start, offset), end: translatePoint(member.end, offset)};
  for (const key of ['startNode','endNode','columnId','frameId','trussId','bandId','deckId','originalRadialId']) if (m[key]) m[key] = `${towerId}-${m[key]}`;
  if (member.solid) m.solid = translateSolid(member.solid, offset);
  return m;
}
function simplePrism(polygon, bottom, thickness) {
  const n = polygon.length, vertices = [...polygon.map(p => [...p,bottom]), ...polygon.map(p => [...p,bottom+thickness])], faces = [];
  for (let i = 1; i < n - 1; i++) faces.push([0,i+1,i],[n,n+i,n+i+1]);
  for (let i = 0; i < n; i++) {const j=(i+1)%n; faces.push([i,j,n+j],[i,n+j,n+i]);}
  return {vertices, faces};
}
function convexIntersection(subject, clip) {
  let output = subject.map(p => [...p]);
  for (let i = 0; i < clip.length && output.length; i++) {
    const a=clip[i], b=clip[(i+1)%clip.length], input=output; output=[];
    const side=p=>cross(a,b,p), intersection=(p,q)=>{const sp=side(p),sq=side(q),t=sp/(sp-sq);return[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];};
    for(let j=0;j<input.length;j++){const p=input[j],q=input[(j+1)%input.length],pin=side(p)>=-EPS,qin=side(q)>=-EPS;if(pin&&qin)output.push(q);else if(pin)output.push(intersection(p,q));else if(qin)output.push(intersection(p,q),q);}
  }
  return output;
}
// Ear clipping allows the occupied overlap ledger to handle concave custom plans.
function triangulatePolygon(polygon) {
  const points=polygonArea(polygon)<0?[...polygon].reverse():polygon, ids=points.map((_,i)=>i), triangles=[];
  for(let guard=0;ids.length>3&&guard<points.length*points.length;guard++){
    let found=false;
    for(let k=0;k<ids.length;k++) {const a=points[ids[(k-1+ids.length)%ids.length]],b=points[ids[k]],c=points[ids[(k+1)%ids.length]];if(cross(a,b,c)<=EPS)continue;
      if(ids.some((id,j)=>![k,(k-1+ids.length)%ids.length,(k+1)%ids.length].includes(j)&&cross(a,b,points[id])>=-EPS&&cross(b,c,points[id])>=-EPS&&cross(c,a,points[id])>=-EPS))continue;
      triangles.push([a,b,c]);ids.splice(k,1);found=true;break;
    } if(!found)break;
  } if(ids.length===3)triangles.push(ids.map(i=>points[i]));return triangles;
}
function overlapArea(polygon, rectangle) {return triangulatePolygon(polygon).reduce((a,t)=>a+Math.abs(polygonArea(convexIntersection(t,rectangle))),0);}
function clusterPositions(social) {
  const s=social.separation;
  return ['sky_plaza','vertical_campus'].includes(social.typology) ? [[-s,-6],[0,10],[s,-6]] : [[-s/2,0],[s/2,0]];
}
function coreFacePoint(core, center, direction, z) {
  const dx=direction[0],dy=direction[1],t=Math.min(Math.abs(dx)>EPS?core.width/2/Math.abs(dx):Infinity,Math.abs(dy)>EPS?core.depth/2/Math.abs(dy):Infinity);
  // Embedded in the wall shell, rather than ending at a floating envelope line.
  return [center[0]+dx*(t-core.wall/2),center[1]+dy*(t-core.wall/2),z];
}
function buildSocialCluster(state) {
  const base=buildSingleModel({...state,social:{...state.social,enabled:false},vancouver:{...state.vancouver,podiumStepback:0,rainCover:false},landscape:{...state.landscape,enabled:false},megaFloors:{...state.megaFloors,enabled:false},publicSpace:{...state.publicSpace,layout:state.publicSpace.layout==='courtyard'?'open_plaza':state.publicSpace.layout}});
  if(!base.valid) {base.state=state;return base;}
  const offsets=clusterPositions(state.social), podiumFloors=base.floors.filter(f=>f.isPodium).map(copy), towerFloors=base.floors.filter(f=>!f.isPodium);
  const towers=offsets.map((offset,i)=>{
    const id=`tower-${i+1}`, core={...copy(base.core),towerId:id,center:[...offset],polygon:translateLoop(base.core.polygon,offset),innerPolygon:translateLoop(base.core.innerPolygon,offset)};
    return {id,offset,core,floors:towerFloors.map(f=>translateLevel(f,offset,id)),roof:translateLevel(base.roof,offset,id),columns:base.columns.filter(c=>c.role==='gravity').map(c=>translateMember(c,offset,id)),members:base.members.filter(m=>m.floorIndex>state.podiumFloors||m.kind==='diagonal'||/^mega_|terrace/.test(m.role||'')).map(m=>translateMember(m,offset,id))};
  });
  const allCores=towers.map(t=>copy(t.core.polygon));
  for(const floor of podiumFloors){floor.holes=copy(allCores);floor.coreFits=allCores.every(c=>polygonContainsFootprint(floor.polygon,c));floor.netArea=Math.max(0,floor.grossArea-allCores.length*base.core.width*base.core.depth);}
  const podiumRoof=base.podiumRoof?{...copy(base.podiumRoof),holes:copy(allCores),coreFits:allCores.every(c=>polygonContainsFootprint(base.podiumRoof.polygon,c))}:null;
  const columns=towers.flatMap(t=>t.columns), members=towers.flatMap(t=>t.members), nodes=towers.flatMap(t=>base.nodes.map(n=>({...copy(n),id:`${t.id}-${n.id}`,towerId:t.id,point:translatePoint(n.point,t.offset)})));
  // One common podium: a separate grid of pilotis, with actual nearest-core beams.
  const podium=podiumFloors[0]?.polygon||podiumRoof?.polygon, half=state.columnSection/2;
  if(podium&&podiumRoof)for(let x=-state.podiumWidth/2+5;x<state.podiumWidth/2-3;x+=state.columnSpacing)for(let y=-state.podiumDepth/2+5;y<state.podiumDepth/2-3;y+=state.columnSpacing){
    const footprint=[[x-half,y-half],[x+half,y-half],[x+half,y+half],[x-half,y+half]];
    if(!polygonContainsFootprint(podium,footprint)||allCores.some(c=>polygonsOverlap(c,footprint))||columns.some(c=>dist(c.start,[x,y])<state.columnSection))continue;
    const tower=towers.reduce((best,t)=>!best||dist(t.offset,[x,y])<dist(best.offset,[x,y])?t:best,null),delta=[x-tower.offset[0],y-tower.offset[1]],l=Math.hypot(...delta),dir=delta.map(v=>v/l);
    const id=`shared-pilotis-${columns.length}`;columns.push({id,start:[x,y,0],end:[x,y,podiumRoof.z],section:state.columnSection,role:'podium_pilotis'});
    for(const f of [...podiumFloors,podiumRoof]){const z=f.z-state.landscape.beamDepth/2,start=coreFacePoint(tower.core,tower.offset,dir,z),end=[x,y,z];if(segmentInUnion(start,end,[podium]))members.push(rectangularMember(`${id}-floor-${f.index||'roof'}`,start,end,state.landscape.beamWidth,state.landscape.beamDepth,'podium_floor_beam',{floorIndex:f.index||'podium_roof',towerId:tower.id}));}
  }
  const connectors=[],guards=[],supportMembers=[],failures=[];
  const levels=[...new Set(state.social.levels.map(t=>Math.min(towerFloors.length-1,Math.max(0,Math.round(t*(towerFloors.length-1))))))];
  levels.forEach((level,li)=>{
    for(let pair=0;pair<towers.length-1;pair++){
      const a=towers[pair],b=towers[pair+1],fa=a.floors[level],fb=b.floors[level],id=`sky-${li+1}-${pair+1}`,delta=[b.offset[0]-a.offset[0],b.offset[1]-a.offset[1]],length=Math.hypot(...delta),u=delta.map(v=>v/length),v=[-u[1],u[0]],zTop=fa.z+state.slabThickness,thickness=.45,zBottom=zTop-thickness;
      const coreStart=coreFacePoint(a.core,a.offset,u,zBottom),coreEnd=coreFacePoint(b.core,b.offset,u.map(n=>-n),zBottom),width=state.social.deckWidth;
      const faceExtent=core=>(Math.abs(u[0])*core.width+Math.abs(u[1])*core.depth)/2+.1;
      const start=[a.offset[0]+u[0]*faceExtent(a.core),a.offset[1]+u[1]*faceExtent(a.core),zBottom],end=[b.offset[0]-u[0]*faceExtent(b.core),b.offset[1]-u[1]*faceExtent(b.core),zBottom];
      // End platforms lie inside the occupied plates and overlap their slab volume.
      const p=(point,side)=>[point[0]+v[0]*width/2*side,point[1]+v[1]*width/2*side];
      const polygon=[p(start,-1),p(end,-1),p(end,1),p(start,1)];
      const bearingCorners=[p(start,-1),p(start,1),p(end,-1),p(end,1)];
      const bearingFits=segmentInUnion(bearingCorners[0],bearingCorners[1],[fa.polygon])&&segmentInUnion(bearingCorners[2],bearingCorners[3],[fb.polygon]);
      const overlap=overlapArea(fa.polygon,polygon)+overlapArea(fb.polygon,polygon),area=Math.abs(polygonArea(polygon)),externalArea=Math.max(0,area-overlap);
      const deck={id,floorIndex:fa.index,zTop,zBottom,thickness,width,polygon,solid:simplePrism(polygon,zBottom,thickness),fromTower:a.id,toTower:b.id,bearings:[{towerId:a.id,floorIndex:fa.index,point:coreStart,coreWallEmbedM:a.core.wall/2},{towerId:b.id,floorIndex:fb.index,point:coreEnd,coreWallEmbedM:b.core.wall/2}],bearingFits,area,externalArea,occupiedOverlapArea:area-externalArea,framingDepth:2.5};connectors.push(deck);
      if(!bearingFits||Math.abs(fa.z-fb.z)>EPS)failures.push(`${id}: entry/bearing reservations do not fit matching occupied floors.`);
      // Two deep edge truss reservations, anchored into the continuous wall shells.
      const span=dist(start,end),panels=Math.max(4,Math.ceil(span/6)),topZ=zBottom-.2,bottomZ=topZ-deck.framingDepth;
      const edgeFrames=[];
      for(const side of [-1,1]){
        const offset=(Math.min(width,a.core.width,a.core.depth,b.core.width,b.core.depth)/2-1)*side;
        const anchor=(tower,direction)=>{
          const origin=[tower.offset[0]+v[0]*offset,tower.offset[1]+v[1]*offset], hw=tower.core.width/2,hd=tower.core.depth/2;
          const tx=Math.abs(direction[0])>EPS?((direction[0]>0?hw:-hw)-(origin[0]-tower.offset[0]))/direction[0]:Infinity;
          const ty=Math.abs(direction[1])>EPS?((direction[1]>0?hd:-hd)-(origin[1]-tower.offset[1]))/direction[1]:Infinity;
          const axis=tx<ty?0:1,travel=Math.min(tx,ty)-tower.core.wall/2/Math.abs(direction[axis]);
          return [origin[0]+direction[0]*travel,origin[1]+direction[1]*travel];
        };
        const first=anchor(a,u),last=anchor(b,u.map(n=>-n));
        const at=(t,z)=>[first[0]+(last[0]-first[0])*t,first[1]+(last[1]-first[1])*t,z];edgeFrames.push(at);
        deck.bearings.push({towerId:a.id,floorIndex:fa.index,point:at(0,topZ),coreWallEmbedM:a.core.wall/2,side},{towerId:b.id,floorIndex:fb.index,point:at(1,topZ),coreWallEmbedM:b.core.wall/2,side});
        for(let j=0;j<panels;j++){
          const t=j/panels,q=(j+1)/panels;
          supportMembers.push(rectangularMember(`${id}-${side}-top-${j}`,at(t,topZ),at(q,topZ),.35,.4,'sky_top_chord',{connectorId:id,fromTower:a.id,toTower:b.id}));
          supportMembers.push(rectangularMember(`${id}-${side}-bottom-${j}`,at(t,bottomZ),at(q,bottomZ),.35,.4,'sky_bottom_chord',{connectorId:id}));
          supportMembers.push(rectangularMember(`${id}-${side}-web-${j}`,at(t,j%2?topZ:bottomZ),at(q,j%2?bottomZ:topZ),.28,.28,'sky_web',{connectorId:id}));
        }
        for(const [j,t] of [0,1].entries())supportMembers.push(rectangularMember(`${id}-${side}-post-${j}`,at(t,bottomZ),at(t,topZ),.4,.4,'sky_bearing_post',{connectorId:id,towerId:j?b.id:a.id}));
      }
      for(let j=0;j<=panels;j++){
        const t=j/panels,left=edgeFrames[0](t,topZ),right=edgeFrames[1](t,topZ),overhang=width/2-(Math.min(width,a.core.width,a.core.depth,b.core.width,b.core.depth)/2-1);
        supportMembers.push(rectangularMember(`${id}-cross-${j}`,[left[0]-v[0]*overhang,left[1]-v[1]*overhang,left[2]],[right[0]+v[0]*overhang,right[1]+v[1]*overhang,right[2]],.35,.4,'sky_cross_beam',{connectorId:id}));
      }
      // Guard reservations are restricted to the open gap, leaving both floor entries open.
      for(const side of [-1,1]){
        const offset=width/2-.04,at=t=>[start[0]+(end[0]-start[0])*t+v[0]*offset,start[1]+(end[1]-start[1])*t+v[1]*offset,zTop+.55];
        const samples=Array.from({length:201},(_,j)=>j/200),open=samples.filter(t=>!pointInPolygon(at(t),fa.polygon)&&!pointInPolygon(at(t),fb.polygon));
        if(open.length>1)guards.push(rectangularMember(`${id}-guard-${side}`,at(open[0]),at(open.at(-1)),.08,1.1,'sky_guard',{connectorId:id,floorIndex:fa.index}));
      }
    }
  });
  for(const deck of connectors){const a=towers.find(t=>t.id===deck.fromTower).floors.find(f=>f.index===deck.floorIndex),b=towers.find(t=>t.id===deck.toTower).floors.find(f=>f.index===deck.floorIndex);if(supportMembers.some(m=>m.connectorId===deck.id&&!segmentInUnion(m.start,m.end,[a.polygon,b.polygon,deck.polygon])))failures.push(`${deck.id}: a support reservation leaves the occupied floor / shared deck projection.`);}
  members.push(...supportMembers);
  const primary=towers[0],publicSpace=copy(base.publicSpace);publicSpace.layout=state.publicSpace.layout==='courtyard'?'open_plaza':state.publicSpace.layout;
  publicSpace.courtyard={requested:false,valid:true,polygon:[]};publicSpace.pilotisCount=columns.filter(c=>c.role==='podium_pilotis').length;
  if(publicSpace.ground)publicSpace.ground.holes=copy(allCores);
  publicSpace.gardens=(publicSpace.gardens||[]).filter(g=>!allCores.some(c=>polygonsOverlap(g.polygon,c)));
  publicSpace.routes=[];
  const allFloors=[...podiumFloors,...towers.flatMap(t=>t.floors)],gfa=allFloors.reduce((a,f)=>a+f.grossArea,0),nonresidentialGfa=allFloors.filter(f=>f.occupancy==='nonresidential').reduce((a,f)=>a+f.grossArea,0);
  const sitePoints=[...allFloors.flatMap(f=>f.polygon),...towers.flatMap(t=>t.roof.polygon),...connectors.flatMap(d=>d.solid.vertices),...guards.flatMap(g=>g.solid.vertices),...supportMembers.flatMap(m=>m.solid.vertices),...(podiumRoof?.polygon||[])];
  const siteFits=insideSite(sitePoints,state.placement),coreFits=allFloors.every(f=>f.coreFits)&&towers.every(t=>t.roof.coreFits)&&(!podiumRoof||podiumRoof.coreFits);
  let towerOverlap=false;for(let i=0;i<towers.length;i++)for(let j=i+1;j<towers.length;j++)if(towers[i].floors.some((f,k)=>polygonsOverlap(f.polygon,towers[j].floors[k].polygon)))towerOverlap=true;
  const sharedSkyArea=connectors.reduce((a,d)=>a+d.externalArea,0),checks=base.checks.filter(c=>!['site-fit','core-fit','gravity-path','competition-nonresidential','courtyard-fit','public-space','terrace-load-path','landscape-band','terrace-engineering','terrace-truss','terrace-frame-interface','mega-load-path','mega-zone'].includes(c.id));
  checks.unshift({id:'site-fit',status:siteFits?'pass':'block',title:'Cluster site envelope',message:siteFits?'All cluster floors, roofs, shared podium and sky-deck reservations fit the supplied site.':'The cluster or shared podium extends beyond the supplied site; reduce separation or dimensions, or reposition.',limits:'Geometric boundary fit only; zoning, setbacks and view cones remain separate.'},{id:'core-fit',status:coreFits?'pass':'block',title:'Independent tower cores',message:coreFits?`${towers.length} independent hollow core walls continue from grade to roof and fit every tower floor and shared podium.`:'One or more cores do not fit every floor or the shared podium.'},{id:'cluster-separation',status:towerOverlap?'block':'pass',title:'Tower separation geometry',message:towerOverlap?'Occupied tower plates overlap. Increase separation or reduce plan/profile dimensions.':'Occupied tower plates are geometrically separate; common sky decks are modelled at matching floor elevations.',limits:'No planning, privacy, fire-separation or seismic-joint distance is checked.'},{id:'sky-connections',status:failures.length?'block':'pass',title:'Shared sky-deck connections',message:failures.length?failures.join(' '):`${connectors.length} closed level decks overlap actual floor slabs, with under-deck chords, webs and bearing posts anchored into each tower core wall.`,limits:'Member depths are reservations; capacity, joint movement, progressive collapse, diaphragm action, anchorage, egress and accessible public routes require engineering.'},{id:'social-typology',status:'review',title:'Socializing the Sky · Studio interpretation',message:'Tower clusters, vertical campus, sky plazas, bridges and outlook decks inform these editable starting options. The four Studio preset names and geometry are our interpretations, not a verified reproduction of the book taxonomy.',sourceUrl:'https://oroeditions.com/product/socializing-the-sky',limits:'Public access, amenities, management, fire strategy and circulation need project design. No people-flow, structural or environmental simulation is computed.'},{id:'shared-area',status:'review',title:'Shared-space area ledger',message:`${round(sharedSkyArea,1)} m² of external shared sky-deck area is separate from ${round(gfa,1)} m² of occupied gross floor area. Podium floors are counted once; deck overlap inside tower slabs is excluded from the additional sky area.`,limits:'External shared decks are not counted as occupied GFA here; legal FSR treatment needs review.'});
  checks.push({id:'gravity-path',status:towers.every(t=>t.columns.length)?'pass':'review',title:'Cluster continuous gravity supports',message:`${towers.reduce((a,t)=>a+t.columns.length,0)} fixed tower columns continue from grade to roof; ${publicSpace.pilotisCount} additional pilotis support the shared podium.`,limits:'Geometric continuity only; tower, transfer, foundation and connector loads are not calculated.'},{id:'competition-nonresidential',status:nonresidentialGfa<103213.44?'review':'pass',title:'Cluster nonresidential programme',message:`${round(nonresidentialGfa,1)} m² of assigned occupied floors gives ${round(nonresidentialGfa/11468.16,2)} nominal FSR across the complete cluster. ${nonresidentialGfa<103213.44?'The brief’s minimum 9 nonresidential FSR is not reached.':'The preliminary gross area reaches the brief’s minimum 9 nonresidential FSR.'}`,limits:'Shared podium counted once; external sky decks excluded. FSR exclusions and actual programme need review.'});
  if(state.publicSpace.layout==='courtyard')checks.push({id:'cluster-courtyard',status:'review',title:'Shared podium courtyard',message:'Tower-cluster mode reserves separate openings for all continuous cores. The single-tower circular courtyard is paused; the public ground uses the open plaza arrangement.'});
  if(state.landscape.enabled)checks.push({id:'cluster-landscape',status:'review',title:'Individual terrace mode',message:'The tower-cluster mode uses shared sky decks. Individual Babel terraces are paused; return to a single-tower preset to inspect the spiral terraces.'});
  if(state.megaFloors.enabled)checks.push({id:'cluster-mega',status:'review',title:'Cluster mega-floor reservations',message:'Individual outrigger/belt bands are paused in tower-cluster mode. The shared sky decks have their own core-anchored framing reservations; combined structural analysis needs separate coordination.'});
  const vancouver=vancouverSteps(state,podium||[]);
  if(vancouver.pausedReason)checks.push({id:'podium-stepback',status:'review',title:'Podium retreat paused',message:vancouver.pausedReason+' The existing shared podium is retained; no retreat caps are generated.'});
  const social={enabled:true,typology:state.social.typology,towers,connectors,guards,supportMembers,occupiedGfa:gfa,sharedSkyArea,sourceUrl:'https://oroeditions.com/product/socializing-the-sky',interpretation:true,inspectionTowerId:primary.id,limits:'Geometry and area study. No forces, comfort, evacuation, people-flow or environmental response are simulated.'};
  const summary={...base.summary,gfa,fsr:gfa/(SITE.width*SITE.depth),nonresidentialGfa,nonresidentialFsrNominal:nonresidentialGfa/11468.16,coreArea:primary.core.width*primary.core.depth,totalCoreArea:towers.length*primary.core.width*primary.core.depth,columnCount:columns.length,memberCount:members.length,diagonalCount:members.filter(m=>m.kind==='diagonal').length,pilotisCount:publicSpace.pilotisCount,externalLandscapeArea:sharedSkyArea,terraceCount:0,terraceSupportCount:0,terraceTrussCount:0,terraceClearWidth:0,towerCount:towers.length,sharedSkyArea,sharedSkyDeckCount:connectors.length,status:checks.some(c=>c.status==='block')?'blocked':'concept'};
  const bounds={min:[Math.min(...sitePoints.map(p=>p[0])),Math.min(...sitePoints.map(p=>p[1])),0],max:[Math.max(...sitePoints.map(p=>p[0])),Math.max(...sitePoints.map(p=>p[1])),state.height]};
  return {...base,state,core:primary.core,floors:[...podiumFloors,...primary.floors],roof:primary.roof,podiumRoof,publicSpace,vancouver,columns,members,nodes,landscape:{...base.landscape,enabled:false,decks:[],guards:[],planters:[],supportMembers:[],trussFrames:[],outer:[],inner:[],externalArea:0},megaFloors:{...base.megaFloors,bands:[]},social,checks,summary,bounds};
}

/** One deterministic geometry model feeds plan inspection, 3D, area and Rhino. */
export function buildModel(input = {}) {const state=normalizeState(input),model=state.social.enabled?buildSocialCluster(state):buildSingleModel(state);addRainGallery(model);return model;}

export function serializeDesign(input) {
  const model = buildModel(input);
  return JSON.stringify({ schema: SCHEMA_VERSION, units: 'metres', coordinateSystem: 'local XY, Z up; site centre from supplied Rhino file', state: model.state,
    summary: model.summary, checks: model.checks, limitations: 'Concept geometry only. No structural capacity or complete code compliance evaluation.' }, null, 2);
}

export function inspectFloor(model, index) {
  const floor = model.floors[clamp(Math.round(index) - 1, 0, model.floors.length - 1)];
  if (!floor) return null;
  return { ...floor, grossArea: round(floor.grossArea, 1), netArea: round(floor.netArea, 1), coreArea: model.summary.coreArea,
    coreFraction: model.summary.coreArea / floor.grossArea, columns: model.columns.filter(c => (!model.social?.enabled || floor.isPodium || c.towerId === model.social.inspectionTowerId) && c.start[2] <= floor.z + EPS && c.end[2] >= floor.z + model.state.slabThickness - EPS).map(c => [c.start[0], c.start[1]]),
    limitations: `${model.social?.enabled ? (floor.isPodium ? 'Shared podium inspection. ' : `Inspecting ${model.social.inspectionTowerId}; the area ledger includes the complete cluster. `) : ''}Area and fit are geometric. Occupancy, travel distance, structural spans and exit planning need further design.` };
}

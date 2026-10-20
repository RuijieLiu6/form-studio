/** Geographic site insertion and plan-only screening. Geometry remains in building-local metres. */
import { VANCOUVER_SITES, VANCOUVER_CONES, VANCOUVER_SOURCES } from './data/vancouver-sites.js';

const EPS = 1e-7;
const DEG = Math.PI / 180;
const LON_METRES = 111320 * Math.cos(49.2827 * DEG);
const LAT_METRES = 110574;
const baseAssessments = new WeakMap();
const copy = value => JSON.parse(JSON.stringify(value));
const finite = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

export const SITE_OPTIONS = Object.freeze(VANCOUVER_SITES.map(site => Object.freeze({
  id: site.id, label: site.label, address: site.address, latitude: site.latitude, longitude: site.longitude,
  centerLonLat: [site.longitude, site.latitude], area: site.area
})));

/** A bounded map study extent, not the City's jurisdiction or a land/parcel boundary. */
export const VANCOUVER_MAP_BOUNDS = Object.freeze({ west: -123.32, south: 49.18, east: -123.00, north: 49.34 });
export function isVancouverMapLocation(value) {
  return value != null && Number.isFinite(Number(value.longitude)) && Number.isFinite(Number(value.latitude)) &&
    Number(value.longitude) >= VANCOUVER_MAP_BOUNDS.west && Number(value.longitude) <= VANCOUVER_MAP_BOUNDS.east &&
    Number(value.latitude) >= VANCOUVER_MAP_BOUNDS.south && Number(value.latitude) <= VANCOUVER_MAP_BOUNDS.north;
}

function normalizeParcel(value, location) {
  if (!value || !['city', 'study'].includes(value.source) || !Array.isArray(value.polygonLonLat) || value.polygonLonLat.length > 513 || (Array.isArray(value.holes) && value.holes.length)) return null;
  let ring = value.polygonLonLat.map(p => Array.isArray(p) && p.length >= 2 ? [Number(p[0]), Number(p[1])] : [NaN, NaN]);
  if (ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]) ring.pop();
  if (ring.length < 3 || ring.length > 512 || ring.some(p => !p.every(Number.isFinite)) || new Set(ring.map(p => p.join(','))).size !== ring.length) return null;
  const origin = lonLatToVista([location.longitude, location.latitude]);
  const local = ring.map(p => { const q = lonLatToVista(p); return [q[0] - origin[0], q[1] - origin[1]]; });
  if (local.some(p => Math.hypot(...p) > 2000)) return null;
  const bounds = boundsOf(local), area = polygonArea(local);
  if (bounds.width > 2000 || bounds.depth > 2000 || area < 5 || area > 2000000 || !pointInSitePolygon([0, 0], local)) return null;
  // Reject self crossings and nonadjacent touching edges. Holes and multiple rings must
  // be explicitly resolved by the lookup; never flatten them into a false property fit.
  for (let i = 0; i < local.length; i++) for (let j = i + 1; j < local.length; j++) {
    if (j === i + 1 || (i === 0 && j === local.length - 1)) continue;
    const a = local[i], b = local[(i + 1) % local.length], c = local[j], d = local[(j + 1) % local.length];
    if (intersectionParameter(a, b, c, d) !== null || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b)) return null;
  }
  const citySiteIds = [...new Set((Array.isArray(value.citySiteIds) ? value.citySiteIds : []).filter(v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v)))].slice(0, 20);
  if (value.source === 'city' && !citySiteIds.length) return null;
  const short = (v, fallback) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 180) : fallback;
  return {
    polygonLonLat: ring, source: value.source, citySiteIds,
    label: short(value.label, value.source === 'city' ? 'Selected City assessment parcel' : 'User study boundary'),
    address: short(value.address, 'Map-selected Vancouver location'),
    accessedOn: /^\d{4}-\d{2}-\d{2}$/.test(value.accessedOn || '') ? value.accessedOn : null,
    sourceUrl: value.source === 'city' ? VANCOUVER_SOURCES.parcelDataset : null,
    geometryScope: value.geometryScope === 'containing-component' ? 'containing-component' : 'parcel'
  };
}

export function normalizeSiteContext(value = {}) {
  value ||= {};
  const rotation = finite(value.rotation ?? value.rotationDeg);
  const normalized = {
    mode: value.mode === 'vancouver' ? 'vancouver' : 'competition',
    siteId: SITE_OPTIONS.some(site => site.id === value.siteId) ? value.siteId : 'library-square',
    rotation: ((rotation + 180) % 360 + 360) % 360 - 180
  };
  if (value.siteId === 'custom' && isVancouverMapLocation(value.location)) {
    normalized.siteId = 'custom';
    normalized.location = { longitude: Number(value.location.longitude), latitude: Number(value.location.latitude) };
    normalized.parcel = normalizeParcel(value.parcel, normalized.location);
  }
  return normalized;
}

/** Vista's checked local model projection, not a surveyed or EPSG projected coordinate system. */
export function lonLatToVista([longitude, latitude]) {
  return [(longitude + 123.1207) * LON_METRES, (latitude - 49.2827) * LAT_METRES];
}
export function vistaToLonLat([x, y]) {
  return [-123.1207 + x / LON_METRES, 49.2827 + y / LAT_METRES];
}

function boundsOf(polygon) {
  const minX = Math.min(...polygon.map(p => p[0])), maxX = Math.max(...polygon.map(p => p[0]));
  const minY = Math.min(...polygon.map(p => p[1])), maxY = Math.max(...polygon.map(p => p[1]));
  return { minX, minY, maxX, maxY, width: maxX - minX, depth: maxY - minY };
}
function polygonArea(polygon) {
  return Math.abs(polygon.reduce((sum, a, i) => { const b = polygon[(i + 1) % polygon.length]; return sum + a[0] * b[1] - a[1] * b[0]; }, 0) / 2);
}

export function getSiteContext(state = {}) {
  state ||= {};
  const selected = normalizeSiteContext(state.siteContext);
  if (selected.mode === 'competition') {
    const polygon = [[-72.39, -39.624], [72.39, -39.624], [72.39, 39.624], [-72.39, 39.624]];
    return {
      mode: 'competition', id: 'competition', label: 'Competition model', address: 'Supplied fictional competition context',
      latitude: null, longitude: null, centerLonLat: null, polygon, polygons: [polygon], area: 144.78 * 79.248,
      bounds: boundsOf(polygon), width: 144.78, depth: 79.248, originRhino: [439.703104, 143.256, 0],
      rotationDeg: selected.rotation, nearbyBuildings: [], cones: [], boundaryKnown: true, boundarySource: 'competition', displayExtentOnly: false,
      verticalDatum: 'Supplied model grade z=0. Exact geographic site and geodetic vertical datum are unverified.',
      sources: { parcelDataset: null, viewConeDataset: null, accessedOn: null },
      limits: 'The competition model has no verified geographic site. City view-cone overlays are therefore unavailable in this mode.'
    };
  }
  if (selected.siteId === 'custom') {
    const { longitude, latitude } = selected.location, origin = [...lonLatToVista([longitude, latitude]), 0], parcel = selected.parcel;
    // This finite rectangle is a scene/navigation extent only. It never enters a
    // property-fit or FSR calculation while the parcel boundary is unknown.
    const polygon = parcel ? parcel.polygonLonLat.map(p => { const q = lonLatToVista(p); return [q[0] - origin[0], q[1] - origin[1]]; }) : [[-150, -150], [150, -150], [150, 150], [-150, 150]];
    const bounds = boundsOf(polygon), boundaryKnown = Boolean(parcel), city = parcel?.source === 'city';
    return {
      mode: 'vancouver', id: 'custom', label: parcel?.label || 'Map-selected Vancouver location',
      address: parcel?.address || 'Map point · parcel boundary unknown', latitude, longitude, centerLonLat: [longitude, latitude],
      originRhino: origin, coordinateKey: `custom:${longitude}:${latitude}:${parcel ? JSON.stringify(parcel.polygonLonLat) : 'point'}`,
      polygon, polygons: [polygon], area: boundaryKnown ? polygonArea(polygon) : null,
      bounds, width: bounds.width, depth: bounds.depth, boundaryKnown, displayExtentOnly: !boundaryKnown,
      boundarySource: city ? 'city' : parcel ? 'study' : 'unknown', boundaryGeometryScope: parcel?.geometryScope || null,
      citySiteIds: parcel?.citySiteIds || [], rotationDeg: selected.rotation,
      nearbyBuildings: nearbyAtLocation(origin, boundaryKnown ? polygon : null),
      cones: VANCOUVER_CONES.map(cone => ({ ...copy(cone), polygon: cone.polygon.map(p => [p[0] - origin[0], p[1] - origin[1]]) })),
      verticalDatum: VANCOUVER_SOURCES.verticalDatum,
      sources: { ...VANCOUVER_SOURCES, parcelAccessedOn: parcel?.accessedOn || null,
        parcelDataset: city ? VANCOUVER_SOURCES.parcelDataset : null,
        contextGeometry: `${VANCOUVER_SOURCES.contextGeometry} Partial downtown coverage within 400 m, reused at its actual geographic coordinates; no citywide building coverage.` },
      limits: `${boundaryKnown ? city ? 'City assessment geometry used for a hypothetical design study. ' : 'User-authored study outline, not a property boundary. ' : 'Only the selected geographic point is known. The 300 m display extent is not a parcel boundary; site fit, parcel area and FSR are unknown. '}${parcel?.geometryScope === 'containing-component' ? 'Only the parcel component containing the selected point is represented; other components are excluded. ' : ''}Ownership, existing-building clearance, jurisdiction, survey, zoning, setbacks, terrain, access and permitted height are unverified. Building context is partial and approximate.`
    };
  }
  const site = VANCOUVER_SITES.find(item => item.id === selected.siteId);
  const polygon = copy(site.polygon), bounds = boundsOf(polygon);
  return {
    ...copy(site), mode: 'vancouver', centerLonLat: [site.longitude, site.latitude],
    polygon, polygons: [polygon], bounds, width: bounds.width, depth: bounds.depth, rotationDeg: selected.rotation,
    boundaryKnown: true, boundarySource: 'city', displayExtentOnly: false,
    cones: VANCOUVER_CONES.map(cone => ({ ...cone, polygon: cone.polygon.map(p => [p[0] - site.originRhino[0], p[1] - site.originRhino[1]]) })),
    verticalDatum: VANCOUVER_SOURCES.verticalDatum, sources: { ...VANCOUVER_SOURCES },
    limits: 'Occupied real Vancouver parcel used as a hypothetical design study. Parcel ownership, demolition, zoning, setbacks, terrain and permitted height are not assessed. Context footprints and heights are approximate.'
  };
}

let absoluteBuildings;
function nearbyAtLocation(origin, parcel) {
  if (!absoluteBuildings) {
    const unique = new Map();
    for (const site of VANCOUVER_SITES) for (const building of site.nearbyBuildings || []) if (!unique.has(building.id)) {
      unique.set(building.id, { ...copy(building), polygon: building.polygon.map(p => [p[0] + site.originRhino[0], p[1] + site.originRhino[1]]) });
    }
    absoluteBuildings = [...unique.values()];
  }
  return absoluteBuildings.flatMap(building => {
    const polygon = building.polygon.map(p => [p[0] - origin[0], p[1] - origin[1]]), bounds = boundsOf(polygon);
    const nearestX = Math.max(bounds.minX, Math.min(0, bounds.maxX)), nearestY = Math.max(bounds.minY, Math.min(0, bounds.maxY));
    if (Math.hypot(nearestX, nearestY) > 400 || (parcel && polygonsOverlap(polygon, parcel))) return [];
    return [{ ...copy(building), polygon }];
  });
}

/** Rotation is about the building origin; placement follows in fixed site east/north axes. */
export function buildingToSitePoint(point, state = {}) {
  state ||= {};
  // A normalized angle is unnecessary for trig; do not revalidate a 512-vertex
  // saved parcel for every vertex in the proposed tower.
  const radians = finite(state.siteContext?.rotation ?? state.siteContext?.rotationDeg) * DEG, c = Math.cos(radians), s = Math.sin(radians);
  const x = point[0] * c - point[1] * s + finite(state.placement?.x);
  const y = point[0] * s + point[1] * c + finite(state.placement?.y);
  return point.length > 2 ? [x, y, point[2]] : [x, y];
}

/** Convert a building-local point to the existing source model coordinates, once only. */
export function localToWorld(point, context, options = {}) {
  const radians = finite(context.rotationDeg) * DEG, c = Math.cos(radians), s = Math.sin(radians);
  const origin = context.originRhino || [0, 0, 0];
  const out = [point[0] * c - point[1] * s + finite(options.placement?.x) + origin[0],
    point[0] * s + point[1] * c + finite(options.placement?.y) + origin[1]];
  return point.length > 2 ? [...out, point[2] + (origin[2] || 0)] : out;
}
export function buildingToSourcePoint(point, state = {}) {
  state ||= {};
  return localToWorld(point, getSiteContext(state), { placement: state.placement });
}

function onSegment(a, b, p) {
  return Math.abs(cross(a, b, p)) < EPS && p[0] >= Math.min(a[0], b[0]) - EPS && p[0] <= Math.max(a[0], b[0]) + EPS &&
    p[1] >= Math.min(a[1], b[1]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS;
}
export function pointInSitePolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    if (onSegment(a, b, point)) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function intersectionParameter(a, b, c, d) {
  const ux = b[0] - a[0], uy = b[1] - a[1], vx = d[0] - c[0], vy = d[1] - c[1];
  const den = ux * vy - uy * vx;
  if (Math.abs(den) < EPS) return null;
  const t = ((c[0] - a[0]) * vy - (c[1] - a[1]) * vx) / den;
  const u = ((c[0] - a[0]) * uy - (c[1] - a[1]) * ux) / den;
  return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS ? Math.max(0, Math.min(1, t)) : null;
}
function segmentInside(a, b, polygon) {
  if (!pointInSitePolygon(a, polygon) || !pointInSitePolygon(b, polygon)) return false;
  const seams = [0, 1];
  for (let i = 0; i < polygon.length; i++) {
    const t = intersectionParameter(a, b, polygon[i], polygon[(i + 1) % polygon.length]);
    if (t !== null) seams.push(t);
  }
  seams.sort((x, y) => x - y);
  for (let i = 1; i < seams.length; i++) {
    const t = (seams[i - 1] + seams[i]) / 2;
    if (!pointInSitePolygon([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], polygon)) return false;
  }
  return true;
}
export function polygonFitsSite(footprint, polygon) {
  return footprint.length > 0 && footprint.every((a, i) => segmentInside(a, footprint[(i + 1) % footprint.length], polygon));
}
function polygonsOverlap(a, b) {
  const aa = boundsOf(a), bb = boundsOf(b);
  if (aa.maxX < bb.minX - EPS || aa.minX > bb.maxX + EPS || aa.maxY < bb.minY - EPS || aa.minY > bb.maxY + EPS) return false;
  if (a.some(p => pointInSitePolygon(p, b)) || b.some(p => pointInSitePolygon(p, a))) return true;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    if (intersectionParameter(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length]) !== null) return true;
    if (onSegment(a[i], a[(i + 1) % a.length], b[j])) return true;
  }
  return false;
}
function convexHull(points) {
  const sorted = [...new Map(points.map(p => [p.slice(0, 2).join(','), p.slice(0, 2)])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const half = list => { const out = []; for (const p of list) { while (out.length > 1 && cross(out.at(-2), out.at(-1), p) <= EPS) out.pop(); out.push(p); } return out; };
  return [...half(sorted).slice(0, -1), ...half([...sorted].reverse()).slice(0, -1)];
}

function squareMemberFootprint(member) {
  const a = member.start, b = member.end, h = member.section / 2;
  if (!a || !b || !(h > 0)) return [];
  const delta = b.map((v, i) => v - a[i]), length = Math.hypot(...delta);
  if (length < EPS) return [];
  const d = delta.map(v => v / length), k = 1 + d[2];
  const u = k > 1e-8 ? [1 - d[0] * d[0] / k, -d[0] * d[1] / k, -d[0]] : [1, 0, 0];
  const v = k > 1e-8 ? [-d[0] * d[1] / k, 1 - d[1] * d[1] / k, -d[1]] : [0, -1, 0];
  return convexHull([a, b].flatMap(p => [[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, y]) => [p[0] + u[0] * x + v[0] * y, p[1] + u[1] * x + v[1] * y])));
}

/** All occupied/capped levels plus actual exterior solid sections, including companion towers. */
export function modelFootprints(model) {
  const footprints = [], seen = new Set();
  const add = (polygon, id) => {
    if (!Array.isArray(polygon) || polygon.length < 3 || polygon.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return;
    const key = polygon.map(p => `${p[0]},${p[1]}`).join(';');
    if (!seen.has(key)) { footprints.push({ id, polygon: polygon.map(p => p.slice(0, 2)) }); seen.add(key); }
  };
  const level = (floor, id) => { if (floor) add(floor.polygon, id); };
  (model.floors || []).forEach((floor, i) => level(floor, `floor-${floor.index ?? i}`));
  level(model.roof, 'roof'); level(model.podiumRoof, 'podium-roof');
  add(model.core?.polygon, 'core');
  for (const [index, tower] of (model.social?.towers || []).entries()) {
    (tower.floors || []).forEach((floor, i) => level(floor, `tower-${index}-floor-${i}`)); level(tower.roof, `tower-${index}-roof`);
    add(tower.core?.polygon, `tower-${index}-core`);
  }
  const solid = (object, id) => { if (object?.solid?.vertices) add(convexHull(object.solid.vertices), id); };
  for (const terrace of model.vancouver?.terraces || []) { add(terrace.polygon, terrace.id); solid(terrace, terrace.id); }
  if (model.vancouver?.canopy) { add(model.vancouver.canopy.polygon, model.vancouver.canopy.id); solid(model.vancouver.canopy, model.vancouver.canopy.id); }
  for (const deck of model.landscape?.decks || []) { add(deck.polygonXY, deck.id); solid(deck, deck.id); }
  for (const guard of model.landscape?.guards || []) solid(guard, guard.id);
  for (const guard of model.social?.guards || []) solid(guard, guard.id);
  for (const member of [...model.members || [], ...model.columns || []]) {
    if (member.solid?.vertices) solid(member, member.id); else add(squareMemberFootprint(member), member.id);
  }
  for (const [i, planter] of (model.landscape?.planters || []).entries()) add(planter.polygon, `planter-${i}`);
  for (const [i, garden] of (model.publicSpace?.gardens || []).entries()) add(garden.polygon, `ground-garden-${i}`);
  for (const [i, connector] of (model.social?.connectors || []).entries()) { add(connector.polygon, `connector-${i}`); solid(connector, `connector-${i}`); }
  if (model.publicSpace?.enabled) add(model.publicSpace.ground?.polygon, 'ground-paving');
  return footprints;
}

export function assessModelOnSite(model, state = model.state || {}) {
  const context = getSiteContext(state);
  const footprints = modelFootprints(model).map(item => ({ ...item, polygon: item.polygon.map(p => buildingToSitePoint(p, state)) }));
  const boundaryKnown = context.boundaryKnown !== false;
  const outside = boundaryKnown ? footprints.filter(item => !polygonFitsSite(item.polygon, context.polygon)) : [];
  // Actual level/deck projections rather than a cluster's convex hull avoid false overlaps in gaps.
  const occupied = footprints.filter(item => !item.id?.startsWith('ground-'));
  const overlaps = context.cones.filter(cone => occupied.some(item => polygonsOverlap(item.polygon, cone.polygon)))
    .map(({ id, label, url }) => ({ id, label, url }));
  return {
    mode: context.mode, siteId: context.id, fits: boundaryKnown ? footprints.length > 0 && outside.length === 0 : null,
    boundaryKnown, boundarySource: context.boundarySource, fitStatus: boundaryKnown ? outside.length ? 'outside' : 'inside' : 'unknown',
    overflowCount: boundaryKnown ? outside.length : null, outsideIds: outside.map(item => item.id), footprintCount: footprints.length,
    footprint: convexHull(footprints.flatMap(item => item.polygon)), overlaps,
    heightStatus: 'unknown', maximumHeight: null, verticalDatum: context.verticalDatum,
    limits: context.mode === 'vancouver' ? VANCOUVER_SOURCES.viewConeLimits : context.limits
  };
}

/** Apply after all cluster/terrace geometry exists. Replaces competition-only site/brief screens. */
export function applySiteContext(model, state = model.state || {}) {
  if (!baseAssessments.has(model)) baseAssessments.set(model, {
    checks: [...model.checks || []],
    siteArea: model.summary.siteArea, fsr: model.summary.fsr,
    briefNominalSiteArea: model.summary.briefNominalSiteArea,
    nonresidentialFsrNominal: model.summary.nonresidentialFsrNominal
  });
  const original = baseAssessments.get(model);
  const context = getSiteContext(state), assessment = assessModelOnSite(model, state);
  model.siteContext = context; model.siteAssessment = assessment;
  model.site = { polygon: copy(context.polygon), width: context.width, depth: context.depth, area: context.area,
    boundaryKnown: context.boundaryKnown !== false, displayExtentOnly: context.displayExtentOnly === true,
    source: context.mode === 'vancouver' ? context.sources.parcelDataset : 'Supplied competition Rhino site boundary.' };
  model.checks = original.checks.filter(check => check.id !== 'site-fit' && check.id !== 'view-cones' &&
    !(context.mode === 'vancouver' && (check.id === 'competition-height' || check.id === 'competition-nonresidential')));
  model.checks.unshift({
    id: 'site-fit', status: !assessment.boundaryKnown ? 'review' : assessment.fits ? 'pass' : 'block', title: 'Site envelope',
    message: !assessment.boundaryKnown ? 'Building placed at the selected map point. Parcel boundary, site fit, parcel area and FSR are unknown; the displayed study extent is not a property boundary.' : assessment.fits ? `All modelled level boundaries and exterior solid sections fit the ${context.boundarySource === 'study' ? 'user-authored study outline' : context.mode === 'vancouver' ? 'selected parcel' : 'supplied competition site'} after rotation and placement.` : `${assessment.overflowCount} modelled boundaries or solid sections extend beyond the ${context.boundarySource === 'study' ? 'user-authored study outline' : context.mode === 'vancouver' ? 'selected parcel' : 'supplied competition site'}. Move, rotate or reduce the building/podium/terraces${model.vancouver?.canopy ? '/rain gallery' : ''}.`,
    limits: 'A geometric boundary check. Setbacks, property survey, terrain, access, zoning, neighbouring structures and development rights are unresolved.',
    affectedGeometry: assessment.outsideIds
  });
  if (context.mode === 'vancouver') {
    model.checks.push({
      id: 'view-cones', status: 'review', title: 'Protected views · plan screening',
      message: assessment.overlaps.length ? `The modelled building overlaps ${assessment.overlaps.length} City protected-view plan polygons: ${assessment.overlaps.map(view => view.id).join(', ')}. Permitted height is unknown.` : 'No intersection with the bundled City protected-view plan polygons was found. Permitted height and other planning controls remain unknown.',
      limits: VANCOUVER_SOURCES.viewConeLimits, sourceUrl: VANCOUVER_SOURCES.viewConeDataset,
      verifiedOn: VANCOUVER_SOURCES.accessedOn, kind: 'planning_screen', overlappingViews: assessment.overlaps
    });
    model.summary.siteArea = context.area;
    model.summary.fsr = context.area > 0 ? model.summary.gfa / context.area : null;
    model.summary.briefNominalSiteArea = null;
    model.summary.nonresidentialFsrNominal = null;
  } else {
    model.summary.siteArea = original.siteArea;
    model.summary.fsr = original.fsr;
    model.summary.briefNominalSiteArea = original.briefNominalSiteArea;
    model.summary.nonresidentialFsrNominal = original.nonresidentialFsrNominal;
  }
  model.summary.status = model.checks.some(check => check.status === 'block') ? 'blocked' : 'concept';
  return model;
}

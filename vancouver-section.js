/** A true building-local section through the generated geometry, at X = 0 m. */
const C = { paper: '#faf9f6', ink: '#26363c', coral: '#a84231', green: '#38705c', blue: '#28404d', muted: '#617073', rule: '#d7dcd6' };
const EPS = 1e-7;
const SCOPE = 'Concept geometry only. Access, drainage, connections, structural capacity and environmental performance require design.';
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));
const validNumber = value => value != null && value !== '' && Number.isFinite(Number(value));
const num = (value, fallback = 0) => validNumber(value) ? Number(value) : fallback;
const positive = (value, fallback) => validNumber(value) && Number(value) > EPS ? Number(value) : fallback;
const round = value => Number(num(value).toFixed(4));
const arr = value => Array.isArray(value) ? value.filter(item => item != null) : [];
const point = (value, dimensions = 2) => Array.isArray(value) && value.length >= dimensions && value.slice(0, dimensions).every(validNumber);
const ring = value => Array.isArray(value) && value.length >= 3 && value.every(p => point(p)) ? value.map(p => [Number(p[0]), Number(p[1])]) : [];
const attrs = values => Object.entries(values).map(([key, value]) => ` ${key}="${esc(value)}"`).join('');
const text = (x, y, value, extra = {}) => `<text${attrs({ x: round(x), y: round(y), ...extra })}>${esc(value)}</text>`;
const path = points => points.length ? `M${points.map(p => `${round(p[0])},${round(p[1])}`).join('L')}Z` : '';
const fmt = (value, digits = 0) => num(value).toLocaleString('en-CA', { maximumFractionDigits: digits });
const unique = values => [...values].sort((a, b) => a - b).filter((value, i, ordered) => !i || value - ordered[i - 1] > EPS);

function inside(p, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i], cross = (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0]);
    if (Math.abs(cross) < EPS && p[0] >= Math.min(a[0], b[0]) - EPS && p[0] <= Math.max(a[0], b[0]) + EPS && p[1] >= Math.min(a[1], b[1]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS) return true;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}

// Testing every span between boundary events handles concavities, vertices and
// collinear cut edges without pairing unrelated outer / courtyard crossings.
function ringCut(polygon) {
  if (!polygon.length) return [];
  const events = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    if (Math.abs(a[0]) < EPS) events.push(a[1]);
    if (a[0] < -EPS && b[0] > EPS || a[0] > EPS && b[0] < -EPS) events.push(a[1] + (b[1] - a[1]) * -a[0] / (b[0] - a[0]));
  }
  const sorted = unique(events), intervals = [];
  for (let i = 1; i < sorted.length; i++) if (inside([0, (sorted[i - 1] + sorted[i]) / 2], polygon)) {
    const previous = intervals.at(-1);
    if (previous && Math.abs(previous[1] - sorted[i - 1]) < EPS) previous[1] = sorted[i];
    else intervals.push([sorted[i - 1], sorted[i]]);
  }
  return intervals;
}

function regionCut(polygon, holes = []) {
  let spans = ringCut(ring(polygon));
  for (const hole of arr(holes)) for (const [h0, h1] of ringCut(ring(hole))) {
    spans = spans.flatMap(([a, b]) => h1 <= a + EPS || h0 >= b - EPS ? [[a, b]] : [[a, Math.min(b, h0)], [Math.max(a, h1), b]].filter(([lo, hi]) => hi - lo > EPS));
  }
  return spans;
}

function towersFor(model) {
  const supplied = arr(model.social?.towers).filter(tower => arr(tower.floors).some(floor => ring(floor.polygon).length));
  return supplied.length ? supplied : [{ id: 'primary', floors: arr(model.floors).filter(floor => !floor.isPodium), core: model.core, roof: model.roof }];
}

function hull(points) {
  const ordered = [...new Map(points.map(p => [`${round(p[0])}:${round(p[1])}`, p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (ordered.length < 3) return [];
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half = sequence => { const result = []; for (const p of sequence) { while (result.length > 1 && cross(result.at(-2), result.at(-1), p) <= EPS) result.pop(); result.push(p); } return result.slice(0, -1); };
  const result = [...half(ordered), ...half(ordered.slice().reverse())];
  return result.length >= 3 ? result : [];
}

// Member solids are convex boxes in the engine. Cut their actual edges; taking
// the hull closes only that individual box, never a building or courtyard.
function solidCut(solid) {
  const vertices = arr(solid?.vertices), faces = arr(solid?.faces);
  if (vertices.length < 4 || !vertices.every(p => point(p, 3)) || !faces.length) return [];
  const result = [], edges = new Set();
  for (const face of faces) {
    if (!Array.isArray(face) || face.length < 3 || !face.every(index => Number.isInteger(index) && vertices[index])) return [];
    for (let i = 0; i < face.length; i++) {
      const indices = [face[i], face[(i + 1) % face.length]].sort((a, b) => a - b), key = indices.join(':');
      if (edges.has(key)) continue; edges.add(key);
      const [a, b] = indices.map(index => vertices[index].map(Number));
      if (Math.abs(a[0]) < EPS) result.push([a[1], a[2]]);
      if (Math.abs(b[0]) < EPS) result.push([b[1], b[2]]);
      if (a[0] < -EPS && b[0] > EPS || a[0] > EPS && b[0] < -EPS) {
        const t = -a[0] / (b[0] - a[0]); result.push([a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      }
    }
  }
  return hull(result);
}

function memberSolid(member) {
  if (member.solid) return member.solid;
  if (!point(member.start, 3) || !point(member.end, 3)) return null;
  const start = member.start.map(Number), end = member.end.map(Number), delta = end.map((v, i) => v - start[i]), length = Math.hypot(...delta);
  if (length < EPS) return null;
  const section = positive(member.section, 0), width = positive(member.width, section), depth = positive(member.depth, section);
  if (!width || !depth) return null;
  let u, v;
  if (point(member.axes?.u, 3) && point(member.axes?.v, 3)) { u = member.axes.u.map(Number); v = member.axes.v.map(Number); }
  else if (member.width && member.depth) {
    const horizontal = Math.hypot(delta[0], delta[1]);
    u = horizontal > EPS ? [-delta[1] / horizontal, delta[0] / horizontal, 0] : [1, 0, 0];
    v = horizontal > EPS ? [-delta[2] * delta[0] / length / horizontal, -delta[2] * delta[1] / length / horizontal, horizontal / length] : [0, delta[2] < 0 ? -1 : 1, 0];
  } else {
    // Matches the 3D view's square section and rotation from local +Z.
    const d = delta.map(value => value / length);
    if (d[2] < -1 + EPS) { u = [1, 0, 0]; v = [0, -1, 0]; }
    else { const divisor = Math.sqrt(2 * (1 + d[2])), qx = -d[1] / divisor, qy = d[0] / divisor, qw = divisor / 2; u = [1 - 2 * qy * qy, 2 * qx * qy, -2 * qw * qy]; v = [2 * qx * qy, 1 - 2 * qx * qx, 2 * qw * qx]; }
  }
  const vertices = [];
  for (const p of [start, end]) for (const [x, y] of [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]]) vertices.push(p.map((value, i) => value + u[i] * x + v[i] * y));
  return { vertices, faces: [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]] };
}

function sectionData(model, state) {
  const slabs = [], cores = [], members = [], towers = towersFor(model), thickness = positive(state.slabThickness, .25);
  const slab = (source, kind, id, extra = {}) => {
    if (!source || !validNumber(source.z ?? source.bottom)) return;
    const z = num(source.z ?? source.bottom), depth = positive(source.thickness, thickness);
    for (const interval of regionCut(source.polygon, source.holes)) slabs.push({ kind, id, interval, z, thickness: depth, ...extra });
  };
  for (const [index, floor] of arr(model.floors).filter(floor => floor.isPodium).entries()) slab(floor, 'podium', `podium-floor-${floor.index ?? index + 1}`, { floorIndex: floor.index ?? index + 1, towerId: 'shared-podium' });
  for (const tower of towers) {
    for (const [index, floor] of arr(tower.floors).entries()) slab(floor, 'floor', `${tower.id}-floor-${floor.index ?? index + 1}`, { floorIndex: floor.index ?? index + 1, towerId: tower.id });
    slab(tower.roof, 'roof', `${tower.id}-roof`, { towerId: tower.id });
    const core = tower.core;
    if (core && positive(core.height, 0)) for (const interval of regionCut(core.polygon, ring(core.innerPolygon).length ? [core.innerPolygon] : [])) cores.push({ id: tower.id, interval, z: num(core.z), height: Number(core.height), hollow: ring(core.innerPolygon).length > 0 });
  }
  slab(model.podiumRoof, 'podium-roof', 'podium-roof');
  slab(model.publicSpace?.ground, 'ground', 'public-ground');
  for (const terrace of arr(model.vancouver?.terraces)) slab(terrace, 'terrace', terrace.id);
  const canopy = model.vancouver?.canopy;
  slab(canopy, 'canopy', canopy?.id || 'rain-gallery-roof');
  const sourceMembers = [...arr(model.columns), ...arr(model.members), ...arr(model.social?.supportMembers)];
  const seen = new Set();
  for (const [index, member] of sourceMembers.entries()) {
    const id = member.id ?? `member-${index}`;
    if (seen.has(id)) continue; seen.add(id);
    const polygon = solidCut(memberSolid(member));
    if (polygon.length) members.push({ id, role: member.role || 'member', polygon });
  }
  return { slabs, cores, members, towers, canopy, sourceMemberCount: seen.size, floorCount: arr(model.floors).filter(f => f.isPodium).length + towers.reduce((count, tower) => count + arr(tower.floors).length, 0) };
}

function wrap(value, width, size = 14) {
  const result = []; let line = '';
  for (const word of String(value).split(/\s+/)) {
    if (line && (line.length + word.length + 1) * size * .49 > width) { result.push(line); line = word; }
    else line += `${line ? ' ' : ''}${word}`;
  }
  if (line) result.push(line);
  return result;
}
function paragraph(x, y, value, width, extra = {}, size = 14, lineHeight = 19) {
  const rows = wrap(value, width, size);
  return { svg: rows.map((row, i) => text(x, y + i * lineHeight, row, extra)).join(''), height: rows.length * lineHeight };
}
function niceStep(maximum) { const raw = maximum / 4, magnitude = 10 ** Math.floor(Math.log10(Math.max(raw, EPS))); return [1, 2, 5, 10].map(n => n * magnitude).find(n => n >= raw) || magnitude * 10; }
function rectangle(interval, z, thickness) { return [[interval[0], z], [interval[1], z], [interval[1], z + thickness], [interval[0], z + thickness]]; }

function panel(data, box, extent, { base = false } = {}) {
  const points = [...data.slabs.flatMap(s => rectangle(s.interval, s.z, s.thickness)), ...data.cores.flatMap(c => rectangle(c.interval, c.z, c.height)), ...data.members.flatMap(member => member.polygon)];
  const minY = Math.min(...points.map(p => p[0]), -1), maxY = Math.max(...points.map(p => p[0]), 1), minZ = Math.min(...points.map(p => p[1]), -.12);
  const plot = { x: box.x + 45, y: box.y + 54, width: box.width - 66, height: box.height - 99 };
  const horizontalPadding = Math.max(4, (maxY - minY) * .08), y0 = minY - horizontalPadding, y1 = maxY + horizontalPadding + 5, z0 = Math.min(-1.5, minZ - .5), z1 = extent;
  const scale = Math.min(plot.width / (y1 - y0), plot.height / (z1 - z0)), originX = plot.x + (plot.width - (y1 - y0) * scale) / 2, originZ = plot.y + plot.height;
  const to = p => [originX + (p[0] - y0) * scale, originZ - (p[1] - z0) * scale];
  const clip = base ? 'street-section-base' : 'street-section-profile';
  let svg = `<rect${attrs({ x: box.x, y: box.y, width: box.width, height: box.height, rx: 3, class: 'panel' })}/>`;
  svg += text(box.x + 17, box.y + 26, base ? `Public base · Z 0–${fmt(extent)} m` : 'Full tower profile', { class: 'panel-title' });
  svg += text(box.x + 17, box.y + 45, 'Same cut plane · local X = 0 m', { class: 'small muted' });
  const cutTop = to([y0, z1])[1], cutBottom = to([y0, z0])[1];
  svg += `<defs><clipPath id="${clip}"><rect${attrs({ x: plot.x, y: cutTop, width: plot.width, height: cutBottom - cutTop })}/></clipPath></defs>`;
  const step = niceStep(extent);
  for (let z = 0; z < extent + EPS; z += step) {
    const [x, y] = to([y0, z]), right = to([y1, z])[0];
    svg += `<path d="M${round(x)},${round(y)}H${round(right)}" class="grid"/>` + text(plot.x - 9, y + 4, fmt(z), { class: 'small muted', 'text-anchor': 'end' });
  }
  svg += `<g clip-path="url(#${clip})">`;
  for (const member of data.members) svg += `<path${attrs({ d: path(member.polygon.map(to)), class: 'member', 'data-member': member.id, 'data-role': member.role, 'data-cut-polygon': JSON.stringify(member.polygon.map(p => p.map(round))) })}/>`;
  for (const core of data.cores) svg += `<path${attrs({ d: path(rectangle(core.interval, core.z, core.height).map(to)), class: 'core', 'data-core': core.id, 'data-hollow': core.hollow, 'data-interval': JSON.stringify(core.interval.map(round)) })}/>`;
  // Draw the occupied slabs before terrace and canopy overlays, which represent
  // their actual generated slab regions rather than additional occupied floors.
  for (const slab of data.slabs) svg += `<path${attrs({ d: path(rectangle(slab.interval, slab.z, slab.thickness).map(to)), class: `slab ${slab.kind}`, 'data-slab': slab.id, 'data-kind': slab.kind, 'data-interval': JSON.stringify(slab.interval.map(round)), 'data-z': round(slab.z), 'data-thickness': round(slab.thickness), ...(slab.towerId ? { 'data-tower': slab.towerId } : {}), ...(slab.floorIndex != null ? { 'data-floor-index': slab.floorIndex } : {}) })}/>`;
  svg += '</g>';
  const datum = to([y0, 0]), datumEnd = to([y1, 0]);
  svg += `<path d="M${round(datum[0])},${round(datum[1])}H${round(datumEnd[0])}" class="datum"/>`;
  svg += text(box.x + 17, box.y + box.height - 18, 'Z ↑ metres', { class: 'small muted' }) + text(box.x + box.width - 17, box.y + box.height - 18, '← local Y →', { class: 'small muted', 'text-anchor': 'end' });
  if (base) {
    const a = to([maxY + horizontalPadding + 1, 0]), b = to([maxY + horizontalPadding + 1, 1.7]);
    svg += `<path${attrs({ d: `M${round(a[0] - 3)},${round(a[1])}h6M${round(a[0])},${round(a[1])}V${round(b[1])}M${round(b[0] - 3)},${round(b[1])}h6`, class: 'scale-marker', 'data-scale-metres': 1.7 })}/>`;
    svg += text(a[0] - 5, b[1] - 6, '1.7 m', { class: 'small', 'text-anchor': 'end' });
  }
  return svg;
}

function frame(title, summary, content, width, height, metadata) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="vancouver-section-title vancouver-section-description"><title id="vancouver-section-title">${esc(title)}</title><desc id="vancouver-section-description">${esc(summary)} ${esc(SCOPE)}</desc><metadata>${esc(JSON.stringify(metadata))}</metadata><style>text{font-family:Barlow,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;fill:${C.ink};font-variant-numeric:tabular-nums}.heading{font-size:24px;font-weight:600}.panel-title,.stat-title{font-size:17px;font-weight:600}.small{font-size:12px}.muted{fill:${C.muted}}.panel{fill:none;stroke:${C.rule};stroke-width:1}.grid{fill:none;stroke:${C.rule};stroke-width:.65;stroke-dasharray:3 4}.datum{fill:none;stroke:${C.ink};stroke-width:.9}.slab{fill:${C.coral};fill-opacity:.65;stroke:${C.coral};stroke-width:.65}.ground{fill:${C.ink};fill-opacity:.65;stroke:${C.ink}}.terrace{fill:${C.green};fill-opacity:.9;stroke:${C.green};stroke-width:1}.canopy{fill:${C.blue};fill-opacity:.85;stroke:${C.blue};stroke-width:1}.core{fill:${C.blue};fill-opacity:.32;stroke:${C.blue};stroke-width:.65}.member{fill:${C.blue};fill-opacity:.42;stroke:${C.blue};stroke-width:.55}.scale-marker{fill:none;stroke:${C.ink};stroke-width:1}.divider{stroke:${C.rule};stroke-width:1}</style><rect width="${width}" height="${height}" fill="${C.paper}"/>${content}</svg>`;
}

/** Standalone SVG; no DOM, projection, model mutation or geospatial assumptions. */
export function createVancouverSection(model = {}, state = model?.state || {}, { compact = false } = {}) {
  model = model || {}; state = state || model.state || {};
  const width = compact ? 390 : 1100, title = 'Vancouver public base · true section', data = sectionData(model, state);
  const points = [...data.slabs.flatMap(s => rectangle(s.interval, s.z, s.thickness)), ...data.cores.flatMap(c => rectangle(c.interval, c.z, c.height)), ...data.members.flatMap(member => member.polygon)];
  const metadata = { drawing: title, design: state.name || 'Untitled design', units: 'metres', plane: { coordinateSystem: 'building-local', axis: 'X', value: 0, horizontalAxis: 'Y', verticalAxis: 'Z' }, geographicOrientation: 'unassigned', occupiedFloorCount: data.floorCount, towerCount: data.towers.filter(t => arr(t.floors).length).length, cutSlabs: data.slabs.map(s => ({ ...s, interval: s.interval.map(round) })), cutCores: data.cores.map(c => ({ ...c, interval: c.interval.map(round) })), sectionedMemberCount: data.members.length, omittedMemberCount: data.sourceMemberCount - data.members.length, canopyIntersectsPlane: data.slabs.some(s => s.kind === 'canopy'), publicAccess: 'unresolved', environmentalPerformance: 'not calculated' };
  if (!points.length) {
    const summary = 'No supplied solid crosses the building-local X = 0 m section plane.';
    const note = 'A true cut is shown only where actual model geometry intersects the plane. Geometry away from this plane is omitted.';
    let body = text(20, 34, 'Section geometry unavailable', { class: 'panel-title' });
    body += paragraph(20, 75, summary, width - 40).svg + paragraph(20, 132, note, width - 40, { class: 'muted' }).svg;
    return { title, summary, svg: frame(title, summary, body, width, compact ? 265 : 220, metadata), notes: [note, SCOPE], filename: 'vancouver-public-base-section.svg' };
  }
  const highest = Math.max(...points.map(p => p[1]), 1), fullTop = Math.ceil((highest + 1) / 5) * 5;
  const baseTop = Math.min(fullTop, Math.max(30, Math.min(40, num(model.podiumRoof?.z) + 3)));
  const intersectsCanopy = metadata.canopyIntersectsPlane;
  const summary = `${data.floorCount} occupied floor plates; true cut at building-local X = 0 m. Only intersected slabs, core walls and member solids are drawn. The horizontal axis is local Y; its geographic direction is unassigned.`;
  let body = text(20, 34, compact ? 'Vancouver public base' : title, { class: 'heading' });
  let next = 61;
  const subtitle = paragraph(20, next, compact ? 'True cut · building-local X = 0 m' : 'Building-local X = 0 m · local Y across the page · geographic street direction unassigned', width - 40, { class: 'muted' }); body += subtitle.svg; next += subtitle.height + 10;
  const name = paragraph(20, next, state.name || 'Current design', width - 40, { class: 'small muted' }, 12, 17); body += name.svg; next += name.height + 17;
  const chartY = next, chartHeight = compact ? 365 : 402;
  if (compact) {
    body += panel(data, { x: 20, y: chartY, width: 350, height: 340 }, baseTop, { base: true });
    body += panel(data, { x: 20, y: chartY + 340 + 16, width: 350, height: chartHeight }, fullTop);
    next = chartY + chartHeight + 340 + 42;
  } else {
    body += panel(data, { x: 20, y: chartY, width: 405, height: chartHeight }, fullTop);
    body += panel(data, { x: 442, y: chartY, width: 638, height: chartHeight }, baseTop, { base: true });
    next = chartY + chartHeight + 28;
  }
  const terraceArea = arr(model.vancouver?.terraces).reduce((total, terrace) => total + num(terrace.area), 0), canopy = data.canopy;
  const stats = [
    ['Occupied floor GFA', validNumber(model.summary?.gfa) ? `${fmt(model.summary.gfa)} m²` : 'Area unavailable', 'Exterior terraces and roof cover are separate from occupied floor area.'],
    ['Stepped public base', `${arr(model.vancouver?.terraces).length} terrace${arr(model.vancouver?.terraces).length === 1 ? '' : 's'}${terraceArea > 0 ? ` · ${fmt(terraceArea)} m²` : ''}`, 'Actual level slabs; accessible connections between public levels remain unresolved.'],
    ['Independent rain gallery', canopy ? `${fmt(canopy.area)} m² roof cover${validNumber(canopy.length) ? ` · ${fmt(canopy.length, 1)} m` : ''}` : 'Off', canopy ? intersectsCanopy ? 'Column-supported roof at the chosen local edge. Street alignment and weather performance remain unresolved.' : `Gallery on ${String(canopy.side || 'selected side').replace(/[_-]/g, ' ')} does not cross X = 0 m; its section is omitted.` : 'A separate column-supported cover can be reserved at the chosen local edge.']
  ];
  let statBottom = next;
  for (let i = 0; i < stats.length; i++) {
    const [label, value, detail] = stats[i], x = compact ? 20 : 20 + i * 364, y = compact ? statBottom : next, columnWidth = compact ? 350 : 333;
    body += text(x, y, label, { class: 'stat-title' }) + text(x, y + 25, value);
    const detailParagraph = paragraph(x, y + 49, detail, columnWidth, { class: 'muted' }); body += detailParagraph.svg;
    const bottom = y + 49 + detailParagraph.height;
    statBottom = compact ? bottom + 25 : Math.max(statBottom, bottom);
  }
  next = statBottom + (compact ? 0 : 25);
  body += `<path d="M20,${round(next)}H${width - 20}" class="divider"/>`; next += 27;
  const legend = compact ? 'Coral: floor slabs. Green: terrace slabs. Blue: core walls, cut members and gallery roof.' : 'Coral · occupied slabs     Green · terrace slabs     Blue · core walls, cut members and gallery roof';
  const legendParagraph = paragraph(20, next, legend, width - 40, { class: 'small muted' }, 12, 17); body += legendParagraph.svg; next += legendParagraph.height + 15;
  const limits = 'Studio interpretation. Openings use actual cut intervals; geometry away from the plane is omitted. Public levels do not establish a continuous accessible route.';
  const limitsParagraph = paragraph(20, next, limits, width - 40, { class: 'muted' }); body += limitsParagraph.svg; next += limitsParagraph.height + 13;
  const scopeParagraph = paragraph(20, next, SCOPE, width - 40, { class: 'small muted' }, 12, 17); body += scopeParagraph.svg; next += scopeParagraph.height + 22;
  const notes = ['Section plane: building-local X = 0 m, horizontal local Y and vertical Z. Geographic orientation is unassigned.', 'Slab and core openings are cut from actual polygons and holes; geometry outside the cut plane is omitted.', 'Terrace slab area and rain-gallery roof cover area are separate from occupied floor GFA.', canopy && !intersectsCanopy ? 'The rain-gallery roof does not cross the section plane and is omitted from the drawing.' : 'Only rain-gallery geometry that intersects the plane is shown.', 'Public levels are geometric reservations. Accessible connectivity remains unresolved.', SCOPE];
  return { title, summary, svg: frame(title, summary, body, width, Math.ceil(next), metadata), notes, filename: 'vancouver-public-base-section.svg' };
}

/** Drawing-only explanations of the same concept geometry used by the model and exports. */
const COLOUR = { paper: '#faf9f6', ink: '#26363c', muted: '#526269', rule: '#d4d8d5', coral: '#a84231', green: '#38705c', blue: '#28404d', focus: '#176f85' };
const SCOPE = 'Not calculated: member forces, drift, wind/seismic response, accessibility or full code compliance';
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));
const finite = value => Number.isFinite(Number(value));
const number = (value, fallback = 0) => finite(value) ? Number(value) : fallback;
const coordinate = value => Number(number(value).toFixed(3));
const point = value => Array.isArray(value) && value.length >= 2 && value[0] != null && value[1] != null && finite(value[0]) && finite(value[1]);
const polygon = value => Array.isArray(value) && value.length >= 3 && value.every(point) ? value.map(p => p.map(number)) : [];
const list = value => Array.isArray(value) ? value.filter(item => item != null) : [];
const format = (value, places = 0) => number(value).toLocaleString('en-CA', { maximumFractionDigits: places });
const label = value => String(value ?? '').replace(/[_-]/g, ' ');
const attributes = values => Object.entries(values).map(([key, value]) => ` ${key}="${escape(value)}"`).join('');
const path = points => points.length ? `M${points.map(p => `${coordinate(p[0])},${coordinate(p[1])}`).join('L')}Z` : '';
const linePath = points => points.length ? `M${points.map(p => `${coordinate(p[0])},${coordinate(p[1])}`).join('L')}` : '';
const text = (x, y, content, extra = {}) => `<text${attributes({ x: coordinate(x), y: coordinate(y), ...extra })}>${escape(content)}</text>`;
const lines = (x, y, content, extra = {}, lineHeight = 19) => content.map((item, i) => text(x, y + i * lineHeight, item, extra)).join('');
function wrap(content, width, size = 14) {
  const words = String(content).split(/\s+/), result = []; let row = '';
  for (const word of words) {
    if (row && (row.length + word.length + 1) * size * .5 > width) { result.push(row); row = word; }
    else row += `${row ? ' ' : ''}${word}`;
  }
  if (row) result.push(row);
  return result;
}
function bounds(points) {
  const valid = points.filter(point);
  if (!valid.length) return null;
  const xs = valid.map(p => p[0]), ys = valid.map(p => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}
function fit(points, box, padding = 3) {
  const b = bounds(points);
  if (!b) return null;
  const width = Math.max(.01, b.maxX - b.minX), height = Math.max(.01, b.maxY - b.minY);
  const scale = Math.min((box.width - padding * 2) / width, (box.height - padding * 2) / height);
  return p => [box.x + box.width / 2 + (p[0] - (b.minX + b.maxX) / 2) * scale, box.y + box.height / 2 - (p[1] - (b.minY + b.maxY) / 2) * scale];
}
function towersFor(model) {
  const supplied = list(model.social?.towers).filter(tower => list(tower.floors).some(floor => polygon(floor.polygon).length));
  if (supplied.length) return supplied;
  const floors = list(model.floors).filter(floor => !floor.isPodium && polygon(floor.polygon).length);
  return floors.length ? [{ id: 'primary', core: model.core, floors, roof: model.roof }] : [];
}
function floorsFor(model) {
  const towers = towersFor(model);
  return towers.length ? [...list(model.floors).filter(floor => floor.isPodium), ...towers.flatMap(tower => list(tower.floors))] : list(model.floors);
}
function validFloors(model) { return floorsFor(model).filter(floor => polygon(floor.polygon).length); }
function decksFor(model) { return [...list(model.social?.connectors), ...list(model.landscape?.decks)].filter(deck => polygon(deck.polygon).length); }
function supportMembers(model) { return [...list(model.social?.supportMembers), ...list(model.landscape?.supportMembers)]; }
function worldPoint(p, model, state) {
  // Floors and companion offsets are in building-local metres. Site/context stays fixed.
  const rotation = number(model.siteContext?.rotationDeg, number(state.siteContext?.rotation, number(state.siteContext?.rotationDeg))) * Math.PI / 180;
  const c = Math.cos(rotation), s = Math.sin(rotation), placement = state.placement || model.placement || {};
  return [p[0] * c - p[1] * s + number(placement.x), p[0] * s + p[1] * c + number(placement.y)];
}
function siteData(model, state) {
  const site = polygon(model.site?.polygon).length ? polygon(model.site.polygon) : polygon(model.siteContext?.polygon);
  const floors = validFloors(model).map(floor => ({ ...floor, world: polygon(floor.polygon).map(p => worldPoint(p, model, state)) }));
  const decks = decksFor(model).map(deck => ({ ...deck, world: polygon(deck.polygon).map(p => worldPoint(p, model, state)) }));
  const roofs = [model.roof, model.podiumRoof, ...towersFor(model).map(tower => tower.roof)].filter(roof => polygon(roof?.polygon).length).map(roof => polygon(roof.polygon).map(p => worldPoint(p, model, state)));
  const cones = list(model.siteContext?.cones).flatMap(cone => {
    const polygons = polygon(cone.polygon).length ? [polygon(cone.polygon)] : list(cone.polygons).map(polygon).filter(p => p.length);
    return polygons.map(points => ({ ...cone, points }));
  });
  const boundaryKnown = model.siteContext?.boundaryKnown !== false && model.site?.boundaryKnown !== false;
  return { site, floors, decks, roofs, cones, boundaryKnown };
}
function marker(id, colour) { return `<marker id="${id}" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0L7,3.5L0,7" fill="none" stroke="${colour}" stroke-width="1.2"/></marker>`; }
function frame(title, summary, body, width, height, mode, state, metadata = {}) {
  const titleId = `model-diagram-${mode}-title`, descId = `model-diagram-${mode}-description`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${titleId} ${descId}"><title id="${titleId}">${escape(title)}</title><desc id="${descId}">${escape(summary.replace(/[.!?]$/, ''))}. ${escape(SCOPE)}.</desc><metadata>${escape(JSON.stringify({ drawing: title, design: state.name || 'Untitled design', units: 'metres', scope: 'Concept geometry only', ...metadata }))}</metadata><style>text{font-family:Barlow,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;fill:${COLOUR.ink};font-variant-numeric:tabular-nums}.heading{font-size:17px;font-weight:600}.muted{fill:${COLOUR.muted}}.small{font-size:14px}.line{fill:none;stroke:${COLOUR.rule};stroke-width:1}.outline{fill:${COLOUR.coral};fill-opacity:.1;stroke:${COLOUR.coral};stroke-width:1.4}.core{fill:${COLOUR.blue};fill-opacity:.25;stroke:${COLOUR.blue};stroke-width:1}.slab{fill:none;stroke:${COLOUR.coral};stroke-opacity:.38;stroke-width:.7}.deck{fill:${COLOUR.green};fill-opacity:.3;stroke:${COLOUR.green};stroke-width:1.6}.support{fill:none;stroke:${COLOUR.blue};stroke-width:1.3}.site{fill:none;stroke:${COLOUR.blue};stroke-width:1.8}.study-extent{fill:none;stroke:${COLOUR.muted};stroke-width:1;stroke-dasharray:6 5}.cone{fill:${COLOUR.focus};fill-opacity:.08;stroke:${COLOUR.focus};stroke-width:1;stroke-dasharray:5 4}.floor{fill:${COLOUR.coral};fill-opacity:.025;stroke:${COLOUR.coral};stroke-opacity:.3;stroke-width:.7}</style><defs>${marker(`arrow-${mode}`, COLOUR.blue)}</defs><rect width="${width}" height="${height}" fill="${COLOUR.paper}"/>${body}</svg>`;
}
function scopeBand(y, width, compact) {
  const content = compact ? ['Not calculated: member forces, drift,', 'wind/seismic response, accessibility', 'or full code compliance'] : ['Not calculated: member forces, drift, wind/seismic response, accessibility or full code compliance'];
  return `<path d="M18,${y}H${width - 18}" stroke="${COLOUR.rule}"/>${lines(20, y + 24, content, { class: 'muted' }, 19)}`;
}
function emptyDrawing(mode, state, compact, message) {
  const width = compact ? 390 : 900, height = compact ? 250 : 220;
  const title = `${mode === 'site' ? 'Site plan' : mode === 'social' ? 'Shared sky spaces' : 'How this model is built'} · geometry unavailable`;
  const summary = 'Generate a valid closed plan to show the model explanation.';
  const body = text(20, 32, compact ? 'Geometry unavailable' : title, { class: 'heading' }) + lines(20, 72, wrap(message, width - 40), { class: 'muted' }) + scopeBand(height - (compact ? 90 : 60), width, compact);
  return { title, summary, notes: [message, SCOPE], svg: frame(title, summary, body, width, height, mode, state) };
}
function projection(model) {
  const towers = towersFor(model), first = towers[0]?.core?.center || towers[0]?.offset || [0, 0], last = towers.at(-1)?.core?.center || towers.at(-1)?.offset || [1, 0];
  const a = Array.isArray(first) ? first : [number(first.x), number(first.y)], b = Array.isArray(last) ? last : [number(last.x), number(last.y)];
  const dx = number(b[0]) - number(a[0]), dy = number(b[1]) - number(a[1]), length = Math.hypot(dx, dy);
  const axis = length > .01 ? [dx / length, dy / length] : [1, 0];
  return p => p[0] * axis[0] + p[1] * axis[1];
}
function elevation(model, state, box, { details = true, showLandscape = false, anchors } = {}) {
  const project = projection(model), towers = towersFor(model), floors = validFloors(model), decks = showLandscape ? decksFor(model) : list(model.social?.connectors).filter(deck => polygon(deck.polygon).length);
  const slice = floor => { const xs = polygon(floor.polygon).map(project); return [Math.min(...xs), Math.max(...xs)]; };
  const roofTop = Math.max(number(model.summary?.height), ...floors.map(floor => number(floor.top, number(floor.z) + number(floor.height))), 1);
  const extents = [...floors.flatMap(floor => { const x = slice(floor); return [[x[0], number(floor.z)], [x[1], roofTop]]; }), ...decks.flatMap(deck => polygon(deck.polygon).map(p => [project(p), number(deck.zTop)]))];
  const to = fit(extents, box, 4); if (!to) return '';
  let body = '';
  const shape = (floor, top, className, extra = {}) => {
    const [lo, hi] = slice(floor), bottom = number(floor.z, number(floor.zBottom)), end = number(top, bottom + number(state.slabThickness, .25));
    return `<path${attributes({ d: path([[lo, bottom], [hi, bottom], [hi, end], [lo, end]].map(to)), class: className, ...extra })}/>`;
  };
  for (const floor of list(model.floors).filter(floor => floor.isPodium && polygon(floor.polygon).length)) body += shape(floor, floor.top, 'outline');
  for (const tower of towers) {
    const ordered = list(tower.floors).filter(floor => polygon(floor.polygon).length).sort((a, b) => number(a.z) - number(b.z));
    if (!ordered.length) continue;
    const left = ordered.map(floor => [slice(floor)[0], number(floor.z)]), right = ordered.map(floor => [slice(floor)[1], number(floor.z)]);
    const roof = polygon(tower.roof?.polygon), roofZ = number(tower.roof?.z, number(ordered.at(-1).top, roofTop));
    const roofX = roof.length ? [Math.min(...roof.map(project)), Math.max(...roof.map(project))] : slice(ordered.at(-1));
    body += `<path${attributes({ d: path([...left, [roofX[0], roofZ], [roofX[1], roofZ], ...right.reverse()].map(to)), class: 'outline', 'data-tower': tower.id, 'data-floor-count': ordered.length })}/>`;
    const core = polygon(tower.core?.polygon);
    if (core.length) { const x = core.map(project); body += `<path d="${path([[Math.min(...x), 0], [Math.max(...x), 0], [Math.max(...x), number(tower.core.height, roofZ)], [Math.min(...x), number(tower.core.height, roofZ)]].map(to))}" class="core"/>`; }
    for (const floor of ordered) body += shape(floor, number(floor.z) + number(state.slabThickness, .25), 'slab', { 'data-floor-index': floor.index });
  }
  for (const member of [...list(model.social?.supportMembers), ...(showLandscape ? list(model.landscape?.supportMembers) : [])]) {
    if (!point(member.start) || !point(member.end)) continue;
    const a = to([project(member.start), number(member.start[2])]), b = to([project(member.end), number(member.end[2])]);
    body += `<path${attributes({ d: linePath([a, b]), class: 'support', 'data-member': member.id })}/>`;
  }
  for (const deck of decks) {
    body += shape({ ...deck, z: number(deck.zBottom) }, deck.zTop, 'deck', { 'data-connector': deck.id, 'data-floor-index': deck.floorIndex, 'data-z-top': coordinate(deck.zTop) });
    if (anchors) anchors.push({ deck, point: to([Math.max(...polygon(deck.polygon).map(project)), number(deck.zTop)]) });
    if (details) for (const bearing of list(deck.bearings)) if (point(bearing.point)) {
      const p = to([project(bearing.point), number(bearing.point[2])]);
      body += `<rect${attributes({ x: coordinate(p[0] - 3), y: coordinate(p[1] - 3), width: 6, height: 6, fill: COLOUR.blue, 'data-bearing-tower': bearing.towerId })}/>`;
    }
  }
  const bottom = to([0, 0])[1];
  body += `<path d="M${box.x},${coordinate(bottom)}H${box.x + box.width}" stroke="${COLOUR.rule}"/>`;
  return body;
}
function plan(model, state, box, { showCones = false, provenance = false, includeCore = true } = {}) {
  const data = siteData(model, state), allPoints = [...data.site, ...data.floors.flatMap(floor => floor.world), ...data.decks.flatMap(deck => deck.world), ...data.roofs.flat()];
  const to = fit(allPoints, box, 10); if (!to) return '';
  let body = '';
  // The site box is the drawing crop. Very long view-cone polygons remain clipped to it.
  const clipId = `diagram-plan-${coordinate(box.x)}-${coordinate(box.y)}-${coordinate(box.width)}`.replace(/\./g, '_');
  body += `<defs><clipPath id="${clipId}"><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"/></clipPath></defs><g clip-path="url(#${clipId})">`;
  if (showCones) for (const cone of data.cones) body += `<path${attributes({ d: path(cone.points.map(to)), class: 'cone', 'data-cone': cone.id || cone.name || cone.label })}/>`;
  for (const floor of data.floors) body += `<path${attributes({ d: path(floor.world.map(to)), class: 'floor', 'data-floor-index': floor.index, 'data-tower': floor.towerId || (floor.isPodium ? 'shared-podium' : 'primary'), ...(provenance ? { 'data-site-points': JSON.stringify(floor.world.map(p => p.map(coordinate))) } : {}) })}/>`;
  for (const roof of data.roofs) body += `<path d="${path(roof.map(to))}" class="floor"/>`;
  for (const deck of data.decks) body += `<path${attributes({ d: path(deck.world.map(to)), class: 'deck', 'data-deck': deck.id })}/>`;
  if (includeCore) for (const tower of towersFor(model)) {
    const core = polygon(tower.core?.polygon).map(p => worldPoint(p, model, state));
    if (core.length) body += `<path d="${path(core.map(to))}" class="core"/>`;
  }
  if (data.site.length) body += `<path${attributes({ d: path(data.site.map(to)), class: data.boundaryKnown ? 'site' : 'study-extent', ...(provenance ? { [data.boundaryKnown ? 'data-site-boundary' : 'data-display-extent']: JSON.stringify(data.site) } : {}) })}/>`;
  return body + '</g>';
}
function inputDrawing(model, state, box) {
  const floor = validFloors(model).find(f => !f.isPodium) || validFloors(model)[0];
  const floorPlan = polygon(floor?.polygon).map(p => worldPoint(p, model, state)), site = siteData(model, state).site;
  const to = fit([...site, ...floorPlan], { x: box.x, y: box.y + 30, width: box.width * .54, height: box.height - 40 }, 4);
  let body = to ? `${site.length ? `<path d="${path(site.map(to))}" class="${siteData(model, state).boundaryKnown ? 'site' : 'study-extent'}"/>` : ''}<path d="${path(floorPlan.map(to))}" class="outline"/>` : '';
  const profile = list(state.profile).filter(knot => finite(knot.t) && finite(knot.scaleX));
  const points = profile.map(knot => [number(knot.scaleX) * number(state.width, 50) / 2, number(knot.t) * number(state.height, 1)]);
  const fitProfile = fit([[0, 0], ...points], { x: box.x + box.width * .59, y: box.y + 7, width: box.width * .37, height: box.height - 14 }, 5);
  if (fitProfile && points.length) {
    body += `<path d="${linePath(points.map(fitProfile))}" class="support"/>`;
    for (const p of points.map(fitProfile)) body += `<circle cx="${coordinate(p[0])}" cy="${coordinate(p[1])}" r="2.5" fill="${COLOUR.blue}"/>`;
  }
  return body;
}
function processDrawing(model, state, compact) {
  const width = compact ? 390 : 900, height = compact ? 1040 : 380, floorCount = validFloors(model).length, towerCount = towersFor(model).length;
  const title = 'How this model is built';
  const summary = `${floorCount} occupied floor plates across ${towerCount} tower${towerCount === 1 ? '' : 's'} are generated from the plan, profiles and site, then shared with the geometry screens, 3D view and exports.`;
  const sharedCount = list(model.social?.connectors).length, terraceCount = list(model.landscape?.decks).length;
  const blocks = [
    { title: 'Plan + profile + site', details: [`${label(state.shape || 'Plan')} · ${format(state.height)} m`, 'Direct editing inputs'], draw: box => inputDrawing(model, state, box) },
    { title: 'Floors + cores', details: [`${floorCount} plates · ${towerCount} core${towerCount === 1 ? '' : 's'}`, `${format(model.summary?.gfa)} m² occupied GFA`], draw: box => elevation(model, state, box, { details: false }) },
    { title: 'Decks + supports', details: [`${sharedCount} shared · ${terraceCount} terrace${terraceCount === 1 ? '' : 's'}`, `${supportMembers(model).length} support members`], draw: box => elevation(model, state, box, { details: false, showLandscape: true }) },
    { title: 'Geometry screens', details: ['Area · core fit · site fit', 'Plan overlaps only'], draw: box => plan(model, state, box) },
    { title: 'Same model → output', details: ['3D view · native Rhino', 'Editable design JSON'], draw: box => elevation(model, state, box, { details: false, showLandscape: true }) }
  ];
  const name = state.name || 'Current design';
  let body = text(20, 30, compact && name.length > 40 ? name.slice(0, 39) + '…' : name, { class: 'heading' }) + text(20, 54, 'One geometric model, rebuilt when you edit.', { class: 'muted' });
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i], x = compact ? 20 : 20 + i * 178, y = compact ? 77 + i * 172 : 78;
    const drawBox = compact ? { x, y: y + 8, width: 108, height: 127 } : { x, y: y + 35, width: 148, height: 112 };
    body += text(compact ? x + 127 : x, compact ? y + 30 : y + 16, b.title, { class: 'heading' });
    body += b.draw(drawBox);
    body += lines(compact ? x + 127 : x, compact ? y + 65 : y + 178, compact ? b.details.flatMap(detail => wrap(detail, 220)) : b.details, {}, 20);
    if (i < blocks.length - 1) body += compact ? `<path d="M74,${y + 145}v16" class="support" marker-end="url(#arrow-process)"/>` : `<path d="M${x + 152},${y + 93}h18" class="support" marker-end="url(#arrow-process)"/>`;
  }
  body += scopeBand(compact ? 947 : 313, width, compact);
  return { title, summary, notes: ['GFA counts occupied floors; shared sky-deck area is reported separately.', SCOPE], svg: frame(title, summary, body, width, height, 'process', state, { floorCount, towerCount, sharedDeckCount: sharedCount, terraceCount }) };
}
function socialDrawing(model, state, compact) {
  const width = compact ? 390 : 900, connectors = list(model.social?.connectors).filter(deck => polygon(deck.polygon).length), towers = towersFor(model);
  const title = connectors.length ? 'Shared sky spaces · actual floor connections' : 'Tower floors · shared sky spaces are off';
  const summary = `${towers.length} tower${towers.length === 1 ? '' : 's'} with ${connectors.length} shared sky deck${connectors.length === 1 ? '' : 's'} at generated floor elevations. Bearings and supports show intended gravity paths only.`;
  const byLevel = new Map();
  for (const connector of connectors) {
    const key = `${connector.floorIndex}:${connector.zTop}`;
    if (!byLevel.has(key)) byLevel.set(key, []);
    byLevel.get(key).push(connector);
  }
  const callouts = [...byLevel.values()].map(decks => ({ decks, first: `Floor ${decks[0].floorIndex} · ${format(decks[0].zTop, 2)} m`, second: `${decks.length} deck${decks.length === 1 ? '' : 's'} · ${decks.reduce((sum, deck) => sum + list(deck.bearings).length, 0)} bearings` }));
  const calloutHeight = Math.max(70, callouts.length * 58), chart = compact ? { x: 20, y: 64, width: 350, height: 300 } : { x: 25, y: 60, width: 520, height: 230 };
  const annotationY = compact ? 397 : 98, pathY = compact ? annotationY + calloutHeight + 8 : 307;
  const boundaryY = compact ? pathY + 125 : 378, height = boundaryY + (compact ? 94 : 63);
  const anchors = [];
  let body = text(20, 30, label(model.social?.typology || state.social?.typology || 'Single tower'), { class: 'heading' }) + elevation(model, state, chart, { details: true, showLandscape: !connectors.length, anchors });
  const keyX = compact ? 20 : 582;
  if (callouts.length) for (let i = 0; i < callouts.length; i++) {
    const item = callouts[i], y = annotationY + i * 58;
    for (const deck of item.decks) {
      const anchor = anchors.find(itemAnchor => itemAnchor.deck === deck)?.point;
      if (anchor && !compact) body += `<path d="${linePath([anchor, [chart.x + chart.width + 15, anchor[1]], [keyX - 12, y - 5]])}" fill="none" stroke="${COLOUR.green}" stroke-width="1"/>`;
      if (anchor && compact) body += text(anchor[0] + 7, anchor[1] - 4, `F${deck.floorIndex}`, { fill: COLOUR.green });
    }
    body += `<path d="M${keyX},${y - 5}h22" stroke="${COLOUR.green}" stroke-width="4"/>`;
    body += text(keyX + 32, y, item.first, { class: 'heading' }) + text(keyX + 32, y + 21, item.second, { class: 'muted' });
  } else body += lines(keyX, annotationY, compact ? ['Enable a shared sky-space typology', 'to generate connected floors.'] : ['Enable a shared sky-space typology', 'to generate connected floors.'], { class: 'muted' });
  body += text(20, pathY + 4, 'Intended gravity path', { class: 'heading' });
  const intended = connectors.length ? 'Shared deck → bearing reservations → support framing → tower cores / columns.' : 'Floor plates → continuous columns / core → grade.';
  body += lines(20, pathY + 28, wrap(intended, width - 40), {}, 20);
  body += lines(20, pathY + (compact ? 78 : 53), wrap('Blue geometry shows reserved cores, bearings and members; connection design and forces remain unresolved.', width - 40), { class: 'muted' }, 19);
  body += scopeBand(boundaryY, width, compact);
  return { title, summary, notes: ['Floor labels and deck elevations come from generated connector geometry.', 'Shared deck area is separate from occupied GFA.', SCOPE], svg: frame(title, summary, body, width, height, 'social', state, { towerCount: towers.length, connectors: connectors.map(deck => ({ id: deck.id, floorIndex: deck.floorIndex, zTop: deck.zTop, bearingCount: list(deck.bearings).length })) }) };
}
function siteDrawing(model, state, compact) {
  const width = compact ? 390 : 900, height = compact ? 715 : 398, data = siteData(model, state), context = model.siteContext || {};
  if (!data.site.length) return emptyDrawing('site', state, compact, 'The site boundary is unavailable. Select a site context to draw the placement screen.');
  const title = 'Site plan · all active floor footprints';
  const overlapLabels = list(model.siteAssessment?.overlaps).map(overlap => overlap.label || overlap.id).filter(Boolean);
  const summary = `${data.floors.length} actual floor footprints are placed in the current site coordinate system. ${data.boundaryKnown ? '' : 'Parcel boundary, fit, area and FSR are unknown; the dashed display extent is not a parcel. '}${overlapLabels.length ? `${overlapLabels.length} plan view-cone overlap${overlapLabels.length === 1 ? '' : 's'} flagged.` : 'Plan view-cone overlaps are geometric screening only.'} View-cone height compliance is unknown.`;
  const chart = compact ? { x: 20, y: 67, width: 350, height: 280 } : { x: 20, y: 60, width: 530, height: 258 };
  let body = lines(20, 30, wrap(context.label || model.site?.label || 'Current site boundary', width - 40, 17).slice(0, 2), { class: 'heading' }, 20) + plan(model, state, chart, { showCones: true, provenance: true });
  const x = compact ? 20 : 581, y = compact ? 377 : 77;
  const placement = state.placement || model.placement || {}, rotation = number(context.rotationDeg);
  const details = [
    [`${data.floors.length} occupied floor footprints`, 'Coral outlines include every active tower.'],
    [`${data.decks.length} shared / terrace decks`, 'Green outlines include exterior decks.'],
    [!data.boundaryKnown ? 'Parcel fit: unknown' : context.boundarySource === 'study' ? 'Study outline + plan view cones' : 'Fixed site + plan view cones', !data.boundaryKnown ? 'Dashed display extent is not a parcel. Area and FSR are unknown.' : `${format(rotation, 1)}° building rotation · E ${format(placement.x, 1)} / N ${format(placement.y, 1)} m`],
    ['Height compliance: unknown', overlapLabels.length ? `Plan overlap: ${overlapLabels.join(', ')}` : 'Plan overlap is not a height clearance check.']
  ];
  let nextY = y;
  for (const [first, second] of details) {
    body += text(x, nextY, first, { class: 'heading' });
    const rows = wrap(second, compact ? 350 : 300);
    body += lines(x, nextY + 22, rows, { class: 'muted' }, 19); nextY += Math.max(56, 26 + rows.length * 19);
  }
  const boundaryY = compact ? Math.max(621, nextY + 10) : Math.max(336, nextY + 10);
  body += scopeBand(boundaryY, width, compact);
  return { title, summary, notes: ['Site and plan view cones stay fixed; building placement and rotation are applied once.', ...(!data.boundaryKnown ? ['The dashed drawing extent is for navigation only; parcel boundary, fit, area and FSR are unknown.'] : context.boundarySource === 'study' ? ['The boundary is a user-authored study outline, not a property boundary.'] : []), 'A plan overlap cannot establish the permitted height at a floor.', SCOPE], svg: frame(title, summary, body, width, Math.max(height, boundaryY + (compact ? 94 : 62)), 'site', state, { floorCount: data.floors.length, siteContext: context.id || 'supplied-rhino', rotationDeg: rotation, placement, boundaryKnown: data.boundaryKnown, fitStatus: data.boundaryKnown ? model.siteAssessment?.fitStatus || 'unassessed' : 'unknown', overlapCount: overlapLabels.length, heightCompliance: 'unknown' }) };
}
/**
 * Pure, standalone SVG. Use compact:true below a 600px container for readable mobile text.
 * No assessment is inferred from the drawing or from the presence of support geometry.
 */
export function createModelDiagram(model = {}, state = model?.state || {}, { mode = 'process', compact = false } = {}) {
  model = model || {}; state = state || model.state || {};
  const kind = ['process', 'social', 'site'].includes(mode) ? mode : 'process';
  if (!validFloors(model).length) return emptyDrawing(kind, state, compact, 'The plan has no valid generated floors. Resolve the plan geometry to rebuild this drawing.');
  return kind === 'social' ? socialDrawing(model, state, compact) : kind === 'site' ? siteDrawing(model, state, compact) : processDrawing(model, state, compact);
}

import {getSiteContext} from './site-context.js';
/** Native Rhino mesh-solid export; all dimensions and source coordinates are metres. */
export const SOURCE_ORIGIN = Object.freeze([439.703104, 143.256, 0]);
export const EXPORT_LIMITS = 'Concept geometry only. No structural capacity, wind/seismic analysis, planting-load design, accessibility or complete Vancouver code compliance assessment.';

const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, s) => a.map(v => v * s);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = v => Math.hypot(...v);
const unit = v => mul(v, 1 / length(v));
const area = p => p.reduce((a, v, i) => { const n = p[(i + 1) % p.length]; return a + v[0] * n[1] - n[0] * v[1]; }, 0) / 2;

function cleanLoop(points, ccw) {
  let p = points.map(v => [Number(v[0]), Number(v[1])]);
  if (p.length > 1 && Math.hypot(p[0][0] - p.at(-1)[0], p[0][1] - p.at(-1)[1]) < 1e-7) p.pop();
  if (p.length < 3 || p.some(v => !v.every(Number.isFinite)) || Math.abs(area(p)) < 1e-8) throw new Error('A floor outline is invalid.');
  // Earcut discards collinear vertices. Remove them from the side-wall loops too,
  // so rectangular/triangular plans cannot acquire cap-to-wall T junctions.
  p = p.filter((b, i) => {
    const a = p[(i - 1 + p.length) % p.length], c = p[(i + 1) % p.length];
    const determinant = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    const scale = Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(c[0] - b[0], c[1] - b[1]);
    return Math.abs(determinant) > Math.max(1, scale) * 1e-10;
  });
  if (p.length < 3) throw new Error('A floor outline has no noncollinear boundary.');
  if ((area(p) > 0) !== ccw) p.reverse();
  return p;
}

/** Build a closed, outward-wound extrusion with actual apertures, including concave plans. */
export function extrudePlan(outline, holes, z, thickness, three = globalThis.THREE) {
  if (!three?.ShapeUtils?.triangulateShape) throw new Error('The locally bundled plan triangulator has not loaded.');
  if (!Number.isFinite(z) || !(thickness > 0)) throw new Error('A slab elevation or thickness is invalid.');
  const outer = cleanLoop(outline, true), inner = (holes || []).map(h => cleanLoop(h, false));
  const vector = p => p.map(([x, y]) => new three.Vector2(x, y));
  let triangles = three.ShapeUtils.triangulateShape(vector(outer), inner.map(vector));
  const flat = [outer, ...inner].flat(), n = flat.length;
  if (!triangles.length) throw new Error('A floor outline could not be triangulated.');
  // Earcut may remove a collinear cap vertex when it joins aligned apertures.
  // Split cap edges at every retained loop vertex, so the cap and wall mesh share
  // identical seams even with two or three independent tower-core openings.
  if(inner.length>1) {
    const pending=[...triangles],conforming=[];
    while(pending.length) {
      const tri=pending.pop();let split=false;
      for(let edge=0;edge<3&&!split;edge++) {
        const ai=tri[edge],bi=tri[(edge+1)%3],ci=tri[(edge+2)%3],a=flat[ai],b=flat[bi],dx=b[0]-a[0],dy=b[1]-a[1],squared=dx*dx+dy*dy;
        for(let i=0;i<flat.length;i++) {
          if(tri.includes(i))continue;const p=flat[i],projection=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/squared;
          if(projection<=1e-8||projection>=1-1e-8||Math.abs(dx*(p[1]-a[1])-dy*(p[0]-a[0]))>1e-8*Math.max(1,Math.sqrt(squared)))continue;
          pending.push([ai,i,ci],[i,bi,ci]);split=true;break;
        }
      }
      if(!split)conforming.push(tri);
    }
    triangles=conforming;
  }
  const vertices = [...flat.map(p => [...p, z]), ...flat.map(p => [...p, z + thickness])];
  const faces = [];
  for (let [a, b, c] of triangles) {
    const pa = flat[a], pb = flat[b], pc = flat[c];
    if ((pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]) < 0) [b, c] = [c, b];
    faces.push([c, b, a], [a + n, b + n, c + n]);
  }
  let offset = 0;
  for (const loop of [outer, ...inner]) {
    for (let i = 0; i < loop.length; i++) {
      const a = offset + i, b = offset + (i + 1) % loop.length;
      faces.push([a, b, b + n], [a, b + n, a + n]);
    }
    offset += loop.length;
  }
  return { vertices, faces };
}

/** An actual capped member cross-section; does not encode capacity or connections. */
export function memberSolid(start, end, radius, sides = 8) {
  if (!start?.every(Number.isFinite) || !end?.every(Number.isFinite) || !(radius > 0)) throw new Error('A structural member has invalid dimensions.');
  const delta = sub(end, start);
  if (length(delta) < 1e-7) throw new Error('A structural member has zero length.');
  const d = unit(delta), ref = Math.abs(d[2]) < .9 ? [0, 0, 1] : [1, 0, 0];
  const u = unit(cross(d, ref)), v = cross(d, u), vertices = [], faces = [];
  for (const p of [start, end]) for (let i = 0; i < sides; i++) {
    const theta = i / sides * Math.PI * 2;
    vertices.push(add(p, add(mul(u, radius * Math.cos(theta)), mul(v, radius * Math.sin(theta)))));
  }
  vertices.push([...start], [...end]);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    faces.push([i, j, j + sides], [i, j + sides, i + sides], [sides * 2, j, i], [sides * 2 + 1, i + sides, j + sides]);
  }
  return { vertices, faces };
}

/** Match the square section reservations used in the browser's instanced members. */
export function squareMemberSolid(start, end, section) {
  if (!start?.every(Number.isFinite) || !end?.every(Number.isFinite) || !(section > 0)) throw new Error('A structural member has invalid dimensions.');
  const delta = sub(end, start);
  if (length(delta) < 1e-7) throw new Error('A structural member has zero length.');
  const d = unit(delta);
  // Minimal rotation from +Z matches THREE.Quaternion.setFromUnitVectors.
  const k = 1 + d[2];
  const u = k > 1e-8 ? [1 - d[0] * d[0] / k, -d[0] * d[1] / k, -d[0]] : [1, 0, 0];
  const v = k > 1e-8 ? [-d[0] * d[1] / k, 1 - d[1] * d[1] / k, -d[1]] : [0, -1, 0];
  const h = section / 2, vertices = [], faces = [];
  for (const p of [start, end]) for (const [x, y] of [[-h, -h], [h, -h], [h, h], [-h, h]]) vertices.push(add(p, add(mul(u, x), mul(v, y))));
  faces.push([2, 1, 0], [3, 2, 0], [4, 5, 6], [4, 6, 7]);
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; faces.push([i, j, j + 4], [i, j + 4, i + 4]); }
  return { vertices, faces };
}

/** Match the engine's rectangular section axes for terrace beams and guard infill. */
export function rectangularMemberSolid(start, end, width, depth, axes = null) {
  if (!start?.every(Number.isFinite) || !end?.every(Number.isFinite) || !(width > 0) || !(depth > 0)) throw new Error('A rectangular member has invalid dimensions.');
  const delta = sub(end, start);
  if (length(delta) < 1e-7) throw new Error('A rectangular member has zero length.');
  const direction = unit(delta);
  const u = axes?.u ? unit(axes.u) : Math.abs(direction[2]) < .99999 ? unit(cross([0, 0, 1], direction)) : [1, 0, 0];
  const v = axes?.v ? unit(axes.v) : unit(cross(direction, u));
  if (![...u, ...v].every(Number.isFinite)) throw new Error('A rectangular member has invalid section axes.');
  const vertices = [], faces = [];
  for (const point of [start, end]) for (const [x, y] of [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]]) vertices.push(add(point, add(mul(u, x), mul(v, y))));
  faces.push([2, 1, 0], [3, 2, 0], [4, 5, 6], [4, 6, 7]);
  for (let i = 0; i < 4; i++) {const j = (i + 1) % 4; faces.push([i, j, j + 4], [i, j + 4, i + 4]);}
  return {vertices, faces};
}

/** Close the landscape strip by connecting its supplied inner/outer spatial edges. */
export function ribbonSolid(inner, outer, thickness = .25) {
  if (inner.length !== outer.length || inner.length < 2 || !(thickness > 0)) throw new Error('The landscape ribbon is invalid.');
  const vertices = [], faces = [];
  for (let i = 0; i < inner.length; i++) {
    if (![...inner[i], ...outer[i]].every(Number.isFinite)) throw new Error('The landscape ribbon has invalid points.');
    vertices.push(add(inner[i], [0, 0, -thickness]), add(outer[i], [0, 0, -thickness]), [...inner[i]], [...outer[i]]);
  }
  const quad = (a, b, c, d) => faces.push([a, b, c], [a, c, d]);
  for (let i = 0; i < inner.length - 1; i++) {
    const a = i * 4, b = a + 4;
    // Keep the exact top-surface triangulation shared with the model engine.
    faces.push([a + 2, a + 3, b + 2], [a + 3, b + 3, b + 2]);
    faces.push([a, b, a + 1], [a + 1, b, b + 1]);
    quad(a, a + 2, b + 2, b); // inner edge
    quad(a + 1, b + 1, b + 3, a + 3); // outer edge
  }
  quad(0, 1, 3, 2);
  const a = (inner.length - 1) * 4;
  quad(a, a + 2, a + 3, a + 1);
  return { vertices, faces };
}

function makeMesh(data, rhino, origin, rotation = 0) {
  const mesh = new rhino.Mesh();
  const angle=rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  for (const p of data.vertices) mesh.vertices().add(p[0]*c-p[1]*s + origin[0], p[0]*s+p[1]*c + origin[1], p[2] + origin[2]);
  for (const f of data.faces) mesh.faces().addTriFace(f[0], f[1], f[2]);
  mesh.normals().computeNormals();
  mesh.compact();
  if (!mesh.isClosed || !mesh.isValid) { mesh.delete(); throw new Error('Export encountered an invalid or open solid.'); }
  return mesh;
}

function blockers(model) {
  const checks = Array.isArray(model?.checks) ? model.checks : [];
  return checks.filter(c => c.status === 'block' || c.severity === 'block' || c.status === 'blocked');
}

/** Synchronous deterministic builder, also used by roundtrip verification tests. */
export function buildRhinoFile(model, rhino, options = {}) {
  if (!model?.floors?.length) throw new Error('Generate a tower before exporting.');
  if (blockers(model).length) throw new Error('Resolve the blocked geometry checks before exporting this tower.');
  if (model.floors.some(f => f.coreFits === false)) throw new Error('The fixed core does not fit every plate. Enlarge or reposition the plan before exporting.');
  if (model.roof?.coreFits === false) throw new Error('The fixed core does not fit the roof plate. Enlarge the upper plate before exporting.');
  if (options.includeContext) throw new Error('This export contains the tower only. Open the provided base model in Rhino and import this file to overlay it.');
  const file = new rhino.File3dm();
  file.settings().modelUnitSystem = rhino.UnitSystem.Meters;
  file.settings().modelAbsoluteTolerance = .001;
  file.applicationName = 'Mountain Studio';
  file.applicationDetails = EXPORT_LIMITS;
  const siteContext = getSiteContext(model.state);
  const baseOrigin = options.origin || siteContext.originRhino || SOURCE_ORIGIN;
  const placement = model.state?.placement || model.placement || {x: 0, y: 0};
  const origin = add(baseOrigin, [Number(placement.x) || 0, Number(placement.y) || 0, 0]);
  const layers = {};
  const addLayer = (key, name, color) => {
    const layer = new rhino.Layer(); layer.name = name;
    const n = parseInt(color.slice(1), 16); layer.color = { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 255 };
    layers[key] = file.layers().add(layer); layer.delete();
  };
  addLayer('floors', 'Tower Floors', '#cfccb8');
  addLayer('core', 'Structure Core Walls', '#b79571');
  addLayer('columns', 'Structure Columns', '#6c7773');
  addLayer('beams', 'Structure Floor Beams', '#6c7773');
  addLayer('diagrid', 'Structure Diagonal Members', '#d29152');
  addLayer('landscape', 'Landscape Level Terrace Decks', '#64836d');
  addLayer('terraceSupports', 'Structure Terrace Support Reservations', '#28475c');
  addLayer('megaFrames', 'Mega floor - outrigger - belt reservations', '#a06943');
  addLayer('guards', 'Landscape Guard Infill Reservations', '#91aa8b');
  addLayer('publicGround', 'Public Ground Surface', '#d8d9c5');
  addLayer('planters', 'Landscape Planting Reservation', '#385b42');
  if (model.vancouver?.terraces?.length) addLayer('vancouverTerraces', 'Vancouver Podium Terrace Caps', '#74876a');
  if (model.vancouver?.canopy) {
    addLayer('rainGallery', 'Vancouver Rain Gallery Roof', '#a9bdc5');
    addLayer('rainGallerySupports', 'Structure Rain Gallery Support Reservations', '#647a78');
  }
  if(model.social?.enabled){addLayer('skyDecks','Shared Sky Deck Reservations','#64836d');addLayer('skyFrames','Shared Sky Support Reservations','#28475c');}
  const addSolid = (data, kind, name, metadata = {}) => {
    const mesh = makeMesh(data, rhino, origin, siteContext.rotationDeg || 0), attributes = new rhino.ObjectAttributes();
    attributes.layerIndex = layers[kind]; attributes.name = name;
    attributes.setUserString('MountainStudio_kind', kind);
    attributes.setUserString('MountainStudio_geometry', JSON.stringify(metadata));
    attributes.setUserString('MountainStudio_assessment', EXPORT_LIMITS);
    file.objects().addMesh(mesh, attributes);
    mesh.delete(); attributes.delete();
  };
  try {
    populateModel(file, model, addSolid, options);
    file.strings().set('MountainStudio_source_origin_m', JSON.stringify(origin));
    file.strings().set('MountainStudio_original_source_origin_m', JSON.stringify(baseOrigin));
    file.strings().set('MountainStudio_placement_m', JSON.stringify({x: Number(placement.x) || 0, y: Number(placement.y) || 0}));
    file.strings().set('MountainStudio_coordinate_basis', siteContext.mode === 'vancouver' ? 'Vista model XY, Z up, metres; site rotation, placement and model-frame source origin applied once. Grade z=0 is assumed; geodetic vertical datum is unverified.' : 'Original competition model XY, Z up, metres; tower source origin and placement offset have each been applied once.');
    file.strings().set('MountainStudio_site_context', JSON.stringify({mode:siteContext.mode,id:siteContext.id,label:siteContext.label,originRhino:baseOrigin,rotationDeg:siteContext.rotationDeg || 0,verticalDatum:siteContext.verticalDatum}));
    file.strings().set('MountainStudio_context', 'Building geometry only; competition or Vancouver surrounding context is not included.');
    file.strings().set('MountainStudio_assessment', EXPORT_LIMITS);
    file.strings().set('MountainStudio_sources', 'https://vancouver.ca/your-government/vancouver-building-bylaw.aspx | https://bylaws.vancouver.ca/consolidated/14688.pdf | https://www.kpf.com/project/azrieli-spiral-tower | https://www.khm.at/en/objectdb/detail/323/');
    file.strings().set('MountainStudio_state', JSON.stringify(model.state || model.params || {}));
    return file;
  } catch (error) { file.delete(); throw error; }
}

// This adapter follows the geometry schema shared by the browser model and the exporter.
function populateModel(file, model, addSolid, options) {
  const state = model.state, core = model.core, three = options.three || globalThis.THREE;
  if (!core?.polygon || !core?.innerPolygon) throw new Error('The tower has no valid core reservation.');
  for (const floor of model.floors) {
    addSolid(extrudePlan(floor.polygon, floor.holes || [core.polygon], floor.z, state.slabThickness, three), 'floors', `Floor ${floor.index} — ${floor.isPodium ? 'podium' : 'tower'}`, {
      floor: floor.index, elevationM: floor.z, thicknessM: state.slabThickness,
      grossAreaM2: floor.grossArea, coreApertureAreaM2: core.width * core.depth * (floor.isPodium && model.social?.enabled ? model.social.towers.length : 1), totalApertureAreaM2: (floor.holes || [core.polygon]).reduce((sum,h)=>sum+Math.abs(area(h)),0), towerId: floor.towerId || (floor.isPodium && model.social?.enabled ? 'shared-podium' : undefined),
      floorUseReservation: floor.occupancy, coreFits: floor.coreFits
    });
  }
  if (model.roof?.polygon) addSolid(extrudePlan(model.roof.polygon, model.roof.holes || [core.polygon], model.roof.z, state.slabThickness, three), 'floors', 'Roof slab', { elevationM: model.roof.z, thicknessM: state.slabThickness, coreFits: model.roof.coreFits });
  if (model.podiumRoof?.polygon) addSolid(extrudePlan(model.podiumRoof.polygon, model.podiumRoof.holes || [core.polygon], model.podiumRoof.z, state.slabThickness, three), 'floors', 'Podium roof slab', {elevationM: model.podiumRoof.z, thicknessM: state.slabThickness, courtyard: model.publicSpace?.courtyard, note: 'Separate podium roof/cap; excluded from occupied floor area.'});
  for (const terrace of model.vancouver?.terraces || []) addSolid(terrace.solid || extrudePlan(terrace.polygon, terrace.holes || [], terrace.z, terrace.thickness, three), 'vancouverTerraces', terrace.id, {
    role: terrace.role || 'podium_terrace', elevationM: terrace.z, thicknessM: terrace.thickness, areaM2: terrace.area,
    holes: terrace.holes || [], stepDirection: model.vancouver.stepDirection,
    note: 'Exposed podium terrace cap; excluded from occupied floor area. Guarding, drainage, planting loads and access remain design work.'
  });
  const canopy = model.vancouver?.canopy;
  if (canopy) addSolid(canopy.solid || extrudePlan(canopy.polygon, canopy.holes || [], canopy.z, canopy.thickness, three), 'rainGallery', canopy.id, {
    role: 'rain_gallery_roof', elevationM: canopy.z, thicknessM: canopy.thickness, lengthM: canopy.length, areaM2: canopy.area,
    side: canopy.side, holes: canopy.holes || [], postIds: canopy.postIds, beamIds: canopy.beamIds,
    note: 'Independently supported rain gallery roof reservation; excluded from occupied floor area. Drainage, connections and capacity are unverified.'
  });
  addSolid(extrudePlan(core.polygon, [core.innerPolygon], 0, core.height, three), 'core', 'Continuous hollow core wall reservation', {
    widthM: core.width, depthM: core.depth, wallThicknessM: core.wall, heightM: core.height,
    note: 'Closed wall shell; door openings, coupling beams and shaft/stair planning are unresolved.'
  });
  for (const column of model.columns || []) addSolid(column.solid || (column.width && column.depth ? rectangularMemberSolid(column.start, column.end, column.width, column.depth, column.axes) : squareMemberSolid(column.start, column.end, column.section)), column.role === 'rain_gallery' ? 'rainGallerySupports' : 'columns', column.id, {startM: column.start, endM: column.end, squareSectionM: column.section, widthM: column.width, depthM: column.depth, role: column.role, component: column.component, mega: Boolean(column.mega), megaBandIds: column.megaBandIds, requestedMegaSectionM: column.requestedMegaSection, actualMegaSectionM: column.megaSection});
  for (const member of model.members || []) {
    const data = member.solid || (member.width && member.depth ? rectangularMemberSolid(member.start, member.end, member.width, member.depth, member.axes) : squareMemberSolid(member.start, member.end, member.section));
    const kind = member.role === 'rain_gallery' ? 'rainGallerySupports' : /^sky_/.test(member.role || '') ? 'skyFrames' : /^mega_/.test(member.role || '') ? 'megaFrames' : /terrace/.test(member.role || '') ? 'terraceSupports' : member.kind === 'diagonal' ? 'diagrid' : 'beams';
    const band = (model.megaFloors?.bands || []).find(b => b.id === member.bandId);
    const anchoredColumn = point => (model.columns || []).find(column => column.mega && Math.hypot(column.start[0] - point[0], column.start[1] - point[1]) < 1e-6)?.id;
    addSolid(data, kind, member.id, {startM: member.start, endM: member.end, towerId: member.towerId, connectorId: member.connectorId, squareSectionM: member.width ? undefined : member.section, widthM: member.width, depthM: member.depth, sectionAxes: member.axes, kind: member.kind, role: member.role, floorIndex: member.floorIndex, startNode: member.startNode, endNode: member.endNode, trussPattern: member.pattern || state.trussPattern, trussId: member.trussId, frameId: member.frameId, component: member.component, deckId: member.deckId, originalRadialId: member.originalRadialId, bandId: member.bandId, part: member.part, panelIndex: member.panelIndex, columnId: member.columnId, coreFaceAxis: member.coreFaceAxis, coreEmbedDepth: member.coreEmbedDepth, bottomFloorIndex: member.bottomFloorIndex, topFloorIndex: member.topFloorIndex, bandColumnIds: band?.columnIds, startColumnId: band ? anchoredColumn(member.start) : undefined, endColumnId: band ? anchoredColumn(member.end) : undefined});
  }
  if(model.social?.enabled) {
    for(const tower of model.social.towers.slice(1)) {
      for(const floor of tower.floors)addSolid(extrudePlan(floor.polygon,floor.holes,floor.z,state.slabThickness,three),'floors',`${tower.id} — floor ${floor.index}`,{towerId:tower.id,floor:floor.index,elevationM:floor.z,grossAreaM2:floor.grossArea,floorUseReservation:floor.occupancy});
      addSolid(extrudePlan(tower.roof.polygon,tower.roof.holes,tower.roof.z,state.slabThickness,three),'floors',`${tower.id} — roof`,{towerId:tower.id,elevationM:tower.roof.z});
      addSolid(extrudePlan(tower.core.polygon,[tower.core.innerPolygon],0,tower.core.height,three),'core',`${tower.id} — continuous hollow core`,{towerId:tower.id,widthM:tower.core.width,depthM:tower.core.depth,wallThicknessM:tower.core.wall,heightM:tower.core.height});
    }
    for(const deck of model.social.connectors)addSolid(deck.solid,'skyDecks',deck.id,{floorIndex:deck.floorIndex,zTop:deck.zTop,zBottom:deck.zBottom,fromTower:deck.fromTower,toTower:deck.toTower,bearings:deck.bearings,externalAreaM2:deck.externalArea,occupiedOverlapAreaM2:deck.occupiedOverlapArea,note:'Level shared sky deck; floor overlap excluded from additional shared area. Structural capacity, joints, movement and access are unresolved.'});
    for(const guard of model.social.guards)addSolid(guard.solid,'guards',guard.id,{connectorId:guard.connectorId,floorIndex:guard.floorIndex,note:'Guard infill reservation; resistance, anchorage and openings unverified.'});
    file.strings().set('MountainStudio_social_cluster',JSON.stringify({typology:model.social.typology,interpretation:true,source:model.social.sourceUrl,towers:model.social.towers.map(t=>({id:t.id,offset:t.offset})),connectors:model.social.connectors.map(({solid,...d})=>d),sharedSkyAreaM2:model.social.sharedSkyArea,occupiedGfaM2:model.social.occupiedGfa,inspectionTowerId:model.social.inspectionTowerId,limits:model.social.limits}));
  }
  const landscape = model.landscape;
  if (landscape?.enabled) {
    for (const deck of landscape.decks || []) {
      if (!deck.solid?.vertices?.length || !deck.solid?.faces?.length) throw new Error('A level terrace deck has no valid closed geometry.');
      addSolid(deck.solid, 'landscape', `Level terrace — floor ${deck.floorIndex}`, {
        floorIndex: deck.floorIndex, elevationM: deck.zTop ?? deck.z, thicknessM: deck.thickness || landscape.thickness,
        widthM: landscape.width, externalAreaM2: deck.externalArea ?? deck.area, access: deck.access,
        note: 'Level deck joined to its own floor. Door/frame, guard resistance, thermal bridging, waterproofing, planting loads and support capacity remain engineering/design work.'
      });
    }
    for (const guard of landscape.guards || []) {
      const solid = guard.solid || rectangularMemberSolid(guard.start, guard.end, guard.width, guard.depth, guard.axes);
      addSolid(solid, 'guards', guard.id || `Terrace guard — floor ${guard.floorIndex}`, {floorIndex: guard.floorIndex, startM: guard.start, endM: guard.end, widthM: guard.width, depthM: guard.depth, sectionAxes: guard.axes, note: 'Closed guard infill volume reservation; resistance, anchorage and opening requirements are unverified.'});
    }
    for (const [i, planter] of (landscape.planters || []).entries()) {
      const [x, y, z] = planter.center, w = planter.width / 2, d = planter.depth / 2;
      const polygon = planter.polygon || [[x - w, y - d], [x + w, y - d], [x + w, y + d], [x - w, y + d]];
      addSolid(extrudePlan(polygon, [], z - planter.height / 2, planter.height, three), 'planters', `Terrace planter reservation ${i + 1}`, {
        centerM: planter.center, widthM: planter.width, depthM: planter.depth, heightM: planter.height, floorIndex: planter.floorIndex,
        note: 'Concept planting reservation; no soil saturation, roots or loading calculation.'
      });
    }
  }
  const publicGround = model.publicSpace?.enabled ? model.publicSpace.ground : null;
  if (publicGround?.solid) addSolid(publicGround.solid, 'publicGround', 'Public ground beneath raised podium', {note: 'Concept public surface; access, permeability, landscape and drainage are unverified.'});
  else if (publicGround?.polygon?.length) addSolid(extrudePlan(publicGround.polygon, publicGround.holes || [], publicGround.z ?? 0, publicGround.thickness || .15, three), 'publicGround', 'Public ground beneath raised podium', {note: 'Concept public surface; access, permeability, landscape and drainage are unverified.'});
  for (const [index, garden] of (model.publicSpace?.enabled ? model.publicSpace.gardens || [] : []).entries()) {
    const solid = garden.solid || extrudePlan(garden.polygon, [], garden.baseZ ?? garden.z ?? 0, garden.thickness || garden.height || .45, three);
    addSolid(solid, 'publicGround', garden.id || `Public garden reservation ${index + 1}`, {note: 'Ground landscape reservation; planting, drainage and loads are unverified.'});
  }
  file.strings().set('MountainStudio_mega_floors', JSON.stringify(model.megaFloors || {enabled: false, bands: []}));
  if (model.vancouver) file.strings().set('MountainStudio_vancouver', JSON.stringify({
    ...model.vancouver,
    terraces: (model.vancouver.terraces || []).map(({solid, ...terrace}) => terrace),
    canopy: model.vancouver.canopy ? (({solid, ...roof}) => roof)(model.vancouver.canopy) : null
  }));
  file.strings().set('MountainStudio_truss_pattern', state.trussPattern || 'warren');
  file.strings().set('MountainStudio_checks', JSON.stringify(model.checks));
  file.strings().set('MountainStudio_summary', JSON.stringify(model.summary));
}

let rhinoPromise;
async function loadRhino() {
  if (!rhinoPromise) {
    if (typeof globalThis.rhino3dm !== 'function') throw new Error('The locally bundled Rhino exporter has not loaded.');
    rhinoPromise = globalThis.rhino3dm({ locateFile: file => new URL('./vendor/' + file, import.meta.url).href });
    rhinoPromise.catch(() => { rhinoPromise = null; });
  }
  return rhinoPromise;
}

/** Return a native 3dm Blob without saving or sending model data to an external service. */
export async function exportRhino(model, options = {}) {
  const rhino = options.rhino || await loadRhino(), file = buildRhinoFile(model, rhino, options);
  try { return new Blob([file.toByteArray()], { type: 'application/octet-stream' }); }
  finally { file.delete(); }
}

export async function downloadRhino(model) {
  const blob = await exportRhino(model);
  const preset = String(model.state?.preset || model.state?.name || model.params?.preset || 'tower').replace(/[^a-z0-9_-]/gi, '-');
  const fileName = `Mountain-Studio-${preset}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.3dm`;
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = fileName; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return { blob, fileName };
}

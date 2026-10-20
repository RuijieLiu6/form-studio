import {extrudePlan, rectangularMemberSolid} from './export.js';
import {getSiteContext} from './site-context.js';
/* The viewer consumes the same metre-based model used by the plan editor and exports.
 * X/Y are the competition site's local plan axes; Z is up. No analysis is implied
 * by the materials, lighting, or structural-member display. */
const T = window.THREE;
const COLORS = {background: '#f5f4ee', ground: '#ebece7', plate: '#cda28c', edge: '#955943', envelope: '#bc775b', core: '#b45c49', column: '#28475c', diagonal: '#397363', beam: '#647a78', context: '#b4c0c3', contextEdge: '#8c9c9f', site: '#a37b5f', selected: '#d8673e'};
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const vector = p => new T.Vector3(Number(p[0]) || 0, Number(p[1]) || 0, Number(p[2]) || 0);
const radians = n => (Number(n) || 0) * Math.PI / 180;

/** Draw a finite ground projection without inventing cone edges at the drawing crop. */
export function viewConeGroundGeometry(polygon, halfExtent = 300) {
  if (!Array.isArray(polygon) || polygon.length < 3 || polygon.some(p => !Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return {fill: [], edges: []};
  const limit = Math.max(1, Number(halfExtent) || 300), ring = polygon.map(p => p.slice(0, 2));
  if (ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]) ring.pop();
  let fill = ring;
  for (const [axis, boundary, sign] of [[0, -limit, 1], [0, limit, -1], [1, -limit, 1], [1, limit, -1]]) {
    const source = fill; fill = [];
    for (let i = 0; i < source.length; i++) {
      const a = source[i], b = source[(i + 1) % source.length], aInside = sign * (a[axis] - boundary) >= 0, bInside = sign * (b[axis] - boundary) >= 0;
      if (aInside) fill.push(a);
      if (aInside !== bInside) {const t = (boundary - a[axis]) / (b[axis] - a[axis]); fill.push(a.map((v, j) => v + t * (b[j] - v)));}
    }
  }
  const edges = [];
  // Clip each original edge independently. Crop seams are never presented as cone boundaries.
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], d = b.map((v, j) => v - a[j]); let low = 0, high = 1, valid = true;
    for (const [p, q] of [[-d[0], a[0] + limit], [d[0], limit - a[0]], [-d[1], a[1] + limit], [d[1], limit - a[1]]]) {
      if (Math.abs(p) < 1e-12) {if (q < 0) valid = false; continue;}
      const t = q / p; if (p < 0) low = Math.max(low, t); else high = Math.min(high, t);
    }
    if (valid && low <= high && high - low > 1e-10) edges.push([a.map((v, j) => v + low * d[j]), a.map((v, j) => v + high * d[j])]);
  }
  return {fill: fill.length >= 3 ? fill : [], edges};
}

function shapeWithHole(polygon, hole) {
  const shape = new T.Shape(polygon.map(p => new T.Vector2(p[0], p[1])));
  const loops = hole?.length ? typeof hole[0]?.[0] === 'number' ? [hole] : hole : [];
  for (const loop of loops) if (loop?.length) shape.holes.push(new T.Path([...loop].reverse().map(p => new T.Vector2(p[0], p[1]))));
  return shape;
}
function sideGeometry(lower, upper, z0, z1) {
  const positions = [], indices = [];
  for (let j = 0; j < lower.length; j++) {
    const a = lower[j], b = lower[(j + 1) % lower.length], c = upper[(j + 1) % upper.length], d = upper[j];
    const base = positions.length / 3;
    positions.push(a[0], a[1], z0, b[0], b[1], z0, c[0], c[1], z1, d[0], d[1], z1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

export function createScene(container, {onSelectFloor, onHandleChange} = {}) {
  if (!T?.WebGLRenderer || !T?.OrbitControls) throw new Error('The 3D viewer libraries did not load. Reload this page to try again.');
  const scene = new T.Scene(); scene.background = new T.Color(COLORS.background);
  scene.fog = new T.Fog(COLORS.background, 1400, 2600);
  const camera = new T.OrthographicCamera(-180, 180, 210, -210, .1, 5000);
  camera.up.set(0, 0, 1);
  const renderer = new T.WebGLRenderer({antialias: true, alpha: false, preserveDrawingBuffer: true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.domElement.setAttribute('aria-label', 'Interactive tower model. Drag to orbit; scroll to zoom; drag the labelled roof handles to shape the tower.');
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none;';
  container.appendChild(renderer.domElement);
  const controls = new T.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .12;
  controls.screenSpacePanning = true; controls.zoomSpeed = .8;
  controls.minZoom = .3; controls.maxZoom = 10;
  controls.maxPolarAngle = Math.PI * .495;
  controls.target.set(0, 0, 125);
  camera.position.set(430, -560, 390); controls.update();
  scene.add(new T.HemisphereLight('#fffdfa', '#a1afb0', .86));
  const key = new T.DirectionalLight('#fff9f0', .72); key.position.set(-350, -450, 700); scene.add(key);
  const fill = new T.DirectionalLight('#e6eef0', .35); fill.position.set(300, 100, 320); scene.add(fill);
  // Neutral model-board lighting, without a simulated sun or wind field.
  const ground = new T.Mesh(new T.PlaneGeometry(1800, 1800), new T.MeshBasicMaterial({color: new T.Color(COLORS.ground).convertSRGBToLinear()}));
  ground.position.z = -.35; scene.add(ground);
  const context = new T.Group(), tower = new T.Group(), plates = new T.Group(), envelopes = new T.Group(), structure = new T.Group(), terraceSupports = new T.Group(), megaFrames = new T.Group(), landscape = new T.Group(), publicSpace = new T.Group(), skySpaces = new T.Group(), vancouverElements = new T.Group(), vancouverContext = new T.Group(), viewCones = new T.Group(), detail = new T.Group(), outline = new T.Group(), handles = new T.Group(), siteGroup = new T.Group();
  tower.add(plates, envelopes, structure, terraceSupports, megaFrames, landscape, publicSpace, skySpaces, vancouverElements, outline); scene.add(context, vancouverContext, siteGroup, viewCones, tower, handles, detail); detail.visible = false;
  const material = (color, opacity = 1, extra = {}) => new T.MeshBasicMaterial({color: new T.Color(color).convertSRGBToLinear(), side: T.DoubleSide, transparent: opacity < 1, opacity, ...extra});
  const mats = {
    plate: material(COLORS.plate, .96), roof: material(COLORS.plate, .94), envelope: material(COLORS.envelope, .58, {depthWrite: false}),
    core: material(COLORS.core, .93), column: material(COLORS.column), diagonal: material(COLORS.diagonal), beam: material(COLORS.beam),
    support: material(COLORS.column), secondarySupport: material('#9baba9', .25, {depthWrite: false}), mega: material('#a06943'), megaColumn: material('#1e3546'), guard: material('#95ad8e', .24, {depthWrite: false}), detailPlate: material(COLORS.plate, .14, {depthWrite: false}), groundCanopy: material(COLORS.plate, .20, {depthWrite: false}), route: material('#e4e5d9', .96), publicGround: material('#c5d1b6'), garden: material('#718953'), portal: new T.LineBasicMaterial({color: new T.Color('#176f85').convertSRGBToLinear()}), portalFrame: material('#176f85'),
    landscape: material('#6e8c59'), planters: material('#395538'), planting: material('#54703f'), landscapeEdge: new T.LineBasicMaterial({color: '#657b58', transparent: true, opacity: .65}),
    podiumTerrace: material('#74876a', .96), rainGallery: material('#a9bdc5', .58, {depthWrite: false}),
    edge: new T.LineBasicMaterial({color: COLORS.edge, transparent: true, opacity: .38}), selected: new T.LineBasicMaterial({color: COLORS.selected}),
    context: new T.MeshStandardMaterial({color: new T.Color(COLORS.context).convertSRGBToLinear(), roughness: 1, side: T.DoubleSide, transparent: true, opacity: .38}), contextEdge: new T.LineBasicMaterial({color: COLORS.contextEdge, transparent: true, opacity: .27}),
    street: new T.LineBasicMaterial({color: '#b7bebb', transparent: true, opacity: .52}), site: new T.LineBasicMaterial({color: COLORS.site, transparent: true, opacity: .8}),
    siteFill: material('#f4ebe0', .8), extent: new T.LineDashedMaterial({color: '#526269', transparent: true, opacity: .6, dashSize: 4, gapSize: 4}),
    coneFill: material('#176f85', .035, {depthWrite: false}), coneEdge: new T.LineBasicMaterial({color: '#176f85', transparent: true, opacity: .55, depthWrite: false}),
    guide: new T.LineBasicMaterial({color: '#7d8f89', transparent: true, opacity: .5})
  };
  const ray = new T.Raycaster(), pointer = new T.Vector2();
  let model = null, state = null, mode = 'massing', view = 'perspective', selection = 1, disposed = false, frame = 0, drag = null, press = null, hasFitted = false;
  let detailMode = null, detailDeck = null, detailBand = null, detailProjectedSize = null, overviewProjectedSize = null, savedCamera = null, contextVisible = true, viewConesVisible = true, detailPickables = [], contextReady = false, activeSiteKey = null;
  let selectionLines = [], handleObjects = [], handleLabels = [], width = 1, height = 1, viewSpan = 360;
  const contextAbort = new AbortController();
  const handleLeaders = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  handleLeaders.setAttribute('aria-hidden', 'true');
  handleLeaders.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;overflow:hidden;';
  container.appendChild(handleLeaders);
  const contextStatus = document.createElement('span');
  contextStatus.className = 'scene-context-status';
  contextStatus.style.cssText = 'position:absolute;left:18px;bottom:16px;font:11px/1.3 var(--font-body,Arial,sans-serif);color:#586d70;pointer-events:none;max-width:calc(100% - 36px);';
  contextStatus.textContent = 'Loading supplied site context…'; container.appendChild(contextStatus);
  const detailScale = document.createElement('div'); detailScale.className = 'scene-detail-scale';
  detailScale.style.cssText = 'position:absolute;left:18px;bottom:40px;display:none;pointer-events:none;color:#304c45;font:11px/1.2 var(--font-body,Arial,sans-serif);';
  detailScale.innerHTML = '<div class="scene-scale-line" style="height:6px;border:1px solid #304c45;border-bottom:0"></div><span style="display:block;margin-top:3px">10 m</span>'; container.appendChild(detailScale);

  function clear(group) {
    const geometries = new Set();
    for (const child of [...group.children]) {
      group.remove(child); child.traverse(object => {if (object.geometry) geometries.add(object.geometry);});
    }
    geometries.forEach(g => g.dispose());
  }
  function line(points, mat, group, closed = false) {
    const points3 = points.map(vector); if (closed && points3.length) points3.push(points3[0].clone());
    const object = new T.Line(new T.BufferGeometry().setFromPoints(points3), mat); group.add(object); return object;
  }
  function solidGeometry(solid) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(solid.vertices.flat(), 3));
    geometry.setIndex(solid.faces.flat()); geometry.computeVertexNormals(); return geometry;
  }
  function solidMesh(solid, mat, target, data = {}) {
    const mesh = new T.Mesh(solidGeometry(solid), mat); Object.assign(mesh.userData, data); target.add(mesh); return mesh;
  }
  function mergeSolids(solids) {
    const vertices = [], faces = [];
    for (const solid of solids) {const offset = vertices.length; vertices.push(...solid.vertices); faces.push(...solid.faces.map(f => f.map(i => i + offset)));}
    return {vertices, faces};
  }
  function buildMembers(members, target = structure, overrideMaterial = null) {
    const grouped = new Map(), exact = new Map();
    for (const member of members) {
      const length = vector(member.end).sub(vector(member.start)).length();
      if (!Number.isFinite(length) || length < .001) continue;
      const family = member.role === 'rain_gallery' ? member.component === 'post' ? 'column' : 'beam' : /^mega_/.test(member.role || '') ? 'mega' : /terrace/.test(member.role || '') ? 'support' : /gravity|pilotis|column/.test(member.role || '') ? member.mega ? 'megaColumn' : 'column' : member.kind === 'beam' ? 'beam' : 'diagonal';
      if (member.solid || (member.width && member.depth)) {
        if (!exact.has(family)) exact.set(family, []);
        exact.get(family).push(member); continue;
      }
      if (!grouped.has(family)) grouped.set(family, []); grouped.get(family).push(member);
    }
    for (const [family, familyMembers] of exact) {
      const solids = familyMembers.map(m => m.solid || rectangularMemberSolid(m.start, m.end, m.width, m.depth, m.axes));
      solidMesh(mergeSolids(solids), overrideMaterial || mats[family], target, {members: familyMembers});
    }
    const matrix = new T.Matrix4(), rotation = new T.Quaternion(), up = new T.Vector3(0, 0, 1);
    for (const [family, familyMembers] of grouped) {
      const mesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), overrideMaterial || mats[family], familyMembers.length);
      familyMembers.forEach((member, index) => {
        const start = vector(member.start), end = vector(member.end), direction = end.clone().sub(start), length = direction.length();
        const section = Math.max(.12, Number(member.section) || .45);
        rotation.setFromUnitVectors(up, direction.normalize());
        matrix.compose(start.add(end).multiplyScalar(.5), rotation, new T.Vector3(section, section, length)); mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true; mesh.userData.members = familyMembers; target.add(mesh);
    }
  }
  function entryMarker(access, target) {
    if (!access?.center || !access?.tangent) return;
    const center = vector(access.center), halfWidth = vector(access.tangent).normalize().multiplyScalar((access.width || 1.6) / 2);
    const a = center.clone().sub(halfWidth), b = center.clone().add(halfWidth), h = access.height || 2.1;
    const points = [a.toArray(), [a.x, a.y, a.z + h], [b.x, b.y, b.z + h], b.toArray(), a.toArray()];
    // A blue 80 mm annotation frame marks the unchanged level-entry reservation.
    // It is a viewer marker, not a resolved door, façade cut or exported structural member.
    const pieces = points.slice(0, -1).map((start, i) => rectangularMemberSolid(start, points[i + 1], .08, .08));
    solidMesh(mergeSolids(pieces), mats.portalFrame, target, {description: 'Blue floor-entry portal reservation; the façade opening is unresolved'});
  }
  function buildLandscape(data, target = landscape, floorIndex = null, showEntry = false) {
    clear(target); if (!data?.enabled) return [];
    const deckMeshes = [];
    for (const deck of data.decks || []) {
      if (floorIndex !== null && deck.floorIndex !== floorIndex) continue;
      const mesh = solidMesh(deck.solid, mats.landscape, target, {floorIndex: deck.floorIndex, deckId: deck.id, terrace: true}); deckMeshes.push(mesh);
      line(deck.polygon.map(p => [p[0], p[1], deck.zTop + .02]), mats.landscapeEdge, target, true);
      if (showEntry) entryMarker(deck.access, target);
    }
    const guards = (data.guards || []).filter(g => floorIndex === null || g.floorIndex === floorIndex);
    if (guards.length) {
      const guardMesh = solidMesh(mergeSolids(guards.map(g => g.solid || rectangularMemberSolid(g.start, g.end, g.width, g.depth, g.axes))), mats.guard, target, {description: 'Closed guard-infill volume reservations'});
      target.add(new T.LineSegments(new T.EdgesGeometry(guardMesh.geometry, 25), mats.landscapeEdge));
    }
    const planters = (data.planters || []).filter(p => floorIndex === null || p.floorIndex === floorIndex);
    if (planters.length) {
      const boxes = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), mats.planters, planters.length);
      const shrubs = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), mats.planting, planters.length);
      const matrix = new T.Matrix4(), quaternion = new T.Quaternion();
      planters.forEach((planter, index) => {
        const center = vector(planter.center), h = planter.height || .5, w = planter.width || .9, d = planter.depth || .6;
        quaternion.setFromAxisAngle(new T.Vector3(0, 0, 1), planter.rotation || 0);
        // The engine supplies the physical box centre, including its height above the deck.
        matrix.compose(center, quaternion, new T.Vector3(w, d, h)); boxes.setMatrixAt(index, matrix);
        center.z += h / 2 + .25; matrix.compose(center, quaternion, new T.Vector3(w * .8, d * .8, .45)); shrubs.setMatrixAt(index, matrix);
      });
      boxes.instanceMatrix.needsUpdate = true; shrubs.instanceMatrix.needsUpdate = true;
      boxes.userData.description = 'Concept planting reservations'; shrubs.userData.description = 'Planting volume proxies'; target.add(boxes, shrubs);
    }
    return deckMeshes;
  }
  function nearestDeck(index = selection) {
    return (model?.landscape?.decks || []).reduce((nearest, deck) => !nearest || Math.abs(deck.floorIndex - index) < Math.abs(nearest.floorIndex - index) ? deck : nearest, null);
  }
  function nearestBand(index = selection) {
    return (model?.megaFloors?.bands || []).reduce((nearest, band) => {
      const distance = index < band.bottomFloorIndex ? band.bottomFloorIndex - index : index > band.topFloorIndex ? index - band.topFloorIndex : 0;
      if (!nearest) return band;
      const previousDistance = index < nearest.bottomFloorIndex ? nearest.bottomFloorIndex - index : index > nearest.topFloorIndex ? index - nearest.topFloorIndex : 0;
      return distance < previousDistance ? band : nearest;
    }, null);
  }
  function floorMesh(floor, target, mat = mats.plate) {
    const holes = floor.holes || (floor.coreFits ? [model.core.polygon] : []);
    return solidMesh(extrudePlan(floor.polygon, holes, floor.bottom ?? floor.z, state.slabThickness || .25, T), mat, target, {floorIndex: floor.index});
  }
  function publicGroundGeometry(target, showRoutes = false) {
    const data = model?.publicSpace, ground = data?.ground;
    if (!data?.enabled || !ground) return;
    if (ground.solid) solidMesh(ground.solid, mats.publicGround, target);
    else if (ground.polygon) solidMesh(extrudePlan(ground.polygon, ground.holes || [], ground.z ?? -.15, ground.thickness || .15, T), mats.publicGround, target);
    for (const garden of data.gardens || []) {
      if (garden.solid) solidMesh(garden.solid, mats.garden, target);
      else if (garden.polygon) solidMesh(extrudePlan(garden.polygon, [], garden.baseZ ?? garden.z ?? .01, garden.thickness || garden.height || .35, T), mats.garden, target);
    }
    if (showRoutes) for (const route of data.routes || []) {
      const a = route.start, b = route.end, dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
      if (length < .001) continue;
      const nx = -dy / length * route.width / 2, ny = dx / length * route.width / 2;
      const polygon = [[a[0] + nx, a[1] + ny], [a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny]];
      const marker = new T.Mesh(new T.ShapeGeometry(shapeWithHole(polygon)), mats.route); marker.position.z = (ground.z ?? -.12) + (ground.thickness || .12) + .005;
      marker.userData.description = 'Pedestrian route reservation; accessible routes and clearance are unresolved'; target.add(marker);
    }
  }
  function rainGalleryGeometry(target, includeSupports = false) {
    const canopy = model?.vancouver?.canopy;
    if (!canopy) return;
    solidMesh(canopy.solid || extrudePlan(canopy.polygon, canopy.holes || [], canopy.z, canopy.thickness, T), mats.rainGallery, target, {rainGallery: true, canopyId: canopy.id});
    line(canopy.polygon.map(p => [...p, canopy.z + canopy.thickness]), mats.contextEdge, target, true);
    if (includeSupports) buildMembers([...(model.columns || []), ...(model.members || [])].filter(member => member.role === 'rain_gallery'), target);
  }
  function clipColumns(columns, z0, z1) {
    return columns.filter(c => Math.min(c.start[2], c.end[2]) < z1 && Math.max(c.start[2], c.end[2]) > z0).map(c => ({...c, start: [c.start[0], c.start[1], Math.max(z0, Math.min(c.start[2], c.end[2]))], end: [c.end[0], c.end[1], Math.min(z1, Math.max(c.start[2], c.end[2]))], solid: undefined}));
  }
  function buildDetail() {
    clear(detail); detailPickables = []; detailDeck = null; detailBand = null; detailProjectedSize = null;
    if (!model || !detailMode) return;
    if (detailMode === 'terrace') {
      const deck = nearestDeck(selection); if (!deck) return;
      detailDeck = deck; selection = deck.floorIndex;
      const floor = model.floors.find(f => f.index === selection), index = model.floors.indexOf(floor);
      const z0 = model.floors[Math.max(0, index - 1)]?.z ?? floor.z - floor.height, z1 = model.floors[Math.min(model.floors.length - 1, index + 1)]?.top ?? floor.top + floor.height;
      detailPickables.push(floorMesh(floor, detail, mats.detailPlate));
      line(floor.polygon.map(p => [...p, floor.z + state.slabThickness + .02]), mats.selected, detail, true);
      solidMesh(extrudePlan(model.core.polygon, [model.core.innerPolygon], z0, z1 - z0, T), mats.core, detail);
      buildMembers(clipColumns(model.columns || [], z0, z1), detail);
      const terraceMembers = (model.landscape.supportMembers || []).filter(m => m.floorIndex === selection);
      if (state.landscape.supportType === 'truss') {
        buildMembers(terraceMembers.filter(m => m.role === 'terrace_radial'), detail, mats.secondarySupport);
        buildMembers(terraceMembers.filter(m => m.role !== 'terrace_radial'), detail);
      } else buildMembers(terraceMembers, detail);
      const localLandscape = new T.Group(); detail.add(localLandscape);
      detailPickables.push(...buildLandscape(model.landscape, localLandscape, selection, true));
      contextStatus.textContent = `Floor ${selection} · level entry portal reservation · metres`;
    } else if (detailMode === 'mega') {
      const band = nearestBand(selection); if (!band) return;
      detailBand = band; selection = band.bottomFloorIndex;
      const bottomFloor = model.floors.find(f => f.index === band.bottomFloorIndex), topFloor = model.floors.find(f => f.index === band.topFloorIndex);
      if (!bottomFloor || !topFloor) return;
      const z0 = Math.max(0, bottomFloor.z - bottomFloor.height), z1 = topFloor.top;
      for (const floor of [bottomFloor, topFloor]) {
        detailPickables.push(floorMesh(floor, detail, mats.detailPlate));
        line(floor.polygon.map(p => [...p, floor.z + state.slabThickness + .02]), mats.selected, detail, true);
      }
      solidMesh(extrudePlan(model.core.polygon, [model.core.innerPolygon], z0, z1 - z0, T), mats.core, detail);
      const connectedColumns = (model.columns || []).filter(column => (band.columnIds || []).includes(column.id));
      buildMembers(clipColumns(connectedColumns, z0, z1), detail);
      const members = (model.members || []).filter(member => (band.memberIds || []).includes(member.id) || member.bandId === band.id);
      buildMembers(members, detail);
      contextStatus.textContent = `Floors ${band.bottomFloorIndex}–${band.topFloorIndex} · ${bottomFloor.z.toFixed(1)}–${topFloor.z.toFixed(1)} m · mechanical-zone reservation`;
    } else {
      publicGroundGeometry(detail, true);
      const firstFloor = model.floors.find(f => f.isPodium) || model.floors[0];
      const slabLevel = firstFloor.z, top = slabLevel + state.slabThickness;
      // Show a cutaway at the actual first slab; upper podium geometry remains in Overview/export.
      detailPickables.push(floorMesh(firstFloor, detail, mats.groundCanopy));
      line(firstFloor.polygon.map(p => [...p, top + .015]), mats.edge, detail, true);
      for (const hole of firstFloor.holes || []) line(hole.map(p => [...p, top + .015]), mats.edge, detail, true);
      for (const core of model.social?.enabled ? model.social.towers.map(t=>t.core) : [model.core]) solidMesh(extrudePlan(core.polygon, [core.innerPolygon], 0, Math.max(top, .01), T), mats.core, detail);
      buildMembers(clipColumns((model.columns || []).filter(column => column.role !== 'rain_gallery'), 0, slabLevel), detail);
      buildMembers((model.members || []).filter(m => m.role === 'podium_floor_beam' && m.floorIndex === firstFloor.index), detail, mats.support);
      rainGalleryGeometry(detail, true);
      contextStatus.textContent = 'Public ground · cutaway at first podium slab · metres';
    }
  }
  function selectFloor(index) {
    selection = clamp(Math.round(index || 1), 1, model?.floors?.length || 1);
    if (detailMode === 'terrace') {const deck = nearestDeck(selection); if (deck) selection = deck.floorIndex;}
    if (detailMode === 'mega') {const band = nearestBand(selection); if (band) selection = band.bottomFloorIndex;}
    for (const mesh of plates.children) {
      const selected = mesh.userData.floorIndex === selection;
      mesh.material = mesh.userData.roof ? mats.roof : mats.plate;
      mesh.userData.selected = selected;
    }
    for (const line of selectionLines) outline.remove(line);
    selectionLines.forEach(l => l.geometry.dispose()); selectionLines = [];
    const floor = model?.floors?.find(f => f.index === selection) || model?.floors?.[selection - 1];
    if (floor) {
      const selected = line(floor.polygon.map(p => [p[0], p[1], floor.bottom + (state?.slabThickness || .25) + .06]), mats.selected, outline, true);
      selected.visible = mode === 'plates'; selectionLines.push(selected);
      if (floor.coreFits && model.core?.polygon) {
        const coreLine = line(model.core.polygon.map(p => [...p, floor.bottom + (state?.slabThickness || .25) + .07]), mats.selected, outline, true);
        coreLine.visible = mode === 'plates'; selectionLines.push(coreLine);
      }
    }
    if (detailMode) {const previousFocusId = detailDeck?.id || detailBand?.id; buildDetail(); if (previousFocusId !== (detailDeck?.id || detailBand?.id)) fitCamera();}
    return selection;
  }
  function applyMode() {
    envelopes.visible = mode === 'massing';
    mats.plate.opacity = mode === 'structure' ? .15 : mode === 'plates' ? .66 : .96;
    mats.plate.depthWrite = mode !== 'structure'; mats.plate.transparent = true;
    mats.roof.opacity = mode === 'structure' ? .1 : mode === 'plates' ? .6 : .92;
    mats.roof.transparent = true; mats.roof.depthWrite = mode !== 'structure';
    mats.edge.opacity = mode === 'structure' ? .17 : mode === 'plates' ? .55 : .44;
    structure.visible = mode !== 'plates';
    landscape.visible = true; terraceSupports.visible = true; megaFrames.visible = true; skySpaces.visible = true;
    tower.visible = !detailMode; detail.visible = !!detailMode; context.visible = !detailMode && contextVisible && getSiteContext(state).mode !== 'vancouver'; vancouverContext.visible = !detailMode && contextVisible && getSiteContext(state).mode === 'vancouver';
    viewCones.visible = !detailMode && viewConesVisible && getSiteContext(state).mode === 'vancouver';
    siteGroup.visible = !detailMode; ground.visible = !detailMode; handles.visible = !detailMode;
    selectionLines.forEach(l => {l.visible = mode === 'plates';});
    render();
  }
  function displayedBounds(group) {
    // Three r128 does not include instance transforms in Box3.setFromObject.
    // Compute actual instance bounds so a high-floor detail cannot accidentally include grade.
    group.updateMatrixWorld(true); const bounds = new T.Box3(), local = new T.Matrix4(), world = new T.Matrix4(), box = new T.Box3();
    group.traverse(object => {
      if (!object.geometry) return;
      object.geometry.computeBoundingBox();
      if (object.isInstancedMesh) {
        for (let i = 0; i < object.count; i++) {object.getMatrixAt(i, local); world.multiplyMatrices(object.matrixWorld, local); bounds.union(box.copy(object.geometry.boundingBox).applyMatrix4(world));}
      } else bounds.union(box.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld));
    });
    return bounds;
  }
  function displayedProjection(group) {
    camera.updateMatrixWorld(true); group.updateMatrixWorld(true);
    const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const point = new T.Vector3(), local = new T.Matrix4(), world = new T.Matrix4();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const scan = (object, matrix) => {
      const positions = object.geometry.attributes.position;
      if (!positions) return;
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(matrix);
        const x = point.dot(right), y = point.dot(up); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    };
    group.traverse(object => {
      if (!object.geometry) return;
      if (object.isInstancedMesh) for (let i = 0; i < object.count; i++) {object.getMatrixAt(i, local); world.multiplyMatrices(object.matrixWorld, local); scan(object, world);}
      else scan(object, object.matrixWorld);
    });
    return {width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY)};
  }
  function fitCamera() {
    if (detailMode && detail.children.length) {
      const box = displayedBounds(detail), center = box.getCenter(new T.Vector3()), extent = box.getSize(new T.Vector3());
      viewSpan = Math.max(extent.x, extent.y, extent.z * 2, 20) * 1.45; camera.zoom = 1;
      if (view === 'top') {camera.up.set(0, 1, 0); camera.position.copy(center).add(new T.Vector3(0, -.0001, viewSpan * 3));}
      else if (view === 'front') {camera.up.set(0, 0, 1); camera.position.copy(center).add(new T.Vector3(0, -viewSpan * 3, 0));}
      else {
        camera.up.set(0, 0, 1);
        if (detailMode === 'terrace' && state.landscape.supportType === 'truss' && detailDeck) {
          const frames = (model.landscape.trussFrames || []).filter(frame => frame.floorIndex === detailDeck.floorIndex), frame = frames[Math.floor(frames.length / 2)];
          const chords = (model.landscape.supportMembers || []).filter(member => member.frameId === frame?.id && member.component === 'top_chord');
          const radial = chords.length ? vector(chords.at(-1).end).sub(vector(chords[0].start)).setZ(0).normalize() : vector(detailDeck.access.center).setZ(0).normalize();
          const side = new T.Vector3(-radial.y, radial.x, 0);
          // View the actual central primary frame from its side, with a little outward bias.
          // The lower eye reveals its web depth while secondary beams remain faint references.
          const direction = side.multiplyScalar(.94).add(radial.multiplyScalar(.34)).normalize(), distance = viewSpan * 1.95;
          camera.position.copy(center).add(direction.multiplyScalar(distance)).add(new T.Vector3(0, 0, distance * Math.tan(radians(20))));
        } else camera.position.copy(center).add(new T.Vector3(viewSpan * 1.15, -viewSpan * 1.55, viewSpan * (detailMode === 'ground' ? .78 : 1.15)));
      }
      controls.target.copy(center); controls.enableRotate = view === 'perspective'; controls.maxPolarAngle = Math.PI * .95; controls.update();
      detailProjectedSize = displayedProjection(detail);
      viewSpan = Math.max(detailProjectedSize.height / .75, detailProjectedSize.width / Math.max(width / height, .3) / .75);
      resize(); return;
    }
    const hasVancouverGeometry = Boolean(model?.vancouver?.canopy || model?.vancouver?.terraces?.length);
    // These features can extend asymmetrically beyond the occupied plates. Scan the
    // displayed solids after the tower's single site rotation and placement transform.
    const actualBounds = hasVancouverGeometry ? displayedBounds(tower) : null;
    const h = actualBounds ? actualBounds.max.z - Math.min(0, actualBounds.min.z) : model?.summary?.height || 276, b = model?.bounds;
    const spanX = actualBounds ? actualBounds.max.x - actualBounds.min.x : b ? b.max[0] - b.min[0] : 95;
    const spanY = actualBounds ? actualBounds.max.y - actualBounds.min.y : b ? b.max[1] - b.min[1] : 65;
    viewSpan = view === 'top' ? Math.max(spanX, spanY, 150) * 1.42 : Math.max(h * 1.38, spanX * 1.7, 210);
    camera.zoom = 1;
    const px = actualBounds ? (actualBounds.min.x + actualBounds.max.x) / 2 : Number(state?.placement?.x) || 0;
    const py = actualBounds ? (actualBounds.min.y + actualBounds.max.y) / 2 : Number(state?.placement?.y) || 0;
    if (view === 'top') {
      camera.up.set(0, 1, 0); controls.target.set(px, py, 0); camera.position.set(px, py - .0001, Math.max(600, h + 300));
    } else if (view === 'front') {
      camera.up.set(0, 0, 1); controls.target.set(px, py, h * .49); camera.position.set(px, py - 1000, h * .49);
    } else {
      camera.up.set(0, 0, 1); controls.target.set(px, py, h * .48);
      camera.position.set(px + h * 1.5, py - h * 1.9, h * 1.28);
    }
    controls.enableRotate = view === 'perspective'; controls.maxPolarAngle = view === 'perspective' ? Math.PI * .495 : Math.PI; controls.update();
    overviewProjectedSize = hasVancouverGeometry ? displayedProjection(tower) : null;
    resize();
  }
  function resize() {
    const bounds = container.getBoundingClientRect(); width = Math.max(1, bounds.width); height = Math.max(1, bounds.height);
    const aspect = width / height;
    const projected = detailMode ? detailProjectedSize : overviewProjectedSize;
    const verticalSpan = projected ? Math.max(projected.height / .75, projected.width / aspect / .75, detailMode ? 0 : viewSpan) : aspect < .68 ? viewSpan / Math.max(aspect / .68, .55) : viewSpan;
    camera.left = -verticalSpan * aspect / 2; camera.right = verticalSpan * aspect / 2;
    camera.top = verticalSpan / 2; camera.bottom = -verticalSpan / 2;
    camera.updateProjectionMatrix(); renderer.setSize(width, height, false); render();
  }
  function buildVancouverContext(site) {
    const key=`${site.mode}:${site.id}:${site.coordinateKey || site.originRhino?.join(',') || ''}`;
    if(key===activeSiteKey)return;
    activeSiteKey=key;clear(vancouverContext);clear(viewCones);
    if(site.mode!=='vancouver'){if(!detailMode)contextStatus.textContent=contextReady?'Competition site · metres':'Loading supplied site context…';return;}
    for(const building of site.nearbyBuildings || []) {
      if(!building.polygon?.length || !(building.height>0))continue;
      const mesh=solidMesh(extrudePlan(building.polygon,[],building.baseZ || 0,building.height,T),mats.context,vancouverContext,{contextBuilding:true});
      vancouverContext.add(new T.LineSegments(new T.EdgesGeometry(mesh.geometry,25),mats.contextEdge));
    }
    for (const cone of site.cones || []) {
      const drawing = viewConeGroundGeometry(cone.polygon);
      if (drawing.fill.length) {
        const mesh = new T.Mesh(new T.ShapeGeometry(shapeWithHole(drawing.fill)), mats.coneFill);
        mesh.position.z = .10; mesh.userData.viewConeId = cone.id; viewCones.add(mesh);
      }
      for (const edge of drawing.edges) line(edge.map(p => [...p, .12]), mats.coneEdge, viewCones).userData.viewConeId = cone.id;
    }
    if(!detailMode)contextStatus.textContent=siteStatus(site);
  }
  function siteStatus(site = getSiteContext(state)) {
    if (site.mode !== 'vancouver') return contextReady ? 'Competition site · metres' : 'Loading supplied site context…';
    return `${site.label} · ${site.boundaryKnown === false ? 'display extent only · ' : site.boundarySource === 'study' ? 'study outline · ' : ''}${viewConesVisible ? 'View cones: plan only · ' : ''}local grade assumed · metres`;
  }
  function buildSite(polygon, site = getSiteContext(state)) {
    clear(siteGroup);
    if (site.boundaryKnown !== false) {
      const plate = new T.Mesh(new T.ShapeGeometry(shapeWithHole(polygon)), mats.siteFill); plate.position.z = -.06; siteGroup.add(plate);
      line(polygon.map(p => [...p, .04]), mats.site, siteGroup, true);
    } else {
      const extent = line(polygon.map(p => [...p, .04]), mats.extent, siteGroup, true); extent.computeLineDistances();
    }
    // An unknown-boundary map point has only a dashed navigation extent, never a parcel fill.
  }
  function clearHandles() {
    clear(handles); handleObjects = [];
    handleLabels.forEach(label => {label.element.remove(); label.leader.remove();}); handleLabels = [];
  }
  function handleValue(type) {
    const top = state?.profile?.[state.profile.length - 1] || {};
    return type === 'height' ? state?.height || model?.summary?.height || 276 : type === 'topScaleX' ? top.scaleX || 1 : type === 'topScaleY' ? top.scaleY || 1 : top.twist || 0;
  }
  function addHandle(type, label, position, color) {
    const sphere = new T.Mesh(new T.SphereGeometry(1, 16, 12), material(color));
    sphere.position.copy(vector(position)); sphere.userData.handleType = type;
    sphere.userData.ownedMaterial = true; handles.add(sphere); handleObjects.push(sphere);
    const element = document.createElement('button'); element.type = 'button'; element.className = `scene-handle-label scene-handle-${type}`;
    element.textContent = label; element.setAttribute('aria-label', `${label}. Drag to change; arrow keys adjust.`);
    element.title = `Drag ${label.toLowerCase()}, or use arrow keys`;
    element.style.cssText = `position:absolute;z-index:3;transform:translate(-50%,-50%);min-width:43px;box-sizing:border-box;padding:5px 7px;border:1px solid ${color};background:#fffdf8;color:#243a38;border-radius:4px;font:600 10px/1.2 var(--font-body,Arial,sans-serif);cursor:grab;white-space:nowrap;touch-action:none;`;
    element.addEventListener('pointerdown', event => startDrag(event, sphere));
    element.addEventListener('keydown', event => {
      if (!['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(event.key)) return;
      event.preventDefault();
      const sign = ['ArrowUp', 'ArrowRight'].includes(event.key) ? 1 : -1;
      const step = type === 'height' ? (event.shiftKey ? 10 : 2) : type === 'topTwist' ? (event.shiftKey ? 10 : 2) : (event.shiftKey ? .1 : .025);
      const limits = type === 'height' ? [40, 500] : type === 'topTwist' ? [-180, 180] : [.25, 1.8];
      onHandleChange?.({type, value: clamp(handleValue(type) + sign * step, ...limits)});
    });
    const leader = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    leader.setAttribute('stroke', color); leader.setAttribute('stroke-width', '.8'); leader.setAttribute('stroke-opacity', '.6'); handleLeaders.appendChild(leader);
    container.appendChild(element); handleLabels.push({element, object: sphere, type, leader});
    return sphere;
  }
  function buildHandles() {
    // Preserve handles and DOM during a drag: rebuilding the label would break pointer capture.
    if (!model?.roof || !state) return;
    if (!handleObjects.length) {
      addHandle('height', 'Height', [0, 0, 0], '#a05c47');
      addHandle('topScaleX', 'Width', [0, 0, 0], '#456f83');
      addHandle('topScaleY', 'Depth', [0, 0, 0], '#456f83');
      addHandle('topTwist', 'Twist', [0, 0, 0], '#36735e');
    }
    const primaryOffset = model.social?.enabled ? model.social.towers[0].offset : [0,0];
    const roof = model.roof, top = state.profile?.[state.profile.length - 1] || {scaleX: 1, scaleY: 1, twist: 0};
    const angle = radians(top.twist), c = Math.cos(angle), s = Math.sin(angle);
    const w = (state.width || 42) * (top.scaleX || 1) / 2, d = (state.depth || 32) * (top.scaleY || 1) / 2;
    const rotate = (x, y) => [primaryOffset[0] + x * c - y * s, primaryOffset[1] + x * s + y * c, roof.z + 1.8];
    const positions = [[primaryOffset[0], primaryOffset[1], roof.z + 18], rotate(w + 8, 0), rotate(0, d + 8), rotate(w + 9, -d - 9)];
    handleObjects.forEach((h, i) => h.position.copy(vector(positions[i])));
    // Guides share the profile's roof plane so drags read as planar edits.
    for (const object of [...handles.children].filter(o => o.isLine)) {handles.remove(object); object.geometry.dispose();}
    line([[primaryOffset[0], primaryOffset[1], roof.z], positions[0]], mats.guide, handles);
    line([rotate(0, 0), positions[1]], mats.guide, handles);
    line([rotate(0, 0), positions[2]], mats.guide, handles);
    const radius = Math.hypot(w + 9, d + 9), arc = [];
    for (let i = 0; i <= 32; i++) {const a = angle - .95 + i * .045; arc.push([primaryOffset[0] + Math.cos(a) * radius, primaryOffset[1] + Math.sin(a) * radius, roof.z + 1.8]);}
    line(arc, mats.guide, handles);
  }
  function update(modelIn, stateIn = modelIn?.state) {
    if (disposed || !modelIn?.floors?.length) return;
    model = modelIn; state = stateIn || modelIn.state;
    clear(plates); clear(envelopes); clear(structure); clear(terraceSupports); clear(megaFrames); clear(publicSpace); clear(skySpaces); clear(vancouverElements); clear(outline); selectionLines = [];
    const px = Number(state?.placement?.x) || 0, py = Number(state?.placement?.y) || 0;
    const site = getSiteContext(state);
    [tower, handles, detail].forEach(group => {group.position.set(px, py, 0);group.rotation.z=radians(site.rotationDeg || 0);});
    buildVancouverContext(site);
    const thickness = Math.max(.05, Number(state?.slabThickness) || .25), corePolygon = model.core?.polygon;
    for (let i = 0; i < model.floors.length; i++) {
      const floor = model.floors[i], polygon = floor.polygon;
      const mesh = floorMesh(floor, plates);
      line(polygon.map(p => [...p, (floor.bottom ?? floor.z) + thickness]), mats.edge, outline, true);
      const next = model.floors[i + 1], upper = floor.isPodium && model.vancouver?.appliedStepback > 0 ? polygon : next && next.polygon.length === polygon.length ? next.polygon : model.roof?.polygon?.length === polygon.length && i === model.floors.length - 1 ? model.roof.polygon : polygon;
      const skin = new T.Mesh(sideGeometry(polygon, upper, floor.bottom ?? floor.z, floor.top), mats.envelope); envelopes.add(skin);
    }
    const roof = model.roof;
    if (roof?.polygon) {
      const mesh = solidMesh(extrudePlan(roof.polygon, roof.holes || (roof.coreFits ? [corePolygon] : []), roof.z, thickness, T), mats.roof, plates); mesh.userData.roof = true; mesh.userData.floorIndex = model.floors.length;
      line(roof.polygon.map(p => [...p, roof.z + thickness]), mats.edge, outline, true);
    }
    if (model.core?.polygon) {
      const core = model.core;
      const inner = core.innerPolygon || [[-core.width / 2 + core.wall, -core.depth / 2 + core.wall], [core.width / 2 - core.wall, -core.depth / 2 + core.wall], [core.width / 2 - core.wall, core.depth / 2 - core.wall], [-core.width / 2 + core.wall, core.depth / 2 - core.wall]];
      const mesh = new T.Mesh(new T.ExtrudeGeometry(shapeWithHole(core.polygon, inner), {depth: core.height || model.summary.height, bevelEnabled: false}), mats.core); structure.add(mesh);
    }
    buildMembers([...(model.columns || []), ...(model.members || []).filter(m => !/terrace/.test(m.role || '') && !/^mega_/.test(m.role || ''))]);
    buildMembers((model.members || []).filter(m => /terrace/.test(m.role || '')), terraceSupports);
    buildMembers((model.members || []).filter(m => /^mega_/.test(m.role || '')), megaFrames);
    publicGroundGeometry(publicSpace);
    if (model.podiumRoof?.polygon) {const podiumRoofMesh = floorMesh({...model.podiumRoof, index: state.podiumFloors || 1}, plates); podiumRoofMesh.userData.podiumRoof = true;}
    for (const terrace of model.vancouver?.terraces || []) {
      solidMesh(terrace.solid || extrudePlan(terrace.polygon, terrace.holes || [], terrace.z, terrace.thickness, T), mats.podiumTerrace, vancouverElements, {podiumTerrace: true, terraceId: terrace.id});
      line(terrace.polygon.map(p => [...p, terrace.z + terrace.thickness + .01]), mats.landscapeEdge, vancouverElements, true);
    }
    rainGalleryGeometry(vancouverElements);
    if (model.social?.enabled) {
      for (const companion of model.social.towers.slice(1)) {
        for (let i=0;i<companion.floors.length;i++) {
          const floor=companion.floors[i],next=companion.floors[i+1];floorMesh(floor,plates);
          line(floor.polygon.map(p=>[...p,floor.z+thickness]),mats.edge,outline,true);
          envelopes.add(new T.Mesh(sideGeometry(floor.polygon,next?.polygon || companion.roof.polygon,floor.z,floor.top),mats.envelope));
        }
        solidMesh(extrudePlan(companion.roof.polygon,companion.roof.holes,companion.roof.z,thickness,T),mats.roof,plates,{roof:true,floorIndex:state.storeys,towerId:companion.id});
        solidMesh(extrudePlan(companion.core.polygon,[companion.core.innerPolygon],0,companion.core.height,T),mats.core,structure);
      }
      for(const deck of model.social.connectors) {
        solidMesh(deck.solid,mats.landscape,skySpaces,{floorIndex:deck.floorIndex,skyConnector:true});
        line(deck.polygon.map(p=>[...p,deck.zTop+.02]),mats.landscapeEdge,skySpaces,true);
      }
      if(model.social.guards.length)solidMesh(mergeSolids(model.social.guards.map(g=>g.solid)),mats.guard,skySpaces);
    }
    buildLandscape(model.landscape);
    buildSite(model.site?.polygon || [[-72.39, -39.624], [72.39, -39.624], [72.39, 39.624], [-72.39, 39.624]], site);
    selectFloor(state.selectedFloor || selection); buildHandles(); applyMode();
    if (!hasFitted || detailMode) {hasFitted = true; fitCamera();} else render();
  }
  function setPointer(event) {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    ray.setFromCamera(pointer, camera);
  }
  function startDrag(event, object) {
    if (!model || event.button > 0) return;
    event.preventDefault(); event.stopPropagation();
    controls.enabled = false;
    const type = object.userData.handleType, roofZ = model.roof.z, point = object.getWorldPosition(new T.Vector3());
    setPointer(event);
    const normal = type === 'height' ? camera.getWorldDirection(new T.Vector3()).setZ(0).normalize() : new T.Vector3(0, 0, 1);
    if (normal.lengthSq() < .1) normal.set(0, -1, 0);
    const plane = new T.Plane().setFromNormalAndCoplanarPoint(normal, point);
    const intersection = ray.ray.intersectPlane(plane, new T.Vector3());
    drag = {type, object, pointerId: event.pointerId, element: event.currentTarget, plane, origin: intersection || point, value: handleValue(type), x: event.clientX, y: event.clientY, angle: radians(handleValue('topTwist') + (getSiteContext(state).rotationDeg || 0)), roofZ, width: state.width || 42, depth: state.depth || 32, center: handles.localToWorld(new T.Vector3(...(model.social?.enabled ? model.social.towers[0].offset : [0,0]),0))};
    try {event.currentTarget.setPointerCapture(event.pointerId);} catch (_) { /* Browser can cancel capture after a touch interruption. */ }
    renderer.domElement.style.cursor = type === 'height' ? 'ns-resize' : 'grabbing';
  }
  function pointerDown(event) {
    if (event.button !== 0) {press = null; return;}
    press = {x: event.clientX, y: event.clientY};
    if (!detailMode) {setPointer(event); const hit = ray.intersectObjects(handleObjects, false)[0]; if (hit) startDrag(event, hit.object);}
  }
  function pointerMove(event) {
    if (drag) {
      event.preventDefault(); setPointer(event);
      const intersection = ray.ray.intersectPlane(drag.plane, new T.Vector3());
      const delta = intersection ? intersection.clone().sub(drag.origin) : new T.Vector3();
      let value = drag.value;
      if (drag.type === 'height') {
        value += view === 'top' || !intersection ? (drag.y - event.clientY) * viewSpan / height / camera.zoom : delta.z;
        value = clamp(value, 40, 500);
      } else if (drag.type === 'topTwist') {
        if (intersection && drag.origin.lengthSq() > .01) {
          let change = Math.atan2(intersection.y - drag.center.y, intersection.x - drag.center.x) - Math.atan2(drag.origin.y - drag.center.y, drag.origin.x - drag.center.x);
          if (change > Math.PI) change -= Math.PI * 2; if (change < -Math.PI) change += Math.PI * 2;
          value = clamp(drag.value + change * 180 / Math.PI, -180, 180);
        }
      } else {
        const c = Math.cos(drag.angle), s = Math.sin(drag.angle);
        const change = drag.type === 'topScaleX' ? delta.x * c + delta.y * s : -delta.x * s + delta.y * c;
        value = clamp(drag.value + change * 2 / (drag.type === 'topScaleX' ? drag.width : drag.depth), .25, 1.8);
      }
      onHandleChange?.({type: drag.type, value}); return;
    }
    setPointer(event); const hit = !detailMode && ray.intersectObjects(handleObjects, false)[0];
    renderer.domElement.style.cursor = hit ? 'grab' : mode === 'plates' ? 'crosshair' : 'grab';
  }
  function endDrag(event) {
    if (drag) {
      try {if (drag.element.hasPointerCapture?.(drag.pointerId)) drag.element.releasePointerCapture(drag.pointerId);} catch (_) {}
      drag = null; controls.enabled = true; press = null; renderer.domElement.style.cursor = 'grab'; return;
    }
    if (!press || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5) {press = null; return;}
    press = null; setPointer(event);
    const pickables = detailMode ? detailPickables : [...plates.children, ...landscape.children.filter(o => o.userData.terrace)];
    const hit = ray.intersectObjects(pickables, false)[0];
    if (hit?.object.userData.floorIndex) {
      selectFloor(hit.object.userData.floorIndex); onSelectFloor?.(selection); render();
    }
  }
  function updateLabels() {
    handleLabels.forEach(({element, leader}) => {element.style.display = detailMode ? 'none' : ''; leader.style.display = detailMode ? 'none' : '';});
    detailScale.style.display = detailMode ? 'block' : 'none'; detailScale.style.bottom = detailMode === 'mega' ? '58px' : '40px';
    if (detailMode) {detailScale.querySelector('.scene-scale-line').style.width = `${10 * height * camera.zoom / (camera.top - camera.bottom)}px`; return;}
    const worldPerPixel = (camera.top - camera.bottom) / camera.zoom / Math.max(height, 1);
    handleObjects.forEach(h => h.scale.setScalar(worldPerPixel * 5));
    if (!handleLabels.length) return;
    const projected = handleLabels.map(item => {
      const point = item.object.getWorldPosition(new T.Vector3()).project(camera);
      return {...item, point, x: (point.x + 1) * width / 2, y: (-point.y + 1) * height / 2, visible: point.z >= -1 && point.z <= 1 && Math.abs(point.x) < .98 && Math.abs(point.y) < .98};
    });
    // A compact roof-control row keeps all four direct edits discoverable even on phones.
    // Fine leader lines retain the connection to their physical 3D handles.
    const rowWidth = 208, gap = 8, labelWidths = [50, 45, 45, 44];
    const roof = model?.roof ? handles.localToWorld(vector([...(model.social?.enabled ? model.social.towers[0].offset : [0,0]),model.roof.z])).project(camera) : new T.Vector3();
    const center = clamp((roof.x + 1) * width / 2, rowWidth / 2 + 12, width - rowWidth / 2 - 12);
    const visiblePoints = projected.filter(p => p.visible);
    const rowY = clamp((visiblePoints.length ? Math.min(...visiblePoints.map(p => p.y)) : 30) - 30, 22, height - 25);
    let left = center - rowWidth / 2;
    projected.forEach((item, index) => {
      const labelX = left + labelWidths[index] / 2; left += labelWidths[index] + gap;
      item.element.style.display = item.visible ? '' : 'none'; item.leader.style.display = item.visible ? '' : 'none';
      if (item.visible) {
        item.element.style.left = `${labelX}px`; item.element.style.top = `${rowY}px`;
        item.leader.setAttribute('x1', labelX); item.leader.setAttribute('y1', rowY + 12);
        item.leader.setAttribute('x2', item.x); item.leader.setAttribute('y2', item.y);
      }
    });
  }
  function setDetailMode(next) {
    if (next === detailMode) return;
    if (next === 'terrace' && !nearestDeck()) return;
    if (next === 'mega' && !nearestBand()) return;
    if (!detailMode && next) savedCamera = {position: camera.position.clone(), target: controls.target.clone(), up: camera.up.clone(), zoom: camera.zoom, view, span: viewSpan, placement: tower.position.clone()};
    detailMode = next;
    if (next) {
      const previous = selection; buildDetail(); applyMode(); fitCamera();
      if ((next === 'terrace' || next === 'mega') && selection !== previous) onSelectFloor?.(selection);
    } else {
      clear(detail); detailDeck = null; detailBand = null; detailPickables = []; detailProjectedSize = null; applyMode();
      if (savedCamera) {
        const offset = tower.position.clone().sub(savedCamera.placement);
        camera.position.copy(savedCamera.position).add(offset); controls.target.copy(savedCamera.target).add(offset); camera.up.copy(savedCamera.up);
        camera.zoom = savedCamera.zoom; view = savedCamera.view; viewSpan = savedCamera.span;
        controls.enableRotate = view === 'perspective'; controls.maxPolarAngle = view === 'perspective' ? Math.PI * .495 : Math.PI;
        controls.update(); resize(); savedCamera = null;
      } else fitCamera();
      contextStatus.textContent = siteStatus(); render();
    }
  }
  function render() {if (disposed || !container.getClientRects().length) return; updateLabels(); renderer.render(scene, camera);}
  function animate() {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    if (!document.hidden && container.getClientRects().length) {controls.update(); render();}
  }
  // Handle hit-testing runs before OrbitControls so a roof edit never starts an orbit gesture.
  renderer.domElement.addEventListener('pointerdown', pointerDown, true);
  window.addEventListener('pointermove', pointerMove, {passive: false});
  window.addEventListener('pointerup', endDrag); window.addEventListener('pointercancel', endDrag);
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container); resize(); animate();

  fetch(new URL('./data/context.json', import.meta.url), {signal: contextAbort.signal}).then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json();
  }).then(data => {
    if (disposed) return;
    for (const item of data.meshes || []) {
      const positions = item.positions || item.v, indices = item.indices || item.f;
      if (!positions?.length || !indices?.length) continue;
      const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
      const mesh = new T.Mesh(geometry, mats.context); context.add(mesh);
      if (/Buildings|Heritage/i.test(item.layer || '')) {
        const edges = new T.LineSegments(new T.EdgesGeometry(geometry, 25), mats.contextEdge); context.add(edges);
      }
    }
    for (const curve of data.curves || []) {
      if (/Block|Curb|Plaza|Connection/i.test(curve.layer || '') && curve.points?.length) line(curve.points.map(p => [p[0], p[1], Math.max(.05, p[2] || 0)]), mats.street, context, curve.closed);
    }
    contextReady = true; if (!detailMode) contextStatus.textContent = siteStatus(); applyMode(); render();
  }).catch(error => {if (!disposed && !detailMode && getSiteContext(state).mode !== 'vancouver' && error.name !== 'AbortError') contextStatus.textContent = 'Competition context is not included in this public copy · choose Vancouver site for real city context';});

  return {
    update,
    setMode(next) {mode = ['massing', 'structure', 'plates'].includes(next) ? next : 'massing'; applyMode();},
    setCamera(next) {view = ['perspective', 'top', 'front'].includes(next) ? next : 'perspective'; fitCamera();},
    focus() {fitCamera();},
    render,
    selectFloor,
    setContextVisible(visible) {contextVisible = !!visible; context.visible = !detailMode && contextVisible && getSiteContext(state).mode !== 'vancouver'; vancouverContext.visible = !detailMode && contextVisible && getSiteContext(state).mode === 'vancouver'; render();},
    setViewConesVisible(visible) {viewConesVisible = !!visible; viewCones.visible = !detailMode && viewConesVisible && getSiteContext(state).mode === 'vancouver'; if (!detailMode) contextStatus.textContent = siteStatus(); render();},
    setTerraceDetail(enabled) {setDetailMode(enabled ? 'terrace' : detailMode === 'terrace' ? null : detailMode); return detailDeck?.floorIndex ?? null;},
    setMegaDetail(enabled) {setDetailMode(enabled ? 'mega' : detailMode === 'mega' ? null : detailMode); return detailBand?.bottomFloorIndex ?? null;},
    setGroundDetail(enabled) {setDetailMode(enabled ? 'ground' : detailMode === 'ground' ? null : detailMode);},
    capturePng() {render(); return renderer.domElement.toDataURL('image/png');},
    dispose() {
      disposed = true; cancelAnimationFrame(frame); contextAbort.abort(); resizeObserver.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', pointerDown, true);
      window.removeEventListener('pointermove', pointerMove); window.removeEventListener('pointerup', endDrag); window.removeEventListener('pointercancel', endDrag);
      handleObjects.forEach(h => h.material.dispose()); clearHandles();
      [plates, envelopes, structure, terraceSupports, megaFrames, landscape, publicSpace, skySpaces, vancouverElements, vancouverContext, viewCones, detail, outline, siteGroup, context].forEach(clear);
      Object.values(mats).forEach(m => m.dispose()); ground.geometry.dispose(); ground.material.dispose(); renderer.dispose();
      renderer.domElement.remove(); contextStatus.remove(); handleLeaders.remove(); detailScale.remove();
    }
  };
}

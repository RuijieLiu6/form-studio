/** Vancouver insertion map. Geographic overlays are plan projections, never height limits. */
import { VANCOUVER_CONES } from './data/vancouver-sites.js';
import {
  VANCOUVER_MAP_BOUNDS, getSiteContext, buildingToSitePoint,
  lonLatToVista, vistaToLonLat, isVancouverMapLocation
} from './site-context.js';

const DEFAULT_CENTER = [49.27971, -123.115566];
const finiteRing = ring => Array.isArray(ring) && ring.length >= 3 && ring.every(p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
const toLatLng = point => { const p = vistaToLonLat(point); return [p[1], p[0]]; };
const validContext = context => context?.mode === 'vancouver' && Array.isArray(context.originRhino) && context.originRhino.slice(0, 2).every(Number.isFinite);

/** Site points already include building rotation and translation; do not apply them twice. */
export function siteRingToMap(ring, context) {
  if (!validContext(context) || !finiteRing(ring)) return [];
  return ring.map(p => toLatLng([p[0] + context.originRhino[0], p[1] + context.originRhino[1]]));
}

/** Dragging moves the building in fixed site east/north axes, independent of its rotation. */
export function mapPointToPlacement(point, context) {
  if (!validContext(context) || !isVancouverMapLocation(point)) return null;
  const p = lonLatToVista([point.longitude, point.latitude]);
  return { x: p[0] - context.originRhino[0], y: p[1] - context.originRhino[1] };
}

/** Keep the existing site origin fixed while displaying a translated, rotated design. */
export function mapOverlayGeometry(model, state = model?.state || {}) {
  const context = model?.siteContext || getSiteContext(state);
  if (!validContext(context)) return { context, enabled: false, parcel: [], footprint: [], podium: [], towers: [], marker: null, key: null };
  const ring = p => siteRingToMap(p, context);
  const buildingRing = p => finiteRing(p) ? ring(p.map(point => buildingToSitePoint(point, state))) : [];
  const podium = model?.floors?.find(f => f.isPodium);
  const primary = model?.floors?.find(f => !f.isPodium);
  const towers = [primary, ...(model?.social?.towers || []).slice(1).map(tower => tower.floors?.[0])]
    .filter(Boolean).map(floor => buildingRing(floor.polygon)).filter(p => p.length);
  const placement = state.placement || { x: 0, y: 0 };
  return {
    context, enabled: true,
    // A custom point's finite scene extent is expressly not a property boundary.
    parcel: context.boundaryKnown === false ? [] : ring(context.polygon),
    footprint: ring(model?.siteAssessment?.footprint),
    podium: buildingRing(podium?.polygon), towers,
    marker: toLatLng([context.originRhino[0] + (Number(placement.x) || 0), context.originRhino[1] + (Number(placement.y) || 0)]),
    key: `${context.longitude}:${context.latitude}`
  };
}

function textNode(document, className, text) {
  const element = document.createElement('div');
  element.className = className;
  if (text) element.textContent = text;
  return element;
}

/** Instantiate only when its panel is visible. Leaflet is loaded locally before app.js. */
export function createVancouverMap(container, options = {}) {
  const L = globalThis.L;
  if (!container || !L?.map) throw new Error('The local Vancouver map library could not be loaded.');
  const document = container.ownerDocument;
  container.classList.add('vancouver-map', 'choose-site');
  container.setAttribute('role', 'region');
  container.setAttribute('aria-label', 'Vancouver map. Choose a site, or pan and zoom to explore protected views.');
  const bounds = [[VANCOUVER_MAP_BOUNDS.south, VANCOUVER_MAP_BOUNDS.west], [VANCOUVER_MAP_BOUNDS.north, VANCOUVER_MAP_BOUNDS.east]];
  const map = L.map(container, {
    minZoom: 11, maxZoom: 20, maxBounds: bounds, maxBoundsViscosity: 0.8,
    zoomControl: true, attributionControl: true, scrollWheelZoom: false,
    keyboard: true, preferCanvas: false, zoomAnimation: !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  }).setView(DEFAULT_CENTER, 15);
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  map.createPane('viewCones'); map.getPane('viewCones').style.zIndex = '410';
  map.createPane('siteInsertion'); map.getPane('siteInsertion').style.zIndex = '430';

  const status = textNode(document, 'vancouver-map-status');
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.hidden = true;
  const tilesWarning = textNode(document, 'vancouver-map-tiles-warning', 'Street tiles could not load. Building and view-cone overlays remain available.');
  tilesWarning.setAttribute('role', 'status'); tilesWarning.hidden = true;
  const statusControl = L.control({ position: 'bottomleft' });
  statusControl.onAdd = () => {
    const wrapper = textNode(document, 'vancouver-map-messages');
    wrapper.append(status, tilesWarning); L.DomEvent.disableClickPropagation(wrapper); return wrapper;
  };
  statusControl.addTo(map);
  const legend = L.control({ position: 'topright' });
  legend.onAdd = () => {
    const element = textNode(document, 'vancouver-map-legend');
    element.setAttribute('aria-label', 'Map legend');
    for (const [kind, label] of [['cone', 'Protected view · plan'], ['building', 'Building projection'], ['parcel', 'Known site outline']]) {
      const row = document.createElement('div'), swatch = document.createElement('span'), text = document.createElement('span');
      swatch.className = `map-legend-swatch ${kind}`; swatch.setAttribute('aria-hidden', 'true'); text.textContent = label;
      row.append(swatch, text); element.append(row);
    }
    L.DomEvent.disableClickPropagation(element); return element;
  };
  legend.addTo(map);

  // Leaflet requests only the visible viewport. No prefetch, offline cache or retina doubling.
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    maxNativeZoom: 19, maxZoom: 20, detectRetina: false, keepBuffer: 0,
    updateWhenIdle: true, updateWhenZooming: false, crossOrigin: false
  }).addTo(map);
  tiles.on('tileerror', () => { tilesWarning.hidden = false; });
  tiles.on('tileload', () => { tilesWarning.hidden = true; });

  const cones = L.layerGroup(), coneLayers = new Map();
  for (const cone of VANCOUVER_CONES) {
    const layer = L.polygon(cone.polygon.map(toLatLng), {
      pane: 'viewCones', color: '#176f85', weight: 1.1, opacity: 0.65,
      fillColor: '#176f85', fillOpacity: 0.035, bubblingMouseEvents: true
    });
    const label = textNode(document, 'map-cone-label', `${cone.id} · ${cone.label} · plan polygon`);
    layer.bindTooltip(label, { sticky: true, direction: 'top' });
    layer.addTo(cones); coneLayers.set(String(cone.id), { layer, overlapping: false });
  }
  cones.addTo(map);
  const parcel = L.polygon([], { pane: 'siteInsertion', color: '#38705c', weight: 2.2, fillColor: '#83a68b', fillOpacity: 0.09, interactive: false }).addTo(map);
  const footprint = L.polygon([], { pane: 'siteInsertion', color: '#a33f32', weight: 1.6, dashArray: '4 3', fillColor: '#bd5140', fillOpacity: 0.12, interactive: false }).addTo(map);
  const podium = L.polygon([], { pane: 'siteInsertion', color: '#9d3e32', weight: 1.2, fillColor: '#bd5140', fillOpacity: 0.23, interactive: false }).addTo(map);
  const towers = L.layerGroup().addTo(map);
  const towerLayers = [];
  const icon = L.divIcon({ className: 'vancouver-building-marker', html: '<span class="map-building-pin" aria-hidden="true"></span>', iconSize: [30, 30], iconAnchor: [15, 15] });
  const marker = L.marker(DEFAULT_CENTER, { icon, draggable: false, keyboard: true, title: 'Building location', riseOnHover: true });

  let current = null, currentState = null, currentGeometry = null, mode = 'choose', conesVisible = true, previousKey = null, disposed = false, dragging = false, suppressClickUntil = 0;
  const now = () => globalThis.performance?.now?.() || Date.now();
  const setStatus = (message, error = false) => { status.textContent = String(message || ''); status.hidden = !message; status.classList.toggle('error', Boolean(error)); };
  const refreshMarkerLabel = () => {
    const element = marker.getElement();
    if (!element) return;
    element.setAttribute('role', 'button');
    element.setAttribute('aria-label', mode === 'move' ? 'Move building on the Vancouver map' : 'Selected building location');
    element.setAttribute('aria-description', mode === 'move' ? 'Drag to move the building. Arrow keys move one metre; Shift and an arrow move five metres.' : 'Choose Move building to drag this location or use the arrow keys.');
    element.classList.toggle('is-movable', mode === 'move');
  };
  marker.on('add', () => {
    refreshMarkerLabel();
    const element = marker.getElement();
    if (!element) return;
    L.DomEvent.disableClickPropagation(element);
    element.addEventListener('keydown', event => {
      if (mode !== 'move' || !currentState || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const amount = event.shiftKey ? 5 : 1, pos = currentState.placement || { x: 0, y: 0 };
      const next = { x: (Number(pos.x) || 0) + (event.key === 'ArrowRight' ? amount : event.key === 'ArrowLeft' ? -amount : 0),
        y: (Number(pos.y) || 0) + (event.key === 'ArrowUp' ? amount : event.key === 'ArrowDown' ? -amount : 0) };
      options.onGestureStart?.(); options.onMove?.(next); options.onGestureEnd?.();
    });
  });
  marker.on('dragstart', () => { dragging = true; suppressClickUntil = now() + 500; options.onGestureStart?.(); });
  marker.on('drag', () => {
    if (!current) return;
    const p = marker.getLatLng(), placement = mapPointToPlacement({ longitude: p.lng, latitude: p.lat }, current);
    if (placement) options.onMove?.(placement);
  });
  marker.on('dragend', () => { dragging = false; suppressClickUntil = now() + 300; options.onGestureEnd?.(); });
  map.on('click', event => {
    if (mode !== 'choose' || dragging || now() < suppressClickUntil) return;
    const point = { longitude: event.latlng.lng, latitude: event.latlng.lat };
    if (!isVancouverMapLocation(point)) { setStatus('Choose a point within the displayed Vancouver study extent.', true); return; }
    options.onPick?.(point);
  });

  const syncCones = () => {
    if (conesVisible && currentGeometry?.enabled !== false) { if (!map.hasLayer(cones)) cones.addTo(map); }
    else if (map.hasLayer(cones)) map.removeLayer(cones);
  };
  const focusSelection = () => {
    if (!currentGeometry?.enabled) return;
    const points = [...currentGeometry.parcel, ...currentGeometry.footprint];
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [42, 42], maxZoom: 18, animate: false });
    else map.setView(currentGeometry.marker, 17, { animate: false });
  };
  const setMode = value => {
    mode = value === 'move' ? 'move' : 'choose';
    container.classList.toggle('choose-site', mode === 'choose'); container.classList.toggle('move-building', mode === 'move');
    if (mode === 'move') marker.dragging?.enable(); else marker.dragging?.disable();
    refreshMarkerLabel();
  };
  const update = (model, state) => {
    if (disposed) return;
    currentState = state || model?.state || {}; currentGeometry = mapOverlayGeometry(model, currentState); current = currentGeometry.context;
    if (!currentGeometry.enabled) {
      if (map.hasLayer(marker)) map.removeLayer(marker);
      parcel.setLatLngs([]); footprint.setLatLngs([]); podium.setLatLngs([]); towers.clearLayers(); towerLayers.length = 0; previousKey = null; syncCones(); return;
    }
    parcel.setLatLngs(currentGeometry.parcel); footprint.setLatLngs(currentGeometry.footprint); podium.setLatLngs(currentGeometry.podium);
    currentGeometry.towers.forEach((points, index) => {
      if (!towerLayers[index]) towerLayers[index] = L.polygon([], { pane: 'siteInsertion', color: '#943c31', weight: 1.5, fillColor: '#bd5140', fillOpacity: 0.48, interactive: false }).addTo(towers);
      towerLayers[index].setLatLngs(points);
    });
    while (towerLayers.length > currentGeometry.towers.length) towers.removeLayer(towerLayers.pop());
    if (!dragging) marker.setLatLng(currentGeometry.marker);
    if (!map.hasLayer(marker)) marker.addTo(map);
    setMode(mode);
    const overlaps = new Set((model?.siteAssessment?.overlaps || []).map(cone => String(cone.id)));
    for (const [id, item] of coneLayers) {
      const active = overlaps.has(id);
      if (active !== item.overlapping) {
        item.overlapping = active;
        item.layer.setStyle({ color: active ? '#174f65' : '#176f85', weight: active ? 2.2 : 1.1, opacity: active ? 0.95 : 0.65, fillOpacity: active ? 0.12 : 0.035 });
        if (active) item.layer.bringToFront();
      }
    }
    syncCones();
    // Only changing the geographic anchor frames the map. Edits, movement and a
    // completed parcel lookup retain the designer's pan and zoom.
    if (previousKey !== currentGeometry.key) {
      if (previousKey === null) map.setView(currentGeometry.marker, 15, { animate: false });
      else map.panTo(currentGeometry.marker, { animate: false });
      previousKey = currentGeometry.key;
    }
  };
  const resize = () => { if (!disposed) map.invalidateSize({ pan: false, animate: false }); };
  const observer = globalThis.ResizeObserver ? new ResizeObserver(resize) : null;
  observer?.observe(container);
  return {
    update, setMode, setStatus, focusSelection,
    setConesVisible(value) { conesVisible = Boolean(value); syncCones(); },
    showCity() { map.fitBounds(bounds, { padding: [15, 15], animate: false }); },
    getCenter() { const p = map.getCenter(); return { longitude: p.lng, latitude: p.lat }; },
    resize,
    dispose() { if (disposed) return; disposed = true; observer?.disconnect(); map.remove(); }
  };
}

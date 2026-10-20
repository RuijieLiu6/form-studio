/** Read-only City assessment-parcel lookup for a map point. No nearest-parcel snapping. */
import { VANCOUVER_SOURCES } from './data/vancouver-sites.js';
import { isVancouverMapLocation, lonLatToVista, pointInSitePolygon, normalizeSiteContext } from './site-context.js';

const result = (status, message, parcel = null) => ({ status, message, parcel });
const geometryKey = ring => {
  let points = ring.map(p => [Number(p[0]).toFixed(10), Number(p[1]).toFixed(10)].join(','));
  if (points[0] === points.at(-1)) points.pop();
  const rotations = list => { const first = list.reduce((best, p, i) => p < list[best] ? i : best, 0); return [...list.slice(first), ...list.slice(0, first)].join(';'); };
  return [rotations(points), rotations([...points].reverse())].sort()[0];
};
function contains(ring, point) {
  return Array.isArray(ring) && ring.length >= 4 && ring.length <= 513 && ring.every(p => Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]))) &&
    pointInSitePolygon(lonLatToVista([point.longitude, point.latitude]), ring.map(lonLatToVista));
}

/** Kept pure for saved-response tests. A component with holes stays unresolved. */
export function parseParcelResponse(payload, location, accessedOn = new Date().toISOString().slice(0, 10)) {
  if (!isVancouverMapLocation(location)) return result('unsupported', 'Choose a point within the Vancouver map study extent.');
  if (!payload || !Array.isArray(payload.results) || payload.results.length > 50 || Number(payload.total_count) > 50) return result('unsupported', 'The City parcel response is incomplete or too complex; the map point remains placed with an unknown boundary.');
  const groups = new Map(); let complex = false;
  for (const record of payload.results) {
    const geometry = record?.geom?.geometry || record?.geom;
    const components = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
    if (!Array.isArray(components) || components.length > 50) { complex = true; continue; }
    for (const component of components) {
      if (!Array.isArray(component) || !contains(component[0], location)) continue;
      if (component.length !== 1) { complex = true; continue; }
      const ring = component[0], key = geometryKey(ring);
      const group = groups.get(key) || { ring, records: [], componentOnly: geometry.type === 'MultiPolygon' && components.length > 1 };
      group.records.push(record); groups.set(key, group);
    }
  }
  if (!groups.size) return result(complex ? 'unsupported' : 'not-found', complex ? 'This City parcel has holes or unsupported geometry. The selected point is placed, but its boundary needs review.' : 'No City assessment parcel contains this point. The building remains at the selected location; parcel fit and FSR are unknown.');
  if (groups.size !== 1 || complex) return result('unsupported', 'Multiple or complex City parcel geometries overlap this point. The selected location is kept without claiming one property boundary.');
  const group = [...groups.values()][0];
  const citySiteIds = [...new Set(group.records.map(r => String(r.site_id || '')).filter(Boolean))];
  const addresses = [...new Set(group.records.map(r => [r.civic_number, r.streetname].filter(Boolean).join(' ')).filter(Boolean))];
  const address = addresses.join(' / '), candidate = {
    polygonLonLat: group.ring, source: 'city', citySiteIds, label: address || 'Selected City assessment parcel',
    address: address || 'City assessment parcel at selected point', accessedOn,
    sourceUrl: VANCOUVER_SOURCES.parcelDataset, geometryScope: group.componentOnly ? 'containing-component' : 'parcel'
  };
  const parcel = normalizeSiteContext({ mode: 'vancouver', siteId: 'custom', location, parcel: candidate }).parcel;
  if (!parcel) return result('unsupported', 'The City boundary is outside the supported size or geometry limits. The selected point remains placed; parcel fit and FSR are unknown.');
  return result('matched', `${group.componentOnly ? 'Containing City parcel component' : 'City assessment parcel'} loaded. Survey, ownership and permitted development remain unverified.`, parcel);
}

export async function lookupParcel(location, { signal, fetchImpl = globalThis.fetch, timeoutMs = 12000 } = {}) {
  if (!isVancouverMapLocation(location)) return result('unsupported', 'Choose a point within the Vancouver map study extent.');
  if (typeof fetchImpl !== 'function') throw new Error('City parcel lookup is unavailable. The building remains placed with an unknown parcel boundary.');
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const url = new URL(VANCOUVER_SOURCES.parcelApi);
  url.searchParams.set('where', `intersects(geom, geom'POINT(${Number(location.longitude)} ${Number(location.latitude)})')`);
  url.searchParams.set('limit', '50');
  try {
    const response = await fetchImpl(url.href, { signal: controller.signal, credentials: 'omit', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`City parcel lookup returned HTTP ${response.status}. The building remains placed with an unknown parcel boundary.`);
    return parseParcelResponse(await response.json(), location);
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timedOut) throw new Error('City parcel lookup timed out. The building remains placed; parcel fit and FSR are unknown. Retry when connected.');
    if (/^City parcel lookup/.test(error?.message || '')) throw error;
    throw new Error('City parcel lookup could not connect. The building remains placed; parcel fit and FSR are unknown. Retry when connected.');
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
  }
}

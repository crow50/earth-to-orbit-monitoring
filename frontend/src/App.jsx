import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { CircleMarker, GeoJSON, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icons for bundlers (Vite)
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const statusColor = (status) => {
  if (!status) return '#888';
  const s = status.toLowerCase();
  if (s.includes('success')) return '#4caf50';
  if (s.includes('failure') || s.includes('partial failure')) return '#f44336';
  if (s.includes('scrub') || s.includes('hold')) return '#ff9800';
  if (s.includes('tbc') || s.includes('to be confirmed')) return '#ff9800';
  return '#2196f3';
};

function parseBool(value) {
  if (value == null) return null;
  const v = String(value).toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false;
  return null;
}

function parseIntList(values) {
  return values
    .map((v) => Number.parseInt(v, 10))
    .filter((n) => Number.isFinite(n));
}

function parseStringList(values) {
  return values.map((v) => String(v)).filter((s) => s.trim().length > 0);
}

function toUtcIsoFromDateOnly(dateStr, { endOfDay = false } = {}) {
  if (!dateStr) return null;
  // Treat date-only inputs as UTC to keep behavior deterministic.
  const suffix = endOfDay ? 'T23:59:59.999999Z' : 'T00:00:00Z';
  return `${dateStr}${suffix}`;
}

function MapFitBounds({ points, enabled, resetNonce }) {
  const map = useMap();
  const lastBoundsRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    if (!points.length) return;

    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon]));

    const prev = lastBoundsRef.current;
    if (prev && !resetNonce) {
      // Only re-fit if bounds materially change (prevents snapping due to polling refreshes).
      const a = prev.toBBoxString();
      const b = bounds.toBBoxString();
      if (a === b) return;
    }

    map.fitBounds(bounds, { padding: [20, 20], maxZoom: 7 });
    lastBoundsRef.current = bounds;
  }, [map, points, enabled, resetNonce]);

  return null;
}

function MapFitSelectedEndpoints({ launchPoint, recoveryPoint }) {
  const map = useMap();

  useEffect(() => {
    if (!launchPoint || !recoveryPoint) return;

    const bounds = L.latLngBounds([
      [launchPoint.lat, launchPoint.lon],
      [recoveryPoint.lat, recoveryPoint.lon],
    ]);

    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 7 });
  }, [map, launchPoint, recoveryPoint]);

  return null;
}

function MapSelectionFlyTo({ selectedPoint }) {
  const map = useMap();

  useEffect(() => {
    if (!selectedPoint) return;
    map.flyTo([selectedPoint.lat, selectedPoint.lon], Math.max(map.getZoom(), 6), {
      duration: 0.8,
    });
  }, [map, selectedPoint]);

  return null;
}

function Countdown({ targetDate }) {
  const [state, setState] = useState(null);

  useEffect(() => {
    if (!targetDate) return;

    const tick = () => {
      const now = new Date().getTime();
      const t = new Date(targetDate).getTime() - now;

      if (t > 0) {
        const days = Math.floor(t / 86400000);
        const hours = Math.floor((t % 86400000) / 3600000);
        const mins = Math.floor((t % 3600000) / 60000);
        const secs = Math.floor((t % 60000) / 1000);
        return {
          text: `T- ${days > 0 ? `${days}d ` : ''}${hours.toString().padStart(2, '0')}:${mins
            .toString()
            .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`,
          isUrgent: t < 3600000,
          isPast: false,
        };
      }

      const past = Math.abs(t);
      const daysPast = Math.floor(past / 86400000);
      if (daysPast > 0) {
        return { text: `T+ ${daysPast}d ago`, isUrgent: false, isPast: true };
      }
      return { text: 'IN FLIGHT / RECENT', isUrgent: false, isPast: true };
    };

    const id = setInterval(() => setState(tick()), 1000);
    setState(tick());
    return () => clearInterval(id);
  }, [targetDate]);

  if (!targetDate) return <span style={{ color: '#888' }}>TBD</span>;
  if (!state) return null;

  return (
    <span
      style={{
        color: state.isUrgent ? '#f44336' : state.isPast ? '#888' : '#fff',
        fontWeight: 'bold',
        fontFamily: 'monospace',
        fontSize: '1.05rem',
      }}
    >
      {state.text}
    </span>
  );
}

export default function App() {
  const launchMarkerRefs = useRef(new Map());
  const landingMarkerRef = useRef(null);

  const [launches, setLaunches] = useState([]);
  const [loading, setLoading] = useState(false);

  const [meta, setMeta] = useState({ statuses: [], locations: [], pads: [] });

  // Overlays (Horizon 2)
  // Landing zones are contextual: only shown when the selected launch has a
  // landing attempt + known landing location.
  const [overlays, setOverlays] = useState([]);

  // Filters (server-side)
  // Draft filter state (user can edit multiple fields, then Apply)
  const [q, setQ] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [selectedLocationIds, setSelectedLocationIds] = useState([]);
  const [upcomingOnly, setUpcomingOnly] = useState(true);

  // Applied filter state (drives queries + URL)
  const [aq, setAq] = useState('');
  const [aSelectedStatuses, setASelectedStatuses] = useState([]);
  const [aSelectedLocationIds, setASelectedLocationIds] = useState([]);
  const [aUpcomingOnly, setAUpcomingOnly] = useState(true);

  const [selectedLaunchId, setSelectedLaunchId] = useState(null);

  // Date range (date-only UI; sent as UTC timestamps)
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [aFromDate, setAFromDate] = useState('');
  const [aToDate, setAToDate] = useState('');

  const [mapResetNonce, setMapResetNonce] = useState(0);

  const hasExplicitRange = Boolean(fromDate || toDate);
  const hasExplicitRangeApplied = Boolean(aFromDate || aToDate);

  const didInitFromUrl = useRef(false);

  const queryParams = useMemo(() => {
    const params = {};
    if (aq.trim()) params.q = aq.trim();
    if (aSelectedStatuses.length) params.status = aSelectedStatuses;
    if (aSelectedLocationIds.length) params.location_id = aSelectedLocationIds;

    const fromIso = toUtcIsoFromDateOnly(aFromDate, { endOfDay: false });
    const toIso = toUtcIsoFromDateOnly(aToDate, { endOfDay: true });
    if (fromIso) params.from_time = fromIso;
    if (toIso) params.to_time = toIso;

    // Upcoming-only makes sense only when no explicit date-range is set.
    const hasExplicitRangeIso = Boolean(fromIso || toIso);
    if (aUpcomingOnly && !hasExplicitRangeIso) params.upcoming = true;

    params.limit = 200;
    params.offset = 0;
    params.sort = aUpcomingOnly && !hasExplicitRangeIso ? 'net_asc' : 'net_desc';
    return params;
  }, [aq, aSelectedStatuses, aSelectedLocationIds, aUpcomingOnly, aFromDate, aToDate]);

  // Init filter state from the URL querystring (deep-linking)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);

    const q0 = sp.get('q') || '';
    const statuses0 = parseStringList(sp.getAll('status'));
    const locations0 = parseIntList(sp.getAll('location_id'));
    const upcoming0 = parseBool(sp.get('upcoming'));

    // Date-only form: from=YYYY-MM-DD, to=YYYY-MM-DD
    const from0 = sp.get('from') || '';
    const to0 = sp.get('to') || '';

    setQ(q0);
    setSelectedStatuses(statuses0);
    setSelectedLocationIds(locations0);
    if (upcoming0 !== null) setUpcomingOnly(upcoming0);
    setFromDate(from0);
    setToDate(to0);

    // Apply immediately from URL deep-link
    setAq(q0);
    setASelectedStatuses(statuses0);
    setASelectedLocationIds(locations0);
    if (upcoming0 !== null) setAUpcomingOnly(upcoming0);
    setAFromDate(from0);
    setAToDate(to0);

    didInitFromUrl.current = true;
  }, []);

  // If a date-range is set, force upcomingOnly off so the UI matches behavior.
  useEffect(() => {
    if (hasExplicitRange && upcomingOnly) setUpcomingOnly(false);
  }, [hasExplicitRange, upcomingOnly]);

  // Same rule for applied filters.
  useEffect(() => {
    if (hasExplicitRangeApplied && aUpcomingOnly) setAUpcomingOnly(false);
  }, [hasExplicitRangeApplied, aUpcomingOnly]);

  // Keep URL updated with current filter state
  useEffect(() => {
    if (!didInitFromUrl.current) return;

    const sp = new URLSearchParams();

    if (aq.trim()) sp.set('q', aq.trim());
    aSelectedStatuses.forEach((s) => sp.append('status', s));
    aSelectedLocationIds.forEach((id) => sp.append('location_id', String(id)));

    if (aFromDate) sp.set('from', aFromDate);
    if (aToDate) sp.set('to', aToDate);

    // Only set upcoming=false explicitly; otherwise omit to keep URLs clean.
    if (aUpcomingOnly === false) sp.set('upcoming', 'false');

    const qs = sp.toString();
    const nextUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', nextUrl);
  }, [aq, aSelectedStatuses, aSelectedLocationIds, aUpcomingOnly, aFromDate, aToDate]);

  // Load filter metadata once
  useEffect(() => {
    axios
      .get('/api/v1/meta/filters')
      .then((r) => setMeta(r.data))
      .catch((e) => console.error(e));
  }, []);

  // Load overlays (Horizon 2) once
  useEffect(() => {
    axios
      .get('/api/v1/overlays', { params: { overlay_type: 'landing_zone', is_active: true } })
      .then((r) => setOverlays(r.data || []))
      .catch((e) => {
        console.error(e);
        setOverlays([]);
      });
  }, []);

  const selectedLaunch = useMemo(() => {
    if (!selectedLaunchId) return null;
    return launches.find((l) => l.id === selectedLaunchId) || null;
  }, [launches, selectedLaunchId]);

  const selectedRecoveryOverlay = useMemo(() => {
    if (!selectedLaunch) return null;
    const overlayId = selectedLaunch.recovery_overlay_id;
    if (!overlayId) return null;
    return overlays.find((o) => o.id === overlayId) || null;
  }, [overlays, selectedLaunch]);

  const shouldShowLandingZones = Boolean(selectedLaunchId && selectedRecoveryOverlay);

  const hasTwoPopups = Boolean(selectedLaunchId && selectedRecoveryOverlay);
  const launchPopupOffset = hasTwoPopups ? [-14, -8] : [0, 0];
  const landingPopupOffset = hasTwoPopups ? [14, -8] : [0, 0];

  // When a tile is selected, open the corresponding map popups (launch + landing)
  // to mimic direct marker clicks.
  useEffect(() => {
    if (!selectedLaunchId) return;

    const m = launchMarkerRefs.current.get(selectedLaunchId);
    try {
      m?.openPopup?.();
    } catch {
      // ignore
    }

    // If we have a known landing marker, open it too.
    try {
      landingMarkerRef.current?.openPopup?.();
    } catch {
      // ignore
    }
  }, [selectedLaunchId, selectedRecoveryOverlay]);

  const recoveryPoint = useMemo(() => {
    if (!selectedRecoveryOverlay) return null;
    const g = selectedRecoveryOverlay.geometry?.geometry;
    if (!g || g.type !== 'Point' || !Array.isArray(g.coordinates)) return null;
    const [lon, lat] = g.coordinates;
    if (typeof lat !== 'number' || typeof lon !== 'number') return null;
    return { lat, lon };
  }, [selectedRecoveryOverlay]);

  // Fetch launches (poll)
  useEffect(() => {
    let cancelled = false;

    const fetchData = () => {
      setLoading(true);
      axios
        .get('/api/v1/launches', { params: queryParams, paramsSerializer: { indexes: null } })
        .then((r) => {
          if (!cancelled) setLaunches(r.data);
        })
        .catch((e) => console.error(e))
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    fetchData();
    const id = setInterval(fetchData, 30000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [queryParams]);

  const mapPoints = useMemo(() => {
    return launches
      .filter((l) => typeof l.pad_latitude === 'number' && typeof l.pad_longitude === 'number')
      .map((l) => ({
        id: l.id,
        mission_name: l.mission_name,
        status: l.status,
        launch_time: l.launch_time,
        pad_name: l.pad_name || l.legacy_pad,
        location_name: l.location_name,
        lat: l.pad_latitude,
        lon: l.pad_longitude,
      }));
  }, [launches]);


  const selectedPoint = useMemo(() => {
    if (!selectedLaunchId) return null;
    return mapPoints.find((p) => p.id === selectedLaunchId) || null;
  }, [mapPoints, selectedLaunchId]);

  const selectedLaunchPoint = useMemo(() => {
    if (!selectedPoint) return null;
    return { lat: selectedPoint.lat, lon: selectedPoint.lon };
  }, [selectedPoint]);

  const mapCenter = mapPoints.length ? [mapPoints[0].lat, mapPoints[0].lon] : [20, 0];

  const activeFilterCount =
    (aq ? 1 : 0) +
    (aSelectedStatuses.length ? 1 : 0) +
    (aSelectedLocationIds.length ? 1 : 0) +
    (aFromDate ? 1 : 0) +
    (aToDate ? 1 : 0) +
    (aUpcomingOnly ? 1 : 0);

  const [filtersCollapsed, setFiltersCollapsed] = useState(false);

  const [mapHeight, setMapHeight] = useState(380);

  useEffect(() => {
    const compute = () => {
      const isMobile = window.innerWidth <= 768;
      const isLandscape = window.matchMedia?.('(orientation: landscape)').matches;
      if (isMobile && isLandscape) return 240;
      return 380;
    };

    const apply = () => setMapHeight(compute());
    apply();
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    return () => {
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
    };
  }, []);

  return (
    <div
      style={{
        padding: '2rem',
        fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        backgroundColor: '#0b0e14',
        color: '#e0e0e0',
        minHeight: '100vh',
      }}
    >
      <header style={{ marginBottom: '1.0rem', borderBottom: '1px solid #2d333b', paddingBottom: '0.75rem' }}>
        <h1 style={{ margin: 0, color: '#fff', letterSpacing: '1px' }}>EARTH TO ORBIT</h1>
        <p style={{ margin: '0.5rem 0 0', color: '#8b949e' }}>Mission Control Monitoring Dashboard</p>
      </header>

      {/* Sticky filter bar (stays above map when scrolling) */}
      <section
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: '#0b0e14',
          paddingTop: '0.75rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid #2d333b',
          marginBottom: '1.0rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <button
            type="button"
            onClick={() => setFiltersCollapsed((v) => !v)}
            style={{
              padding: '0.45rem 0.7rem',
              borderRadius: 6,
              border: '1px solid #30363d',
              background: '#161b22',
              color: '#c9d1d9',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            Filters{activeFilterCount ? ` (${activeFilterCount})` : ''} {filtersCollapsed ? '▸' : '▾'}
          </button>

          <span style={{ color: '#8b949e', fontSize: '0.85rem' }}>{loading ? 'Refreshing…' : ' '}</span>
        </div>

        {!filtersCollapsed && (
          <div
            style={{
              marginTop: '0.75rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1.25rem',
              alignItems: 'end',
            }}
          >
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#8b949e', marginBottom: '0.25rem' }}>
              Search
            </label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="mission / pad / location"
              style={{
                width: '100%',
                padding: '0.6rem 0.7rem',
                borderRadius: 6,
                border: '1px solid #30363d',
                background: '#161b22',
                color: '#e0e0e0',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#8b949e', marginBottom: '0.25rem' }}>
              Status
            </label>
            <select
              multiple
              value={selectedStatuses}
              onChange={(e) => setSelectedStatuses(Array.from(e.target.selectedOptions).map((o) => o.value))}
              style={{
                width: '100%',
                minHeight: 80,
                padding: '0.5rem',
                borderRadius: 6,
                border: '1px solid #30363d',
                background: '#161b22',
                color: '#e0e0e0',
              }}
            >
              {meta.statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#8b949e', marginBottom: '0.25rem' }}>
              Location
            </label>
            <select
              multiple
              value={selectedLocationIds.map(String)}
              onChange={(e) => setSelectedLocationIds(Array.from(e.target.selectedOptions).map((o) => Number(o.value)))}
              style={{
                width: '100%',
                minHeight: 80,
                padding: '0.5rem',
                borderRadius: 6,
                border: '1px solid #30363d',
                background: '#161b22',
                color: '#e0e0e0',
              }}
            >
              {meta.locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}{loc.country_code ? ` (${loc.country_code})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#8b949e', marginBottom: '0.25rem' }}>
              From (UTC date)
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{
                width: '100%',
                padding: '0.6rem 0.7rem',
                borderRadius: 6,
                border: '1px solid #30363d',
                background: '#161b22',
                color: '#e0e0e0',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#8b949e', marginBottom: '0.25rem' }}>
              To (UTC date)
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              style={{
                width: '100%',
                padding: '0.6rem 0.7rem',
                borderRadius: 6,
                border: '1px solid #30363d',
                background: '#161b22',
                color: '#e0e0e0',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', paddingBottom: '0.2rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: '#c9d1d9' }}>
              <input
                type="checkbox"
                checked={upcomingOnly}
                onChange={(e) => setUpcomingOnly(e.target.checked)}
                disabled={Boolean(fromDate || toDate)}
              />
              Upcoming only
            </label>

            <button
              type="button"
              onClick={() => {
                // Apply draft filters
                setAq(q);
                setASelectedStatuses(selectedStatuses);
                setASelectedLocationIds(selectedLocationIds);
                setAFromDate(fromDate);
                setAToDate(toDate);

                // upcomingOnly applied only if no explicit date range
                const hasRange = Boolean(fromDate || toDate);
                setAUpcomingOnly(hasRange ? false : upcomingOnly);

                setFiltersCollapsed(true);
              }}
              style={{
                padding: '0.45rem 0.7rem',
                borderRadius: 6,
                border: '1px solid #58a6ff',
                background: 'rgba(88, 166, 255, 0.1)',
                color: '#58a6ff',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Apply
            </button>

            <button
              type="button"
              onClick={() => {
                setQ('');
                setSelectedStatuses([]);
                setSelectedLocationIds([]);
                setFromDate('');
                setToDate('');
                setUpcomingOnly(true);

                // Reset applied filters too
                setAq('');
                setASelectedStatuses([]);
                setASelectedLocationIds([]);
                setAFromDate('');
                setAToDate('');
                setAUpcomingOnly(true);

                setSelectedLaunchId(null);
                setMapResetNonce((n) => n + 1);
              }}
              style={{
                padding: '0.45rem 0.7rem',
                borderRadius: 6,
                border: '1px solid #30363d',
                background: '#0b0e14',
                color: '#c9d1d9',
                cursor: 'pointer',
              }}
            >
              Reset
            </button>

            {selectedLaunchId && (
              <button
                type="button"
                onClick={() => setSelectedLaunchId(null)}
                style={{
                  padding: '0.45rem 0.7rem',
                  borderRadius: 6,
                  border: '1px solid #58a6ff',
                  background: 'rgba(88, 166, 255, 0.1)',
                  color: '#58a6ff',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                }}
              >
                Clear selection
              </button>
            )}
          </div>
          </div>
        )}
      </section>

      {/* Map */}
      <section
        style={{
          backgroundColor: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 8,
          overflow: 'hidden',
          marginBottom: '1.5rem',
          position: 'sticky',
          top: '5.75rem',
          zIndex: 10,
        }}
      >
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #30363d', color: '#8b949e' }}>
          Map (OpenStreetMap)
        </div>
        <div style={{ height: mapHeight, position: 'relative' }}>
          {shouldShowLandingZones && (
            <div
              style={{
                position: 'absolute',
                right: 10,
                top: 10,
                zIndex: 1000,
                background: 'rgba(11, 14, 20, 0.85)',
                border: '1px solid #30363d',
                borderRadius: 8,
                padding: '0.5rem 0.6rem',
                fontSize: '0.8rem',
                color: '#c9d1d9',
                backdropFilter: 'blur(4px)',
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: 4, color: '#fff' }}>Legend</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 12,
                    height: 12,
                    borderRadius: 999,
                    border: '2px dashed #ff9800',
                    background: 'rgba(255,152,0,0.35)',
                  }}
                />
                <span>Landing Zone</span>
              </div>
              <div style={{ marginTop: 4, color: '#8b949e' }}>Launch pads use default pin markers.</div>
            </div>
          )}

          <MapContainer center={mapCenter} zoom={mapPoints.length ? 4 : 2} style={{ height: '100%', width: '100%' }}>
            <MapFitBounds points={mapPoints} enabled={!loading && !selectedLaunchId} resetNonce={mapResetNonce} />
            <MapFitSelectedEndpoints launchPoint={selectedLaunchPoint} recoveryPoint={recoveryPoint} />
            <MapSelectionFlyTo selectedPoint={selectedPoint} />
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
            />

            {/* Overlays */}
            {shouldShowLandingZones && selectedRecoveryOverlay && (
              <>
                {/* Contextual landing zone marker: only the selected launch's landing site */}
                {(() => {
                  const o = selectedRecoveryOverlay;
                  const g = o.geometry?.geometry;
                  if (!g || g.type !== 'Point' || !Array.isArray(g.coordinates)) return null;
                  const [lon, lat] = g.coordinates;
                  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
                  return (
                    <CircleMarker
                      key={`lz-${o.id}`}
                      center={[lat, lon]}
                      radius={9}
                      pathOptions={{
                        color: '#ff9800',
                        weight: 3,
                        fillColor: '#ff9800',
                        fillOpacity: 0.35,
                        dashArray: '4 4',
                      }}
                      ref={landingMarkerRef}
                    >
                      <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
                        Landing Zone: {o.name}
                      </Tooltip>
                      <Popup offset={landingPopupOffset} maxWidth={260} minWidth={180}>
                        <div style={{ maxWidth: 260 }}>
                          <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Landing Zone</div>
                          <div style={{ color: '#fff', marginBottom: 6 }}>{o.name}</div>
                          <div style={{ color: '#8b949e', fontSize: '0.85rem' }}>
                            {o.properties?.site ? `Site: ${o.properties.site}` : ''}
                          </div>
                          <div style={{ color: '#8b949e', fontSize: '0.85rem' }}>
                            {o.properties?.operator ? `Operator: ${o.properties.operator}` : ''}
                          </div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })()}
              </>
            )}

            {/* Selected endpoints line (pad → recovery) */}
            {selectedLaunchPoint && recoveryPoint && (
              <Polyline
                positions={[
                  [selectedLaunchPoint.lat, selectedLaunchPoint.lon],
                  [recoveryPoint.lat, recoveryPoint.lon],
                ]}
                pathOptions={{ color: '#ff9800', weight: 3, opacity: 0.8, dashArray: '6 6' }}
              />
            )}

            {mapPoints.map((p) => (
              <CircleMarker
                key={p.id}
                center={[p.lat, p.lon]}
                radius={7}
                pathOptions={{
                  color: p.id === selectedLaunchId ? '#58a6ff' : '#2f81f7',
                  weight: p.id === selectedLaunchId ? 3 : 2,
                  fillColor: p.id === selectedLaunchId ? '#58a6ff' : '#2f81f7',
                  fillOpacity: 0.55,
                }}
                eventHandlers={{
                  click: () => setSelectedLaunchId(p.id),
                }}
                ref={(ref) => {
                  if (ref) launchMarkerRefs.current.set(p.id, ref);
                }}
              >
                <Tooltip direction="top" offset={[0, -8]} opacity={0.9}>
                  Launch Pad: {p.pad_name || 'Unknown'}
                </Tooltip>
                <Popup offset={launchPopupOffset} maxWidth={300} minWidth={200}>
                  <div style={{ maxWidth: 280 }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 6 }}>{p.mission_name || 'Unknown mission'}</div>
                    <div style={{ marginBottom: 6 }}>
                      <span
                        style={{
                          backgroundColor: statusColor(p.status),
                          color: '#fff',
                          padding: '0.15rem 0.5rem',
                          borderRadius: 4,
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                          textTransform: 'uppercase',
                        }}
                      >
                        {p.status || 'Unknown'}
                      </span>
                    </div>
                    <div style={{ color: '#8b949e', fontSize: '0.85rem' }}>Launch Pad: {p.pad_name || ''}</div>
                    <div style={{ color: '#8b949e', fontSize: '0.85rem' }}>{p.location_name || ''}</div>
                    <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {p.launch_time ? new Date(p.launch_time).toLocaleString() : 'TBD'}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
        {launches.map((l) => (
          <div
            key={l.id}
            onClick={() => setSelectedLaunchId(l.id === selectedLaunchId ? null : l.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setSelectedLaunchId(l.id === selectedLaunchId ? null : l.id);
              }
            }}
            tabIndex={0}
            style={{
              backgroundColor: '#161b22',
              borderRadius: 8,
              padding: '1.25rem',
              border: l.id === selectedLaunchId ? '2px solid #58a6ff' : '1px solid #30363d',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: l.id === selectedLaunchId ? '0 0 15px rgba(88, 166, 255, 0.4)' : '0 4px 6px rgba(0,0,0,0.3)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              transform: l.id === selectedLaunchId ? 'translateY(-2px)' : 'none',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                <span
                  style={{
                    backgroundColor: statusColor(l.status),
                    color: '#fff',
                    padding: '0.25rem 0.6rem',
                    borderRadius: 4,
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {l.status || 'Unknown'}
                </span>
                <Countdown targetDate={l.launch_time} />
              </div>

              <h2 style={{ fontSize: '1.15rem', margin: '0.85rem 0 0.5rem', color: '#58a6ff' }}>
                {l.mission_name || 'Unknown Mission'}
              </h2>

              <div style={{ marginBottom: 6 }}>
                <span style={{ color: '#8b949e', fontSize: '0.9rem' }}>Pad: </span>
                <span style={{ color: '#c9d1d9' }}>{l.pad_name || l.legacy_pad || 'TBD'}</span>
              </div>
              <div>
                <span style={{ color: '#8b949e', fontSize: '0.9rem' }}>Location: </span>
                <span style={{ color: '#c9d1d9' }}>{l.location_name || 'TBD'}</span>
              </div>

              {l.recovery_attempted !== null && l.recovery_attempted !== undefined && (
                <div style={{ marginTop: 8 }}>
                  <span style={{ color: '#8b949e', fontSize: '0.9rem' }}>Recovery: </span>
                  <span style={{ color: '#c9d1d9' }}>
                    {l.recovery_attempted ? (l.recovery_success === true ? 'Successful' : l.recovery_success === false ? 'Failed' : 'Attempted') : 'No attempt'}
                  </span>
                  {l.recovery_attempted && !l.recovery_overlay_id && (
                    <div style={{ color: '#8b949e', fontSize: '0.85rem', marginTop: 2 }}>Location not provided yet</div>
                  )}
                </div>
              )}
            </div>

            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #30363d', fontSize: '0.85rem', color: '#8b949e' }}>
              {l.launch_time ? new Date(l.launch_time).toLocaleString() : 'Time TBD'}
            </div>
          </div>
        ))}

        {!loading && launches.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#8b949e' }}>
            No results. Try widening filters.
          </div>
        )}

        {loading && launches.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#8b949e' }}>
            Loading…
          </div>
        )}
      </div>
    </div>
  );
}
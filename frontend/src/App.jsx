import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';

// Create an axios instance with the Vite base path so API calls work behind
// reverse-proxy prefixes (e.g. /e2o/).  Paths must be relative (no leading /)
// so axios actually prepends the baseURL.
const api = axios.create({ baseURL: import.meta.env.BASE_URL });
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

function prettyRecoveryMethod(method) {
  if (!method) return null;
  const raw = String(method).trim();
  const m = raw.toUpperCase();

  // Common acronyms/abbrevs → user-friendly labels.
  if (m === 'ASDS') return 'Drone ship (ASDS)';
  if (m === 'RTLS') return 'Return to launch site (RTLS)';
  if (m === 'LZ') return 'Landing zone (LZ)';

  return raw;
}

function utcDateOnly(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toISOString().slice(0, 10);
}

function addDaysUtc(d = new Date(), days = 0) {
  const dt = d instanceof Date ? new Date(d.getTime()) : new Date(d);
  dt.setUTCDate(dt.getUTCDate() + Number(days));
  return dt;
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

    // Avoid zooming *too* far out by default; it makes the map feel empty.
    // NOTE: This trades some bounds completeness for UX. User can still zoom out manually.
    try {
      const z = map.getZoom();
      // Keep the view from being *extremely* zoomed out, but avoid forcing a tight zoom.
      if (z < 2.2) map.setZoom(2.2);
    } catch {
      // ignore
    }

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

function MapCloseAndOpenPopups({
  selectedLaunchId,
  hasLanding,
  launchMarkerRefs,
  landingMarkerRef,
}) {
  const map = useMap();

  useEffect(() => {
    if (!selectedLaunchId) return;

    // Close any existing open popups first (prevents “competing cards” from clusters + endpoints).
    try {
      map.closePopup();
    } catch {
      // ignore
    }

    const open = () => {
      try {
        const m = launchMarkerRefs.current.get(selectedLaunchId);
        m?.openPopup?.();
      } catch {
        // ignore
      }

      if (hasLanding) {
        try {
          landingMarkerRef.current?.openPopup?.();
        } catch {
          // ignore
        }
      }
    };

    // Defer to ensure markers are mounted.
    setTimeout(open, 0);
    setTimeout(open, 50);
  }, [map, selectedLaunchId, hasLanding, launchMarkerRefs, landingMarkerRef]);

  return null;
}

function MapSelectionFlyTo({ selectedPoint, enabled = true }) {
  const map = useMap();

  useEffect(() => {
    if (!enabled) return;
    if (!selectedPoint) return;
    map.flyTo([selectedPoint.lat, selectedPoint.lon], Math.max(map.getZoom(), 6), {
      duration: 0.8,
    });
  }, [map, selectedPoint, enabled]);

  return null;
}

function formatTimeAgo(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  const abs = Math.abs(seconds);

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  if (abs < 60) return `Updated ${rtf.format(-seconds, 'second')}`;
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return `Updated ${rtf.format(-minutes, 'minute')}`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return `Updated ${rtf.format(-hours, 'hour')}`;
  const days = Math.round(hours / 24);
  return `Updated ${rtf.format(-days, 'day')}`;
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
  const [upcomingOnly, setUpcomingOnly] = useState(false);

  // Applied filter state (drives queries + URL)
  const [aq, setAq] = useState('');
  const [aSelectedStatuses, setASelectedStatuses] = useState([]);
  const [aSelectedLocationIds, setASelectedLocationIds] = useState([]);
  const [aUpcomingOnly, setAUpcomingOnly] = useState(false);

  const [selectedLaunchId, setSelectedLaunchId] = useState(null);

  // Date range (date-only UI; sent as UTC timestamps)
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [aFromDate, setAFromDate] = useState('');
  const [aToDate, setAToDate] = useState('');

  // Landing defaults (Horizon 2 UX): show a mixed list by default so demos aren't empty.
  // Window: past 365 days + next 72 hours.
  const defaultWindow = useMemo(() => {
    const pad2 = (n) => String(n).padStart(2, '0');
    const toDateOnlyUtc = (d) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

    // Anchor on UTC midnight to keep date-only UI consistent.
    const now = new Date();
    const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const from = new Date(anchor);
    from.setUTCDate(from.getUTCDate() - 365);

    const to = new Date(anchor);
    // Date-only UI uses end-of-day when sent to API, so +3 days ~= next 72h.
    to.setUTCDate(to.getUTCDate() + 3);

    return { from: toDateOnlyUtc(from), to: toDateOnlyUtc(to) };
  }, []);

  const [mapResetNonce, setMapResetNonce] = useState(0);

  const todayUtc = utcDateOnly();

  const hasExplicitRange = Boolean(fromDate || toDate);
  const hasExplicitRangeApplied = Boolean(aFromDate || aToDate);

  // Timeline mode detection (used to highlight the segmented control).
  const isTimelineAll = !upcomingOnly && fromDate === defaultWindow.from && toDate === defaultWindow.to;
  const isTimelineUpcoming = Boolean(upcomingOnly) && !fromDate && !toDate;
  const isTimelineHistorical = !upcomingOnly && fromDate === defaultWindow.from && toDate === todayUtc;

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

    // Optional: deep-link to a selected launch (useful for screenshots and sharing)
    const selected0 = sp.get('selected_launch_id') || sp.get('launch_id') || sp.get('selected') || '';

    const hasAnyUrlFilters = Boolean(
      q0 ||
        statuses0.length ||
        locations0.length ||
        upcoming0 !== null ||
        from0 ||
        to0 ||
        // If the querystring has *any* keys, we assume the user meant it.
        // (e.g. ?foo=bar from a redirect)
        Array.from(sp.keys()).length
    );

    // Default landing view (no URL filters): past 365d + next 72h, upcoming-only OFF.
    const fromInit = hasAnyUrlFilters ? from0 : defaultWindow.from;
    const toInit = hasAnyUrlFilters ? to0 : defaultWindow.to;
    const upcomingInit = hasAnyUrlFilters && upcoming0 !== null ? upcoming0 : false;

    setQ(q0);
    setSelectedStatuses(statuses0);
    setSelectedLocationIds(locations0);
    setUpcomingOnly(upcomingInit);
    setFromDate(fromInit);
    setToDate(toInit);

    // Apply immediately from URL deep-link (or defaults)
    setAq(q0);
    setASelectedStatuses(statuses0);
    setASelectedLocationIds(locations0);
    setAUpcomingOnly(upcomingInit);
    setAFromDate(fromInit);
    setAToDate(toInit);

    if (selected0) setSelectedLaunchId(selected0);

    didInitFromUrl.current = true;
  }, [defaultWindow.from, defaultWindow.to]);

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
    api
      .get('api/v1/meta/filters')
      .then((r) => setMeta(r.data))
      .catch((e) => console.error(e));
  }, []);

  // Load overlays (Horizon 2) once
  useEffect(() => {
    // Pull all overlay types so recovery can reference ASDS as well.
    api
      .get('api/v1/overlays', { params: { is_active: true } })
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
  const landingPopupOffset = hasTwoPopups ? [18, -10] : [0, 0];

  // Popup orchestration moved into MapCloseAndOpenPopups (inside MapContainer)

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
      api
        .get('api/v1/launches', { params: queryParams, paramsSerializer: { indexes: null } })
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

  const padCoordById = useMemo(() => {
    const m = new Map();
    for (const p of meta.pads || []) {
      if (p && typeof p.id === 'number' && typeof p.latitude === 'number' && typeof p.longitude === 'number') {
        m.set(p.id, { lat: p.latitude, lon: p.longitude, name: p.name });
      }
    }
    return m;
  }, [meta.pads]);

  const mapPoints = useMemo(() => {
    return launches
      .map((l) => {
        let lat = typeof l.pad_latitude === 'number' ? l.pad_latitude : null;
        let lon = typeof l.pad_longitude === 'number' ? l.pad_longitude : null;

        // Fallback 1: pad_id → meta.pads
        if ((lat === null || lon === null) && typeof l.pad_id === 'number') {
          const c = padCoordById.get(l.pad_id);
          if (c) {
            lat = c.lat;
            lon = c.lon;
          }
        }

        if (lat === null || lon === null) return null;

        return {
          id: l.id,
          mission_name: l.mission_name,
          status: l.status,
          launch_time: l.launch_time,
          pad_name: l.pad_name || l.legacy_pad,
          location_name: l.location_name,
          lat,
          lon,
        };
      })
      .filter(Boolean);
  }, [launches, padCoordById]);

  const mappedCount = mapPoints.length;
  const totalCount = launches.length;

  const mapPointGroups = useMemo(() => {
    // Group by near-identical coordinates to avoid indistinguishable stacks.
    const groups = new Map();
    for (const p of mapPoints) {
      const key = `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
      if (!groups.has(key)) groups.set(key, { key, lat: p.lat, lon: p.lon, points: [] });
      groups.get(key).points.push(p);
    }
    return Array.from(groups.values());
  }, [mapPoints]);


  const selectedPoint = useMemo(() => {
    if (!selectedLaunchId) return null;
    return mapPoints.find((p) => p.id === selectedLaunchId) || null;
  }, [mapPoints, selectedLaunchId]);

  const selectedLaunchPoint = useMemo(() => {
    if (!selectedPoint) return null;
    return { lat: selectedPoint.lat, lon: selectedPoint.lon };
  }, [selectedPoint]);

  const mapCenter = mapPoints.length ? [mapPoints[0].lat, mapPoints[0].lon] : [20, 0];

  const draftFilterCount =
    (q ? 1 : 0) +
    (selectedStatuses.length ? 1 : 0) +
    (selectedLocationIds.length ? 1 : 0) +
    (fromDate ? 1 : 0) +
    (toDate ? 1 : 0) +
    (upcomingOnly ? 1 : 0);

  const activeFilterCount =
    (aq ? 1 : 0) +
    (aSelectedStatuses.length ? 1 : 0) +
    (aSelectedLocationIds.length ? 1 : 0) +
    (aFromDate ? 1 : 0) +
    (aToDate ? 1 : 0) +
    (aUpcomingOnly ? 1 : 0);

  const [filtersCollapsed, setFiltersCollapsed] = useState(false);

  // Tiny UX helper for the mission detail drawer.
  const [copiedMissionId, setCopiedMissionId] = useState(false);

  // Close the mission drawer with ESC (quality-of-life)
  useEffect(() => {
    if (!selectedLaunchId) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setSelectedLaunchId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedLaunchId]);

  const [mapHeight, setMapHeight] = useState(380);
  const [lineDashOffset, setLineDashOffset] = useState(0);

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

  // Subtle dash animation for mission leg (only when endpoints are present)
  useEffect(() => {
    if (!selectedLaunchPoint || !recoveryPoint) return;
    const id = setInterval(() => setLineDashOffset((v) => (v + 1) % 200), 80);
    return () => clearInterval(id);
  }, [selectedLaunchPoint, recoveryPoint]);

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
      <style>{`
        /* Leaflet tile seam/artifact mitigation (esp. during scroll + sticky). */
        .leaflet-container img.leaflet-tile {
          mix-blend-mode: normal !important;
        }
        .leaflet-tile {
          outline: 1px solid transparent;
        }
      `}</style>

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
          marginBottom: 0,
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

          <span className={loading ? 'loading-pulse' : ''} style={{ color: '#58a6ff', fontSize: '0.85rem', fontWeight: loading ? 'bold' : 'normal' }}>{loading ? '● Refreshing…' : ' '}</span>
        </div>

        {!filtersCollapsed && (
          <div
            style={{
              marginTop: '0.75rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1.25rem 1.5rem',
              alignItems: 'end',
              padding: '0.5rem 0',
            }}
          >
          <div style={{ minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#8b949e', marginBottom: '0.4rem' }}>
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

          <div style={{ minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#8b949e', marginBottom: '0.4rem' }}>
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

          <div style={{ minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#8b949e', marginBottom: '0.4rem' }}>
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

          <div style={{ minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#8b949e', marginBottom: '0.4rem' }}>
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

          <div style={{ minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#8b949e', marginBottom: '0.4rem' }}>
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
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ color: '#8b949e', fontSize: '0.8rem' }}>Timeline:</span>

              <button
                type="button"
                onClick={() => {
                  setFromDate(defaultWindow.from);
                  setToDate(defaultWindow.to);
                  setUpcomingOnly(false);
                }}
                style={{
                  padding: '0.35rem 0.6rem',
                  borderRadius: 999,
                  border: isTimelineAll ? '1px solid #58a6ff' : '1px solid #30363d',
                  background: isTimelineAll ? 'rgba(88, 166, 255, 0.12)' : '#0b0e14',
                  color: isTimelineAll ? '#58a6ff' : '#c9d1d9',
                  cursor: 'pointer',
                  fontWeight: isTimelineAll ? 'bold' : 'normal',
                }}
              >
                All
              </button>

              <button
                type="button"
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                  setUpcomingOnly(true);
                }}
                style={{
                  padding: '0.35rem 0.6rem',
                  borderRadius: 999,
                  border: isTimelineUpcoming ? '1px solid #58a6ff' : '1px solid #30363d',
                  background: isTimelineUpcoming ? 'rgba(88, 166, 255, 0.12)' : '#0b0e14',
                  color: isTimelineUpcoming ? '#58a6ff' : '#c9d1d9',
                  cursor: 'pointer',
                  fontWeight: isTimelineUpcoming ? 'bold' : 'normal',
                }}
              >
                Upcoming
              </button>

              <button
                type="button"
                onClick={() => {
                  setFromDate(defaultWindow.from);
                  setToDate(todayUtc);
                  setUpcomingOnly(false);
                }}
                style={{
                  padding: '0.35rem 0.6rem',
                  borderRadius: 999,
                  border: isTimelineHistorical ? '1px solid #58a6ff' : '1px solid #30363d',
                  background: isTimelineHistorical ? 'rgba(88, 166, 255, 0.12)' : '#0b0e14',
                  color: isTimelineHistorical ? '#58a6ff' : '#c9d1d9',
                  cursor: 'pointer',
                  fontWeight: isTimelineHistorical ? 'bold' : 'normal',
                }}
              >
                Historical
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ color: '#8b949e', fontSize: '0.8rem' }}>Presets:</span>

              <button
                type="button"
                onClick={() => {
                  setFromDate(utcDateOnly(addDaysUtc(new Date(), -30)));
                  setToDate(todayUtc);
                  setUpcomingOnly(false);
                }}
                style={{
                  padding: '0.35rem 0.6rem',
                  borderRadius: 999,
                  border: '1px solid #30363d',
                  background: '#0b0e14',
                  color: '#c9d1d9',
                  cursor: 'pointer',
                }}
              >
                Last 30d
              </button>

              <button
                type="button"
                onClick={() => {
                  setFromDate(todayUtc);
                  setToDate(utcDateOnly(addDaysUtc(new Date(), 7)));
                  setUpcomingOnly(false);
                }}
                style={{
                  padding: '0.35rem 0.6rem',
                  borderRadius: 999,
                  border: '1px solid #30363d',
                  background: '#0b0e14',
                  color: '#c9d1d9',
                  cursor: 'pointer',
                }}
              >
                Next 7d
              </button>

              <button
                type="button"
                onClick={() => {
                  const y = new Date().getUTCFullYear();
                  setFromDate(`${y}-01-01`);
                  setToDate(`${y}-12-31`);
                  setUpcomingOnly(false);
                }}
                style={{
                  padding: '0.35rem 0.6rem',
                  borderRadius: 999,
                  border: '1px solid #30363d',
                  background: '#0b0e14',
                  color: '#c9d1d9',
                  cursor: 'pointer',
                }}
              >
                This year
              </button>

              <button
                type="button"
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                  setUpcomingOnly(false);
                }}
                style={{
                  padding: '0.35rem 0.6rem',
                  borderRadius: 999,
                  border: '1px solid #30363d',
                  background: '#0b0e14',
                  color: '#c9d1d9',
                  cursor: 'pointer',
                }}
              >
                All time
              </button>
            </div>

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
              Apply{draftFilterCount ? ` (${draftFilterCount})` : ''}
            </button>

            <button
              type="button"
              onClick={() => {
                // Reset to the default landing view (mixed list): past 365d + next 72h.
                setQ('');
                setSelectedStatuses([]);
                setSelectedLocationIds([]);
                setFromDate(defaultWindow.from);
                setToDate(defaultWindow.to);
                setUpcomingOnly(false);

                // Reset applied filters too
                setAq('');
                setASelectedStatuses([]);
                setASelectedLocationIds([]);
                setAFromDate(defaultWindow.from);
                setAToDate(defaultWindow.to);
                setAUpcomingOnly(false);

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
          // Non-sticky for a seamless, unified scroll experience (no overlap/bleed).
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #30363d', color: '#8b949e', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <span>Map (OpenStreetMap)</span>
          <span style={{ fontSize: '0.8rem', color: '#8b949e' }}>
            Mapped: <span style={{ color: '#c9d1d9', fontWeight: 'bold' }}>{mappedCount}</span> / {totalCount}
            {totalCount > mappedCount ? (
              <span style={{ marginLeft: 8 }}>(missing coords: {totalCount - mappedCount})</span>
            ) : null}
          </span>
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
                    border: '2px solid #2f81f7',
                    background: 'rgba(47,129,247,0.55)',
                  }}
                />
                <span>Launch Pad</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 12,
                    height: 12,
                    borderRadius: 999,
                    border: '2px dashed #ff9800',
                    background: 'rgba(255,152,0,0.40)',
                  }}
                />
                <span>Landing Site (LZ/ASDS)</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 16,
                    height: 0,
                    borderTop: '3px dashed #ff9800',
                    opacity: 0.9,
                  }}
                />
                <span>Mission leg (pad → landing)</span>
              </div>
            </div>
          )}

          <MapContainer center={mapCenter} zoom={mapPoints.length ? 4 : 2} style={{ height: '100%', width: '100%', background: '#161b22' }}>
            <MapFitBounds points={mapPoints} enabled={!loading && !selectedLaunchId} resetNonce={mapResetNonce} />
            <MapFitSelectedEndpoints launchPoint={selectedLaunchPoint} recoveryPoint={recoveryPoint} />
            <MapSelectionFlyTo selectedPoint={selectedPoint} enabled={!recoveryPoint} />
            <MapCloseAndOpenPopups
              selectedLaunchId={selectedLaunchId}
              hasLanding={Boolean(selectedRecoveryOverlay)}
              launchMarkerRefs={launchMarkerRefs}
              landingMarkerRef={landingMarkerRef}
            />
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url='https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
              subdomains='abcd'
              maxZoom={20}
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
                      radius={11}
                      pathOptions={{
                        color: '#ff9800',
                        weight: 4,
                        fillColor: '#ff9800',
                        fillOpacity: 0.5,
                        dashArray: '4 4',
                      }}
                      ref={landingMarkerRef}
                    >
                      <Tooltip direction="top" offset={[0, -10]} opacity={0.95}>
                        Landing Site: {o.name}
                      </Tooltip>
                      <Popup offset={landingPopupOffset} maxWidth={300} minWidth={200}>
                        <div style={{ maxWidth: 300 }}>
                          <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Landing Site</div>
                          <div style={{ color: '#fff', marginBottom: 6 }}>{o.name}</div>
                          <div style={{ color: '#8b949e', fontSize: '0.85rem' }}>
                            Type: {o.overlay_type === 'asds' ? 'ASDS (drone ship)' : 'Landing Zone'}
                          </div>
                          {o.properties?.abbrev && (
                            <div style={{ color: '#8b949e', fontSize: '0.85rem' }}>Abbrev: {o.properties.abbrev}</div>
                          )}
                          {o.properties?.ocean && (
                            <div style={{ color: '#8b949e', fontSize: '0.85rem' }}>Ocean: {o.properties.ocean}</div>
                          )}
                          {o.properties?.site && (
                            <div style={{ color: '#8b949e', fontSize: '0.85rem' }}>Site: {o.properties.site}</div>
                          )}
                          {o.properties?.operator && (
                            <div style={{ color: '#8b949e', fontSize: '0.85rem' }}>Operator: {o.properties.operator}</div>
                          )}
                          {!o.properties?.abbrev && !o.properties?.ocean && !o.properties?.site && !o.properties?.operator && (
                            <div style={{ color: '#8b949e', fontSize: '0.85rem' }}>Details not provided yet</div>
                          )}
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })()}
              </>
            )}

            {/* Selected endpoints line (pad → recovery) */}
            {selectedLaunchPoint && recoveryPoint && selectedLaunch && (
              <Polyline
                positions={[
                  [selectedLaunchPoint.lat, selectedLaunchPoint.lon],
                  [recoveryPoint.lat, recoveryPoint.lon],
                ]}
                pathOptions={{
                  color: '#ff9800',
                  weight: 3,
                  opacity: 0.9,
                  dashArray: '6 6',
                  dashOffset: String(lineDashOffset),
                }}
              >
                <Tooltip sticky opacity={0.95}>
                  {prettyRecoveryMethod(selectedLaunch.recovery_method) || (selectedRecoveryOverlay?.overlay_type === 'asds' ? 'Drone ship (ASDS)' : 'Return to launch site (RTLS)')}
                </Tooltip>
              </Polyline>
            )}

            {mapPointGroups.map((g) => {
              const count = g.points.length;

              if (count === 1) {
                const p = g.points[0];
                return (
                  <CircleMarker
                    key={p.id}
                    center={[p.lat, p.lon]}
                    radius={7}
                    pathOptions={{
                      color: p.id === selectedLaunchId ? '#58a6ff' : '#2f81f7',
                      weight: p.id === selectedLaunchId ? 3 : selectedLaunchId ? 1 : 2,
                      fillColor: p.id === selectedLaunchId ? '#58a6ff' : '#2f81f7',
                      fillOpacity: selectedLaunchId && p.id !== selectedLaunchId ? 0.06 : 0.60,
                    }}
                    eventHandlers={{
                      click: () => setSelectedLaunchId(p.id),
                    }}
                    ref={(ref) => {
                      if (ref) launchMarkerRefs.current.set(p.id, ref);
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -8]} opacity={0.9}>
                      Launch Pad: {p.pad_name || p.location_name || 'Unknown'}
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
                        <div style={{ color: '#8b949e', fontSize: '0.85rem' }}>
                          Launch Pad: {p.pad_name || p.location_name || 'Unknown'}
                        </div>
                        <div style={{ color: '#8b949e', fontSize: '0.85rem' }}>{p.location_name || ''}</div>
                        <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: '0.85rem' }}>
                          {p.launch_time ? new Date(p.launch_time).toLocaleString() : 'TBD'}
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              }

              // Cluster marker for overlapping launches.
              return (
                <CircleMarker
                  key={g.key}
                  center={[g.lat, g.lon]}
                  radius={12}
                  pathOptions={{
                    color: '#2f81f7',
                    weight: 2,
                    fillColor: '#2f81f7',
                    fillOpacity: 0.75,
                  }}
                >
                  <Tooltip direction="top" offset={[0, -10]} opacity={0.95}>
                    {count} launches at this pad
                  </Tooltip>
                  <Popup maxWidth={340} minWidth={220}>
                    <div style={{ maxWidth: 320 }}>
                      <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Launches at this pad ({count})</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {g.points
                          .slice()
                          .sort((a, b) => String(a.launch_time || '').localeCompare(String(b.launch_time || '')))
                          .map((p) => (
                            <button
                              key={`pick-${p.id}`}
                              type="button"
                              onClick={() => setSelectedLaunchId(p.id)}
                              style={{
                                textAlign: 'left',
                                padding: '0.35rem 0.5rem',
                                borderRadius: 6,
                                border: '1px solid #30363d',
                                background: '#0b0e14',
                                color: '#c9d1d9',
                                cursor: 'pointer',
                              }}
                            >
                              <div style={{ fontWeight: 'bold', color: '#58a6ff' }}>{p.mission_name || 'Unknown mission'}</div>
                              <div style={{ fontSize: '0.85rem', color: '#8b949e' }}>
                                {p.launch_time ? new Date(p.launch_time).toLocaleString() : 'TBD'} · {p.status || 'Unknown'}
                              </div>
                            </button>
                          ))}
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>
      </section>


      {/* Mission drilldown drawer (Horizon 2) */}
      {selectedLaunchId && (
        <>
          {/* Backdrop for small screens */}
          {window.innerWidth <= 900 && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => setSelectedLaunchId(null)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') setSelectedLaunchId(null);
              }}
              aria-label="Close mission details"
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 50,
                background: 'rgba(0,0,0,0.55)',
              }}
            />
          )}

          <aside
            aria-label="Mission details"
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              height: '100vh',
              width: 'min(420px, 92vw)',
              zIndex: 60,
              background: '#0b0e14',
              borderLeft: '1px solid #30363d',
              boxShadow: '-10px 0 30px rgba(0,0,0,0.55)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ padding: '1.1rem 1.1rem 0.9rem', borderBottom: '1px solid #30363d' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', letterSpacing: '0.12em', color: '#8b949e', textTransform: 'uppercase' }}>
                    Mission Details
                  </div>
                  <div style={{ marginTop: 6, fontSize: '1.15rem', fontWeight: 'bold', color: '#fff' }}>
                    {selectedLaunch?.mission_name || 'Unknown mission'}
                  </div>
                  {selectedLaunch?.rocket_name && (
                    <div style={{ marginTop: 4, fontSize: '0.9rem', color: '#58a6ff', fontStyle: 'italic' }}>
                      {selectedLaunch.rocket_name}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedLaunchId(null)}
                  style={{
                    padding: '0.35rem 0.55rem',
                    borderRadius: 8,
                    border: '1px solid #30363d',
                    background: '#161b22',
                    color: '#c9d1d9',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  ✕
                </button>
              </div>

              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span
                  style={{
                    backgroundColor: statusColor(selectedLaunch?.status),
                    color: '#fff',
                    padding: '0.25rem 0.6rem',
                    borderRadius: 6,
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                  }}
                >
                  {selectedLaunch?.status || 'Unknown'}
                </span>
                <Countdown targetDate={selectedLaunch?.launch_time} />
              </div>

              <div style={{ marginTop: 10, color: '#8b949e', fontSize: '0.9rem' }}>
                NET: <span style={{ color: '#c9d1d9' }}>{selectedLaunch?.launch_time ? new Date(selectedLaunch.launch_time).toLocaleString() : 'TBD'}</span>
              </div>

              <div style={{ marginTop: 6, color: '#8b949e', fontSize: '0.85rem' }}>
                {formatTimeAgo(selectedLaunch?.last_updated) || 'Updated time not available'}
              </div>
            </div>

            <div style={{ padding: '1.0rem 1.1rem', overflowY: 'auto' }}>
              {/* Watch link */}
              {(() => {
                const watchUrl =
                  (Array.isArray(selectedLaunch?.vid_urls) && selectedLaunch.vid_urls.length ? selectedLaunch.vid_urls[0] : null) ||
                  selectedLaunch?.watch_url ||
                  selectedLaunch?.watch_link ||
                  selectedLaunch?.webcast_url ||
                  selectedLaunch?.webcast ||
                  null;

                const isAvailable = Boolean(watchUrl);
                return (
                  <div style={{ marginBottom: '1.25rem' }}>
                    <div style={{ fontSize: '0.8rem', color: '#8b949e', marginBottom: 6 }}>Watch</div>
                    {isAvailable ? (
                      <a
                        href={watchUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'inline-block',
                          padding: '0.55rem 0.8rem',
                          borderRadius: 8,
                          border: '1px solid #58a6ff',
                          background: 'rgba(88, 166, 255, 0.12)',
                          color: '#58a6ff',
                          textDecoration: 'none',
                          fontWeight: 'bold',
                        }}
                      >
                        Open live stream
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        title="No watch link provided by the API yet"
                        style={{
                          padding: '0.55rem 0.8rem',
                          borderRadius: 8,
                          border: '1px solid #30363d',
                          background: '#161b22',
                          color: '#8b949e',
                          cursor: 'not-allowed',
                          fontWeight: 'bold',
                        }}
                      >
                        Watch link not available
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Tools */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.8rem', color: '#8b949e', marginBottom: 6 }}>Tools</div>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const id = selectedLaunch?.id;
                        if (!id) return;
                        await navigator.clipboard.writeText(String(id));
                        setCopiedMissionId(true);
                        window.setTimeout(() => setCopiedMissionId(false), 1200);
                      } catch {
                        // ignore
                      }
                    }}
                    style={{
                      padding: '0.55rem 0.8rem',
                      borderRadius: 8,
                      border: '1px solid #30363d',
                      background: '#161b22',
                      color: '#c9d1d9',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                    }}
                  >
                    Copy Mission ID
                  </button>

                  {copiedMissionId && <span style={{ color: '#7ee787', fontSize: '0.85rem' }}>Copied</span>}
                </div>
              </div>

              {/* Recovery details */}
              <div style={{ marginBottom: '1.0rem' }}>
                <div style={{ fontSize: '0.8rem', color: '#8b949e', marginBottom: 8 }}>Recovery</div>

                {selectedLaunch?.recovery_attempted === null || selectedLaunch?.recovery_attempted === undefined ? (
                  <div style={{ color: '#8b949e' }}>Recovery details not provided yet.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
                    <div>
                      <span style={{ color: '#8b949e' }}>Attempted: </span>
                      <span style={{ color: '#c9d1d9', fontWeight: 'bold' }}>{selectedLaunch.recovery_attempted ? 'Yes' : 'No'}</span>
                    </div>

                    {selectedLaunch.recovery_attempted && (
                      <div>
                        <span style={{ color: '#8b949e' }}>Success: </span>
                        <span style={{ color: '#c9d1d9', fontWeight: 'bold' }}>
                          {selectedLaunch.recovery_success === true ? 'Yes' : selectedLaunch.recovery_success === false ? 'No' : 'Unknown'}
                        </span>
                      </div>
                    )}

                    <div>
                      <span style={{ color: '#8b949e' }}>Landing: </span>
                      <span style={{ color: '#c9d1d9' }}>{prettyRecoveryMethod(selectedLaunch?.recovery_method) || '—'}</span>
                    </div>

                    <div>
                      <span style={{ color: '#8b949e' }}>Provider: </span>
                      <span style={{ color: '#c9d1d9' }}>{selectedLaunch?.recovery_provider || '—'}</span>
                    </div>

                    <div>
                      <span style={{ color: '#8b949e' }}>Overlay: </span>
                      <span style={{ color: '#c9d1d9' }}>{selectedRecoveryOverlay?.name || (selectedLaunch?.recovery_overlay_id ? 'Unknown overlay' : '—')}</span>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ marginTop: '1.0rem', paddingTop: '1.0rem', borderTop: '1px solid #30363d', color: '#8b949e', fontSize: '0.8rem' }}>
                Pad: <span style={{ color: '#c9d1d9' }}>{selectedLaunch?.pad_name || selectedLaunch?.legacy_pad || 'TBD'}</span>
                <div style={{ marginTop: 4 }}>
                  Location: <span style={{ color: '#c9d1d9' }}>{selectedLaunch?.location_name || 'TBD'}</span>
                </div>
              </div>
            </div>
          </aside>
        </>
      )}

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
            className="launch-card"
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

              <h2 style={{ fontSize: '1.15rem', margin: '0.85rem 0 0.25rem', color: '#58a6ff' }}>
                {l.mission_name || 'Unknown Mission'}
              </h2>
              {l.rocket_name && (
                <div style={{ fontSize: '0.85rem', color: '#8b949e', marginBottom: '0.5rem', fontStyle: 'italic' }}>
                  {l.rocket_name}
                </div>
              )}

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
                  {(l.recovery_method || l.recovery_provider) && (
                    <div style={{ marginTop: 4, color: '#8b949e', fontSize: '0.85rem' }}>
                      {l.recovery_method ? `Landing: ${prettyRecoveryMethod(l.recovery_method)}` : ''}
                      {l.recovery_method && l.recovery_provider ? ' · ' : ''}
                      {l.recovery_provider ? `Source: ${l.recovery_provider}` : ''}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #30363d', fontSize: '0.85rem', color: '#8b949e' }}>
              <div>{l.launch_time ? new Date(l.launch_time).toLocaleString() : 'Time TBD'}</div>
              {formatTimeAgo(l.last_updated) && (
                <div style={{ marginTop: 4, fontSize: '0.8rem', color: '#6e7681' }}>{formatTimeAgo(l.last_updated)}</div>
              )}
            </div>
          </div>
        ))}

        {!loading && launches.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3.5rem 2rem', color: '#8b949e' }}>
            <div style={{ fontSize: '1.05rem', color: '#c9d1d9', marginBottom: '0.5rem' }}>No launches match these filters.</div>
            <div style={{ marginBottom: '1.25rem' }}>Try one of these quick options:</div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  // Default window: past 365d + next 72h (upcoming-only OFF)
                  setFromDate(defaultWindow.from);
                  setToDate(defaultWindow.to);
                  setUpcomingOnly(false);

                  setAFromDate(defaultWindow.from);
                  setAToDate(defaultWindow.to);
                  setAUpcomingOnly(false);

                  setSelectedLaunchId(null);
                  setMapResetNonce((n) => n + 1);
                }}
                style={{
                  padding: '0.5rem 0.8rem',
                  borderRadius: 6,
                  border: '1px solid #58a6ff',
                  background: 'rgba(88, 166, 255, 0.1)',
                  color: '#58a6ff',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                }}
              >
                Show last 365d + next 72h
              </button>

              <button
                type="button"
                onClick={() => {
                  // Upcoming-only view (clear explicit range)
                  setFromDate('');
                  setToDate('');
                  setUpcomingOnly(true);

                  setAFromDate('');
                  setAToDate('');
                  setAUpcomingOnly(true);

                  setSelectedLaunchId(null);
                  setMapResetNonce((n) => n + 1);
                }}
                style={{
                  padding: '0.5rem 0.8rem',
                  borderRadius: 6,
                  border: '1px solid #30363d',
                  background: '#0b0e14',
                  color: '#c9d1d9',
                  cursor: 'pointer',
                }}
              >
                Upcoming only
              </button>

              <button
                type="button"
                onClick={() => {
                  // Broadest view: clear dates + upcoming; keep other filters as-is.
                  setFromDate('');
                  setToDate('');
                  setUpcomingOnly(false);

                  setAFromDate('');
                  setAToDate('');
                  setAUpcomingOnly(false);

                  setSelectedLaunchId(null);
                  setMapResetNonce((n) => n + 1);
                }}
                style={{
                  padding: '0.5rem 0.8rem',
                  borderRadius: 6,
                  border: '1px solid #30363d',
                  background: '#0b0e14',
                  color: '#c9d1d9',
                  cursor: 'pointer',
                }}
              >
                Clear date window
              </button>
            </div>
          </div>
        )}

        {loading && launches.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#8b949e' }}>
            <div className="loading-pulse" style={{ fontSize: '1.1rem', color: '#58a6ff', marginBottom: '0.5rem' }}>● Loading missions…</div>
            <div style={{ fontSize: '0.85rem' }}>Fetching data from the API</div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer style={{
        marginTop: '3rem',
        paddingTop: '1.5rem',
        borderTop: '1px solid #2d333b',
        textAlign: 'center',
        color: '#484f58',
        fontSize: '0.8rem',
      }}>
        <div>Earth to Orbit Monitoring Dashboard</div>
        <div style={{ marginTop: '0.35rem' }}>
          Data sourced from{' '}
          <a href="https://thespacedevs.com/" target="_blank" rel="noreferrer" style={{ color: '#58a6ff', textDecoration: 'none' }}>
            The Space Devs
          </a>
          {' · '}
          Map tiles by{' '}
          <a href="https://carto.com/" target="_blank" rel="noreferrer" style={{ color: '#58a6ff', textDecoration: 'none' }}>
            CARTO
          </a>
        </div>
      </footer>
    </div>
  );
}
import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
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

function MapFitBounds({ points, enabled }) {
  const map = useMap();
  const lastBoundsRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    if (!points.length) return;

    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon]));

    const prev = lastBoundsRef.current;
    if (prev) {
      // Only re-fit if bounds materially change (prevents snapping due to polling refreshes).
      const a = prev.toBBoxString();
      const b = bounds.toBBoxString();
      if (a === b) return;
    }

    map.fitBounds(bounds, { padding: [20, 20], maxZoom: 7 });
    lastBoundsRef.current = bounds;
  }, [map, points, enabled]);

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
  const [launches, setLaunches] = useState([]);
  const [loading, setLoading] = useState(false);

  const [meta, setMeta] = useState({ statuses: [], locations: [], pads: [] });

  // Filters (server-side)
  const [q, setQ] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [selectedLocationIds, setSelectedLocationIds] = useState([]);
  const [upcomingOnly, setUpcomingOnly] = useState(true);

  const [selectedLaunchId, setSelectedLaunchId] = useState(null);

  // Date range (date-only UI; sent as UTC timestamps)
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const hasExplicitRange = Boolean(fromDate || toDate);

  const didInitFromUrl = useRef(false);

  const queryParams = useMemo(() => {
    const params = {};
    if (q.trim()) params.q = q.trim();
    if (selectedStatuses.length) params.status = selectedStatuses;
    if (selectedLocationIds.length) params.location_id = selectedLocationIds;

    const fromIso = toUtcIsoFromDateOnly(fromDate, { endOfDay: false });
    const toIso = toUtcIsoFromDateOnly(toDate, { endOfDay: true });
    if (fromIso) params.from_time = fromIso;
    if (toIso) params.to_time = toIso;

    // Upcoming-only makes sense only when no explicit date-range is set.
    const hasExplicitRangeIso = Boolean(fromIso || toIso);
    if (upcomingOnly && !hasExplicitRangeIso) params.upcoming = true;

    params.limit = 200;
    params.offset = 0;
    params.sort = upcomingOnly && !hasExplicitRangeIso ? 'net_asc' : 'net_desc';
    return params;
  }, [q, selectedStatuses, selectedLocationIds, upcomingOnly, fromDate, toDate]);

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

    didInitFromUrl.current = true;
  }, []);

  // If a date-range is set, force upcomingOnly off so the UI matches behavior.
  useEffect(() => {
    if (hasExplicitRange && upcomingOnly) setUpcomingOnly(false);
  }, [hasExplicitRange, upcomingOnly]);

  // Keep URL updated with current filter state
  useEffect(() => {
    if (!didInitFromUrl.current) return;

    const sp = new URLSearchParams();

    if (q.trim()) sp.set('q', q.trim());
    selectedStatuses.forEach((s) => sp.append('status', s));
    selectedLocationIds.forEach((id) => sp.append('location_id', String(id)));

    if (fromDate) sp.set('from', fromDate);
    if (toDate) sp.set('to', toDate);

    // Only set upcoming=false explicitly; otherwise omit to keep URLs clean.
    if (upcomingOnly === false) sp.set('upcoming', 'false');

    const qs = sp.toString();
    const nextUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', nextUrl);
  }, [q, selectedStatuses, selectedLocationIds, upcomingOnly, fromDate, toDate]);

  // Load filter metadata once
  useEffect(() => {
    axios
      .get('/api/v1/meta/filters')
      .then((r) => setMeta(r.data))
      .catch((e) => console.error(e));
  }, []);

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

  const mapCenter = mapPoints.length ? [mapPoints[0].lat, mapPoints[0].lon] : [20, 0];

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
      <header style={{ marginBottom: '1.5rem', borderBottom: '1px solid #2d333b', paddingBottom: '1rem' }}>
        <h1 style={{ margin: 0, color: '#fff', letterSpacing: '1px' }}>EARTH TO ORBIT</h1>
        <p style={{ margin: '0.5rem 0 0', color: '#8b949e' }}>Mission Control Monitoring Dashboard</p>

        <div
          style={{
            marginTop: '1rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.75rem',
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

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', paddingBottom: '0.2rem' }}>
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
                setQ('');
                setSelectedStatuses([]);
                setSelectedLocationIds([]);
                setFromDate('');
                setToDate('');
                setUpcomingOnly(true);
                setSelectedLaunchId(null);
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
            <span style={{ color: '#8b949e', fontSize: '0.85rem' }}>{loading ? 'Refreshing…' : ' '}</span>
          </div>
        </div>
      </header>

      {/* Sticky-top map + normal page scroll (mobile-safe) */}
      <section
        style={{
          backgroundColor: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 8,
          overflow: 'hidden',
          marginBottom: '1.5rem',
          position: 'sticky',
          top: 0,
          zIndex: 5,
        }}
      >
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #30363d', color: '#8b949e' }}>
          Map (OpenStreetMap)
        </div>
        <div style={{ height: 380 }}>
          <MapContainer center={mapCenter} zoom={mapPoints.length ? 4 : 2} style={{ height: '100%', width: '100%' }}>
            <MapFitBounds points={mapPoints} enabled={!loading} />
            <MapSelectionFlyTo selectedPoint={selectedPoint} />
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
            />
            {mapPoints.map((p) => (
              <Marker key={p.id} position={[p.lat, p.lon]}>
                <Popup>
                  <div style={{ minWidth: 220 }}>
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
                    <div style={{ color: '#8b949e', fontSize: '0.85rem' }}>{p.pad_name || ''}</div>
                    <div style={{ color: '#8b949e', fontSize: '0.85rem' }}>{p.location_name || ''}</div>
                    <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {p.launch_time ? new Date(p.launch_time).toLocaleString() : 'TBD'}
                    </div>
                  </div>
                </Popup>
              </Marker>
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
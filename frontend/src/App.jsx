import React, { useEffect, useState } from "react";
import axios from "axios";

export default function App() {
  const [launches, setLaunches] = useState([]);
  useEffect(() => {
    axios
      .get("/api/v1/launches")
      .then((r) => setLaunches(r.data))
      .catch((e) => console.error(e));
  }, []);
  return (
    <div style={{ padding: "1rem", fontFamily: "sans-serif" }}>
      <h1>Rocket Launch Dashboard (MVP)</h1>
      <p>List of launches (sample)</p>
      <ul>
        {launches.map((l) => (
          <li key={l.id}>
            <strong>{l.mission_name || "—"}</strong> — {l.rocket_name || "—"} @ {l.location_name || "—"} ({l.launch_time})
          </li>
        ))}
      </ul>
    </div>
  );
}

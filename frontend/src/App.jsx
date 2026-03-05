import React, { useEffect, useState } from "react";
import axios from "axios";

// Helper for status color coding
const getStatusColor = (status) => {
  if (!status) return "#888";
  const s = status.toLowerCase();
  if (s.includes("success") || s.includes("go for launch")) return "#4caf50"; // Green
  if (s.includes("failure") || s.includes("partial failure")) return "#f44336"; // Red
  if (s.includes("hold") || s.includes("scrubbed") || s.includes("tbc") || s.includes("to be confirmed")) return "#ff9800"; // Orange/Yellow
  return "#2196f3"; // Blue for TBD, Scheduled, etc.
};

// Countdown Timer Component
const Countdown = ({ targetDate }) => {
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    if (!targetDate) return;

    const calculateTime = () => {
      const now = new Date().getTime();
      const target = new Date(targetDate).getTime();
      const difference = target - now;

      if (difference > 0) {
        const d = Math.floor(difference / (1000 * 60 * 60 * 24));
        const h = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((difference % (1000 * 60)) / 1000);
        
        const hStr = h.toString().padStart(2, "0");
        const mStr = m.toString().padStart(2, "0");
        const sStr = s.toString().padStart(2, "0");

        return {
          text: `T- ${d > 0 ? d + "d " : ""}${hStr}:${mStr}:${sStr}`,
          isUrgent: difference < 3600000, // < 1 hour
          isPast: false
        };
      } else {
        const ago = Math.abs(difference);
        const d = Math.floor(ago / (1000 * 60 * 60 * 24));
        if (d > 0) return { text: `T+ ${d}d ago`, isUrgent: false, isPast: true };
        return { text: "IN FLIGHT / RECENT", isUrgent: false, isPast: true };
      }
    };

    const timer = setInterval(() => {
      setTimeLeft(calculateTime());
    }, 1000);

    setTimeLeft(calculateTime());
    return () => clearInterval(timer);
  }, [targetDate]);

  if (!targetDate) return <span style={{ color: "#888" }}>TBD</span>;
  if (!timeLeft) return null;

  return (
    <span style={{ 
      color: timeLeft.isUrgent ? "#f44336" : (timeLeft.isPast ? "#888" : "#fff"),
      fontWeight: "bold",
      fontFamily: "monospace",
      fontSize: "1.1rem"
    }}>
      {timeLeft.text}
    </span>
  );
};

export default function App() {
  const [launches, setLaunches] = useState([]);

  useEffect(() => {
    const fetchLaunches = () => {
      axios
        .get("/api/v1/launches")
        .then((r) => setLaunches(r.data))
        .catch((e) => console.error(e));
    };

    fetchLaunches();
    const interval = setInterval(fetchLaunches, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ 
      padding: "2rem", 
      fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      backgroundColor: "#0b0e14",
      color: "#e0e0e0",
      minHeight: "100vh"
    }}>
      <header style={{ marginBottom: "2rem", borderBottom: "1px solid #2d333b", paddingBottom: "1rem" }}>
        <h1 style={{ margin: 0, color: "#fff", letterSpacing: "1px" }}>EARTH TO ORBIT</h1>
        <p style={{ margin: "0.5rem 0 0", color: "#8b949e" }}>Mission Control Monitoring Dashboard</p>
      </header>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        gap: "1.5rem"
      }}>
        {launches.map((l) => (
          <div key={l.id} style={{
            backgroundColor: "#161b22",
            borderRadius: "8px",
            padding: "1.5rem",
            border: "1px solid #30363d",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            transition: "transform 0.2s",
            boxShadow: "0 4px 6px rgba(0,0,0,0.3)"
          }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                <span style={{
                  backgroundColor: getStatusColor(l.status),
                  color: "#fff",
                  padding: "0.25rem 0.6rem",
                  borderRadius: "4px",
                  fontSize: "0.75rem",
                  fontWeight: "bold",
                  textTransform: "uppercase"
                }}>
                  {l.status || "Unknown"}
                </span>
                <Countdown targetDate={l.launch_time} />
              </div>

              <h2 style={{ fontSize: "1.25rem", margin: "0 0 0.5rem", color: "#58a6ff" }}>
                {l.mission_name || "Unknown Mission"}
              </h2>
              
              <div style={{ marginBottom: "0.5rem" }}>
                <span style={{ color: "#8b949e", fontSize: "0.9rem" }}>Rocket: </span>
                <span style={{ color: "#c9d1d9" }}>{l.rocket_name || "Unknown"}</span>
              </div>

              <div>
                <span style={{ color: "#8b949e", fontSize: "0.9rem" }}>Location: </span>
                <span style={{ color: "#c9d1d9" }}>{l.location_name || "TBD"}</span>
              </div>
            </div>

            <div style={{ marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid #30363d", fontSize: "0.85rem", color: "#8b949e" }}>
              {l.launch_time ? new Date(l.launch_time).toLocaleString() : "Time TBD"}
            </div>
          </div>
        ))}
      </div>
      
      {launches.length === 0 && (
        <div style={{ textAlign: "center", padding: "4rem", color: "#8b949e" }}>
          Loading launch data...
        </div>
      )}
    </div>
  );
}

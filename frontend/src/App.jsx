import React, { useState, useEffect } from "react";
import Map3D from "./Map3D";
import Sidebar from "./Sidebar";
import { fetchBuildings } from "./api";

export default function App() {
  const [buildings, setBuildings] = useState([]);
  const [highlightedIds, setHighlightedIds] = useState([]);
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetchBuildings().then(data => {
      setBuildings(data);
      setLoading(false);
    });
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw" }}>
      {/* 3D Map takes most of screen */}
      <div style={{ flex: 1, position: "relative" }}>
        {loading && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            background: "#0a0a1a", zIndex: 10, flexDirection: "column", gap: 16
          }}>
            <div style={{ fontSize: 48 }}>🏙️</div>
            <div style={{ fontSize: 18, color: "#60a5fa" }}>Loading Calgary...</div>
            <div style={{ color: "#666" }}>Fetching 573 buildings</div>
          </div>
        )}
        <Map3D
          buildings={buildings}
          highlightedIds={highlightedIds}
          onSelectBuilding={setSelectedBuilding}
        />

        {/* Building popup */}
        {selectedBuilding && (
          <div style={{
            position: "absolute", bottom: 24, left: 24,
            background: "rgba(15,23,42,0.95)", border: "1px solid #334155",
            borderRadius: 12, padding: 20, minWidth: 280,
            backdropFilter: "blur(10px)", zIndex: 100
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: "#60a5fa" }}>
                {selectedBuilding.name}
              </span>
              <button onClick={() => setSelectedBuilding(null)}
                style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 18 }}>✕</button>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {[
                ["📍 Address", `${selectedBuilding.housenumber} ${selectedBuilding.address}`],
                ["📏 Height", `${selectedBuilding.height}m (${selectedBuilding.height_feet} ft)`],
                ["🏢 Floors", selectedBuilding.levels],
                ["🗂️ Zoning", selectedBuilding.zoning],
                ["🔖 Zone Code", selectedBuilding.zoning_code || "N/A"],
                ["💰 Assessed Value", selectedBuilding.assessed_value
                  ? `$${Number(selectedBuilding.assessed_value).toLocaleString()}`
                  : "N/A"],
              ].map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <span style={{ color: "#94a3b8", fontSize: 13 }}>{label}</span>
                  <span style={{ color: "#f1f5f9", fontSize: 13, fontWeight: 500 }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter badge */}
        {highlightedIds.length > 0 && (
          <div style={{
            position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
            background: "rgba(234,179,8,0.2)", border: "1px solid #eab308",
            borderRadius: 20, padding: "6px 16px", color: "#eab308", fontSize: 13
          }}>
            ✨ {highlightedIds.length} buildings highlighted
            <button onClick={() => setHighlightedIds([])}
              style={{ marginLeft: 10, background: "none", border: "none", color: "#eab308", cursor: "pointer" }}>
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <Sidebar
        buildings={buildings}
        onHighlight={setHighlightedIds}
        activeFilter={activeFilter}
        setActiveFilter={setActiveFilter}
        user={user}
        setUser={setUser}
        highlightedIds={highlightedIds}
       onZoom={(val) => {
  window.dispatchEvent(new CustomEvent("zoom3d", { detail: val }));
}}
      />
    </div>
  );
}
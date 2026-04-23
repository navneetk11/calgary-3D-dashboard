import React, { useState } from "react";
import { queryBuildings, loginUser, saveProject, loadProjects } from "./api";

// ── Toast Notification Component ──────────────────────────────────
function Toast({ messages }) {
  return (
    <div style={{ position: "fixed", bottom: 24, right: 320, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
      {messages.map(m => (
        <div key={m.id} style={{
          padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500,
          background: m.type === "error" ? "rgba(239,68,68,0.95)" :
                      m.type === "success" ? "rgba(34,197,94,0.95)" :
                      "rgba(59,130,246,0.95)",
          color: "#fff", boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          animation: "slideIn 0.2s ease"
        }}>
          {m.type === "error" ? "❌" : m.type === "success" ? "✅" : "ℹ️"} {m.text}
        </div>
      ))}
    </div>
  );
}

export default function Sidebar({ buildings, onHighlight, activeFilter, setActiveFilter, user, setUser, highlightedIds, onZoom }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projects, setProjects] = useState([]);
  const [queryHistory, setQueryHistory] = useState([]);
  const [toasts, setToasts] = useState([]);

  // ── Toast helper ──
  function showToast(text, type = "success") {
    const id = Date.now();
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }

  // ── Handlers ──
  async function handleQuery(q = query) {
    if (!q.trim()) {
      showToast("Please enter a query first", "error");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await queryBuildings(q);
      if (res.matched_ids) {
        onHighlight(res.matched_ids);
        setActiveFilter(res.filter);
        setResult({ count: res.count, filter: res.filter });
        setQueryHistory(prev => [q, ...prev.filter(x => x !== q)].slice(0, 5));
        if (res.count === 0) {
          showToast("No buildings matched your query", "error");
        } else {
          showToast(`${res.count} buildings highlighted`, "success");
        }
      } else {
        showToast(res.error || "Could not parse query", "error");
        setResult({ error: res.error || "No results" });
      }
    } catch (e) {
      showToast("Server error — is Flask running?", "error");
      setResult({ error: "Backend error" });
    }
    setLoading(false);
  }

  async function handleLogin() {
    if (!usernameInput.trim()) {
      showToast("Please enter a username", "error");
      return;
    }
    try {
      const res = await loginUser(usernameInput.trim());
      setUser(res);
      const projs = await loadProjects(res.user_id);
      setProjects(projs);
      showToast(`Welcome, ${res.username}!`, "success");
    } catch (e) {
      showToast("Could not log in — server error", "error");
    }
  }

  function handleSwitchUser() {
    setUser(null);
    setUsernameInput("");
    setProjects([]);
    setResult(null);
    showToast("Switched user", "info");
  }

  async function handleSave() {
    if (!user) { showToast("Please log in first", "error"); return; }
    if (!activeFilter) { showToast("Run a query first before saving", "error"); return; }
    if (!projectName.trim()) { showToast("Enter a project name", "error"); return; }
    try {
      await saveProject(user.user_id, projectName.trim(), activeFilter);
      showToast(`Project "${projectName}" saved!`, "success");
      setProjectName("");
      const projs = await loadProjects(user.user_id);
      setProjects(projs);
    } catch (e) {
      showToast("Could not save project", "error");
    }
  }

  async function handleDelete(projectId, projectName) {
    try {
      await fetch(`https://calgary-3d-dashboard-backend.onrender.com/api/projects/${projectId}`, { method: "DELETE" });
      showToast(`"${projectName}" deleted`, "info");
      const projs = await loadProjects(user.user_id);
      setProjects(projs);
    } catch (e) {
      showToast("Could not delete project", "error");
    }
  }

  async function handleLoadProject(project) {
    try {
      setActiveFilter(project.filters);
      const { attribute, operator, value } = project.filters;
      const matched = buildings.filter(b => {
        const bval = b[attribute];
        if (bval === null || bval === undefined) return false;
        try {
          if (operator === ">") return parseFloat(bval) > parseFloat(value);
          if (operator === "<") return parseFloat(bval) < parseFloat(value);
          if (operator === ">=") return parseFloat(bval) >= parseFloat(value);
          if (operator === "<=") return parseFloat(bval) <= parseFloat(value);
          if (operator === "==") return String(bval).toLowerCase() === String(value).toLowerCase();
          if (operator === "contains") return String(bval).toLowerCase().includes(String(value).toLowerCase());
        } catch { return false; }
        return false;
      });
      onHighlight(matched.map(b => b.id));
      setResult({ count: matched.length, filter: project.filters });
      showToast(`Loaded "${project.name}" — ${matched.length} buildings`, "success");
    } catch (e) {
      showToast("Could not load project", "error");
    }
  }

  function exportCSV() {
    const matched = buildings.filter(b => highlightedIds.includes(b.id));
    if (!matched.length) {
      showToast("No highlighted buildings to export", "error");
      return;
    }
    try {
      const headers = ["id","name","address","height","height_feet","levels","zoning","zoning_code","assessed_value"];
      const rows = matched.map(b => headers.map(h => b[h] ?? "").join(","));
      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "calgary_buildings.csv"; a.click();
      URL.revokeObjectURL(url);
      showToast(`Exported ${matched.length} buildings as CSV`, "success");
    } catch (e) {
      showToast("Export failed", "error");
    }
  }

  const zoningCounts = buildings.reduce((acc, b) => {
    const z = b.zoning || "other";
    acc[z] = (acc[z] || 0) + 1;
    return acc;
  }, {});
  const topZoning = Object.entries(zoningCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const s = styles;

  return (
    <>
      <Toast messages={toasts} />
      <div style={s.sidebar}>
        {/* Header */}
        <div style={s.header}>
          <div style={{ fontSize: 22 }}>🏙️</div>
          <div>
            <div style={s.title}>Calgary 3D</div>
            <div style={s.subtitle}>Urban Dashboard</div>
          </div>
        </div>

        {/* Stats */}
        <div style={s.statsGrid}>
          <div style={s.stat}>
            <div style={s.statNum}>{buildings.length}</div>
            <div style={s.statLabel}>Buildings</div>
          </div>
          <div style={s.stat}>
            <div style={s.statNum}>{highlightedIds.length || "—"}</div>
            <div style={s.statLabel}>Highlighted</div>
          </div>
        </div>

        {/* Zoom Slider */}
        <div style={s.section}>
          <div style={s.sectionTitle}>🔭 Camera Zoom</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "#64748b" }}>Far</span>
            <input
              type="range" min={50} max={500} defaultValue={250}
              style={{ flex: 1, accentColor: "#2563eb" }}
              onChange={e => onZoom(Number(e.target.value))}
            />
            <span style={{ fontSize: 11, color: "#64748b" }}>Close</span>
          </div>
          <button onClick={() => onZoom("reset")} style={{ ...s.clearBtn, marginTop: 6, width: "100%" }}>
            ⟳ Reset View
          </button>
        </div>

        {/* LLM Query */}
        <div style={s.section}>
          <div style={s.sectionTitle}>🤖 AI Query</div>
          <textarea
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleQuery()}
            placeholder={"Try:\n• buildings over 100 feet\n• show commercial buildings\n• buildings less than $500,000\n• show RC-G zoning"}
            style={s.textarea}
            rows={3}
          />
          <button onClick={() => handleQuery()} disabled={loading} style={s.btn}>
            {loading ? "⏳ Querying AI..." : "✨ Run Query"}
          </button>

          {/* Query History */}
          {queryHistory.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, color: "#475569", marginBottom: 4 }}>Recent:</div>
              {queryHistory.map((q, i) => (
                <div key={i} onClick={() => { setQuery(q); handleQuery(q); }} style={s.historyItem}>
                  ⏱ {q}
                </div>
              ))}
            </div>
          )}

          {result && !result.error && (
            <div style={s.resultBox}>
              <div style={{ fontWeight: 600, color: "#eab308" }}>✅ {result.count} buildings matched</div>
              {result.filter && (
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                  {result.filter.attribute} {result.filter.operator} {result.filter.value}
                </div>
              )}
            </div>
          )}

          {highlightedIds.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <button onClick={() => { onHighlight([]); setResult(null); setActiveFilter(null); }} style={s.clearBtn}>
                ✕ Clear
              </button>
              <button onClick={exportCSV} style={s.clearBtn}>⬇ Export CSV</button>
            </div>
          )}
        </div>

        {/* Legend */}
        <div style={s.section}>
          <div style={s.sectionTitle}>🎨 Legend</div>
          {[
            ["#3b82f6", "Commercial"], ["#22c55e", "Residential"],
            ["#8b5cf6", "Office"], ["#f97316", "Retail"],
            ["#ef4444", "Industrial"], ["#475569", "Other"],
            ["#eab308", "Highlighted"],
          ].map(([color, label]) => (
            <div key={label} style={s.legendRow}>
              <div style={{ ...s.dot, background: color }} />
              <span style={{ fontSize: 12, color: "#cbd5e1" }}>{label}</span>
            </div>
          ))}
          <div style={{ marginTop: 10, fontSize: 11, color: "#475569" }}>Top zoning types:</div>
          {topZoning.map(([z, count]) => (
            <div key={z} style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              {z}: {count} ({((count / buildings.length) * 100).toFixed(0)}%)
            </div>
          ))}
        </div>

        {/* Save / Load */}
        <div style={s.section}>
          <div style={s.sectionTitle}>💾 Save / Load</div>
          {!user ? (
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={usernameInput}
                onChange={e => setUsernameInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                placeholder="Enter username"
                style={s.input}
              />
              <button onClick={handleLogin} style={{ ...s.btn, marginTop: 0, padding: "8px 12px" }}>Go</button>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ color: "#60a5fa", fontSize: 13 }}>👋 {user.username}</span>
                <button onClick={handleSwitchUser} style={s.switchBtn}>Switch User</button>
              </div>

              <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                <input
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSave()}
                  placeholder="Project name..."
                  style={s.input}
                />
                <button onClick={handleSave} style={{ ...s.btn, marginTop: 0, padding: "8px 12px" }}>💾</button>
              </div>

              {projects.length > 0 ? (
                <div>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>Saved projects:</div>
                  {projects.map(p => (
                    <div key={p.id} style={s.projectRow}>
                      <div onClick={() => handleLoadProject(p)} style={{ flex: 1, cursor: "pointer" }}>
                        <div style={{ fontSize: 13, color: "#cbd5e1" }}>📁 {p.name}</div>
                        <div style={{ fontSize: 10, color: "#64748b" }}>
                          {p.filters.attribute} {p.filters.operator} {p.filters.value}
                        </div>
                      </div>
                      <button onClick={() => handleDelete(p.id, p.name)} style={s.deleteBtn} title="Delete project">✕</button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "#475569" }}>No saved projects yet.</div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

const styles = {
  sidebar: { width: 300, height: "100vh", background: "#0f172a", borderLeft: "1px solid #1e293b", overflowY: "auto", display: "flex", flexDirection: "column" },
  header: { padding: "16px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", gap: 12, background: "#0a0a1a" },
  title: { fontSize: 18, fontWeight: 700, color: "#60a5fa" },
  subtitle: { fontSize: 11, color: "#475569" },
  statsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid #1e293b" },
  stat: { padding: "10px 16px", textAlign: "center", borderRight: "1px solid #1e293b" },
  statNum: { fontSize: 18, fontWeight: 700, color: "#f1f5f9" },
  statLabel: { fontSize: 10, color: "#475569" },
  section: { padding: 16, borderBottom: "1px solid #1e293b" },
  sectionTitle: { fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 },
  textarea: { width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: 10, color: "#f1f5f9", fontSize: 12, resize: "none", fontFamily: "inherit" },
  input: { flex: 1, background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "8px 10px", color: "#f1f5f9", fontSize: 13 },
  btn: { width: "100%", marginTop: 8, padding: "10px", background: "#2563eb", border: "none", borderRadius: 8, color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13 },
  clearBtn: { flex: 1, padding: "7px", background: "transparent", border: "1px solid #334155", borderRadius: 8, color: "#94a3b8", cursor: "pointer", fontSize: 11 },
  switchBtn: { fontSize: 11, padding: "4px 8px", background: "transparent", border: "1px solid #334155", borderRadius: 6, color: "#94a3b8", cursor: "pointer" },
  resultBox: { marginTop: 10, padding: 10, background: "rgba(234,179,8,0.1)", border: "1px solid #eab308", borderRadius: 8 },
  legendRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 },
  dot: { width: 12, height: 12, borderRadius: 3, flexShrink: 0 },
  projectRow: { display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", background: "#1e293b", borderRadius: 8, marginBottom: 6 },
  deleteBtn: { background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14, padding: "0 4px" },
  historyItem: { fontSize: 11, color: "#64748b", padding: "4px 8px", background: "#1e293b", borderRadius: 6, marginBottom: 3, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
};
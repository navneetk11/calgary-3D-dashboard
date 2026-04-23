const BASE = "https://calgary-3d-dashboard-backend.onrender.com/api";

export async function fetchBuildings() {
  const res = await fetch(`${BASE}/buildings`);
  const data = await res.json();
  return data.buildings || [];
}

export async function queryBuildings(query) {
  const res = await fetch(`${BASE}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });
  return await res.json();
}

export async function loginUser(username) {
  const res = await fetch(`${BASE}/user`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username })
  });
  return await res.json();
}

export async function saveProject(user_id, name, filters) {
  const res = await fetch(`${BASE}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id, name, filters })
  });
  return await res.json();
}

export async function loadProjects(user_id) {
  const res = await fetch(`${BASE}/projects?user_id=${user_id}`);
  const data = await res.json();
  return data.projects || [];
}
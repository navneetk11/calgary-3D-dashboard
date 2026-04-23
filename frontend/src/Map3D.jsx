import React, { useRef, useEffect, useMemo } from "react";
import * as THREE from "three";

const CENTER_LAT = 51.0485;
const CENTER_LON = -114.065;
const SCALE = 80000;

function latLonToXZ(lat, lon) {
  const x = (lon - CENTER_LON) * SCALE * Math.cos(CENTER_LAT * Math.PI / 180);
  const z = -(lat - CENTER_LAT) * SCALE;
  return [x, z];
}

export default function Map3D({ buildings, highlightedIds, onSelectBuilding }) {
  const mountRef = useRef(null);
  const meshMapRef = useRef({});
  const highlightedSet = useMemo(() => new Set(highlightedIds), [highlightedIds]);

  useEffect(() => {
    const mount = mountRef.current;
    const w = mount.clientWidth, h = mount.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1a);
    scene.fog = new THREE.Fog(0x0a0a1a, 300, 800);

    // Camera
    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 2000);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(100, 200, 100);
    scene.add(sun);

    // Grid
    const grid = new THREE.GridHelper(600, 60, 0x1e3a5f, 0x1e293b);
    scene.add(grid);

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.MeshLambertMaterial({ color: 0x0f172a })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    scene.add(ground);

    // Buildings
    const meshMap = {};
    buildings.forEach(b => {
      if (!b.coords || b.coords.length < 3) return;
      try {
        const shape = new THREE.Shape();
        b.coords.forEach((c, i) => {
          const [x, z] = latLonToXZ(c.lat, c.lon);
          i === 0 ? shape.moveTo(x, z) : shape.lineTo(x, z);
        });
        const geo = new THREE.ExtrudeGeometry(shape, {
          depth: b.height * 0.5,
          bevelEnabled: false
        });
        geo.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
        const mat = new THREE.MeshLambertMaterial({
          color: highlightedSet.has(b.id) ? 0xeab308 : getZoningColor(b.zoning),
          transparent: true,
          opacity: 0.85
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData = b;
        scene.add(mesh);
        meshMap[b.id] = mesh;
      } catch (e) {}
    });
    meshMapRef.current = meshMap;

    // ── Single spherical state ──
    const spherical = { theta: 0, phi: Math.PI / 4, radius: 600 };
    let isIntro = true;
    let introTime = 0;

    function updateCamera() {
      camera.position.x = spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
      camera.position.y = spherical.radius * Math.cos(spherical.phi);
      camera.position.z = spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
      camera.lookAt(0, 0, 0);
    }
    updateCamera();

    // Mouse interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    function onClick(e) {
      if (isIntro) return;
      const rect = mount.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(Object.values(meshMap));
      if (hits.length > 0) onSelectBuilding(hits[0].object.userData);
    }
    mount.addEventListener("click", onClick);

    // Orbit (drag)
    let isDragging = false, prevMouse = { x: 0, y: 0 };
    mount.addEventListener("mousedown", e => { isDragging = true; prevMouse = { x: e.clientX, y: e.clientY }; });
    mount.addEventListener("mouseup", () => { isDragging = false; });
    mount.addEventListener("mousemove", e => {
      if (!isDragging || isIntro) return;
      const dx = e.clientX - prevMouse.x;
      const dy = e.clientY - prevMouse.y;
      spherical.theta -= dx * 0.005;
      spherical.phi = Math.max(0.1, Math.min(Math.PI / 2, spherical.phi + dy * 0.005));
      prevMouse = { x: e.clientX, y: e.clientY };
      updateCamera();
    });

    // Scroll zoom
    mount.addEventListener("wheel", e => {
      spherical.radius = Math.max(50, Math.min(500, spherical.radius + e.deltaY * 0.3));
      updateCamera();
    });

    // Slider zoom
    function handleZoom(e) {
      if (e.detail === "reset") {
        spherical.radius = 250;
        spherical.theta = 0;
        spherical.phi = Math.PI / 4;
      } else {
        spherical.radius = Number(e.detail);
      }
      updateCamera();
    }
    window.addEventListener("zoom3d", handleZoom);

    // ── Animate with intro ──
    const clock = new THREE.Clock();
    let animId;

    function animate() {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      if (isIntro) {
        introTime += delta;
        spherical.theta += 0.008;
        spherical.radius = Math.max(250, 600 - introTime * 120);
        if (introTime > 3) {
          isIntro = false;
          spherical.radius = 250;
        }
        updateCamera();
      }

      renderer.render(scene, camera);
    }
    animate();

    // Resize
    function onResize() {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("zoom3d", handleZoom);
      mount.removeEventListener("click", onClick);
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [buildings]);

  // Update highlights
  useEffect(() => {
    const meshMap = meshMapRef.current;
    Object.entries(meshMap).forEach(([id, mesh]) => {
      const isHighlighted = highlightedSet.has(Number(id));
      mesh.material.color.setHex(isHighlighted ? 0xeab308 : getZoningColor(mesh.userData.zoning));
      mesh.material.opacity = isHighlighted ? 1.0 : 0.85;
    });
  }, [highlightedIds]);

  return <div ref={mountRef} style={{ width: "100%", height: "100%" }} />;
}

function getZoningColor(zoning) {
  const z = (zoning || "").toLowerCase();
  if (z.includes("commercial")) return 0x3b82f6;
  if (z.includes("residential")) return 0x22c55e;
  if (z.includes("office")) return 0x8b5cf6;
  if (z.includes("retail")) return 0xf97316;
  if (z.includes("industrial")) return 0xef4444;
  if (z.includes("mixed")) return 0x06b6d4;
  return 0x475569;
}
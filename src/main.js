// App shell: renderer, sky and sun, orbit and walk modes, overlays, plans and the
// UI. Exposes window.__app for the browser tests.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import * as D from './design.js';
import { makeMaterials } from './textures.js';
import { buildWorld } from './build3d.js';
import { buildAirflow, buildRain } from './fx.js';
import { createWalker, levelOf } from './walk.js';
import { drawPlan, planLevels } from './plan.js';

const $ = (id) => document.getElementById(id);
// Yield to the browser between heavy init steps so the progress bar paints. Skip
// it in hidden tabs, where timers may be throttled for a minute or more.
const frame = () => (document.hidden ? Promise.resolve() : new Promise((r) => setTimeout(r, 0)));
const isTouch = () => matchMedia('(pointer: coarse)').matches;
const app = { ready: false, error: null, mode: 'orbit', frames: 0, stats: {} };
window.__app = app;

function progress(p, msg) { $('loading-bar').style.width = `${Math.round(p * 100)}%`; $('loading-text').textContent = msg; }
function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove('show'), ms);
}

async function main() {
  const canvas = $('scene'), touch = isTouch();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !touch, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.62;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xdde4e8, 0.011);
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 2000);
  const ov = D.VIEWPOINTS[0];
  camera.position.set(...ov.pos);

  progress(0.08, 'Preparing natural materials (lime, stone, terracotta, teak)…');
  await frame();
  const M = makeMaterials(renderer, touch ? 'low' : 'high');
  progress(0.45, 'Building the house from the design data…');
  await frame();
  const world = buildWorld(M);
  scene.add(world.root);
  const airflow = buildAirflow(), rain = buildRain();
  airflow.group.visible = false;
  rain.group.visible = false;
  scene.add(airflow.group, rain.group);
  const labels = buildLabels();
  scene.add(labels.group);
  progress(0.7, 'Sky and sunlight…');
  await frame();

  // ---- sky, sun, environment ----
  const sky = new Sky();
  sky.scale.setScalar(1800);
  const su = sky.material.uniforms;
  su.turbidity.value = 2.4; su.rayleigh.value = 1.7; su.mieCoefficient.value = 0.003; su.mieDirectionalG.value = 0.82;
  scene.add(sky);
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(touch ? 1024 : 2048, touch ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 80 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  sun.target.position.set(0.3, 2, 0);
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xe4edf3, 0xbfb6a8, 0.6);
  scene.add(hemi);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(), envSky = new Sky();
  envSky.scale.setScalar(50);
  envScene.add(envSky);
  // A warm ground disc in the environment so interiors receive bounced, earthy light.
  const envGround = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshBasicMaterial({ color: 0xb9b0a2 }));
  envGround.rotation.x = -Math.PI / 2;
  envGround.position.y = -1;
  envScene.add(envGround);
  let envRT = null;
  const sunState = { hour: 15.5, season: 'mar' };
  function updateSun() {
    const lat = (11 * Math.PI) / 180, dec = ({ mar: 0, jun: 23.44, dec: -23.44 }[sunState.season] * Math.PI) / 180;
    const H = ((sunState.hour - 12) * 15 * Math.PI) / 180;
    const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H), alt = Math.asin(sinAlt);
    let az = Math.acos(Math.max(-1, Math.min(1, (Math.sin(dec) - sinAlt * Math.sin(lat)) / (Math.cos(alt) * Math.cos(lat)))));
    if (H > 0) az = 2 * Math.PI - az;
    const dir = new THREE.Vector3(Math.cos(alt) * Math.sin(az), Math.sin(alt), -Math.cos(alt) * Math.cos(az));
    const raining = rain.group.visible;
    for (const u of [su, envSky.material.uniforms]) { u.sunPosition.value.copy(dir); u.turbidity.value = raining ? 12 : 2.4; u.rayleigh.value = raining ? 3 : 1.7; u.mieCoefficient.value = raining ? 0.02 : 0.003; }
    sun.position.copy(sun.target.position).addScaledVector(dir, 40);
    const k = Math.max(0, Math.min(1, alt / 0.35));
    sun.intensity = (raining ? 0.8 : 2.9) * k + 0.05;
    sun.color.setHSL(0.09, 0.55, 0.62 + 0.3 * k);
    hemi.intensity = raining ? 0.75 : 0.5;
    renderer.toneMappingExposure = raining ? 0.62 : 0.5;
    scene.fog.density = raining ? 0.024 : 0.011;
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(envScene, 0.02);
    scene.environment = envRT.texture;
    const degAlt = Math.round((alt * 180) / Math.PI), degAz = Math.round((az * 180) / Math.PI);
    const hh = Math.floor(sunState.hour), mm = Math.round((sunState.hour - hh) * 60);
    $('sun-readout').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · sun ${degAlt}° high, ${degAz}° from N`;
    app.stats.sun = { alt: degAlt, az: degAz };
    requestRender();
  }

  // ---- controls ----
  const orbit = new OrbitControls(camera, canvas);
  orbit.target.set(...ov.look);
  camera.position.set(...fitPos(ov.pos, ov.look));
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;
  orbit.maxPolarAngle = Math.PI * 0.495;
  orbit.minDistance = 2;
  orbit.maxDistance = 60;
  orbit.update();
  orbit.addEventListener('change', requestRender);

  const walker = createWalker({
    camera, dom: canvas, isTouch,
    getMovers: () => world.movers,
    onInteract: (pt) => interact(pt),
    onLockChange: (locked, wanted) => { $('resume').hidden = locked || !wanted || app.mode !== 'walk'; $('walk-hint').classList.toggle('dim', locked); },
  });

  // ---- render loop (on demand; continuous while anything animates) ----
  let dirty = true, last = performance.now();
  function requestRender() { dirty = true; }
  app.requestRender = requestRender;
  function loop(now) {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    let active = false;
    if (app.mode === 'walk') { walker.update(dt); active = true; updateMinimap(); }
    else if (orbit.enableDamping) orbit.update();
    if (world.update(dt, app.mode === 'walk')) active = true;
    if (airflow.group.visible) { airflow.update(dt); active = true; }
    if (rain.group.visible) { rain.update(dt); active = true; }
    if (camAnim) { stepCamAnim(dt); active = true; }
    if (dirty || active) { renderer.render(scene, camera); app.frames++; dirty = false; }
    requestAnimationFrame(loop);
  }

  // ---- camera animation for orbit jumps ----
  let camAnim = null;
  // Pull the camera back on narrow (portrait) screens so the whole house stays in frame.
  function fitPos(pos, look) {
    const off = new THREE.Vector3(pos[0] - look[0], pos[1] - look[1], pos[2] - look[2]), d = off.length();
    const v = THREE.MathUtils.degToRad(camera.fov), h = 2 * Math.atan(Math.tan(v / 2) * camera.aspect);
    const need = 10.5 / Math.sin(Math.min(v, h) / 2);
    return need > d ? off.multiplyScalar(need / d).add(new THREE.Vector3(...look)).toArray() : pos;
  }
  function flyTo(pos, look) {
    pos = fitPos(pos, look);
    camAnim = { t: 0, p0: camera.position.clone(), p1: new THREE.Vector3(...pos), l0: orbit.target.clone(), l1: new THREE.Vector3(...look) };
  }
  function stepCamAnim(dt) {
    camAnim.t = Math.min(1, camAnim.t + dt / 1.1);
    const e = camAnim.t * camAnim.t * (3 - 2 * camAnim.t);
    camera.position.lerpVectors(camAnim.p0, camAnim.p1, e);
    orbit.target.lerpVectors(camAnim.l0, camAnim.l1, e);
    orbit.update();
    if (camAnim.t >= 1) camAnim = null;
  }

  // ---- modes ----
  function setMode(mode, vp) {
    app.mode = mode;
    $('mode-orbit').setAttribute('aria-pressed', String(mode === 'orbit'));
    $('mode-walk').setAttribute('aria-pressed', String(mode === 'walk'));
    $('walk-hud').hidden = mode !== 'walk';
    document.body.classList.toggle('walking', mode === 'walk');
    if (mode === 'walk') {
      const v = vp || D.VIEWPOINTS.find((x) => x.id === 'gate');
      orbit.enabled = false;
      camera.fov = 70;
      camera.near = 0.05;
      camera.updateProjectionMatrix();
      applyLevels('all', false);
      labels.group.visible = false;
      walker.enable(v.pos, v.look);
      $('walk-hint').textContent = touch ? 'Left pad: walk · drag: look around · tap a door or the gate to open/close' : 'Click to look around · W A S D / arrows to walk · Shift to hurry · E or click on a door to open/close · Esc releases the mouse';
      if (touch) setPanel(false);
      else walker.requestLock();
    } else {
      walker.disable();
      orbit.enabled = true;
      camera.fov = 50;
      camera.updateProjectionMatrix();
      applyLevels(levelState.cut, true);
      labels.group.visible = $('opt-labels').checked;
      $('resume').hidden = true;
      const v = vp || D.VIEWPOINTS[0];
      flyTo(v.pos, v.look);
    }
    requestRender();
  }
  function jump(id) {
    const v = D.VIEWPOINTS.find((x) => x.id === id);
    if (!v) return false;
    for (const doorId of v.open || []) { const d = world.doors.find((x) => x.id === doorId); if (d) d.open = true; }
    if (v.mode === 'walk') { if (app.mode !== 'walk') setMode('walk', v); else walker.jump(v.pos, v.look); }
    else setMode('orbit', v);
    app.view = id;
    toast(v.label);
    requestRender();
    return true;
  }

  // ---- levels / layers ----
  const levelState = { cut: 'all' };
  function applyLevels(cut, remember = true) {
    if (remember) levelState.cut = cut;
    const g = world.groups, furn = $('opt-furniture').checked, xray = $('opt-structure').checked && app.mode !== 'walk';
    g.L1.visible = cut !== 'ground' && !xray;
    g.L2.visible = cut === 'all' && !xray;
    g.L0.visible = !xray;
    g.F0.visible = furn && !xray;
    g.F1.visible = furn && cut !== 'ground' && !xray;
    g.F2.visible = furn && cut === 'all' && !xray;
    world.structure.visible = xray;
    for (const l of labels.items) l.sprite.visible = l.level === 'ground' || (l.level === 'first' && cut !== 'ground') || (l.level === 'terrace' && cut === 'all');
    for (const b of document.querySelectorAll('#levels button')) b.setAttribute('aria-pressed', String(b.dataset.level === levelState.cut));
    requestRender();
  }

  // ---- doors: raycast from the crosshair, a tap or a click ----
  const ray = new THREE.Raycaster(), pickables = [];
  world.root.traverse((o) => { if (o.isMesh && o.userData.door) pickables.push(o); });
  function interact(pt) {
    const ndc = new THREE.Vector2(0, 0);
    if (pt) { const r = canvas.getBoundingClientRect(); ndc.set(((pt.x - r.left) / r.width) * 2 - 1, -((pt.y - r.top) / r.height) * 2 + 1); }
    ray.setFromCamera(ndc, camera);
    ray.far = app.mode === 'walk' ? 3.2 : 200;
    const hit = ray.intersectObjects(pickables.filter((m) => m.parent && isShown(m)), false)[0];
    if (!hit) return false;
    const d = hit.object.userData.door;
    d.open = !d.open;
    toast(`${prettyName(d)} ${d.open ? 'opened' : 'closed'}`, 1400);
    requestRender();
    return true;
  }
  const isShown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const prettyName = (d) => (d.id === 'gate' ? 'Gate' : d.label === 'Main door' ? 'Main door' : d.id.replace(/-/g, ' ').replace(/\bdoor\b/, '').trim().replace(/^\w/, (c) => c.toUpperCase()) + ' door');
  let downAt = null;
  canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (app.mode !== 'orbit' || !downAt) return;
    if (Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 6) interact({ x: e.clientX, y: e.clientY });
    downAt = null;
  });

  // ---- labels ----
  function buildLabels() {
    const group = new THREE.Group(), items = [];
    const make = (txt, sub, level, x, z, y) => {
      const c = document.createElement('canvas'), ctx = c.getContext('2d');
      c.width = 512; c.height = 160;
      ctx.fillStyle = 'rgba(32,26,22,0.72)';
      const r = 40;
      ctx.beginPath(); ctx.moveTo(r, 8); ctx.arcTo(504, 8, 504, 152, r); ctx.arcTo(504, 152, 8, 152, r); ctx.arcTo(8, 152, 8, 8, r); ctx.arcTo(8, 8, 504, 8, r); ctx.fill();
      ctx.fillStyle = '#fff8ec'; ctx.textAlign = 'center'; ctx.font = '600 58px system-ui, sans-serif'; ctx.fillText(txt, 256, sub ? 74 : 96);
      if (sub) { ctx.font = '400 38px system-ui, sans-serif'; ctx.fillStyle = '#e8d6bb'; ctx.fillText(sub, 256, 128); }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
      sp.scale.set(1.5, 0.47, 1);
      sp.position.set(x, y, z);
      sp.renderOrder = 10;
      group.add(sp);
      items.push({ sprite: sp, level });
    };
    for (const r of D.ROOMS) {
      if (['void', 'verandah'].includes(r.use) || r.id === 'stair') continue;
      const a = D.roomArea(r), y = D.LEVELS[r.level] + (r.level === 'terrace' ? 2.9 : 2.3);
      make(r.name, r.level === 'first' && r.use !== 'stair' ? `${a.toFixed(1)} m² · ${Math.round(a / D.FT / D.FT)} ft²` : '', r.level, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, y);
    }
    make('Nadumuttam', 'open to sky', 'terrace', (D.COURT.x0 + D.COURT.x1) / 2, (D.COURT.z0 + D.COURT.z1) / 2, D.LEVELS.terrace + 1.6);
    make('Recharge pit', '', 'ground', D.DRAINAGE.rechargePit.x, D.DRAINAGE.rechargePit.z, 1.2);
    make('West gate', 'from the road', 'ground', D.boundaryX('W', 3) - 0.6, 3.0, 2.4);
    return { group, items };
  }

  // ---- minimap ----
  const mm = $('minimap'), mmCache = {};
  let mmLast = 0;
  function updateMinimap(force) {
    const now = performance.now();
    if (!force && now - mmLast < 120) return;
    mmLast = now;
    const dpr = Math.min(2, window.devicePixelRatio || 1), cw = mm.clientWidth, ch = mm.clientHeight;
    if (!cw) return;
    if (mm.width !== Math.round(cw * dpr)) { mm.width = Math.round(cw * dpr); mm.height = Math.round(ch * dpr); for (const k in mmCache) delete mmCache[k]; }
    const lvl = walker.level;
    if (!mmCache[lvl]) {
      const off = document.createElement('canvas');
      off.width = mm.width; off.height = mm.height;
      const t = drawPlan(off, lvl, { compact: true, dpr, overlays: false });
      mmCache[lvl] = { off, t };
    }
    const ctx = mm.getContext('2d'), { off, t } = mmCache[lvl], st = walker.state;
    ctx.drawImage(off, 0, 0);
    const [px, py] = t.P(st.x, st.z), a = -st.yaw - Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, 26 * dpr, a - 0.6, a + 0.6); ctx.closePath(); ctx.fillStyle = 'rgba(214,64,52,0.25)'; ctx.fill();
    ctx.beginPath(); ctx.arc(px, py, 5 * dpr, 0, Math.PI * 2); ctx.fillStyle = '#d64034'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * dpr; ctx.stroke();
    $('minimap-level').textContent = { ground: 'Ground', first: 'First floor', terrace: 'Terrace' }[lvl];
    app.stats.walker = { x: +st.x.toFixed(2), z: +st.z.toFixed(2), feet: +st.feet.toFixed(2), level: lvl };
  }

  // ---- plans dialog ----
  const planState = { level: 'first', overlays: true };
  function renderPlan() {
    const cv = $('plan-canvas'), dpr = Math.min(2, window.devicePixelRatio || 1), box = cv.parentElement.getBoundingClientRect();
    cv.width = Math.max(320, Math.round(box.width * dpr));
    cv.height = Math.max(260, Math.round(box.height * dpr));
    const wk = app.mode === 'walk' ? { x: walker.state.x, z: walker.state.z, yaw: walker.state.yaw, level: walker.level } : null;
    drawPlan(cv, planState.level, { overlays: planState.overlays, walker: wk, dpr });
    for (const b of document.querySelectorAll('#plan-tabs button')) b.setAttribute('aria-selected', String(b.dataset.level === planState.level));
    app.stats.plan = planState.level;
  }
  function openPlans(level) {
    if (level) planState.level = level;
    else if (app.mode === 'walk') planState.level = walker.level;
    if (document.pointerLockElement) document.exitPointerLock?.();
    $('plans-dialog').showModal();
    requestAnimationFrame(renderPlan);
  }

  // ---- UI wiring ----
  function setPanel(open) {
    $('controls-toggle').setAttribute('aria-expanded', String(open));
    $('controls').classList.toggle('collapsed', !open);
  }
  $('controls-toggle').addEventListener('click', () => setPanel($('controls-toggle').getAttribute('aria-expanded') !== 'true'));
  if (touch || window.innerWidth < 760) setPanel(false);
  $('mode-orbit').addEventListener('click', () => setMode('orbit'));
  $('mode-walk').addEventListener('click', () => setMode('walk'));
  $('walk-exit').addEventListener('click', () => setMode('orbit'));
  $('resume-btn').addEventListener('click', () => { $('resume').hidden = true; walker.requestLock(); });
  const vpBox = $('viewpoints');
  for (const v of D.VIEWPOINTS) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = v.label; b.dataset.view = v.id;
    b.addEventListener('click', () => { jump(v.id); if (window.innerWidth < 760) setPanel(false); });
    vpBox.appendChild(b);
  }
  for (const b of document.querySelectorAll('#levels button')) b.addEventListener('click', () => { if (app.mode === 'walk') setMode('orbit'); applyLevels(b.dataset.level); });
  $('opt-furniture').addEventListener('change', () => applyLevels(levelState.cut, false));
  $('opt-labels').addEventListener('change', () => { labels.group.visible = $('opt-labels').checked && app.mode === 'orbit'; requestRender(); });
  $('opt-structure').addEventListener('change', () => { applyLevels(levelState.cut, false); if ($('opt-structure').checked) toast('Structure: 12 columns (230 × 450 mm in the walls) and the beam grid'); });
  $('opt-airflow').addEventListener('change', () => {
    airflow.group.visible = $('opt-airflow').checked;
    if (airflow.group.visible && app.mode === 'orbit') { if (levelState.cut === 'all') applyLevels('first'); flyTo([-5.5, 19.5, 13.5], [0.4, 3.4, -0.2]); }
    if (airflow.group.visible) toast('Cool air enters low on the south-west and leaves high through the court, the stair jaali and the NE vents');
    requestRender();
  });
  $('opt-rain').addEventListener('change', () => {
    rain.group.visible = $('opt-rain').checked;
    if (rain.group.visible && app.mode === 'orbit') flyTo([-9.5, 15.5, 12.5], [0.2, 2.6, 0]);
    updateSun();
    if (rain.group.visible) toast('Rain: terrace → scuppers → court rain garden → overflow → silt trap → recharge pit');
  });
  $('sun-time').addEventListener('input', () => { sunState.hour = +$('sun-time').value; updateSun(); });
  $('sun-season').addEventListener('change', () => { sunState.season = $('sun-season').value; updateSun(); });
  $('open-plans').addEventListener('click', () => openPlans());
  $('walk-plan').addEventListener('click', () => openPlans());
  $('minimap').addEventListener('click', () => openPlans());
  $('plans-close').addEventListener('click', () => $('plans-dialog').close());
  $('plan-overlays').addEventListener('change', () => { planState.overlays = $('plan-overlays').checked; renderPlan(); });
  const tabs = $('plan-tabs');
  for (const l of planLevels()) {
    const b = document.createElement('button');
    b.type = 'button'; b.role = 'tab'; b.dataset.level = l.id; b.textContent = l.name.split(' · ')[0];
    b.addEventListener('click', () => { planState.level = l.id; renderPlan(); });
    tabs.appendChild(b);
  }
  $('open-about').addEventListener('click', () => $('about-dialog').showModal());
  $('disclaimer-more').addEventListener('click', () => $('about-dialog').showModal());
  $('about-close').addEventListener('click', () => $('about-dialog').close());
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.code === 'KeyM' && app.mode === 'walk') openPlans();
    if (e.code === 'Escape' && app.mode === 'walk' && !document.pointerLockElement && !$('plans-dialog').open) setMode('orbit');
  });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    if ($('plans-dialog').open) renderPlan();
    updateMinimap(true);
    requestRender();
  });

  // ---- start ----
  updateSun();
  applyLevels('all');
  labels.group.visible = $('opt-labels').checked;
  renderer.compile(scene, camera);
  requestAnimationFrame(loop);
  await frame();
  await frame();
  $('loading').classList.add('done');
  setTimeout(() => { $('loading').hidden = true; }, 600);
  let tris = 0, calls = 0;
  world.root.traverse((o) => { if (o.isMesh && o.geometry) { calls++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
  Object.assign(app.stats, { meshes: calls, triangles: Math.round(tris), doors: world.doors.length });
  Object.assign(app, {
    ready: true, setMode, jump, openPlans, renderPlan, applyLevels, interact,
    renderNow: () => { if (app.mode === 'orbit') { if (camAnim) { camAnim.t = 1; stepCamAnim(0); } orbit.update(); } renderer.render(scene, camera); app.frames++; },
    toggleDoor: (id) => { const d = [...world.doors, world.gate].find((x) => x.id === id); if (!d) return null; d.open = !d.open; requestRender(); return d.open; },
    doorState: (id) => { const d = [...world.doors, world.gate].find((x) => x.id === id); return d ? { open: d.open, t: d.t } : null; },
    walkTo: (x, z) => { walker.state.x = x; walker.state.z = z; requestRender(); },
    walkStep: (forward, seconds = 1, strafe = 0) => {
      // Test helper: simulate held movement for a number of seconds.
      const keys = []; if (forward > 0) keys.push('KeyW'); if (forward < 0) keys.push('KeyS'); if (strafe > 0) keys.push('KeyD'); if (strafe < 0) keys.push('KeyA');
      for (const k of keys) window.dispatchEvent(new KeyboardEvent('keydown', { code: k }));
      const n = Math.round(seconds / 0.03);
      for (let i = 0; i < n; i++) walker.update(0.03);
      for (const k of keys) window.dispatchEvent(new KeyboardEvent('keyup', { code: k }));
      updateMinimap(true);
      return { ...walker.state, level: walker.level };
    },
    walker, world, camera, renderer, D, levelOf, airflow, rain, labels,
  });
}

main().catch((err) => {
  console.error(err);
  app.error = String(err && err.stack ? err.stack : err);
  const t = $('loading-text');
  if (t) t.textContent = `Sorry, the 3D view could not start: ${err.message || err}`;
});

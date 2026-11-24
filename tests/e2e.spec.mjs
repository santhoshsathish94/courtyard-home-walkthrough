// End-to-end tests of the running walkthrough (desktop + touch phone).
import { test, expect } from '@playwright/test';

async function boot(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/index.html');
  await page.waitForFunction(() => window.__app && (window.__app.ready || window.__app.error), null, { timeout: 180_000, polling: 250 });
  expect(await page.evaluate(() => window.__app.error)).toBeNull();
  return errors;
}
const mobile = (info) => info.project.name === 'mobile';
async function openPanel(page, info) {
  if ((await page.locator('#controls-toggle').getAttribute('aria-expanded')) !== 'true') await page.locator('#controls-toggle').click();
  await expect(page.locator('#controls')).not.toHaveClass(/collapsed/);
}

test('loads the model without errors and renders a real image', async ({ page }) => {
  const errors = await boot(page);
  await expect(page.locator('#loading')).toBeHidden();
  const stats = await page.evaluate(() => window.__app.stats);
  expect(stats.meshes).toBeGreaterThan(80);
  expect(stats.triangles).toBeGreaterThan(15000);
  expect(stats.doors).toBe(5);
  const px = await page.evaluate(() => {
    window.__app.renderNow();
    const src = document.getElementById('scene'), c = document.createElement('canvas');
    c.width = 160; c.height = 100;
    const x = c.getContext('2d');
    x.drawImage(src, 0, 0, 160, 100);
    const d = x.getImageData(0, 0, 160, 100).data, set = new Set();
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) { set.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4)); if (d[i] + d[i + 1] + d[i + 2] < 60) dark++; }
    return { colours: set.size, dark: dark / (d.length / 4) };
  });
  expect(px.colours).toBeGreaterThan(40);
  expect(px.dark).toBeLessThan(0.5);
  expect(errors).toEqual([]);
});

test('the canvas fills the screen and the page does not scroll sideways', async ({ page }) => {
  await boot(page);
  const m = await page.evaluate(() => { const c = document.getElementById('scene'); return { cw: c.clientWidth, ch: c.clientHeight, w: innerWidth, h: innerHeight, sw: document.documentElement.scrollWidth }; });
  expect(m.cw).toBe(m.w);
  expect(m.ch).toBe(m.h);
  expect(m.sw).toBeLessThanOrEqual(m.w);
});

test('walk from the road through the front gate, up the stair, through the main door, to the bedrooms and on to the terrace', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const a = window.__app, w = a.walker.state, out = {};
    // yaw: 0 = north (−z), π = south, π/2 = west, −π/2 = east.
    a.jump('gate');
    out.start = { level: a.walker.level, feet: w.feet };
    w.yaw = -Math.PI / 2; let s = a.walkStep(1, 1.8);            // through the front gate
    out.inside = { x: s.x };
    w.z = -3.97; s = a.walkStep(1, 1.5);                          // along the covered entry to the stair foot
    out.foot = { x: s.x, feet: s.feet };
    s = a.walkStep(1, 3.6);                                       // up both flights to the landing
    out.first = { feet: s.feet, level: s.level, x: s.x };
    s = a.walkStep(1, 1.2);                                       // east through the main door into the hall
    out.hall = { x: s.x };
    w.x = 2.6; w.z = -2.0; w.yaw = Math.PI / 2; s = a.walkStep(1, 3.4); // west along the north walkway into the short access
    out.access = { x: s.x, level: s.level };
    w.x = -3.6; w.z = -2.0; s = a.walkStep(1, 1.5);               // west through the bedroom-3 door
    out.bed3 = { x: s.x };
    w.x = 1.0; w.z = 2.4; s = a.walkStep(1, 2.4);                 // west along the south walkway into the master suite
    out.suite = { x: s.x };
    w.x = -2.1; w.z = 2.4; w.yaw = 0; s = a.walkStep(1, 1.5);     // north through the arch into the master bedroom
    out.master = { z: s.z };
    a.jump('terrace-stair');
    w.yaw = 0; s = a.walkStep(1, 4.5);                            // north up the open west stair
    out.top = { feet: s.feet, level: s.level, z: s.z };
    w.yaw = -Math.PI / 2; s = a.walkStep(1, 1.5);                 // east onto the terrace
    out.terrace = { level: s.level, x: s.x };
    return out;
  });
  expect(r.start.level).toBe('ground');
  expect(r.start.feet).toBeLessThan(0);
  expect(r.inside.x).toBeGreaterThan(-6.6);
  expect(r.foot.x).toBeGreaterThan(-4.5);
  expect(r.foot.feet).toBeLessThan(0.1);
  expect(r.first.level).toBe('first');
  expect(r.first.feet).toBeCloseTo(2.86, 1);
  expect(r.first.x).toBeGreaterThan(0.5);
  expect(r.hall.x).toBeGreaterThan(2.4);
  expect(r.access.x).toBeLessThan(-1.5);
  expect(r.access.level).toBe('first');
  expect(r.bed3.x).toBeLessThan(-4.3);
  expect(r.suite.x).toBeLessThan(-1.5);
  expect(r.master.z).toBeLessThan(1.5);
  expect(r.top.level).toBe('terrace');
  expect(r.top.feet).toBeGreaterThan(6.0);
  expect(r.top.z).toBeLessThan(-1.0);
  expect(r.terrace.level).toBe('terrace');
  expect(r.terrace.x).toBeGreaterThan(-5.5);
});
test('every walk viewpoint stands on a floor at eye height', async ({ page }) => {
  await boot(page);
  const res = await page.evaluate(() => window.__app.D.VIEWPOINTS.filter((v) => v.mode === 'walk').map((v) => {
    window.__app.jump(v.id);
    return { id: v.id, eye: window.__app.camera.position.y, want: v.pos[1] };
  }));
  expect(res.length).toBeGreaterThan(10);
  for (const r of res) expect(Math.abs(r.eye - r.want), r.id).toBeLessThan(0.12);
});

test('doors: a closed door blocks, an open one does not, and clicking the gate toggles it', async ({ page }, info) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const a = window.__app, w = a.walker.state;
    // Common bath, three steps up from the short access (the door starts closed).
    a.jump('hall');
    w.x = -2.79; w.z = -2.0; w.feet = a.D.LEVELS.first + 0.012; w.yaw = 0;
    const closed = a.walkStep(1, 1.2).z;
    a.toggleDoor('cbath-door');
    for (let i = 0; i < 40; i++) a.world.update(0.05);
    w.x = -2.79; w.z = -2.0; w.feet = a.D.LEVELS.first + 0.012;
    const s = a.walkStep(1, 1.2);
    return { closed, open: s.z, feet: s.feet };
  });
  expect(r.closed).toBeGreaterThan(-3.0);
  expect(r.open).toBeLessThan(-3.3);
  expect(r.feet).toBeCloseTo(3.31, 1);
  // Back to orbit, then click/tap the sliding car-gate leaf on screen (real input through the UI).
  await page.evaluate(() => window.__app.jump('overview'));
  const pt = await page.evaluate(() => {
    const a = window.__app;
    a.renderNow();
    const lf = a.world.gate.leaves[0], p = lf.pivot.position, ry = lf.pivot.rotation.y;
    const v = a.camera.position.clone().set(p.x + Math.cos(ry) * lf.w * 0.5, 1.42, p.z - Math.sin(ry) * lf.w * 0.5).project(a.camera);
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
  });
  expect(await page.evaluate(() => window.__app.doorState('gate').open)).toBe(true);
  if (mobile(info)) await page.touchscreen.tap(pt.x, pt.y); else await page.mouse.click(pt.x, pt.y);
  await expect.poll(() => page.evaluate(() => window.__app.doorState('gate').open)).toBe(false);
});

test('floor plans open from the UI, switch levels and draw', async ({ page }, info) => {
  await boot(page);
  await openPanel(page, info);
  await page.locator('#open-plans').click();
  await expect(page.locator('#plans-dialog')).toBeVisible();
  for (const name of ['Ground', 'First floor', 'Terrace garden']) {
    await page.locator('#plan-tabs button', { hasText: name }).click();
    await expect(page.locator('#plan-tabs button', { hasText: name })).toHaveAttribute('aria-selected', 'true');
    const inked = await page.evaluate(() => {
      const c = document.getElementById('plan-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 16) if (d[i] < 110 && d[i + 1] < 110) n++;
      return n;
    });
    expect(inked, name).toBeGreaterThan(400);
  }
  await page.locator('#plans-close').click();
  await expect(page.locator('#plans-dialog')).toBeHidden();
});

test('airflow, rain, structure and level controls change the scene', async ({ page }, info) => {
  await boot(page);
  await openPanel(page, info);
  await page.locator('#opt-airflow').check();
  await page.locator('#opt-rain').check();
  let s = await page.evaluate(() => { const a = window.__app; a.renderNow(); return { air: a.airflow.group.visible, rain: a.rain.group.visible }; });
  expect(s).toEqual({ air: true, rain: true });
  await page.locator('#opt-structure').check();
  s = await page.evaluate(() => { const a = window.__app; a.renderNow(); return { frame: a.world.structure.visible, first: a.world.groups.L1.visible, terrace: a.world.groups.L2.visible }; });
  expect(s).toEqual({ frame: true, first: false, terrace: false });
  await page.locator('#opt-structure').uncheck();
  await page.locator('#levels button[data-level="ground"]').click();
  s = await page.evaluate(() => { const g = window.__app.world.groups; return { ground: g.L0.visible, first: g.L1.visible, terrace: g.L2.visible }; });
  expect(s).toEqual({ ground: true, first: false, terrace: false });
  await page.locator('#levels button[data-level="all"]').click();
  s = await page.evaluate(() => { const g = window.__app.world.groups; return { first: g.L1.visible, terrace: g.L2.visible }; });
  expect(s).toEqual({ first: true, terrace: true });
  await page.locator('#sun-time').fill('9');
  await expect(page.locator('#sun-readout')).toContainText('09:00');
});

test('about dialog explains the plot discrepancy and the concept status', async ({ page }, info) => {
  await boot(page);
  await page.locator('#disclaimer-more').click();
  const dlg = page.locator('#about-dialog');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('1,620');
  await expect(dlg).toContainText('1,617');
  await expect(dlg).toContainText('not a construction drawing');
  await page.locator('#about-close').click();
  await expect(dlg).toBeHidden();
});

test('desktop: keyboard walking moves, and losing focus stops movement', async ({ page }, info) => {
  test.skip(mobile(info), 'desktop only');
  await boot(page);
  await page.locator('#mode-walk').click();
  await expect(page.locator('#walk-exit')).toBeVisible();
  await page.evaluate(() => window.__app.jump('gate'));
  const pos = () => page.evaluate(() => ({ ...window.__app.walker.state }));
  const p0 = await pos();
  // Hold W until the render loop has moved the walker (software GL can be slow under load).
  await page.keyboard.down('w');
  await expect.poll(async () => { const p = await pos(); return Math.hypot(p.x - p0.x, p.z - p0.z); }, { timeout: 60_000 }).toBeGreaterThan(0.2);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const p1 = await pos(), f1 = await page.evaluate(() => window.__app.frames);
  await expect.poll(() => page.evaluate(() => window.__app.frames), { timeout: 60_000 }).toBeGreaterThan(f1 + 2);
  const p2 = await pos();
  await page.keyboard.up('w');
  // Esc in a real browser releases the pointer lock; mimic it before using the HUD buttons.
  await page.evaluate(() => document.exitPointerLock?.());
  expect(Math.hypot(p2.x - p1.x, p2.z - p1.z)).toBeLessThan(0.05);
  await page.locator('#walk-exit').click();
  await expect(page.locator('#walk-exit')).toBeHidden();
});

test('mobile: panel starts collapsed and the touch joystick walks', async ({ page }, info) => {
  test.skip(!mobile(info), 'mobile only');
  await boot(page);
  const toggle = page.locator('#controls-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.tap();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#mode-walk').tap();
  await expect(page.locator('#walk-exit')).toBeVisible();
  await expect(page.locator('#joystick')).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  const box = await page.locator('#joystick').boundingBox();
  const p0 = await page.evaluate(() => ({ ...window.__app.walker.state }));
  await page.evaluate(([cx, cy]) => {
    const el = document.getElementById('joystick');
    const t = (y) => new Touch({ identifier: 7, target: el, clientX: cx, clientY: y });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [t(cy)], changedTouches: [t(cy)], bubbles: true, cancelable: true }));
    el.dispatchEvent(new TouchEvent('touchmove', { touches: [t(cy - 40)], changedTouches: [t(cy - 40)], bubbles: true, cancelable: true }));
    for (let i = 0; i < 40; i++) window.__app.walker.update(0.03);
    el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t(cy - 40)], bubbles: true, cancelable: true }));
  }, [box.x + box.width / 2, box.y + box.height / 2]);
  const p1 = await page.evaluate(() => ({ ...window.__app.walker.state }));
  expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeGreaterThan(0.5);
  await page.locator('#walk-exit').tap();
  await expect(page.locator('#walk-exit')).toBeHidden();
});

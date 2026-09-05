// Scripted first-person tour: a step list (src/data/tour.js) drives the walk
// camera around the apartment, opens and closes fronts and room doors, pauses
// and looks around. Pure functions - no three.js, no DOM - so the whole route
// can be simulated in node (scripts/check-tour.mjs) against the real walls.
//
// Body state is data space: pos = [x, y] mm, yaw/pitch radians with the walk
// camera's convention (yaw 0 faces +y, yaw grows counter-clockwise from above,
// pitch > 0 looks up).
//
// Step kinds (one object each; `say` may ride on any step):
//   { at: [x, y], yaw: deg }            teleport (tour start)
//   { go: [x, y], speed? }              turn to face the point, then walk there looking
//                                       ahead; pauses to open any closed room door on the way
//   { look: target, dur? }              turn to a target (see resolveTarget) or { yaw, pitch } in degrees
//   { turn: deg, dur?, pitch? }         relative turn; 360 = look all around
//   { wait: seconds }
//   { open: sel, stagger? }             open matching fronts (stagger = seconds between each)
//   { close: sel, stagger? }            close them; sel 'opened' = every front this tour
//                                       opened (furniture only - room doors close explicitly)
//   { toggle: sel }
//   { say: 'caption' }
//
// Selectors (sel): 'all' | 'opened' | [sel, ...] |
//   { door: 'opening name' } | { piece: 'label or id', part?: 'name prefix',
//     kind?: 'door'|'drawer'|'flap'|'pullout'|'roomdoor', near?: mm, limit?: n }

// radius: the tour body is slimmer than the manual walker's 200mm (shoulders
// turned sideways) so it fits the 400mm gap between the dining table and the
// kitchen wall stub - the only way from the kitchen to the sofa side.
// doorReach / doorWait: a `go` step that heads into a room door's box (expanded
// by doorReach mm) while that door is closed opens it and holds for doorWait
// seconds until the leaf has swung, so the tour never walks through a closed door.
// walkTurnRate: how fast the body turns toward its next waypoint before it
// starts walking (nobody walks sideways).
export const TOUR = { speed: 1700, turnRate: 70, walkTurnRate: 150, arrive: 60, lookDur: 0.9, eye: 1650, radius: 150, doorReach: 450, doorWait: 1.0 };

export const deg = (d) => (d * Math.PI) / 180;

export function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

// Exponential approach on an angle, taking the short way round.
export function dampAngle(cur, target, lambda, dt) {
  const d = wrapAngle(target - cur);
  return cur + d * (1 - Math.exp(-lambda * dt));
}

// Heading that looks from `from` toward `to` (data-space [x, y]).
export function yawTo(from, to) {
  return Math.atan2(-(to[0] - from[0]), to[1] - from[1]);
}

export function pitchTo(from, eye, to) {
  const d = Math.hypot(to[0] - from[0], to[1] - from[1]);
  return Math.atan2((to[2] ?? eye) - eye, Math.max(d, 1));
}

const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

// Room door geometry the way the viewer draws it (RoomDoor): the leaf pivots
// at `hinge` (data mm), lies along `closed` when shut and along `open` when
// swung, both unit vectors, and is `w` long. `box` is the opening's footprint.
export function doorGeometry(opening) {
  const [sx, sy] = opening.size;
  const horiz = sx >= sy;
  const w = horiz ? sx : sy;
  const hingeEnd = opening.hinge || 'min';
  const swing = opening.swing || -1;
  const hinge = horiz
    ? [hingeEnd === 'max' ? opening.pos[0] + sx : opening.pos[0], opening.pos[1] + sy / 2]
    : [opening.pos[0] + sx / 2, hingeEnd === 'max' ? opening.pos[1] + sy : opening.pos[1]];
  const closed = horiz ? [hingeEnd === 'max' ? -1 : 1, 0] : [0, hingeEnd === 'max' ? -1 : 1];
  const open = swing > 0 ? [-closed[1], closed[0]] : [closed[1], -closed[0]];
  return {
    name: opening.name,
    w,
    hinge,
    closed,
    open,
    box: { min: [opening.pos[0], opening.pos[1]], max: [opening.pos[0] + sx, opening.pos[1] + sy] },
  };
}

// Is a body at p (with `margin`) inside the quarter disc the leaf sweeps?
export function inDoorSweep(d, p, margin = 0) {
  const v = [p[0] - d.hinge[0], p[1] - d.hinge[1]];
  if (Math.hypot(v[0], v[1]) > d.w + margin) return false;
  const a = v[0] * d.closed[0] + v[1] * d.closed[1];
  const b = v[0] * d.open[0] + v[1] * d.open[1];
  return a > -margin && b > -margin;
}

const inBox = (p, box, m) => p[0] > box.min[0] - m && p[0] < box.max[0] + m && p[1] > box.min[1] - m && p[1] < box.max[1] + m;

// Look target -> [x, y, z] world mm. Accepts a plain point, a placed piece
// ({ piece: label-or-id, z? }) whose bbox center is used, or a room opening
// ({ door: name }). Returns null when nothing matches.
export function resolveTarget(target, { placed = [], openings = [], eye = TOUR.eye } = {}) {
  if (!target) return null;
  if (Array.isArray(target)) return [target[0], target[1], target[2] ?? eye];
  if (target.piece !== undefined) {
    const q = String(target.piece).toLowerCase();
    const e = placed.find((p) => p.name.toLowerCase() === q || p.piece.id.toLowerCase() === q);
    if (!e) return null;
    const b = e.bbox;
    const zc = (b.min[2] + b.max[2]) / 2;
    return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, target.z ?? Math.min(zc, eye)];
  }
  if (target.door !== undefined) {
    const o = openings.find((op) => op.name === target.door);
    if (!o) return null;
    return [o.pos[0] + o.size[0] / 2, o.pos[1] + o.size[1] / 2, target.z ?? Math.min(o.pos[2] + o.size[2] / 2, eye)];
  }
  return null;
}

// Openable records: { key, kind, piece (label), pieceId, part, center:[x,y,z], setOpen }.
export function matchOpenables(records, sel, body, opened) {
  if (!sel) return [];
  if (sel === 'all') return records.slice();
  if (sel === 'opened') return records.filter((r) => r.kind !== 'roomdoor' && opened?.has(r.key));
  if (Array.isArray(sel)) {
    const seen = new Set();
    return sel.flatMap((s) => matchOpenables(records, s, body, opened)).filter((r) => !seen.has(r.key) && seen.add(r.key));
  }
  const dist = (r) => Math.hypot(r.center[0] - body.pos[0], r.center[1] - body.pos[1]);
  let out = records.filter((r) => {
    if (sel.door !== undefined) return r.kind === 'roomdoor' && r.part === sel.door;
    if (r.kind === 'roomdoor') return false;
    if (sel.piece !== undefined) {
      const q = String(sel.piece).toLowerCase();
      if (r.piece.toLowerCase() !== q && r.pieceId.toLowerCase() !== q) return false;
    }
    if (sel.part !== undefined && !r.part.toLowerCase().startsWith(String(sel.part).toLowerCase())) return false;
    if (sel.kind !== undefined && r.kind !== sel.kind) return false;
    if (sel.near !== undefined && dist(r) > sel.near) return false;
    return true;
  });
  out.sort((a, b) => dist(a) - dist(b));
  if (sel.limit !== undefined) out = out.slice(0, sel.limit);
  return out;
}

// Order records left-to-right as seen from the body, so staggered opening
// sweeps across a run instead of jumping around.
function leftToRight(records, body) {
  const bearing = (r) => wrapAngle(yawTo(body.pos, r.center) - body.yaw);
  return records.slice().sort((a, b) => bearing(b) - bearing(a));
}

export function createTour(steps, { loop = true } = {}) {
  return { steps, loop, i: 0, t: 0, cur: null, opened: new Set(), done: false };
}

function setOpen(state, ctx, rec, on) {
  ctx.setOpen(rec, on);
  if (on) state.opened.add(rec.key);
  else state.opened.delete(rec.key);
}

function beginStep(state, ctx, step) {
  const body = ctx.body;
  const cur = { type: 'instant' };
  if (step.say !== undefined) ctx.say?.(step.say);
  if (step.at) {
    body.pos = [step.at[0], step.at[1]];
    body.yaw = deg(step.yaw ?? 180);
    body.pitch = 0;
  }
  const fronts = step.open !== undefined ? 'open' : step.close !== undefined ? 'close' : step.toggle !== undefined ? 'toggle' : null;
  if (fronts) {
    const recs = matchOpenables(ctx.openables(), step[fronts], body, state.opened);
    if (!recs.length) ctx.warn?.(`tour step ${state.i}: ${fronts} matched nothing`);
    const on = (r) => (fronts === 'toggle' ? !state.opened.has(r.key) : fronts === 'open');
    if (step.stagger && recs.length > 1) {
      cur.type = 'stagger';
      cur.recs = leftToRight(recs, body);
      cur.on = on;
      cur.stagger = step.stagger;
      cur.dur = step.stagger * recs.length;
      cur.next = 0;
    } else {
      for (const r of recs) setOpen(state, ctx, r, on(r));
    }
  }
  if (step.go) {
    cur.type = 'go';
    cur.target = step.go;
    cur.speed = step.speed ?? TOUR.speed;
    // face the waypoint first (eased turn), then walk
    const d0 = Math.hypot(step.go[0] - body.pos[0], step.go[1] - body.pos[1]);
    cur.y0 = body.yaw;
    cur.y1 = d0 < TOUR.arrive ? body.yaw : body.yaw + wrapAngle(yawTo(body.pos, step.go) - body.yaw);
    cur.p0 = body.pitch;
    cur.turnDur = Math.abs(cur.y1 - cur.y0) / deg(TOUR.walkTurnRate);
    cur.timeout = cur.turnDur + (d0 / cur.speed) * 3 + 3 + 2 * TOUR.doorWait;
    cur.stuck = 0;
    cur.hold = 0;
  } else if (step.look !== undefined) {
    cur.type = 'ease';
    cur.y0 = body.yaw;
    cur.p0 = body.pitch;
    if (Array.isArray(step.look) || step.look.piece !== undefined || step.look.door !== undefined) {
      const tgt = ctx.resolve(step.look);
      if (tgt) {
        cur.y1 = body.yaw + wrapAngle(yawTo(body.pos, tgt) - body.yaw);
        cur.p1 = pitchTo(body.pos, ctx.eye ?? TOUR.eye, tgt);
      } else {
        ctx.warn?.(`tour step ${state.i}: look target not found`);
        cur.y1 = body.yaw;
        cur.p1 = body.pitch;
      }
    } else {
      cur.y1 = step.look.yaw !== undefined ? body.yaw + wrapAngle(deg(step.look.yaw) - body.yaw) : body.yaw;
      cur.p1 = step.look.pitch !== undefined ? deg(step.look.pitch) : body.pitch;
    }
    cur.dur = step.dur ?? TOUR.lookDur;
  } else if (step.turn !== undefined) {
    cur.type = 'ease';
    cur.y0 = body.yaw;
    cur.p0 = body.pitch;
    cur.y1 = body.yaw + deg(step.turn);
    cur.p1 = step.pitch !== undefined ? deg(step.pitch) : body.pitch;
    cur.dur = step.dur ?? Math.abs(step.turn) / TOUR.turnRate;
  } else if (step.wait !== undefined) {
    cur.type = 'wait';
    cur.dur = step.wait;
  }
  state.cur = cur;
  state.t = 0;
}

// Runs one step for dt seconds. Returns true when the step is finished.
function runStep(state, ctx, dt) {
  const { cur } = state;
  const body = ctx.body;
  state.t += dt;
  switch (cur.type) {
    case 'instant':
      return true;
    case 'wait':
      return state.t >= cur.dur;
    case 'ease': {
      const s = smooth(state.t / cur.dur);
      body.yaw = cur.y0 + (cur.y1 - cur.y0) * s;
      body.pitch = cur.p0 + (cur.p1 - cur.p0) * s;
      if (state.t >= cur.dur) {
        body.yaw = wrapAngle(cur.y1);
        body.pitch = cur.p1;
        return true;
      }
      return false;
    }
    case 'stagger': {
      const upto = Math.min(cur.recs.length, Math.floor(state.t / cur.stagger) + 1);
      for (; cur.next < upto; cur.next++) setOpen(state, ctx, cur.recs[cur.next], cur.on(cur.recs[cur.next]));
      return state.t >= cur.dur;
    }
    case 'go': {
      const dx = cur.target[0] - body.pos[0];
      const dy = cur.target[1] - body.pos[1];
      const dist = Math.hypot(dx, dy);
      if (dist < TOUR.arrive) return true;
      if (state.t < cur.turnDur) {
        // still turning on the spot toward the waypoint
        const u = smooth(state.t / cur.turnDur);
        body.yaw = cur.y0 + (cur.y1 - cur.y0) * u;
        body.pitch = cur.p0 * (1 - u);
        return false;
      }
      // walking: look where you walk, level the view
      body.yaw = dampAngle(body.yaw, Math.atan2(-dx, dy), 4, dt);
      body.pitch += -body.pitch * (1 - Math.exp(-3 * dt));
      if (cur.hold > 0) {
        cur.hold -= dt; // a door is swinging open ahead - stand still
        return false;
      }
      const step = Math.min(dist, cur.speed * dt);
      const before = body.pos;
      const next = [before[0] + (dx / dist) * step, before[1] + (dy / dist) * step];
      // heading into a closed room door: open it and wait for the leaf
      const door = (ctx.doors || []).find((d) => {
        if (!inBox(next, d.box, TOUR.doorReach)) return false;
        const c = [(d.box.min[0] + d.box.max[0]) / 2, (d.box.min[1] + d.box.max[1]) / 2];
        return Math.hypot(next[0] - c[0], next[1] - c[1]) < Math.hypot(before[0] - c[0], before[1] - c[1]);
      });
      if (door) {
        const rec = ctx.openables().find((r) => r.kind === 'roomdoor' && r.part === door.name);
        if (rec && !state.opened.has(rec.key)) {
          setOpen(state, ctx, rec, true);
          cur.hold = TOUR.doorWait;
          return false;
        }
      }
      body.pos = ctx.move(before, [(dx / dist) * step, (dy / dist) * step]);
      const moved = Math.hypot(body.pos[0] - before[0], body.pos[1] - before[1]);
      cur.stuck = moved < step * 0.25 ? cur.stuck + dt : 0;
      if (cur.stuck > 0.5) {
        ctx.warn?.(`tour step ${state.i}: stuck ${Math.round(dist)}mm short of [${cur.target}] at [${Math.round(body.pos[0])}, ${Math.round(body.pos[1])}]`);
        return true;
      }
      if (state.t > cur.timeout) {
        ctx.warn?.(`tour step ${state.i}: timed out ${Math.round(dist)}mm short of [${cur.target}]`);
        return true;
      }
      return false;
    }
    default:
      return true;
  }
}

// Advance the tour by dt seconds. Returns false once a non-looping tour has
// played through (the caller then calls endTour).
export function tickTour(state, ctx, dt) {
  if (state.done) return false;
  if (!state.cur) beginStep(state, ctx, state.steps[state.i]);
  // instant steps chain within one tick (bounded so an all-instant script can't spin)
  for (let guard = 0; guard <= state.steps.length; guard++) {
    if (!runStep(state, ctx, dt)) return true;
    state.i += 1;
    state.cur = null;
    if (state.i >= state.steps.length) {
      if (!state.loop) {
        state.done = true;
        return false;
      }
      state.i = 0;
    }
    beginStep(state, ctx, state.steps[state.i]);
    if (state.cur.type !== 'instant') return true;
  }
  return true;
}

// Stop the tour: close whatever it left open.
export function endTour(state, ctx) {
  for (const r of ctx.openables()) if (state.opened.has(r.key)) ctx.setOpen(r, false);
  state.opened.clear();
  state.done = true;
}

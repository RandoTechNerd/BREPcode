var ue = Object.defineProperty;
var U = (l) => {
  throw TypeError(l);
};
var m = (l, e) => ue(l, "name", { value: e, configurable: !0 });
var he = (l, e, t) => e.has(l) || U("Cannot " + t);
var K = (l, e, t) => e.has(l) ? U("Cannot add the same private member more than once") : e instanceof WeakSet ? e.add(l) : e.set(l, t);
var _ = (l, e, t) => (he(l, e, "access private method"), t);
function V(l, e) {
  return Math.sqrt(Math.pow(l.x - e.x, 2) + Math.pow(l.y - e.y, 2));
}
m(V, "distance");
function N(l, e) {
  const t = e.x - l.x, n = e.y - l.y;
  return (Math.atan2(n, t) * 180 / Math.PI + 360) % 360;
}
m(N, "calculateAngle");
function I(l, e, t) {
  const n = t % 360 * (Math.PI / 180), { x: i, y: s } = l, { x: o, y: c } = e, r = (o - i) * Math.cos(n) - (c - s) * Math.sin(n) + i, a = (o - i) * Math.sin(n) + (c - s) * Math.cos(n) + s;
  return e.x = r, e.y = a, { x: r, y: a };
}
m(I, "rotatePoint");
function ie(l, e) {
  return Math.round(l * Math.pow(10, e)) / Math.pow(10, e);
}
m(ie, "roundToDecimals");
let v = 1e-5, F = 0.1, q = 0.1, B = 1e-3;
const A = [], ne = "↥", se = /* @__PURE__ */ new Set(["⟺", ne]), w = /* @__PURE__ */ m((l) => (l % 360 + 360) % 360, "normalizeAngle"), pe = /* @__PURE__ */ m((l, e) => {
  const t = w(l - e);
  return t > 180 ? t - 360 : t;
}, "shortestAngleDelta");
function ye(l, e, t = v) {
  const n = Math.max(Math.abs(l), Math.abs(e), t);
  return Math.abs(l - e) / n;
}
m(ye, "relativeDeltaRatio");
function oe(l, e, t) {
  if (!se.has(e?.type) || !Number.isFinite(t))
    return t;
  const n = Number.isFinite(e._distanceRequestedTarget) ? e._distanceRequestedTarget : null;
  let i = Number.isFinite(e._distanceAppliedTarget) ? e._distanceAppliedTarget : n ?? t;
  const s = n !== null && Math.abs(t - n) > v;
  if (n === null ? (e._distanceThrottleActive = !1, i = t) : s && (ye(t, n, v) > F ? e._distanceThrottleActive = !0 : (e._distanceThrottleActive = !1, i = t)), e._distanceRequestedTarget = t, !e._distanceThrottleActive)
    return e._distanceAppliedTarget = t, t;
  const o = typeof l?._distanceSolvePassToken == "string" ? l._distanceSolvePassToken : null, c = typeof e._distanceLastAppliedPassToken == "string" ? e._distanceLastAppliedPassToken : null;
  if (o !== null && c === o)
    return Number.isFinite(e._distanceAppliedTarget) ? e._distanceAppliedTarget : i;
  const r = t - i, a = Math.abs(r);
  if (a <= v)
    return e._distanceThrottleActive = !1, e._distanceAppliedTarget = t, o !== null && (e._distanceLastAppliedPassToken = o), t;
  const d = Math.max(
    B,
    a * q
  ), f = Math.min(a, d);
  return i += Math.sign(r) * f, Math.abs(t - i) <= v && (i = t, e._distanceThrottleActive = !1), e._distanceAppliedTarget = i, o !== null && (e._distanceLastAppliedPassToken = o), i;
}
m(oe, "resolveDistanceTargetForSolvePass");
(A["━"] = (function(l, e, t, n) {
  if (Math.abs(t[0].y - t[1].y) < v ? e.error = null : e.error = `Horizontal constraint not satisfied
        ${t[0].y} != ${t[1].y}`, !t[0].fixed && !t[1].fixed) {
    const i = (t[0].y + t[1].y) / 2;
    t[0].y = i, t[1].y = i;
  } else t[0].fixed ? t[1].fixed || (t[1].y = t[0].y) : t[0].y = t[1].y;
})).hints = {
  commandTooltip: "Horizontal Constraint",
  pointsRequired: 2
};
(A["│"] = (function(l, e, t, n) {
  if (Math.abs(t[0].x - t[1].x) < v * 2 ? e.error = null : e.error = `Vertical constraint not satisfied
        ${t[0].x} != ${t[1].x}`, !t[0].fixed && !t[1].fixed) {
    const i = (t[0].x + t[1].x) / 2;
    t[0].x = i, t[1].x = i;
  } else t[0].fixed ? t[1].fixed || (t[1].x = t[0].x) : t[0].x = t[1].x;
})).hints = {
  commandTooltip: "Vertical Constraint",
  pointsRequired: 2
};
(A["⟺"] = (function(l, e, t, n) {
  const [i, s] = t;
  let o = n, c = s.x - i.x, r = s.y - i.y, a = V(i, s);
  (isNaN(n) || n == null || n == null) && (o = a, e.value = a, se.has(e?.type) && (e._distanceRequestedTarget = a, e._distanceAppliedTarget = a, e._distanceThrottleActive = !1, e._distanceLastAppliedPassToken = null)), o = oe(l, e, o);
  let d = ie(Math.abs(o) - a, 4);
  if (Math.abs(d) === 0) {
    e.error = null;
    return;
  } else
    e.error = `Distance constraint not satisfied
        ${o} != ${a}`;
  a === 0 && (a = 1, c = 1, r = 1);
  const f = d / a;
  let y = c * f * 0.5, u = r * f * 0.5;
  const p = o >= 0 ? 1 : -1, h = 1, x = Math.sqrt(y * y + u * u) || v;
  if (x > h) {
    const M = h / x;
    y *= M, u *= M;
  }
  if (!i.fixed && !s.fixed)
    i.x -= y * p, i.y -= u * p, s.x += y * p, s.y += u * p;
  else if (!i.fixed)
    i.x -= y * 2 * p, i.y -= u * 2 * p;
  else if (!s.fixed)
    s.x += y * 2 * p, s.y += u * 2 * p;
  else
    return e.error = `points ${i.id} and ${s.id} are both fixed`;
})).hints = {
  commandTooltip: "Distance Constraint",
  pointsRequired: 2
};
(A[ne] = (function(l, e, t, n) {
  const [i, s, o] = t;
  if (!i || !s || !o) {
    e.error = "Line to Point Distance requires 3 points";
    return;
  }
  const c = s.x - i.x, r = s.y - i.y, a = c * c + r * r;
  if (a < v * v)
    return A["⟺"](l, e, [i, o], n);
  const d = Math.sqrt(a), f = -r / d, y = c / d, u = ((o.x - i.x) * c + (o.y - i.y) * r) / a, p = (o.x - i.x) * f + (o.y - i.y) * y;
  let h = Number.isFinite(n) ? Number(n) : Number.NaN;
  if (!Number.isFinite(h)) {
    h = Math.abs(p), e.value = h, e._distanceRequestedTarget = h, e._distanceAppliedTarget = h, e._distanceThrottleActive = !1, e._distanceLastAppliedPassToken = null;
    const T = Math.sign(p);
    e._linePointDistanceSign = T === 0 ? 1 : T;
  }
  h = oe(l, e, h);
  let x = Number(e?._linePointDistanceSign);
  (!Number.isFinite(x) || x === 0) && (x = Math.sign(p), (!Number.isFinite(x) || x === 0) && (x = 1)), h < 0 && (x = -1), e._linePointDistanceSign = x;
  const M = Math.abs(h) * x, b = p - M;
  if (Math.abs(b) <= v) {
    e.error = null;
    return;
  }
  e.error = `Line to Point Distance not satisfied
        ${h} != ${Math.abs(p)}`;
  let C = 0;
  if (o.fixed || (C += 1), i.fixed || (C += (1 - u) * (1 - u)), s.fixed || (C += u * u), C <= 0) {
    e.error = `points ${i.id}, ${s.id}, and ${o.id} are all fixed`;
    return;
  }
  const S = 1 / C, g = b * f, P = b * y;
  o.fixed || (o.x -= g * S, o.y -= P * S), i.fixed || (i.x += g * (1 - u) * S, i.y += P * (1 - u) * S), s.fixed || (s.x += g * u * S, s.y += P * u * S);
})).hints = {
  commandTooltip: "Line to Point Distance Constraint",
  pointsRequired: 3
};
(A["⇌"] = (function(l, e, t, n) {
  const [i, s, o, c] = t;
  let r = l.constraints.find((u) => u.type === "⟺" && u.points.includes(i.id) && u.points.includes(s.id)), a = l.constraints.find((u) => u.type === "⟺" && u.points.includes(o.id) && u.points.includes(c.id)), d = null, f = !1, y = !1;
  if (!r && !a) {
    const u = Math.sqrt(Math.pow(s.x - i.x, 2) + Math.pow(s.y - i.y, 2)), p = Math.sqrt(Math.pow(c.x - o.x, 2) + Math.pow(c.y - o.y, 2));
    d = (u + p) / 2, f = !0, y = !0;
  } else if (r && !a)
    d = r.value, y = !0;
  else if (a && !r)
    d = a.value, f = !0;
  else if (r && a)
    return e.error = "Both lines have a distance constraint applied to them";
  if (f) {
    let u = A["⟺"](l, e, [i, s], d);
    if (u) return u;
  }
  if (y) {
    let u = A["⟺"](l, e, [o, c], d);
    if (u) return u;
  }
})).hints = {
  commandTooltip: "Equal Distance Constraint",
  pointsRequired: 4
};
(A["∥"] = (function(l, e, t, n) {
  let i = l.constraints.find((r) => r.type === "│" && r.points.includes(t[0].id) && r.points.includes(t[1].id)), s = l.constraints.find((r) => r.type === "━" && r.points.includes(t[0].id) && r.points.includes(t[1].id)), o = l.constraints.find((r) => r.type === "│" && r.points.includes(t[2].id) && r.points.includes(t[3].id)), c = l.constraints.find((r) => r.type === "━" && r.points.includes(t[2].id) && r.points.includes(t[3].id));
  if (i) {
    if (o)
      return e.error = "Both lines have a vertical constraint applied to them";
    if (c)
      return e.error = "One line has a vertical constraint and the other has a horizontal constraint";
    {
      let r = A["│"](l, e, [t[2], t[3]], 0);
      if (r) return r;
    }
  } else if (s) {
    if (o)
      return e.error = "One line has a vertical constraint and the other has a horizontal constraint";
    if (c)
      return e.error = "Both lines have a horizontal constraint applied to them";
    {
      let r = A["━"](l, e, [t[2], t[3]], 0);
      if (r) return r;
    }
  } else if (o) {
    let r = A["│"](l, e, [t[0], t[1]], 0);
    if (r) return r;
  } else if (c) {
    let r = A["━"](l, e, [t[0], t[1]], 0);
    if (r) return r;
  } else {
    let r = N(t[0], t[1]), a = N(t[2], t[3]), d = r - a;
    d = (d + 360) % 360;
    let f = 0;
    return d > 90 && (f = 180), d > 180 && (f = 180), d > 270 && (f = 360), A["∠"](l, e, t, f);
  }
})).hints = {
  commandTooltip: "Parallel Constraint",
  pointsRequired: 4
};
(A["⟂"] = (function(l, e, t, n) {
  let i = l.constraints.find((r) => r.type === "│" && r.points.includes(t[0].id) && r.points.includes(t[1].id)), s = l.constraints.find((r) => r.type === "━" && r.points.includes(t[0].id) && r.points.includes(t[1].id)), o = l.constraints.find((r) => r.type === "│" && r.points.includes(t[2].id) && r.points.includes(t[3].id)), c = l.constraints.find((r) => r.type === "━" && r.points.includes(t[2].id) && r.points.includes(t[3].id));
  if (i) {
    if (o)
      return e.error = "Both lines have a vertical constraint applied to them";
    if (c)
      return e.error = "One line has a vertical constraint and the other has a horizontal constraint";
    {
      let r = A["━"](l, e, [t[2], t[3]], 0);
      if (r) return r;
    }
  } else if (s) {
    if (o)
      return e.error = "One line has a vertical constraint and the other has a horizontal constraint";
    if (c)
      return e.error = "Both lines have a horizontal constraint applied to them";
    {
      let r = A["│"](l, e, [t[2], t[3]], 0);
      if (r) return r;
    }
  } else if (o) {
    let r = A["━"](l, e, [t[0], t[1]], 0);
    if (r) return r;
  } else if (c) {
    let r = A["│"](l, e, [t[0], t[1]], 0);
    if (r) return r;
  } else {
    let r, a, d, f;
    [r, a, d, f] = t;
    let y = N(r, a), u = N(d, f), p = y - u;
    p = (p + 360) % 360;
    let h;
    return p <= 180 ? h = 90 : h = 270, A["∠"](l, e, t, h);
  }
})).hints = {
  commandTooltip: "Perpendicular Constraint",
  pointsRequired: 4
};
(A["∠"] = (function(l, e, t, n) {
  const [i, s, o, c] = t, r = N(i, s), a = N(o, c), d = r - a;
  if (e.value == null)
    e.value = ie(w(d), 4);
  else if (e.value < 0) {
    e.value = Math.abs(e.value), e.points = [e.points[2], e.points[3], e.points[1], e.points[0]];
    return;
  } else if (e.value > 360) {
    e.value = w(e.value);
    return;
  }
  const f = w(d);
  let y = Number.isFinite(n) ? n : parseFloat(e.value);
  Number.isFinite(y) || (y = f);
  const u = w(y), p = pe(u, f);
  if (Math.abs(p) < v) {
    e.error = null;
    return;
  }
  Math.abs(p) > v ? e.error = `Angle constraint not satisfied
            ${u} != ${f}
            Diff: ${Math.abs(p).toFixed(4)}
            ` : e.error = null;
  let h = !(i.fixed && s.fixed), x = !(o.fixed && c.fixed);
  if (O(l, "━", [i, s]) && (h = !1), O(l, "━", [o, c]) && (x = !1), O(l, "│", [i, s]) && (h = !1), O(l, "│", [o, c]) && (x = !1), !h && !x) return;
  const M = 1.5;
  let b = p;
  Math.abs(b) > M && (b = Math.sign(b) * M);
  let C = 0, S = 0;
  if (h && x ? (C = b / 2, S = -b / 2) : h ? C = b : x && (S = -b), h && C)
    if (i.fixed)
      I(i, s, C);
    else if (s.fixed)
      I(s, i, C);
    else {
      const g = (i.x + s.x) / 2, P = (i.y + s.y) / 2, T = { x: g, y: P };
      I(T, i, C), I(T, s, C);
    }
  if (x && S)
    if (o.fixed)
      I(o, c, S);
    else if (c.fixed)
      I(c, o, S);
    else {
      const g = (o.x + c.x) / 2, P = (o.y + c.y) / 2, T = { x: g, y: P };
      I(T, o, S), I(T, c, S);
    }
})).hints = {
  commandTooltip: "Angle Constraint",
  pointsRequired: 4
};
(A["≡"] = (function(l, e, t, n) {
  const [i, s] = t;
  if (i.fixed && s.fixed) {
    O(l, "⏚", [t[0]]) && O(l, "⏚", [t[1]]) && (e.error = "Both points are fixed");
    return;
  }
  if (i.x === s.x && i.y === s.y)
    e.error = null;
  else if (!i.fixed && !s.fixed) {
    const o = (i.x + s.x) / 2, c = (i.y + s.y) / 2;
    i.x = o, i.y = c, s.x = o, s.y = c;
  } else i.fixed ? s.fixed || (s.x = i.x, s.y = i.y, s.fixed = !0) : (i.x = s.x, i.y = s.y, i.fixed = !0);
  (i.fixed || s.fixed) && (i.fixed = !0, s.fixed = !0);
})).hints = {
  commandTooltip: "Coincident Constraint",
  pointsRequired: 2
};
(A["⏛"] = (function(l, e, t, n) {
  const [i, s, o] = t, c = s.x - i.x, r = s.y - i.y, a = c * c + r * r;
  if (a < v) {
    V(i, o) > v ? (e.error = "Point on Line: Line is degenerate (points too close) and Point C is not coincident.", o.fixed ? i.fixed || (i.x = o.x, i.y = o.y, s.fixed || (s.x = o.x, s.y = o.y)) : (o.x = i.x, o.y = i.y)) : e.error = null;
    return;
  }
  const d = ((o.x - i.x) * c + (o.y - i.y) * r) / a, f = i.x + d * c, y = i.y + d * r, u = o.x - f, p = o.y - y, h = Math.sqrt(u * u + p * p);
  if (h < v) {
    e.error = null;
    return;
  }
  e.error = `Point on Line not satisfied. Dist: ${h.toFixed(4)}`;
  let x = 0;
  if (o.fixed || (x += 1), i.fixed || (x += (1 - d) * (1 - d)), s.fixed || (x += d * d), x === 0) return;
  const b = 1 / x;
  let C = 0, S = 0;
  if ((!i.fixed || !s.fixed) && a > v) {
    const g = Math.sqrt(a), P = c / g, T = r / g, $ = h / g * 0.1 * b;
    C = P * $, S = T * $;
  }
  o.fixed || (o.x -= u * b, o.y -= p * b), i.fixed || (i.x += u * (1 - d) * b, i.y += p * (1 - d) * b, i.x -= C, i.y -= S), s.fixed || (s.x += u * d * b, s.y += p * d * b, s.x += C, s.y += S);
})).hints = {
  commandTooltip: "Point on Line Constraint",
  pointsRequired: 3
};
(A["⋯"] = (function(l, e, t, n) {
  e.type === "⋱" && (e.type = "⋯");
  const [i, s, o] = t, c = 2 * o.x - i.x - s.x, r = 2 * o.y - i.y - s.y;
  if (Math.abs(c) < v && Math.abs(r) < v) {
    e.error = null;
    return;
  }
  e.error = `Midpoint constraint not satisfied. Error: ${Math.hypot(c, r).toFixed(4)}`;
  let a = 0;
  if (i.fixed || (a += 1), s.fixed || (a += 1), o.fixed || (a += 4), a === 0) {
    e.error = "All points fixed in Midpoint constraint";
    return;
  }
  const d = -c / a, f = -r / a;
  i.fixed || (i.x += d * -1, i.y += f * -1), s.fixed || (s.x += d * -1, s.y += f * -1), o.fixed || (o.x += d * 2, o.y += f * 2);
})).hints = {
  commandTooltip: "Midpoint Constraint",
  pointsRequired: 3
};
(A["⏚"] = (function(l, e, t, n) {
  t[0].fixed = !0;
})).hints = {
  commandTooltip: "Fix Point",
  pointsRequired: 1
};
const D = {
  get tolerance() {
    return v;
  },
  set tolerance(l) {
    v = l;
  },
  get distanceSlideThresholdRatio() {
    return F;
  },
  set distanceSlideThresholdRatio(l) {
    Number.isFinite(l) && l >= 0 && (F = Number(l));
  },
  get distanceSlideStepRatio() {
    return q;
  },
  set distanceSlideStepRatio(l) {
    Number.isFinite(l) && l >= 0 && (q = Number(l));
  },
  get distanceSlideMinStep() {
    return B;
  },
  set distanceSlideMinStep(l) {
    Number.isFinite(l) && l >= 0 && (B = Number(l));
  },
  constraintFunctions: A
};
function O(l, e, t) {
  return l.constraints.some((n) => n.type === e && t.every((i) => n.points.includes(i.id)));
}
m(O, "participateInConstraint");
const Ae = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  constraints: D
}, Symbol.toStringTag, { value: "Module" })), xe = D.constraintFunctions, j = "↥", J = /* @__PURE__ */ new Set(["⟺", j]);
let me = 0;
function Q(l) {
  return !l || typeof l != "object" ? l : {
    ...l,
    points: Array.isArray(l.points) ? l.points.slice() : l.points
  };
}
m(Q, "cloneGeometry");
function W(l) {
  return !l || typeof l != "object" ? l : {
    ...l,
    points: Array.isArray(l.points) ? l.points.slice() : l.points
  };
}
m(W, "cloneConstraint");
function Z(l) {
  let e = "";
  for (let t = 0; t < l.length; t++) {
    const n = l[t];
    if (!n) {
      e += "null;";
      continue;
    }
    e += `${n.id}:${n.x},${n.y},${n.fixed ? 1 : 0};`;
  }
  return e;
}
m(Z, "pointStateSignature");
function ee(l) {
  let e = "";
  for (let t = 0; t < l.length; t++) {
    const n = l[t];
    e += `${n.id}:${n.x},${n.y},${n.fixed ? 1 : 0};`;
  }
  return e;
}
m(ee, "allPointsSignature");
const X = class X {
  constructor(e) {
    const t = typeof e == "string" ? JSON.parse(e) : e || {};
    this.points = t.points.map((n) => new L(
      n.id,
      n.x,
      n.y,
      n.fixed,
      n.construction,
      n.externalReference
    )), this.pointById = new Map(this.points.map((n) => [n.id, n])), this.geometries = Array.isArray(t.geometries) ? t.geometries.map(Q) : [], this.constraints = Array.isArray(t.constraints) ? t.constraints.map(W) : [];
  }
  processConstraintsOfType(e) {
    const t = e === "all" ? this.constraints : this.constraints.filter((n) => n.type === e);
    for (const n of t) {
      const i = parseFloat(n.value), s = n.points.map((f) => this.pointById.get(f)), o = Z(s), c = n._previousSolveValue, r = c === i || Number.isNaN(c) && Number.isNaN(i), a = J.has(n?.type) && n?._distanceThrottleActive === !0;
      if (n.previousPointValues !== void 0 && r && !a && n.previousPointValues === o && n.status === "solved") continue;
      n.status = "", n.error = null;
      try {
        xe[n.type](this, n, s, i);
      } catch (f) {
        n.error = f?.message || String(f);
      }
      const d = Z(s);
      n._previousSolveValue = i, o === d && (n.status = "solved", n.previousPointValues = d);
    }
  }
  async tidyDecimalsOfPoints(e = 4, t = !0) {
    for (const n of this.points) {
      t && (n.fixed = !1), typeof n.x == "string" && (n.x = parseFloat(n.x)), typeof n.y == "string" && (n.y = parseFloat(n.y)), (n.x === null || n.x === void 0 || Number.isNaN(n.x)) && (n.x = 0), (n.y === null || n.y === void 0 || Number.isNaN(n.y)) && (n.y = 0);
      const i = Math.pow(10, e);
      n.x = Math.round(n.x * i) / i, n.y = Math.round(n.y * i) / i;
    }
  }
  solve(e = 100) {
    this._distanceSolveCycleId = ++me;
    const n = /* @__PURE__ */ m(() => {
      const a = Number.isFinite(D?.tolerance) ? Number(D.tolerance) : 1e-8;
      return this.constraints.some((d) => J.has(d?.type) && d?._distanceThrottleActive === !0 && Number.isFinite(d?._distanceRequestedTarget) && Number.isFinite(d?._distanceAppliedTarget) && Math.abs(d._distanceRequestedTarget - d._distanceAppliedTarget) > a);
    }, "hasPendingDistanceTargetSlides");
    let i = Math.max(0, ...this.constraints.map((a) => Number.isFinite(+a.id) ? +a.id : 0)) + 1;
    const s = /* @__PURE__ */ m((a, d) => {
      this.constraints.push({
        id: i++,
        type: a,
        points: d,
        temporary: !0,
        labelX: 0,
        labelY: 0
      });
    }, "pushTemp");
    this.geometries.forEach((a) => {
      if (a.type === "arc")
        s("⇌", [a.points[0], a.points[1], a.points[0], a.points[2]]);
      else if (a.type === "bezier" && Array.isArray(a.points) && a.points.length >= 4) {
        const d = a.points || [], y = Math.floor((d.length - 1) / 3) * 3;
        for (let u = 3; u < y; u += 3) {
          const p = d[u - 1], h = d[u], x = d[u + 1];
          p == null || h == null || x == null || p === h || x === h || p === x || s("⏛", [p, x, h]);
        }
      }
    }), this.tidyDecimalsOfPoints(6, !0), this._distanceSolvePassToken = `${this._distanceSolveCycleId}:pre`, this.processConstraintsOfType("⏚"), this.processConstraintsOfType("all");
    const o = [
      "⏛",
      "━",
      "│",
      "⋯",
      "⟺",
      j,
      "⇌",
      "∠",
      "⟂",
      "∥",
      "⇌",
      "⟺",
      j,
      "⇌",
      "⟺",
      j,
      "⏛",
      "━",
      "│"
      // repeated passes for convergence
    ];
    let c = ee(this.points);
    for (let a = 0; a < e; a++) {
      this._distanceSolvePassToken = `${this._distanceSolveCycleId}:${a}`;
      for (const f of o)
        this.processConstraintsOfType(f), this.processConstraintsOfType("≡"), this.processConstraintsOfType("━"), this.processConstraintsOfType("|"), this.tidyDecimalsOfPoints(6, !1), this.processConstraintsOfType("━"), this.processConstraintsOfType("|"), this.tidyDecimalsOfPoints(6, !1);
      const d = ee(this.points);
      if (d === c && !n())
        break;
      c = d;
    }
    return {
      points: this.points.map((a) => ({
        id: a.id,
        x: a.x,
        y: a.y,
        fixed: a.fixed,
        construction: a.construction === !0,
        externalReference: a.externalReference === !0
      })),
      geometries: this.geometries.map(Q),
      constraints: this.constraints.filter((a) => !a.temporary).map(W)
      // drop temporaries
    };
  }
};
m(X, "ConstraintEngine");
let G = X;
const E = class E {
  constructor(e, t, n, i = !1, s = !1, o = !1) {
    this.id = e, this.x = t, this.y = n, this.fixed = i, this.construction = s === !0, this.externalReference = o === !0;
  }
};
m(E, "Point");
let L = E;
var k, re, ae, z, le, R, ce, de, Y;
const H = class H {
  /**
   * @param {Object} opts
   * @param {Object} [opts.sketch]  initial sketch {points, geometries, constraints}
   * @param {Function} [opts.notifyUser]  (message, type) => void
   * @param {Function} [opts.updateCanvas] () => void
   * @param {Function} [opts.getSelectionItems] () => Array<{type:"point"|"geometry", id:number}>
   * @param {Object}   [opts.appState] external state to mirror mode/type/requiredSelections
   */
  constructor(e = {}) {
    K(this, k);
    this.hooks = {
      notifyUser: typeof e.notifyUser == "function" ? e.notifyUser : (t) => {
      },
      updateCanvas: typeof e.updateCanvas == "function" ? e.updateCanvas : () => {
      },
      getSelectionItems: typeof e.getSelectionItems == "function" ? e.getSelectionItems : () => []
    }, this.appState = e.appState || { mode: "", type: "", requiredSelections: 0 }, this.sketchObject = e.sketch ? ge(e.sketch) : {
      points: [{ id: 0, x: 0, y: 0, fixed: !0, construction: !0, externalReference: !1 }],
      geometries: [],
      constraints: [{ id: 0, type: "⏚", points: [0] }]
    }, this._paused = !1, this._pauseReason = "";
  }
  // ---------- Solver control ----------
  pause(e = "") {
    this._paused = !0, this._pauseReason = e || "";
  }
  resume() {
    this._paused = !1, this._pauseReason = "";
  }
  isPaused() {
    return !!this._paused;
  }
  // ---------- Core solve ----------
  solveSketch(e = null) {
    if (this._paused)
      return this.sketchObject;
    _(this, k, re).call(this);
    const t = e === "full" ? this.fullSolve() : e ?? this.defaultLoops(), i = new G(this.sketchObject).solve(t);
    return this.sketchObject = i, this.sketchObject;
  }
  defaultLoops() {
    return 1500;
  }
  fullSolve() {
    return 2e3;
  }
  // ---------- Accessors ----------
  getPointById(e) {
    return this.sketchObject.points.find((t) => t.id === parseInt(e));
  }
  // ---------- Edit operations (formerly exported functions) ----------
  removePointById(e) {
    e = parseInt(e), e !== 0 && (this.sketchObject.points = this.sketchObject.points.filter((t) => t.id !== e), this.sketchObject.geometries = this.sketchObject.geometries.filter((t) => !t.points.includes(e)), this.sketchObject.constraints = this.sketchObject.constraints.filter((t) => !t.points.includes(e)));
  }
  removeGeometryById(e) {
    e = parseInt(e), e !== 0 && (this.sketchObject.geometries = this.sketchObject.geometries.filter((t) => parseInt(t.id) !== e), this.sketchObject.constraints = this.sketchObject.constraints.filter((t) => t.geometryId !== e));
  }
  removeConstraintById(e) {
    e = parseInt(e), this.sketchObject.constraints = this.sketchObject.constraints.filter((t) => parseInt(t.id) !== e);
  }
  toggleConstruction() {
    const e = this.hooks.getSelectionItems();
    if (!(!e || e.length === 0)) {
      for (const t of e)
        if (t.type === "geometry") {
          const n = this.sketchObject.geometries.find((i) => i.id === parseInt(t.id));
          if (!n) continue;
          n.construction === void 0 && (n.construction = !1), n.construction = !n.construction;
        }
      this.hooks.updateCanvas(!1);
    }
  }
  geometryCreateLine() {
    this.appState.mode = "createGeometry", this.appState.type = "line", this.appState.requiredSelections = 2, this.createGeometry("line");
  }
  geometryCreateCircle() {
    this.appState.mode = "createGeometry", this.appState.type = "circle", this.appState.requiredSelections = 2, this.createGeometry("circle");
  }
  geometryCreateArc() {
    this.appState.mode = "createGeometry", this.appState.type = "arc", this.appState.requiredSelections = 3, this.createGeometry("arc");
  }
  // Create rectangle from two selected points (opposite corners in UV plane)
  // Produces 4 line geometries, 4 coincident constraints (one per corner), and 3 perpendicular constraints
  geometryCreateRectangle() {
    this.appState.mode = "createGeometry", this.appState.type = "rectangle", this.appState.requiredSelections = 2;
    const e = this.hooks.getSelectionItems(), t = [];
    for (const g of e || [])
      if (g.type === "point") {
        const P = this.sketchObject.points.find((T) => T.id === parseInt(g.id));
        P && t.push(P);
      }
    if (t.length !== 2) return !1;
    const n = t[0], i = t[1], s = n.x, o = n.y, c = i.x, r = i.y, a = /* @__PURE__ */ m(() => Math.max(0, ...this.sketchObject.points.map((g) => +g.id || 0)) + 1, "nextPointId"), d = /* @__PURE__ */ m(() => Math.max(0, ...this.sketchObject.geometries.map((g) => +g.id || 0)) + 1, "nextGeoId"), f = /* @__PURE__ */ m(() => Math.max(0, ...this.sketchObject.constraints.map((g) => +g.id || 0)) + 1, "nextConId"), y = { id: a(), x: s, y: o, fixed: !1 }, u = { id: y.id + 1, x: c, y: o, fixed: !1 }, p = { id: u.id + 1, x: c, y: o, fixed: !1 }, h = { id: p.id + 1, x: c, y: r, fixed: !1 }, x = { id: h.id + 1, x: s, y: r, fixed: !1 }, M = { id: x.id + 1, x: s, y: r, fixed: !1 };
    this.sketchObject.points.push(y, u, p, h, x, M);
    const b = /* @__PURE__ */ m((g, P) => {
      const T = d();
      this.sketchObject.geometries.push({ id: T, type: "line", points: [g, P], construction: !1 });
    }, "pushLine");
    b(n.id, u.id), b(p.id, i.id), b(h.id, x.id), b(M.id, y.id);
    const C = /* @__PURE__ */ m((g, P) => {
      const T = f();
      this.sketchObject.constraints.push({ id: T, type: "≡", points: [g, P] });
    }, "pushCoincident");
    C(n.id, y.id), C(u.id, p.id), C(i.id, h.id), C(x.id, M.id);
    const S = /* @__PURE__ */ m((g, P, T, $) => {
      const fe = f();
      this.sketchObject.constraints.push({ id: fe, type: "⟂", points: [g, P, T, $] });
    }, "pushPerp");
    return S(n.id, u.id, p.id, i.id), S(p.id, i.id, h.id, x.id), S(h.id, x.id, M.id, y.id), this.sketchObject = this.solveSketch("full"), this.hooks.updateCanvas(), this.appState.mode = "", this.appState.type = "", this.appState.requiredSelections = 0, !0;
  }
  createGeometry(e, t = []) {
    if (t.length === 0) {
      const o = this.hooks.getSelectionItems();
      if (o && o.length > 0) {
        t = [];
        for (const c of o)
          if (c.type === "point") {
            const r = this.sketchObject.points.find((a) => a.id === parseInt(c.id));
            r && t.push(r);
          }
      }
    }
    if (this.appState.requiredSelections && t.length !== this.appState.requiredSelections)
      return !1;
    let n;
    if (t.length > 0 && typeof t[0] == "object" ? n = t.map((o) => o.id) : n = t, !n || n.length === 0) return !1;
    const s = {
      id: Math.max(0, ...this.sketchObject.geometries.map((o) => +o.id || 0)) + 1,
      type: e,
      points: n,
      construction: !1
    };
    return this.sketchObject.geometries.push(s), this.hooks.updateCanvas(), this.appState.mode = "", this.appState.type = "", this.appState.requiredSelections = 0, !0;
  }
  createConstraint(e, t = null) {
    const n = [];
    let i = null;
    const s = Array.isArray(t) ? t : this.hooks.getSelectionItems();
    for (const r of s) {
      if (r.type === "point") {
        const a = this.sketchObject.points.find((d) => d.id === parseInt(r.id));
        a && n.push(a);
      }
      if (r.type === "geometry") {
        const a = this.sketchObject.geometries.find((d) => d.id === parseInt(r.id));
        if (!a) continue;
        for (const d of a.points) {
          const f = this.sketchObject.points.find((y) => y.id === d);
          f && n.push(f);
        }
        a.type === "arc" && n.pop(), i = a.type;
      }
    }
    if (n.length === 0) return;
    const o = n.map((r) => parseInt(r.id)), c = {
      id: 0,
      type: e,
      points: o,
      labelX: 0,
      labelY: 0,
      displayStyle: "",
      value: null,
      valueNeedsSetup: !0
    };
    if (n.length === 1 && e === "⏚")
      return this.createAndPushNewConstraint(c);
    if (n.length === 2) {
      if (e === "━") return this.createAndPushNewConstraint(c);
      if (e === "│") return this.createAndPushNewConstraint(c);
      if (e === "≡") return this.createAndPushNewConstraint(c);
      if (e === "⟺")
        return (i === "arc" || i === "circle") && (c.displayStyle = "radius"), this.createAndPushNewConstraint(c);
    }
    if (n.length === 3) {
      if (e === "⏛") return this.createAndPushNewConstraint(c);
      if (e === "⋯")
        return s.some((a) => a.type === "geometry") && s[0]?.type === "point" && (c.points = o.slice().reverse()), this.createAndPushNewConstraint(c);
      if (e === j) {
        const r = s.filter((d) => d.type === "geometry"), a = s.filter((d) => d.type === "point");
        if (r.length === 1 && a.length === 1) {
          const d = this.sketchObject.geometries.find((y) => y.id === parseInt(r[0].id)), f = parseInt(a[0].id);
          if (d?.type === "line" && Array.isArray(d.points) && d.points.length >= 2 && Number.isFinite(f))
            return c.points = [
              parseInt(d.points[0]),
              parseInt(d.points[1]),
              f
            ], this.createAndPushNewConstraint(c);
          this.hooks.updateCanvas(), this.hooks.notifyUser(
            `Invalid selection for constraint type ${e}
with ${n.length} points.`,
            "warning"
          );
          return;
        }
        return this.createAndPushNewConstraint(c);
      }
      if (e === "⇌") return this.createAndPushNewConstraint(c);
    }
    if (n.length === 4 || n.length === 5) {
      if (e === "⏛") {
        const r = s.filter((a) => a.type === "geometry");
        if (r.length === 2) {
          const a = this.sketchObject.geometries.find((f) => f.id === parseInt(r[0].id)), d = this.sketchObject.geometries.find((f) => f.id === parseInt(r[1].id));
          if (a?.type === "line" && d?.type === "line" && Array.isArray(a.points) && a.points.length >= 2 && Array.isArray(d.points) && d.points.length >= 2) {
            const f = this.sketchObject.points.find((h) => h.id === a.points[0]), y = this.sketchObject.points.find((h) => h.id === a.points[1]), u = this.sketchObject.points.find((h) => h.id === d.points[0]), p = this.sketchObject.points.find((h) => h.id === d.points[1]);
            if (f && y && u && p) {
              const h = {
                type: e,
                labelX: 0,
                labelY: 0,
                displayStyle: "",
                value: null,
                valueNeedsSetup: !0
              }, x = Math.max(0, ...this.sketchObject.constraints.map((C) => +C.id || 0)) + 1, M = { ...h, id: x, points: [f.id, y.id, u.id] }, b = { ...h, id: x + 1, points: [f.id, y.id, p.id] };
              return this.sketchObject.constraints.push(M, b), this.sketchObject = this.solveSketch("full"), this.hooks.updateCanvas(), this.hooks.notifyUser("Constraint added", "info"), !0;
            }
          }
        }
      }
      if (e === "⟂") {
        if (_(this, k, ce).call(this, s)) {
          const p = _(this, k, de).call(this, s, n);
          if (p)
            return c.points = p, this.createAndPushNewConstraint(c);
        }
        if (n.length !== 4) {
          this.hooks.updateCanvas(), this.hooks.notifyUser(
            `Invalid selection for constraint type ${e}
with ${n.length} points.`,
            "warning"
          );
          return;
        }
        let a = N(n[0], n[1]), d = N(n[1], n[0]), f = N(n[2], n[3]);
        a = (a + 180) % 360 - 180, d = (d + 180) % 360 - 180, f = (f + 180) % 360 - 180;
        let y = a - f, u = d - f;
        return Math.abs(90 - y) > Math.abs(90 - u) && ([c.points[0], c.points[1]] = [c.points[1], c.points[0]]), this.createAndPushNewConstraint(c);
      }
      if (e === "∥") return this.createAndPushNewConstraint(c);
      if (e === "∠")
        return this.createAndPushNewConstraint(c);
      if (e === "⇌") return this.createAndPushNewConstraint(c);
    }
    this.hooks.updateCanvas(), this.hooks.notifyUser(
      `Invalid selection for constraint type ${e}
with ${n.length} points.`,
      "warning"
    );
  }
  createAndPushNewConstraint(e) {
    const t = Math.max(0, ...this.sketchObject.constraints.map((n) => +n.id || 0)) + 1;
    return e.id = t, e.value = e.value === null || e.value === void 0 ? null : parseFloat(Number(e.value).toFixed(4)), this.sketchObject.constraints.push(e), this.sketchObject = this.solveSketch("full"), this.hooks.updateCanvas(), this.hooks.notifyUser("Constraint added", "info"), !0;
  }
  // ---------- Coincident simplification & cleanup ----------
  simplifyCoincidentConstraints() {
    const e = this.sketchObject, t = {}, n = {};
    e.constraints.forEach((i) => {
      if (i.type === "≡") {
        const [s, o] = i.points;
        t[s] || (t[s] = /* @__PURE__ */ new Set()), t[o] || (t[o] = /* @__PURE__ */ new Set()), t[s].add(o), t[o].add(s);
      }
    });
    for (const [, i] of Object.entries(t))
      for (const s of i)
        if (t[s])
          for (const o of t[s])
            i.add(o), t[o] = i;
    for (const [i, s] of Object.entries(t)) {
      const o = Math.min(...Array.from(s).map(Number));
      n[i] = o;
    }
    return e.constraints.forEach((i) => {
      i.points = i.points.map((s) => n[s] || s);
    }), e.geometries.forEach((i) => {
      i.points = i.points.map((s) => n[s] || s);
    }), this.discardUnusedPoints(), e.constraints = e.constraints.filter((i) => !(i.type === "≡" && i.points[0] === i.points[1])), this.sketchObject;
  }
  discardUnusedPoints() {
    const e = this.sketchObject, t = /* @__PURE__ */ new Set();
    return e.constraints.forEach((n) => n.points.forEach((i) => t.add(i))), e.geometries.forEach((n) => n.points.forEach((i) => t.add(i))), e.points = e.points.filter((n) => t.has(n.id)), this.sketchObject;
  }
};
k = new WeakSet(), re = /* @__PURE__ */ m(function() {
  const e = this.sketchObject;
  if (!e || !Array.isArray(e.constraints) || !Array.isArray(e.geometries)) return 0;
  const t = _(this, k, le).call(this, e.constraints), n = _(this, k, ae).call(this, e.geometries, t);
  if (!n.size) return 0;
  const i = e.constraints.length;
  return e.constraints = e.constraints.filter((s) => {
    if (!s || s.temporary) return !0;
    const o = _(this, k, z).call(this, s.type, s.points, t);
    return o ? !n.has(o) : !0;
  }), i - e.constraints.length;
}, "#removeConstraintsDuplicatedByImpliedGeometry"), ae = /* @__PURE__ */ m(function(e, t = null) {
  const n = /* @__PURE__ */ new Set(), i = /* @__PURE__ */ m((s, o) => {
    const c = _(this, k, z).call(this, s, o, t);
    c && n.add(c);
  }, "add");
  for (const s of e || [])
    if (!(!s || !Array.isArray(s.points))) {
      if (s.type === "arc" && s.points.length >= 3)
        i("⇌", [s.points[0], s.points[1], s.points[0], s.points[2]]);
      else if (s.type === "bezier" && s.points.length >= 4) {
        const o = s.points, r = Math.floor((o.length - 1) / 3) * 3;
        for (let a = 3; a < r; a += 3) {
          const d = o[a - 1], f = o[a], y = o[a + 1];
          d == null || f == null || y == null || d === f || y === f || d === y || i("⏛", [d, y, f]);
        }
      }
    }
  return n;
}, "#collectImpliedConstraintKeys"), z = /* @__PURE__ */ m(function(e, t, n = null) {
  if (!Array.isArray(t)) return null;
  const i = /* @__PURE__ */ m((s) => {
    const o = parseInt(s);
    return Number.isFinite(o) ? n ? n.get(o) ?? o : o : null;
  }, "canon");
  if (e === "⇌" && t.length >= 4) {
    const s = i(t[0]), o = i(t[1]), c = i(t[2]), r = i(t[3]);
    if (![s, o, c, r].every(Number.isFinite)) return null;
    const a = _(this, k, R).call(this, s, o), d = _(this, k, R).call(this, c, r);
    return a <= d ? `⇌:${a}|${d}` : `⇌:${d}|${a}`;
  }
  if (e === "⏛" && t.length >= 3) {
    const s = i(t[0]), o = i(t[1]), c = i(t[2]);
    return [s, o, c].every(Number.isFinite) ? `⏛:${_(this, k, R).call(this, s, o)}|${c}` : null;
  }
  return null;
}, "#constraintSignature"), le = /* @__PURE__ */ m(function(e) {
  const t = /* @__PURE__ */ new Map(), n = /* @__PURE__ */ m((o) => {
    let c = t.get(o);
    return c == null ? (t.set(o, o), o) : (c !== o && (c = n(c), t.set(o, c)), c);
  }, "find"), i = /* @__PURE__ */ m((o, c) => {
    const r = n(o), a = n(c);
    r !== a && (r < a ? t.set(a, r) : t.set(r, a));
  }, "union");
  for (const o of e || []) {
    if (!o || o.temporary || o.type !== "≡" || !Array.isArray(o.points) || o.points.length < 2) continue;
    const c = parseInt(o.points[0]), r = parseInt(o.points[1]);
    !Number.isFinite(c) || !Number.isFinite(r) || i(c, r);
  }
  const s = /* @__PURE__ */ new Map();
  for (const o of t.keys()) s.set(o, n(o));
  return s;
}, "#buildCoincidentCanonicalPointMap"), R = /* @__PURE__ */ m(function(e, t) {
  return e <= t ? `${e},${t}` : `${t},${e}`;
}, "#orderedPairKey"), // Helper method to detect if this is a tangent constraint (line + arc/circle)
ce = /* @__PURE__ */ m(function(e) {
  if (e.length !== 2) return !1;
  const t = e.filter((s) => s.type === "geometry");
  if (t.length !== 2) return !1;
  const n = t.find((s) => this.sketchObject.geometries.find((c) => c.id === parseInt(s.id))?.type === "line"), i = t.find((s) => {
    const o = this.sketchObject.geometries.find((c) => c.id === parseInt(s.id));
    return o?.type === "arc" || o?.type === "circle";
  });
  return n && i;
}, "#detectTangentConstraint"), // Helper method to choose optimal points for tangent constraint
de = /* @__PURE__ */ m(function(e, t) {
  const n = e.filter((p) => p.type === "geometry");
  if (n.length !== 2) return null;
  let i = null, s = null, o = [], c = [];
  for (const p of n) {
    const h = this.sketchObject.geometries.find((x) => x.id === parseInt(p.id));
    h && (h.type === "line" ? (i = h, o = h.points.map((x) => this.sketchObject.points.find((M) => M.id === x))) : (h.type === "arc" || h.type === "circle") && (s = h, c = h.points.map((x) => this.sketchObject.points.find((M) => M.id === x))));
  }
  if (!i || !s || o.length < 2 || c.length < 1)
    return null;
  const r = c[0], a = o[0], d = o[1], f = c.slice(1);
  if (f.length === 0)
    return [a.id, d.id, r.id, r.id];
  let y = f[0], u = _(this, k, Y).call(this, f[0], a, d);
  for (let p = 1; p < f.length; p++) {
    const h = _(this, k, Y).call(this, f[p], a, d);
    h < u && (u = h, y = f[p]);
  }
  return [a.id, d.id, r.id, y.id];
}, "#optimizePointsForTangent"), // Helper method to calculate distance from point to line
Y = /* @__PURE__ */ m(function(e, t, n) {
  let i = n.x - t.x, s = n.y - t.y;
  const o = Math.sqrt(i * i + s * s);
  if (o === 0) return V(e, t);
  i /= o, s /= o;
  const c = e.x - t.x, r = e.y - t.y, a = c * i + r * s, d = t.x + a * i, f = t.y + a * s, y = e.x - d, u = e.y - f;
  return Math.sqrt(y * y + u * u);
}, "#distancePointToLine"), m(H, "ConstraintSolver");
let te = H;
function ge(l) {
  const e = {
    points: Array.isArray(l.points) ? l.points.map((t) => ({
      id: +t.id,
      x: +t.x,
      y: +t.y,
      fixed: !!t.fixed,
      construction: typeof t?.construction == "boolean" ? t.construction : +t?.id == 0,
      externalReference: !!t?.externalReference
    })) : [],
    geometries: Array.isArray(l.geometries) ? l.geometries.slice() : [],
    constraints: Array.isArray(l.constraints) ? l.constraints.slice() : []
  };
  return e.points.length === 0 && e.points.push({ id: 0, x: 0, y: 0, fixed: !0, construction: !0, externalReference: !1 }), e.constraints.some((t) => t.type === "⏚") || e.constraints.push({ id: 0, type: "⏚", points: [0] }), e;
}
m(ge, "sanitizeSketch");
export {
  G as C,
  te as a,
  Ae as b,
  D as c
};

// BREPcode's bridge to NVIDIA's SMLib B-rep kernel (github.com/NVIDIA-Omniverse/usd-brep).
//
// A deliberately thin layer: solids live here as integer handles, and every
// call is one kernel operation. The BREPcode feature list is interpreted in
// JavaScript (native/nvidia-kernel/adapter.cjs), which also does the face
// naming; this file only answers the questions that need the kernel's exact
// geometry (which source face does this face lie on, which faces does an edge
// join, where is its midpoint).
//
// Every entry point throws a JS Error carrying the SmApi status on failure,
// and the adapter turns that into an EngineRefusal, so a model the kernel
// cannot build falls through to the next kernel instead of showing junk.

#include <napi.h>

#include <SmSmlibAll.h>
#include <SmPoly.h>
#include <SmApiBrep.h>
#include <SmApiCurves.h>
#include <SmApiFillets.h>
#include <SmApiGeneral.h>
#include <SmApiPrimitives.h>
#include <SmApiQueries.h>
#include <SmApiSurfaces.h>
#include <SmThreadLocalStorage.h>

#include <cmath>
#include <map>
#include <string>
#include <unordered_map>
#include <vector>

namespace {

std::unordered_map<uint32_t, SmBrep*> g_solids;
uint32_t g_next = 1;

uint32_t keep(SmBrep* b) {
  uint32_t id = g_next++;
  g_solids[id] = b;
  return id;
}

[[noreturn]] void fail(const Napi::Env& env, const char* what, long status) {
  throw Napi::Error::New(env, std::string(what) + " failed (SmApi status " + std::to_string(status) + ")");
}

#define CHECK(env, call, what) do { long _s = (call); if (_s != SM_SUCCESS) fail(env, what, _s); } while (0)

SmBrep* get(const Napi::CallbackInfo& info, size_t i) {
  uint32_t id = info[i].As<Napi::Number>().Uint32Value();
  auto it = g_solids.find(id);
  if (it == g_solids.end()) throw Napi::Error::New(info.Env(), "unknown solid handle " + std::to_string(id));
  return it->second;
}

double num(const Napi::CallbackInfo& info, size_t i) { return info[i].As<Napi::Number>().DoubleValue(); }

void checkSolid(const Napi::Env& env, SmBrep* b, const char* what) {
  SmBoolean ok = FALSE;
  if (SmApiBrepIsManifoldSolid(b, ok) != SM_SUCCESS || !ok) {
    // SMLib can report success and hand back a body that is not a solid (a
    // tangent torus on a cylinder came back with zero volume); never let one
    // through as a result.
    throw Napi::Error::New(env, std::string(what) + " did not produce a closed solid");
  }
}

// ---------------------------------------------------------------- lifetime

Napi::Value Info(const Napi::CallbackInfo& info) {
  Napi::Object o = Napi::Object::New(info.Env());
  o.Set("kernel", "SMLib (NVIDIA usd-brep)");
  o.Set("version", "1.0.1");
  return o;
}

Napi::Value Free(const Napi::CallbackInfo& info) {
  uint32_t id = info[0].As<Napi::Number>().Uint32Value();
  auto it = g_solids.find(id);
  if (it != g_solids.end()) { delete it->second; g_solids.erase(it); }
  return info.Env().Undefined();
}

Napi::Value Count(const Napi::CallbackInfo& info) {
  return Napi::Number::New(info.Env(), (double)g_solids.size());
}

Napi::Value Copy(const Napi::CallbackInfo& info) {
  SmBrep* out = nullptr;
  CHECK(info.Env(), SmApiBrepCopy(get(info, 0), out), "copy");
  return Napi::Number::New(info.Env(), keep(out));
}

// -------------------------------------------------------------- primitives
//
// All in SMLib's own frame (Z up, base on z = 0); the adapter places them.

Napi::Value Box(const Napi::CallbackInfo& info) {
  SmBrep* b = nullptr;
  CHECK(info.Env(), SmApiCreateBox(SmVector3d(0, 0, 0), num(info, 0), num(info, 1), num(info, 2), b), "box");
  return Napi::Number::New(info.Env(), keep(b));
}

Napi::Value Cylinder(const Napi::CallbackInfo& info) {
  SmBrep* b = nullptr;
  CHECK(info.Env(), SmApiCreateCylinder(SmVector3d(0, 0, 0), num(info, 0), num(info, 1), b), "cylinder");
  return Napi::Number::New(info.Env(), keep(b));
}

Napi::Value Cone(const Napi::CallbackInfo& info) {
  SmBrep* b = nullptr;
  CHECK(info.Env(), SmApiCreateCone(SmVector3d(0, 0, 0), num(info, 0), num(info, 1), num(info, 2), b), "cone");
  return Napi::Number::New(info.Env(), keep(b));
}

Napi::Value Sphere(const Napi::CallbackInfo& info) {
  SmBrep* b = nullptr;
  CHECK(info.Env(), SmApiCreateSphere(SmVector3d(0, 0, 0), num(info, 0), b), "sphere");
  return Napi::Number::New(info.Env(), keep(b));
}

Napi::Value Torus(const Napi::CallbackInfo& info) {
  SmBrep* b = nullptr;
  CHECK(info.Env(), SmApiCreateTorus(SmVector3d(0, 0, 0), num(info, 0), num(info, 1), b), "torus");
  return Napi::Number::New(info.Env(), keep(b));
}

void freeCurves(SmTArray<SmCurve*>& curves);

// (majorRadius, tubeRadius, degrees): a part torus, the tube's circle (in the
// XZ plane, centred on +X) swept about +Z from +X toward +Y, capped at both ends
Napi::Value TorusArc(const Napi::CallbackInfo& info) {
  SmAxis2Placement frame;
  frame.SetCanonical(SmPoint3d(num(info, 0), 0, 0), SmVector3d(1, 0, 0), SmVector3d(0, 0, 1));
  SmCircle* c = nullptr;
  CHECK(info.Env(), SmCircle::CreateCanonical(*SmApiGetOrCreateContext(), frame, num(info, 1), c), "torus circle");
  SmTArray<SmCurve*> curves;
  curves.Add(c);
  SmBrep* b = nullptr;
  long s = SmApiCreateRotationalSweep(curves, SmPoint3d(0, 0, 0), SmVector3d(0, 0, 1), num(info, 2), TRUE, b);
  freeCurves(curves);
  if (s != SM_SUCCESS || !b) fail(info.Env(), "part torus", s);
  uint32_t id = keep(b);
  checkSolid(info.Env(), b, "part torus");
  return Napi::Number::New(info.Env(), id);
}

// -------------------------------------------------------------- transforms

Napi::Value Translate(const Napi::CallbackInfo& info) {
  CHECK(info.Env(), SmApiTranslate(get(info, 0), SmVector3d(num(info, 1), num(info, 2), num(info, 3))), "translate");
  return info.Env().Undefined();
}

Napi::Value Rotate(const Napi::CallbackInfo& info) {
  // (handle, px, py, pz, ax, ay, az, degrees)
  CHECK(info.Env(), SmApiRotate(get(info, 0), SmVector3d(num(info, 1), num(info, 2), num(info, 3)),
                                SmVector3d(num(info, 4), num(info, 5), num(info, 6)), num(info, 7)), "rotate");
  return info.Env().Undefined();
}

Napi::Value Scale(const Napi::CallbackInfo& info) {
  double sx = num(info, 1), sy = num(info, 2), sz = num(info, 3);
  if (sx > 0 && sy > 0 && sz > 0) {
    CHECK(info.Env(), SmApiScale(get(info, 0), SmVector3d(sx, sy, sz)), "scale");
    return info.Env().Undefined();
  }
  // a mirror: SmApiScale takes positive factors only, but the brep's own 4x4
  // transform splits a reflection out of the matrix and turns the faces over
  if (!(sx != 0 && sy != 0 && sz != 0)) throw Napi::Error::New(info.Env(), "a zero scale flattens the solid");
  const double m[4][4] = { { sx, 0, 0, 0 }, { 0, sy, 0, 0 }, { 0, 0, sz, 0 }, { 0, 0, 0, 1 } };
  SmBrep* b = get(info, 0);
  CHECK(info.Env(), b->Transform(m, TRUE), "mirror");
  checkSolid(info.Env(), b, "mirror");
  return info.Env().Undefined();
}

// ---------------------------------------------------------------- booleans

bool isSolid(SmBrep* b) {
  SmBoolean ok = FALSE;
  return b && SmApiBrepIsManifoldSolid(b, ok) == SM_SUCCESS && ok;
}

// (op, a, b): a is modified in place and stays valid; b is consumed.
// op: 1 union, 2 intersection, 3 difference (SmBooleanOperationType).
//
// SMLib's merge is not symmetric in its numerics: a bar unioned with an arm
// overlapping it by 0.01 (filament-guide) came back as an open shell, the arm
// unioned with the bar as the right solid. Union and intersection don't care
// about order, so when one order fails they are tried the other way round.
Napi::Value Boolean(const Napi::CallbackInfo& info) {
  int op = info[0].As<Napi::Number>().Int32Value();
  uint32_t ida = info[1].As<Napi::Number>().Uint32Value();
  uint32_t idb = info[2].As<Napi::Number>().Uint32Value();
  SmBrep* a = get(info, 1);
  SmBrep* b = get(info, 2);
  SmBrep* ca = nullptr;
  SmBrep* cb = nullptr;
  if (op != SM_BO_DIFFERENCE && (SmApiBrepCopy(a, ca) != SM_SUCCESS || SmApiBrepCopy(b, cb) != SM_SUCCESS)) {
    delete ca; delete cb; ca = cb = nullptr;
  }
  SmBrep* out = nullptr;
  long s = SmApiBoolean(a, b, (SmBooleanOperationType)op, out);
  if (s == SM_SUCCESS && out) {
    g_solids.erase(idb);          // deleted by the kernel on success
    g_solids[ida] = out;          // aliases a
  }
  if (s == SM_SUCCESS && isSolid(out)) { delete ca; delete cb; return info.Env().Undefined(); }
  if (ca && cb) {
    SmBrep* out2 = nullptr;
    long s2 = SmApiBoolean(cb, ca, (SmBooleanOperationType)op, out2);
    if (s2 == SM_SUCCESS && isSolid(out2)) {
      // ca was consumed and cb became out2; drop what the first try left
      if (s == SM_SUCCESS && out) delete out;
      else { delete a; delete b; g_solids.erase(idb); }
      g_solids[ida] = out2;
      return info.Env().Undefined();
    }
    if (s2 == SM_SUCCESS && out2) delete out2;
    else { delete ca; delete cb; }
  } else { delete ca; delete cb; }
  if (s != SM_SUCCESS || !out) fail(info.Env(), "boolean", s);
  throw Napi::Error::New(info.Env(), "boolean did not produce a closed solid");
}

// ------------------------------------------------------------------ sweeps
//
// A profile is a flat array of segments: [0, x0,y0,z0, x1,y1,z1] for a line,
// [1, then four control points] for a cubic Bezier, [2, cx,cy,cz, r, start,
// end] for a counter-clockwise circular arc in a plane of constant z (degrees,
// within [-360, 360], end > start; an exact rational quadratic). Loops are
// simply listed one after another; the kernel sorts outer boundaries from
// holes itself.

void profileCurves(const Napi::CallbackInfo& info, size_t i, SmTArray<SmCurve*>& out) {
  Napi::Array segs = info[i].As<Napi::Array>();
  for (uint32_t k = 0; k < segs.Length(); k++) {
    Napi::Array s = segs.Get(k).As<Napi::Array>();
    auto at = [&](uint32_t j) { return s.Get(j).As<Napi::Number>().DoubleValue(); };
    int kind = (int)at(0);
    if (kind == 0) {
      SmLine* l = nullptr;
      CHECK(info.Env(), SmApiCreateLineSegment(SmPoint3d(at(1), at(2), at(3)), SmPoint3d(at(4), at(5), at(6)), l), "line segment");
      out.Add(l);
    } else if (kind == 2) {
      SmBSplineCurve* c = nullptr;
      CHECK(info.Env(), SmApiCreateArc(SmPoint3d(at(1), at(2), at(3)), at(4), at(5), at(6), c), "arc");
      out.Add(c);
    } else {
      SmTArray<SmPoint3d> pts;
      for (int p = 0; p < 4; p++) pts.Add(SmPoint3d(at(1 + 3 * p), at(2 + 3 * p), at(3 + 3 * p)));
      SmTArray<double> knots; knots.Add(0.0); knots.Add(1.0);
      SmTArray<ULONG> mult; mult.Add(4); mult.Add(4);
      SmBSplineCurve* c = nullptr;
      CHECK(info.Env(), SmApiCreateCanonicalCurve(pts, knots, mult, nullptr, 3, SM_CF_POLYLINE_FORM, c), "bezier");
      out.Add(c);
    }
  }
}

void freeCurves(SmTArray<SmCurve*>& curves) {
  for (ULONG k = 0; k < curves.GetSize(); k++) delete curves[k];
}

// (segments, dx, dy, dz, distance)
Napi::Value Extrude(const Napi::CallbackInfo& info) {
  SmTArray<SmCurve*> curves;
  profileCurves(info, 0, curves);
  SmBrep* b = nullptr;
  long s = SmApiCreateLinearSweep(curves, SmVector3d(num(info, 1), num(info, 2), num(info, 3)), num(info, 4), TRUE, b);
  freeCurves(curves);
  if (s != SM_SUCCESS || !b) fail(info.Env(), "extrude", s);
  uint32_t id = keep(b);
  checkSolid(info.Env(), b, "extrude");
  return Napi::Number::New(info.Env(), id);
}

// A profile (z = 0) as it stands at one height of a twisted extrude: turned
// `deg` about +Z, scaled by `s` about the origin, lifted to `z`. Lines and
// Beziers move point by point; an arc keeps its exact form (its centre moves,
// its radius scales, its angles turn).
void profileCurvesAt(const Napi::CallbackInfo& info, size_t i, double deg, double s, double z, SmTArray<SmCurve*>& out) {
  const double a = deg * 3.14159265358979323846 / 180.0, c = std::cos(a), sn = std::sin(a);
  auto px = [&](double x, double y) { return s * (x * c - y * sn); };
  auto py = [&](double x, double y) { return s * (x * sn + y * c); };
  Napi::Array segs = info[i].As<Napi::Array>();
  for (uint32_t k = 0; k < segs.Length(); k++) {
    Napi::Array g = segs.Get(k).As<Napi::Array>();
    auto at = [&](uint32_t j) { return g.Get(j).As<Napi::Number>().DoubleValue(); };
    int kind = (int)at(0);
    if (kind == 0) {
      SmLine* l = nullptr;
      CHECK(info.Env(), SmApiCreateLineSegment(SmPoint3d(px(at(1), at(2)), py(at(1), at(2)), z),
                                               SmPoint3d(px(at(4), at(5)), py(at(4), at(5)), z), l), "line segment");
      out.Add(l);
    } else if (kind == 2) {
      // SmApiCreateArc takes angles within [-360, 360] (status 1007 past
      // that): turned, the start is brought back to [-180, 180) and, if the
      // end then runs past 360, both drop a turn
      const double sweep = at(6) - at(5);
      double a0 = std::fmod(at(5) + deg, 360.0);
      if (a0 >= 180.0) a0 -= 360.0;
      if (a0 < -180.0) a0 += 360.0;
      if (a0 + sweep > 360.0) a0 -= 360.0;
      SmBSplineCurve* cv = nullptr;
      CHECK(info.Env(), SmApiCreateArc(SmPoint3d(px(at(1), at(2)), py(at(1), at(2)), z), s * at(4), a0, a0 + sweep, cv), "arc");
      out.Add(cv);
    } else {
      SmTArray<SmPoint3d> pts;
      for (int p = 0; p < 4; p++) {
        double x = at(1 + 3 * p), y = at(2 + 3 * p);
        pts.Add(SmPoint3d(px(x, y), py(x, y), z));
      }
      SmTArray<double> knots; knots.Add(0.0); knots.Add(1.0);
      SmTArray<ULONG> mult; mult.Add(4); mult.Add(4);
      SmBSplineCurve* cv = nullptr;
      CHECK(info.Env(), SmApiCreateCanonicalCurve(pts, knots, mult, nullptr, 3, SM_CF_POLYLINE_FORM, cv), "bezier");
      out.Add(cv);
    }
  }
}

// (segments, h, twistDeg | [deg per profile], topScale | [scale per profile], profiles, matrix16)
// A twisted (and/or tapered) extrude: the profile copied `profiles` times up
// the height, each turned and scaled its share, and a solid skinned through
// them (cubic in the loft direction, capped flat at both ends). matrix16 is
// three.js's column-major 4x4, applied afterwards: column i is where axis i
// goes, which is exactly SmBrep::Transform's row i.
Napi::Value TwistExtrude(const Napi::CallbackInfo& info) {
  const double h = num(info, 1);
  const ULONG n = (ULONG)info[4].As<Napi::Number>().Uint32Value();
  // a number spreads evenly up the height; a list gives each profile its own
  // (src/twist.js works out curved ones)
  auto per = [&](size_t arg, ULONG k, bool scale) -> double {
    const double u = (double)k / (double)(n - 1);
    if (info[arg].IsArray()) {
      Napi::Array a = info[arg].As<Napi::Array>();
      if (a.Length() != n) throw Napi::Error::New(info.Env(), "twist extrude: one value per profile");
      return a.Get(k).As<Napi::Number>().DoubleValue();
    }
    const double v = num(info, arg);
    return scale ? 1.0 + (v - 1.0) * u : v * u;
  };
  if (!(h > 0) || n < 2) throw Napi::Error::New(info.Env(), "twist extrude: bad height or profile count");
  for (ULONG k = 0; k < n; k++) if (!(per(3, k, true) > 0)) throw Napi::Error::New(info.Env(), "twist extrude: a scale must be above 0");
  SmTArray<SmCurve*> curves;
  SmTArray<ULONG> counts;
  try {
    for (ULONG k = 0; k < n; k++) {
      const double u = (double)k / (double)(n - 1);
      const ULONG before = curves.GetSize();
      profileCurvesAt(info, 0, per(2, k, false), per(3, k, true), h * u, curves);
      counts.Add(curves.GetSize() - before);
    }
  } catch (...) { freeCurves(curves); throw; }
  SmTArray<const SmCurve*> view;
  for (ULONG k = 0; k < curves.GetSize(); k++) view.Add(curves[k]);
  SmBrep* b = nullptr;
  long s = SmApiCreateSkinPrimitive(counts, view, n >= 4 ? 3 : 1, TRUE, b, nullptr, nullptr, nullptr);
  freeCurves(curves);
  if (s != SM_SUCCESS || !b) fail(info.Env(), "twist extrude", s);
  uint32_t id = keep(b);
  Napi::Array m = info[5].As<Napi::Array>();
  double t[4][4];
  bool identity = true;
  for (int r = 0; r < 4; r++) for (int c = 0; c < 4; c++) {
    t[r][c] = m.Get(4 * r + c).As<Napi::Number>().DoubleValue();
    if (std::fabs(t[r][c] - (r == c ? 1.0 : 0.0)) > 1e-12) identity = false;
  }
  if (!identity) CHECK(info.Env(), b->Transform(t, TRUE), "twist extrude placement");
  checkSolid(info.Env(), b, "twist extrude");
  return Napi::Number::New(info.Env(), id);
}

// (segments, px, py, pz, ax, ay, az, degrees)
Napi::Value Revolve(const Napi::CallbackInfo& info) {
  SmTArray<SmCurve*> curves;
  profileCurves(info, 0, curves);
  SmBrep* b = nullptr;
  long s = SmApiCreateRotationalSweep(curves, SmPoint3d(num(info, 1), num(info, 2), num(info, 3)),
                                      SmVector3d(num(info, 4), num(info, 5), num(info, 6)), num(info, 7), TRUE, b);
  freeCurves(curves);
  if (s != SM_SUCCESS || !b) fail(info.Env(), "revolve", s);
  uint32_t id = keep(b);
  checkSolid(info.Env(), b, "revolve");
  return Napi::Number::New(info.Env(), id);
}

// ----------------------------------------------------------------- fillets

// (handle, [edge indices], radius, xsect) xsect: 0 linear (chamfer), 1 circular
Napi::Value Fillet(const Napi::CallbackInfo& info) {
  SmBrep* b = get(info, 0);
  SmTArray<SmEdge*> all;
  b->GetEdges(all);
  Napi::Array idx = info[1].As<Napi::Array>();
  SmTArray<SmEdge*> pick;
  for (uint32_t k = 0; k < idx.Length(); k++) {
    uint32_t e = idx.Get(k).As<Napi::Number>().Uint32Value();
    if (e >= all.GetSize()) throw Napi::Error::New(info.Env(), "edge index out of range");
    pick.Add(all[e]);
  }
  int xsect = info[3].As<Napi::Number>().Int32Value();
  CHECK(info.Env(), SmApiFilletEdges(b, pick, num(info, 2), (ULONG)xsect, 1, 1.0), xsect ? "fillet" : "chamfer");
  checkSolid(info.Env(), b, xsect ? "fillet" : "chamfer");
  return info.Env().Undefined();
}

// ----------------------------------------------------------------- queries

SmVector3d outwardNormal(SmFace* f, const SmPoint3d& p) {
  SmPoint3d cp;
  SmTArray<SmPoint2d> uvs;
  double d = 0;
  SmVector3d n(0, 0, 0);
  if (SmApiSurfaceClosestPoint(f->GetSurface(), p, cp, uvs, d) != SM_SUCCESS || uvs.GetSize() == 0) return n;
  SmVector2d uv(uvs[0].x, uvs[0].y);
  if (SmApiEvaluateSurfaceNormal(f->GetSurface(), uv, n) != SM_SUCCESS) return SmVector3d(0, 0, 0);
  SmBrep* brep = f->GetBrep();
  SmFaceuse* up = f->GetUpwardFaceuse();
  if (brep && up && up->GetShell() && brep->GetInfiniteRegion() != up->GetShell()->GetRegion()) n *= -1.0;
  return n;
}

// faces(handle) -> Float64Array, 6 per face: an interior point and the
// outward normal there.
Napi::Value Faces(const Napi::CallbackInfo& info) {
  SmBrep* b = get(info, 0);
  SmTArray<SmFace*> faces;
  b->GetFaces(faces);
  Napi::Float64Array out = Napi::Float64Array::New(info.Env(), faces.GetSize() * 6);
  for (ULONG i = 0; i < faces.GetSize(); i++) {
    SmPoint3d p(0, 0, 0);
    if (SmApiFaceInternalPoint(faces[i], p) != SM_SUCCESS) {
      SmPoint3d mn, mx;
      SmApiFaceBoundingBox(faces[i], FALSE, mn, mx);
      p = SmPoint3d((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, (mn.z + mx.z) / 2);
    }
    SmVector3d n = outwardNormal(faces[i], p);
    double* o = out.Data() + 6 * i;
    o[0] = p.x; o[1] = p.y; o[2] = p.z; o[3] = n.x; o[4] = n.y; o[5] = n.z;
  }
  return out;
}

// matchFaces(out, [sources...], tol) -> Int32Array, 2 per face of `out`:
// (source position, face index) of the source face it lies on, or (-1, -1)
// for a face no source had (a fillet's blend, a boolean's new seam face).
Napi::Value MatchFaces(const Napi::CallbackInfo& info) {
  SmBrep* b = get(info, 0);
  Napi::Array srcIds = info[1].As<Napi::Array>();
  double tol = num(info, 2);
  std::vector<SmTArray<SmFace*>> src(srcIds.Length());
  std::vector<std::vector<std::pair<SmPoint3d, SmPoint3d>>> boxes(srcIds.Length());
  for (uint32_t s = 0; s < srcIds.Length(); s++) {
    uint32_t id = srcIds.Get(s).As<Napi::Number>().Uint32Value();
    auto it = g_solids.find(id);
    if (it == g_solids.end()) throw Napi::Error::New(info.Env(), "unknown source handle");
    it->second->GetFaces(src[s]);
    for (ULONG j = 0; j < src[s].GetSize(); j++) {
      SmPoint3d mn, mx;
      SmApiFaceBoundingBox(src[s][j], FALSE, mn, mx);
      boxes[s].push_back({ mn, mx });
    }
  }
  SmTArray<SmFace*> faces;
  b->GetFaces(faces);
  Napi::Int32Array out = Napi::Int32Array::New(info.Env(), faces.GetSize() * 2);
  for (ULONG i = 0; i < faces.GetSize(); i++) {
    int bs = -1, bf = -1;
    double best = tol;
    SmPoint3d p;
    if (SmApiFaceInternalPoint(faces[i], p) == SM_SUCCESS) {
      SmVector3d n = outwardNormal(faces[i], p);
      for (size_t s = 0; s < src.size() && best > 0; s++) {
        for (ULONG j = 0; j < src[s].GetSize(); j++) {
          const auto& bx = boxes[s][j];
          if (p.x < bx.first.x - tol || p.y < bx.first.y - tol || p.z < bx.first.z - tol ||
              p.x > bx.second.x + tol || p.y > bx.second.y + tol || p.z > bx.second.z + tol) continue;
          SmPoint3d cp;
          double d = 1e300;
          if (SmApiFaceClosestPoint(src[s][j], p, cp, d) != SM_SUCCESS || d >= best) continue;
          // a face of the same surface but the other side of a thin wall
          // lies within tolerance too; the normals tell them apart (either
          // sign: a subtracted tool's face is flipped in the result)
          SmVector3d m = outwardNormal(src[s][j], cp);
          double dot = std::fabs(n.x * m.x + n.y * m.y + n.z * m.z);
          if (dot < 0.98) continue;
          best = d; bs = (int)s; bf = (int)j;
        }
      }
    }
    out[2 * i] = bs;
    out[2 * i + 1] = bf;
  }
  return out;
}

// edges(handle) -> Float64Array, 5 per edge: face index A, face index B
// (-1 if missing), and the edge's midpoint.
Napi::Value Edges(const Napi::CallbackInfo& info) {
  SmBrep* b = get(info, 0);
  SmTArray<SmFace*> faces;
  b->GetFaces(faces);
  std::unordered_map<SmFace*, int> faceIdx;
  for (ULONG i = 0; i < faces.GetSize(); i++) faceIdx[faces[i]] = (int)i;
  SmTArray<SmEdge*> edges;
  b->GetEdges(edges);
  Napi::Float64Array out = Napi::Float64Array::New(info.Env(), edges.GetSize() * 5);
  for (ULONG i = 0; i < edges.GetSize(); i++) {
    SmTArray<SmFace*> ef;
    edges[i]->GetFaces(ef);
    double* o = out.Data() + 5 * i;
    o[0] = ef.GetSize() > 0 && faceIdx.count(ef[0]) ? faceIdx[ef[0]] : -1;
    o[1] = ef.GetSize() > 1 && faceIdx.count(ef[1]) ? faceIdx[ef[1]] : -1;
    double lo = 0, hi = 0;
    SmVector3d mid(0, 0, 0);
    if (SmApiEdgeParameterRange(edges[i], lo, hi) == SM_SUCCESS) {
      SmVector3d* pt = &mid;
      SmVector3d* d1 = nullptr;
      SmVector3d* d2 = nullptr;
      SmApiEvaluateCurve(edges[i]->GetCurve(), (lo + hi) / 2, pt, d1, d2);
    }
    o[2] = mid.x; o[3] = mid.y; o[4] = mid.z;
  }
  return out;
}

// bbox(handle) -> [minX, minY, minZ, maxX, maxY, maxZ], tight to the surfaces
Napi::Value BBox(const Napi::CallbackInfo& info) {
  SmPoint3d mn, mx;
  CHECK(info.Env(), SmApiBrepBoundingBox(get(info, 0), TRUE, mn, mx), "bounding box");
  Napi::Float64Array out = Napi::Float64Array::New(info.Env(), 6);
  out[0] = mn.x; out[1] = mn.y; out[2] = mn.z; out[3] = mx.x; out[4] = mx.y; out[5] = mx.z;
  return out;
}

Napi::Value Volume(const Napi::CallbackInfo& info) {
  double v = 0;
  CHECK(info.Env(), SmApiBrepComputeVolume(get(info, 0), 1e-3, v), "volume");
  return Napi::Number::New(info.Env(), v);
}

// ------------------------------------------------------------ tessellation

// tessellate(handle, chordHeight, angleDeg) ->
//   { positions: Float32Array, normals: Float32Array, indices: Uint32Array,
//     faceIds: Uint32Array (B-rep face index per triangle) }
// Vertices are per face, so a crease stays sharp and each face's normals are
// its own.
Napi::Value Tessellate(const Napi::CallbackInfo& info) {
  SmBrep* b = get(info, 0);
  SmTessellationParams params;
  params.dChordHeightTol = num(info, 1);
  params.dCurveAngleTolDeg = num(info, 2);
  params.dSurfaceAngleTolDeg = num(info, 2);
  // optional: a longest edge (world units), and a worst aspect ratio. A
  // twisted wall is curved across its width as well as up it, and without an
  // edge limit the tessellator draws it as slivers that cut through the curve
  // (the aspect limit alone changed nothing, measured)
  if (info.Length() > 3 && info[3].IsNumber()) params.dMaxEdgeLength = num(info, 3);
  if (info.Length() > 4 && info[4].IsNumber()) params.dMaxAspectRatio = num(info, 4);
  SmPolyBrep* pb = nullptr;
  CHECK(info.Env(), SmApiTessellate(b, pb, params), "tessellate");

  SmTArray<SmFace*> faces;
  b->GetFaces(faces);
  std::unordered_map<SmFace*, uint32_t> faceIdx;
  for (ULONG i = 0; i < faces.GetSize(); i++) faceIdx[faces[i]] = i;

  std::vector<float> pos, nrm;
  std::vector<uint32_t> idx, fid;
  SmTArray<SmPolyFace*> polyFaces;
  pb->GetPolyFaces(polyFaces);
  for (ULONG i = 0; i < polyFaces.GetSize(); i++) {
    SmPolyFace* pf = polyFaces[i];
    SmPolyLoop* loop = pf->GetOuterPolyLoop();
    if (!loop) continue;
    SmTArray<SmPolyEdge*> pe;
    loop->GetPolyEdges(pe);
    ULONG n = pe.GetSize();
    if (n < 3) continue;
    SmFace* orig = pf->GetOriginalFace();
    uint32_t f = faceIdx.count(orig) ? faceIdx[orig] : 0xFFFFFFFFu;
    uint32_t base = (uint32_t)(pos.size() / 3);
    for (ULONG j = 0; j < n; j++) {
      SmPolyVertex* v = pe[j]->GetStartPolyVertex();
      const SmPoint3d& p = v->GetPoint();
      pos.push_back((float)p.x); pos.push_back((float)p.y); pos.push_back((float)p.z);
      // the vertex's normal on this face, not the average across a crease
      const auto& ns = v->GetNormalsRef();
      const auto& fs = v->GetFacesRef();
      SmVector3d nv(0, 0, 0);
      bool found = false;
      for (ULONG k = 0; k < fs.GetSize() && k < ns.GetSize(); k++) {
        if (fs[k] == static_cast<SmTopology*>(orig)) { nv = ns[k]; found = true; break; }
      }
      if (!found) for (ULONG k = 0; k < ns.GetSize(); k++) nv += ns[k];
      double len = std::sqrt(nv.x * nv.x + nv.y * nv.y + nv.z * nv.z);
      if (len > 1e-30) nv /= len;
      nrm.push_back((float)nv.x); nrm.push_back((float)nv.y); nrm.push_back((float)nv.z);
    }
    for (ULONG j = 1; j + 1 < n; j++) {
      idx.push_back(base); idx.push_back(base + j); idx.push_back(base + j + 1);
      fid.push_back(f);
    }
  }
  delete pb;

  Napi::Env env = info.Env();
  Napi::Object o = Napi::Object::New(env);
  auto f32 = [&](const std::vector<float>& v) {
    Napi::Float32Array a = Napi::Float32Array::New(env, v.size());
    if (!v.empty()) memcpy(a.Data(), v.data(), v.size() * sizeof(float));
    return a;
  };
  auto u32 = [&](const std::vector<uint32_t>& v) {
    Napi::Uint32Array a = Napi::Uint32Array::New(env, v.size());
    if (!v.empty()) memcpy(a.Data(), v.data(), v.size() * sizeof(uint32_t));
    return a;
  };
  o.Set("positions", f32(pos));
  o.Set("normals", f32(nrm));
  o.Set("indices", u32(idx));
  o.Set("faceIds", u32(fid));
  return o;
}

// ------------------------------------------------------------------ module

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  // SMLib.dll sets up its thread-local storage in DllMain. Linked into this
  // addon there is no such hook (nothing pulls SmDllMain.obj in), so the
  // kernel's first boolean found no TLS slot and threw. Do it here, on the
  // one thread that ever calls the kernel. A no-op off Windows.
  SmThreadLocalStorage::SetupTLS(SM_TLS_PROCESS_ATTACH);
  SmApiCreateContext();
  auto fn = [&](const char* name, Napi::Value (*f)(const Napi::CallbackInfo&)) {
    exports.Set(name, Napi::Function::New(env, [f](const Napi::CallbackInfo& info) -> Napi::Value {
      try { return f(info); }
      catch (const Napi::Error&) { throw; }
      catch (const std::exception& e) { throw Napi::Error::New(info.Env(), std::string("SMLib: ") + e.what()); }
      catch (...) { throw Napi::Error::New(info.Env(), "SMLib: unknown failure"); }
    }, name));
  };
  fn("info", Info);
  fn("free", Free);
  fn("count", Count);
  fn("copy", Copy);
  fn("box", Box);
  fn("cylinder", Cylinder);
  fn("cone", Cone);
  fn("sphere", Sphere);
  fn("torus", Torus);
  fn("torusArc", TorusArc);
  fn("translate", Translate);
  fn("rotate", Rotate);
  fn("scale", Scale);
  fn("boolean", Boolean);
  fn("extrude", Extrude);
  fn("twistExtrude", TwistExtrude);
  fn("revolve", Revolve);
  fn("fillet", Fillet);
  fn("faces", Faces);
  fn("matchFaces", MatchFaces);
  fn("edges", Edges);
  fn("bbox", BBox);
  fn("volume", Volume);
  fn("tessellate", Tessellate);
  return exports;
}

}  // namespace

NODE_API_MODULE(brepcode_nvidia, Init)

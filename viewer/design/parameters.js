// design/parameters.js — Fusion's "Change Parameters" for BREPcode.
//
// The model's parameters are its top-level `const name = …;` lines whose value
// is a number or a formula of numbers and other parameters (`width / 2 + 3`,
// `Math.max(a, b)`). This module reads them, evaluates the formulas (a small
// walker over the parsed expression: arithmetic, other parameters and Math's
// number functions; never eval), rewrites one, and adds a new one. The panel
// (openParameters) is loaded the first time Parameters is clicked; the rest is
// pure and used by the sketcher too (a dimension typed as a formula).

import { Parser } from "../../vendor/acorn/acorn.mjs";

const MATH_FNS = new Set(["abs", "min", "max", "round", "floor", "ceil", "sqrt", "cbrt", "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "hypot", "pow", "exp", "log", "sign", "trunc"]);
const MATH_K = { PI: Math.PI, E: Math.E, SQRT2: Math.SQRT2 };

// The number an expression node comes to, with `scope` (name -> number) for
// the names it uses. Throws on anything else (a string, a call that isn't
// Math's, an unknown name).
function evalNode(n, scope) {
  switch (n.type) {
    case "Literal":
      if (typeof n.value !== "number") throw new Error("only numbers");
      return n.value;
    case "Identifier":
      if (!scope.has(n.name)) throw new Error(`there is no parameter ${n.name}`);
      return scope.get(n.name);
    case "UnaryExpression":
      if (n.operator === "-") return -evalNode(n.argument, scope);
      if (n.operator === "+") return +evalNode(n.argument, scope);
      throw new Error(`no ${n.operator} here`);
    case "BinaryExpression": {
      const a = evalNode(n.left, scope), b = evalNode(n.right, scope);
      switch (n.operator) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return a / b;
        case "%": return a % b;
        case "**": return a ** b;
        default: throw new Error(`no ${n.operator} here`);
      }
    }
    case "MemberExpression":
      if (n.object.type === "Identifier" && n.object.name === "Math" && !n.computed && n.property.name in MATH_K) return MATH_K[n.property.name];
      throw new Error("only Math.PI and Math.E");
    case "CallExpression":
      if (n.callee.type === "MemberExpression" && n.callee.object.name === "Math" && MATH_FNS.has(n.callee.property.name)) {
        return Math[n.callee.property.name](...n.arguments.map((x) => evalNode(x, scope)));
      }
      throw new Error("only Math's functions");
    default:
      throw new Error("not a number formula");
  }
}

// evalFormula("width / 2", scope) -> number, or { error }
export function evalFormula(src, scope = new Map()) {
  try {
    const n = Parser.parseExpressionAt(String(src), 0, { ecmaVersion: "latest" });
    if (n.end !== String(src).trimEnd().length) return { error: "that isn't one formula" };
    const v = evalNode(n, scope);
    return Number.isFinite(v) ? v : { error: "that doesn't come to a number" };
  } catch (e) {
    return { error: String(e.message || e).replace(/\s*\(\d+:\d+\)$/, "") };
  }
}

// readParams(text) -> [{ name, expr, value, start, end, formula }] in order
// (start/end: the value's text). A const whose value isn't a number formula
// (a shape, a list, a string) is not a parameter. Values are worked out top
// down, so a parameter may use the ones above it.
export function readParams(text) {
  let ast;
  try { ast = Parser.parse(text, { ecmaVersion: "latest", sourceType: "script", allowReturnOutsideFunction: true }); } catch { return []; }
  const scope = new Map(), out = [];
  for (const st of ast.body) {
    if (st.type !== "VariableDeclaration" || st.kind !== "const") continue;
    for (const d of st.declarations) {
      if (d.id.type !== "Identifier" || !d.init) continue;
      let v;
      try { v = evalNode(d.init, scope); } catch { continue; }
      if (!Number.isFinite(v)) continue;
      scope.set(d.id.name, v);
      const expr = text.slice(d.init.start, d.init.end);
      out.push({ name: d.id.name, expr, value: v, start: d.init.start, end: d.init.end, formula: !/^-?\s*[\d.]+(e[-+]?\d+)?$/i.test(expr.trim()) });
    }
  }
  return out;
}
export const paramScope = (text) => new Map(readParams(text).map((p) => [p.name, p.value]));

// setParam(text, name, expr) -> { text } | { error }. The formula may only
// use the parameters above this one (they are worked out top down), and every
// parameter below still has to come to a number.
export function setParam(text, name, expr) {
  const list = readParams(text), at = list.findIndex((p) => p.name === name);
  if (at < 0) return { error: `there is no parameter ${name}` };
  const above = new Map(list.slice(0, at).map((p) => [p.name, p.value]));
  const v = evalFormula(expr, above);
  if (typeof v !== "number") return { error: list.some((p, i) => i >= at && new RegExp(`\\b${p.name}\\b`).test(expr)) ? `${name} can only use parameters above it` : v.error };
  const p = list[at];
  const next = text.slice(0, p.start) + String(expr).trim() + text.slice(p.end);
  const after = readParams(next);
  if (after.length < list.length) return { error: "that breaks a parameter further down" };
  return { text: next, value: v };
}

// addParam(text, name, expr) -> { text } | { error }: a new const under the
// last parameter (or at the top).
export function addParam(text, name, expr) {
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) return { error: "a name is letters, digits and _ (not starting with a digit)" };
  if (new RegExp(`(^|[^\\w$.])${name.replace(/\$/g, "\\$")}\\s*=`).test(text) || readParams(text).some((p) => p.name === name)) return { error: `${name} is already used` };
  const v = evalFormula(expr, paramScope(text));
  if (typeof v !== "number") return v;
  const list = readParams(text);
  const line = `const ${name} = ${String(expr).trim()};\n`;
  if (!list.length) return { text: line + text, value: v };
  const end = text.indexOf("\n", list[list.length - 1].end);
  const at = end < 0 ? text.length : end + 1;
  return { text: text.slice(0, at) + (end < 0 ? "\n" : "") + line + text.slice(at), value: v };
}

// Where a name is used, besides its own line (so the panel can say "used by").
export function usesOf(text, name) {
  const list = readParams(text);
  return list.filter((p) => p.name !== name && new RegExp(`\\b${name}\\b`).test(p.expr)).map((p) => p.name);
}

// ------------------------------------------------------------------ panel
const CSS = `
#dz-params { top: 56px; right: 12px; width: 360px; max-height: calc(100vh - 150px); overflow: auto; padding: 0 0 10px; z-index: 31; }
body.dz-ribbon #dz-params { top: 104px; }
#dz-params h3 { margin: 0; padding: 9px 12px 7px; font-size: 13px; font-weight: 650; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--border, #26314a); }
#dz-params h3 .x { margin-left: auto; border: 0; background: transparent; cursor: pointer; color: var(--muted, #8ea0c0); font-size: 15px; }
#dz-params table { width: calc(100% - 24px); margin: 8px 12px 0; border-collapse: collapse; font-size: 12px; }
#dz-params th { text-align: left; font-weight: 500; color: var(--muted, #8ea0c0); font-size: 11px; padding: 2px 4px; }
#dz-params td { padding: 2px 4px; vertical-align: middle; }
#dz-params td.n { font: 600 12px ui-monospace, Consolas, monospace; white-space: nowrap; }
#dz-params td.v { font: 12px ui-monospace, Consolas, monospace; color: var(--muted, #8ea0c0); text-align: right; white-space: nowrap; }
#dz-params input { width: 100%; min-width: 0; box-sizing: border-box; padding: 3px 6px; border-radius: 6px; border: 1px solid var(--border, #26314a); background: rgba(0,0,0,.22); color: inherit; font: 12px ui-monospace, Consolas, monospace; }
#dz-params input.bad { border-color: #ff6b6b; }
#dz-params .add { display: flex; gap: 6px; margin: 10px 12px 0; }
#dz-params .add input:first-child { width: 90px; flex: none; }
#dz-params .add button { border: 1px solid var(--border, #26314a); background: transparent; border-radius: 7px; padding: 3px 10px; cursor: pointer; color: inherit; }
#dz-params .note { margin: 8px 12px 0; font-size: 11px; color: var(--muted, #8ea0c0); }
#dz-params .note.err { color: #ffb3b3; }
`;
let cssDone = false;
export function openParameters({ host }) {
  if (!cssDone) { const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st); cssDone = true; }
  document.getElementById("dz-params")?.remove();
  const el = document.createElement("div");
  el.id = "dz-params";
  el.className = "dz-ui";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Parameters");
  document.body.appendChild(el);
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const fmt = (v) => String(Math.round(v * 1000) / 1000);
  let note = { t: "", err: false };
  function render() {
    const text = host.text(), list = readParams(text);
    el.innerHTML = `<h3>Parameters<button type="button" class="x" title="Close (Esc)" aria-label="Close">×</button></h3>`
      + (list.length ? `<table><tr><th>Name</th><th>Value or formula</th><th style="text-align:right">=</th></tr>`
        + list.map((p) => `<tr><td class="n">${esc(p.name)}</td><td><input data-p="${esc(p.name)}" value="${esc(p.expr)}" aria-label="${esc(p.name)}" title="${usesOf(text, p.name).length ? `used by ${esc(usesOf(text, p.name).join(", "))}` : "a number, or a formula of the parameters above it"}" /></td><td class="v">${fmt(p.value)}</td></tr>`).join("")
        + `</table>` : `<div class="note">No parameters yet. Add one below, or name a sketch dimension (★ name) to make it one.</div>`)
      + `<div class="add"><input placeholder="name" aria-label="New parameter name" /><input placeholder="value or formula" aria-label="New parameter value" /><button type="button" class="go">Add</button></div>`
      + `<div class="note">A formula can use the parameters above it, + − × ÷ and Math (Math.PI, Math.max…), e.g. <code>width / 2 + 3</code>. Enter applies it; every size that uses it follows.</div>`
      + (note.t ? `<div class="note${note.err ? " err" : ""}">${esc(note.t)}</div>` : "");
  }
  const say = (t, err = false) => { note = { t, err }; render(); };
  async function apply(next, msg) {
    const r = await host.commit(next);
    say(r?.ok === false ? `It didn't build: ${r.failure?.message ?? "see the status line"}. Ctrl+Z puts it back.` : msg, r?.ok === false);
  }
  el.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") { close(); return; }
    if (e.key !== "Enter") return;
    const inp = e.target.closest("input");
    if (!inp) return;
    if (inp.dataset.p) {
      const r = setParam(host.text(), inp.dataset.p, inp.value);
      if (r.error) { inp.classList.add("bad"); say(`${inp.dataset.p}: ${r.error}.`, true); return; }
      apply(r.text, `${inp.dataset.p} = ${fmt(r.value)}.`);
    } else el.querySelector(".go").click();
  });
  el.addEventListener("click", (e) => {
    if (e.target.closest(".x")) { close(); return; }
    if (e.target.closest(".go")) {
      const [n, v] = [...el.querySelectorAll(".add input")].map((i) => i.value.trim());
      if (!n || !v) { say("Give the new parameter a name and a value.", true); return; }
      const r = addParam(host.text(), n, v);
      if (r.error) { say(r.error, true); return; }
      apply(r.text, `${n} added (= ${fmt(r.value)}). Use it in a formula, or as a sketch dimension's value.`);
    }
  });
  const off = host.onBuilt?.(() => { if (document.body.contains(el) && !el.contains(document.activeElement)) render(); });
  function close() { el.remove(); off?.(); }
  render();
  return { close, render, el };
}

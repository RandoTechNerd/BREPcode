// A stand-in for Node's "node:module", so the browser can load the kernel.
//
// The vendored BREP.io kernel is built for both Node and the browser, and two
// of its chunks carry a `import("node:module")` on the Node side of an
// environment check. A browser cannot resolve that specifier at all: it is not
// a URL, so the import fails before the check that would have skipped it ever
// runs. Chrome logs a CORS complaint about it and limps on; other engines are
// less forgiving.
//
// The kernel is used UNMODIFIED — its licence voids the permissions granted if
// changes are not contributed back — so the fix cannot be in the kernel. It is
// an import-map entry pointing that specifier here instead, which makes the
// module resolve, load, and do nothing.
//
// Nothing here is ever meant to RUN. If it does, the kernel has taken its Node
// path inside a browser, and the right outcome is a clear error naming the
// cause rather than a mysterious failure three frames later. See also the
// early `delete window.process` in index.html, which is what stops that path
// being taken in the first place.

const wrongEnvironment = (name) => () => {
  throw new Error(
    `node:module.${name}() was called in a browser. The BREP.io kernel has taken `
    + "its Node code path, which usually means something has put a `process` "
    + "global back on the window — see the early script in index.html.",
  );
};

export const createRequire = wrongEnvironment("createRequire");
export const register = wrongEnvironment("register");
export const syncBuiltinESMExports = wrongEnvironment("syncBuiltinESMExports");
export const builtinModules = [];
export const isBuiltin = () => false;

export default {
  createRequire, register, syncBuiltinESMExports, builtinModules, isBuiltin,
};

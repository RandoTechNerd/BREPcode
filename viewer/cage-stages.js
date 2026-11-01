// QuadriFlow's stages, in the order viewer/cage-worker.js runs them. Shared by
// the page side (cage.js) and the worker so the two can never disagree.
export const STAGE_NAMES = ["initialize", "orientation field", "scale", "position field", "index map"];

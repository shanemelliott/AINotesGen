const path = require('path');

// Repo root, so scripts under scripts/<group>/ keep reading plans/, logs/, output/ and docs/ from the root.
const ROOT = path.resolve(__dirname, '..');
// Saved VPR JSON per patient (<dfn>.json); git-ignored.
const VPR_DIR = path.join(ROOT, 'vpr');

module.exports = { ROOT, VPR_DIR };

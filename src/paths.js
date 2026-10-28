const path = require('path');

// Repo root, so scripts under scripts/<group>/ keep reading plans/, logs/, output/, docs/ and <dfn>.json from the root.
const ROOT = path.resolve(__dirname, '..');

module.exports = { ROOT };

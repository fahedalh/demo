// Copies non-TS assets (OpenAPI spec) into dist after tsc.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'src', 'docs', 'openapi.yaml');
const dest = path.join(__dirname, '..', 'dist', 'docs', 'openapi.yaml');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);

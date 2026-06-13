import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const DIST_DIR = path.resolve("dist");
const INDEX_HTML = path.join(DIST_DIR, "index.html");
const ASSETS_DIR = path.join(DIST_DIR, "assets");
const INITIAL_GZIP_BUDGET_BYTES = 130_000;
const VENDOR_MAPLIBRE_GZIP_BUDGET_BYTES = 280_000;

if (!existsSync(INDEX_HTML)) {
  throw new Error("dist/index.html is missing; run npm run build first");
}

const html = readFileSync(INDEX_HTML, "utf8");
if (/rel="modulepreload"[^>]+vendor-maplibre|vendor-maplibre[^>]+rel="modulepreload"/.test(html)) {
  throw new Error("vendor-maplibre must not be preloaded by the initial HTML");
}

const initialAssets = unique(
  Array.from(html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+\.(?:js|css))"/g), (match) => match[1]),
).map((assetPath) => path.join(DIST_DIR, assetPath.replace(/^\//, "")));
const initialGzipBytes = initialAssets.reduce((total, assetPath) => total + gzipBytes(assetPath), 0);
if (initialGzipBytes > INITIAL_GZIP_BUDGET_BYTES) {
  throw new Error(`initial gzip budget exceeded: ${initialGzipBytes} > ${INITIAL_GZIP_BUDGET_BYTES}`);
}

const vendorMaplibre = readdirSync(ASSETS_DIR).find((file) => /^vendor-maplibre-.+\.js$/.test(file));
if (!vendorMaplibre) {
  throw new Error("vendor-maplibre chunk is missing");
}

const vendorMaplibreGzipBytes = gzipBytes(path.join(ASSETS_DIR, vendorMaplibre));
if (vendorMaplibreGzipBytes > VENDOR_MAPLIBRE_GZIP_BUDGET_BYTES) {
  throw new Error(`vendor-maplibre gzip budget exceeded: ${vendorMaplibreGzipBytes} > ${VENDOR_MAPLIBRE_GZIP_BUDGET_BYTES}`);
}

console.log(
  `Performance budgets OK: initial=${initialGzipBytes}B gzip, vendor-maplibre=${vendorMaplibreGzipBytes}B gzip`,
);

function gzipBytes(filePath) {
  return gzipSync(readFileSync(filePath)).byteLength;
}

function unique(values) {
  return [...new Set(values)];
}

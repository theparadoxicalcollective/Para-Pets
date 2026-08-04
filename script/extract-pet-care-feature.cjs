const fs = require('node:fs');
const path = require('node:path');

const housePath = 'client/src/pages/PetHousePage.tsx';
const featurePath = 'client/src/features/pet-care/FeedingOverlay.tsx';
const routePath = 'client/src/pages/PetCarePage.tsx';
const source = fs.readFileSync(housePath, 'utf8');

const marker = '\ntype PetCareShelfItem = {';
const splitAt = source.indexOf(marker);
if (splitAt < 0) throw new Error('Pet Care extraction marker was not found');
if (!source.slice(splitAt).includes('export function FeedingOverlay')) {
  throw new Error('FeedingOverlay was not found after the extraction marker');
}

const iconMarker = '\n// ── SVG icons';
const importEnd = source.indexOf(iconMarker);
if (importEnd < 0) throw new Error('Import block marker was not found');
const imports = source.slice(0, importEnd).trimEnd();

const housePetStart = source.indexOf('interface HousePet {');
const housePetEnd = source.indexOf('\n}', housePetStart);
if (housePetStart < 0 || housePetEnd < 0) throw new Error('HousePet interface was not found');
const housePetType = source.slice(housePetStart, housePetEnd + 2);

const featureBody = source.slice(splitAt + 1).trimStart();
const featureHeader = `${imports}\n\n/**\n * Pet Care feature boundary.\n *\n * This module owns the feeding/care scene so the standalone Pet Care route no\n * longer imports the much larger Pet House page module. Keep Pet Care behavior,\n * endpoints, inventory semantics, animation timing, and visual assets stable.\n */\n${housePetType}\n\n`;

fs.mkdirSync(path.dirname(featurePath), { recursive: true });
fs.writeFileSync(featurePath, featureHeader + featureBody.trimEnd() + '\n');
fs.writeFileSync(housePath, source.slice(0, splitAt).trimEnd() + '\n');

const route = fs.readFileSync(routePath, 'utf8');
const oldImport = 'import { FeedingOverlay } from "@/pages/PetHousePage";';
const newImport = 'import { FeedingOverlay } from "@/features/pet-care/FeedingOverlay";';
if (!route.includes(oldImport)) throw new Error('PetCarePage does not have the expected old import');
fs.writeFileSync(routePath, route.replace(oldImport, newImport));

for (const file of fs.readdirSync('test')) {
  if (!file.endsWith('.test.ts')) continue;
  if (!file.toLowerCase().includes('petcare') && file !== 'visibleImageBounds.test.ts') continue;
  const filePath = path.join('test', file);
  const original = fs.readFileSync(filePath, 'utf8');
  const updated = original.replaceAll(
    'client/src/pages/PetHousePage.tsx',
    'client/src/features/pet-care/FeedingOverlay.tsx',
  );
  if (updated !== original) fs.writeFileSync(filePath, updated);
}

const regressionPath = 'test/petCarePageRegression.test.ts';
let regression = fs.readFileSync(regressionPath, 'utf8');
const testName = 'Pet Care route imports its independent feature boundary';
if (!regression.includes(testName)) {
  regression += `\n\ntest("${testName}", () => {\n` +
    `  const route = readFileSync("client/src/pages/PetCarePage.tsx", "utf8");\n` +
    `  const feature = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");\n` +
    `  const house = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");\n\n` +
    `  assert.match(route, /@\\/features\\/pet-care\\/FeedingOverlay/);\n` +
    `  assert.doesNotMatch(route, /@\\/pages\\/PetHousePage/);\n` +
    `  assert.match(feature, /export function FeedingOverlay/);\n` +
    `  assert.doesNotMatch(house, /export function FeedingOverlay/);\n` +
    `});\n`;
  fs.writeFileSync(regressionPath, regression);
}

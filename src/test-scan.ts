import { scanSceneScripts, decompressUUID } from './scan-scene-scripts';
import * as path from 'path';

// ─── Test Config ─────────────────────────────────────────────────────────────

const SCENE_PATH = 'D:/Github_igs/partygo-client/assets/games/newbiePractice/scene/test.scene';
const BUNDLE_PATH = 'D:/Github_igs/partygo-client/assets/games/newbiePractice';
const PROJECT_ROOT = 'D:/Github_igs/partygo-client';

// ─── Test Helpers ────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
    if (condition) {
        console.log(`  ✅ ${message}`);
        passed++;
    } else {
        console.log(`  ❌ FAIL: ${message}`);
        failed++;
    }
}

function assertIncludes(arr: string[], item: string, message: string): void {
    const found = arr.some(a => a.replace(/\\/g, '/').includes(item.replace(/\\/g, '/')));
    assert(found, message);
}

function assertNotIncludes(arr: string[], item: string, message: string): void {
    const found = arr.some(a => a.replace(/\\/g, '/').includes(item.replace(/\\/g, '/')));
    assert(!found, message);
}

// ─── Test 1: UUID Decompression ──────────────────────────────────────────────

console.log('\n═══ Test 1: UUID Decompression ═══');

// Known: DaCGuaGamePlay.ts.meta UUID = 077b7df9-f072-438f-916e-30580e58a419
// Known: __type__ in scene = 077b7358HJDj5FuMFgOWKQZ

assert(
    decompressUUID('077b7358HJDj5FuMFgOWKQZ') === '077b7df9-f072-438f-916e-30580e58a419',
    '23-char decompression: 077b7358HJDj5FuMFgOWKQZ → 077b7df9-f072-438f-916e-30580e58a419'
);

assert(
    decompressUUID('cc.Node') === 'cc.Node',
    'Built-in type passthrough: cc.Node → cc.Node'
);

assert(
    decompressUUID('BaseSoundData') === 'BaseSoundData',
    'Class name passthrough: BaseSoundData → BaseSoundData'
);

assert(
    decompressUUID('abcdef01-2345-6789-abcd-ef0123456789') === 'abcdef01-2345-6789-abcd-ef0123456789',
    'Full UUID passthrough: already-standard UUID unchanged'
);

assert(
    decompressUUID('3ac5a5KgLZOpKqWlh7g/rjq').length === 36,
    '23-char decompression produces 36-char UUID with dashes'
);

// ─── Test 2: Scene Scan Results ──────────────────────────────────────────────

console.log('\n═══ Test 2: Scene Scan ═══');

const result = scanSceneScripts(SCENE_PATH, BUNDLE_PATH, PROJECT_ROOT);

assert(result.success === true, 'Scan completed successfully');
assert((result.uniqueScripts ?? 0) > 0, `Found scripts (got ${result.uniqueScripts})`);
assert((result.scriptsInBundle?.length ?? 0) > 0, `Some scripts in bundle (got ${result.scriptsInBundle?.length})`);
assert((result.scriptsMissing?.length ?? 0) > 0, `Some scripts outside bundle (got ${result.scriptsMissing?.length})`);

// ─── Test 3: Scripts IN bundle ───────────────────────────────────────────────

console.log('\n═══ Test 3: Scripts IN Bundle ═══');

const inBundlePaths = (result.scriptsInBundle || []).map(s => s.relativePath);

assertIncludes(inBundlePaths, 'DaCGuaGamePlay.ts',     'DaCGuaGamePlay.ts is in bundle');
assertIncludes(inBundlePaths, 'DaCGuaGameMain.ts',      'DaCGuaGameMain.ts is in bundle');
assertIncludes(inBundlePaths, 'DaCGuaFruitFactory.ts',   'DaCGuaFruitFactory.ts is in bundle');
assertIncludes(inBundlePaths, 'DaCGuaUI.ts',             'DaCGuaUI.ts is in bundle');
assertIncludes(inBundlePaths, 'DaCGuaSoundMgr.ts',       'DaCGuaSoundMgr.ts is in bundle');
assertIncludes(inBundlePaths, 'DaCGuaFruit.ts',          'DaCGuaFruit.ts is in bundle');
assertIncludes(inBundlePaths, 'DaCGuaFruitFace.ts',      'DaCGuaFruitFace.ts is in bundle');
assertIncludes(inBundlePaths, 'DaCGuaFruitShake.ts',     'DaCGuaFruitShake.ts is in bundle');
assertIncludes(inBundlePaths, 'DaCGuaGameResult.ts',     'DaCGuaGameResult.ts is in bundle');
assertIncludes(inBundlePaths, 'DaCGuaGameLobby.ts',      'DaCGuaGameLobby.ts is in bundle');

// ─── Test 4: Scripts OUTSIDE bundle ──────────────────────────────────────────

console.log('\n═══ Test 4: Scripts OUTSIDE Bundle ═══');

const missingPaths = (result.scriptsMissing || []).map(s => s.relativePath);

assertIncludes(missingPaths, 'CDDragon.ts',              'CDDragon.ts is outside bundle');
assertIncludes(missingPaths, 'ClickAudio.ts',            'ClickAudio.ts is outside bundle');
assertIncludes(missingPaths, 'ItemCellPrefab.ts',        'ItemCellPrefab.ts is outside bundle');
assertIncludes(missingPaths, 'GamePause.ts',             'GamePause.ts is outside bundle');
assertIncludes(missingPaths, 'FruitNodeLoader.ts',       'FruitNodeLoader.ts is outside bundle');
assertIncludes(missingPaths, 'BaseSoundMgr.ts',          'BaseSoundMgr.ts is outside bundle');
assertIncludes(missingPaths, 'BasePrefabMgr.ts',         'BasePrefabMgr.ts is outside bundle');
assertIncludes(missingPaths, 'BaseGameAssetMgr.ts',      'BaseGameAssetMgr.ts is outside bundle');
assertIncludes(missingPaths, 'DaxiguaComboAnim.ts',      'DaxiguaComboAnim.ts is outside bundle');
assertIncludes(missingPaths, 'GameLobbyMainUI.ts',       'GameLobbyMainUI.ts is outside bundle');
assertIncludes(missingPaths, 'FeatureFlagsGate.ts',      'FeatureFlagsGate.ts is outside bundle');

// ─── Test 5: No duplicates ──────────────────────────────────────────────────

console.log('\n═══ Test 5: No Duplicates ═══');

const allPaths = [...inBundlePaths, ...missingPaths].map(p => p.replace(/\\/g, '/'));
const uniquePaths = new Set(allPaths);
assert(allPaths.length === uniquePaths.size, `No duplicate file paths (${allPaths.length} total, ${uniquePaths.size} unique)`);

// ─── Test 6: Bundle scripts should NOT appear in missing ─────────────────────

console.log('\n═══ Test 6: No Cross-contamination ═══');

assertNotIncludes(missingPaths, 'DaCGuaGamePlay.ts',     'DaCGuaGamePlay.ts NOT in missing list');
assertNotIncludes(missingPaths, 'DaCGuaUI.ts',           'DaCGuaUI.ts NOT in missing list');
assertNotIncludes(inBundlePaths, 'CDDragon.ts',          'CDDragon.ts NOT in bundle list');
assertNotIncludes(inBundlePaths, 'ClickAudio.ts',        'ClickAudio.ts NOT in bundle list');

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════');
console.log(`  ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const scan_scene_scripts_1 = require("./scan-scene-scripts");
const args = process.argv.slice(2);
if (args.length < 3) {
    console.log('Usage: npm run scan -- <scene_or_bundle_path> <bundle_folder> <project_root>');
    console.log('');
    console.log('Example:');
    console.log('  npm run scan -- D:/project/assets/game/scene/test.scene D:/project/assets/game D:/project');
    process.exit(1);
}
const [targetPath, bundleFolder, projectRoot] = args;
const result = (0, scan_scene_scripts_1.scanSceneScripts)(targetPath, bundleFolder, projectRoot);
if (!result.success) {
    console.error('Error:', result.error);
    process.exit(1);
}
const missing = result.scriptsMissing || [];
if (missing.length > 0) {
    console.log('\nScripts outside bundle:');
    missing.forEach((s, i) => {
        var _a;
        const from = ((_a = s.foundIn) === null || _a === void 0 ? void 0 : _a.length) > 0 ? `  (from: ${s.foundIn.join(', ')})` : '';
        console.log(`${String(i + 1).padStart(2)}. ${s.relativePath.replace(/\\/g, '/')}${from}`);
    });
}
process.exit(0);

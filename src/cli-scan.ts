import { scanSceneScripts } from './scan-scene-scripts';

const args = process.argv.slice(2);

if (args.length < 3) {
    console.log('Usage: npm run scan -- <scene_or_bundle_path> <bundle_folder> <project_root>');
    console.log('');
    console.log('Example:');
    console.log('  npm run scan -- D:/project/assets/game/scene/test.scene D:/project/assets/game D:/project');
    process.exit(1);
}

const [targetPath, bundleFolder, projectRoot] = args;
const result = scanSceneScripts(targetPath, bundleFolder, projectRoot);

if (!result.success) {
    console.error('Error:', result.error);
    process.exit(1);
}

const missing = result.scriptsMissing || [];
if (missing.length > 0) {
    console.log('\nScripts outside bundle:');
    missing.forEach((s, i) => {
        console.log(`${String(i + 1).padStart(2)}. ${s.relativePath.replace(/\\/g, '/')}`);
    });
}

process.exit(0);

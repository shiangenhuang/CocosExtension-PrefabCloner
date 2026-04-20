"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeScanReport = exports.scanSceneScripts = exports.decompressUUID = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// ─── Cocos Creator UUID Decompression ────────────────────────────────────────
//
// In Cocos Creator 3.x, custom script components are serialized in scene/prefab
// files with `__type__` set to a "compressed UUID" (22-char base64-like string).
//
// Compression format:
//   - Full UUID (with dashes): 36 chars  →  e.g. "abcdef01-2345-6789-abcd-ef0123456789"
//   - Hex only (no dashes):    32 chars  →  e.g. "abcdef0123456789abcdef0123456789"
//   - Compressed:              22 chars  →  first 2 hex chars + 20 base64 chars
//
// Each pair of base64 chars encodes 12 bits → 3 hex chars.
// 2 (direct hex) + 10 pairs × 3 hex = 32 hex chars total.
const BASE64_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
const HEX_CHARS = '0123456789abcdef';
const base64Values = new Array(128).fill(64);
for (let i = 0; i < 64; ++i) {
    base64Values[BASE64_KEYS.charCodeAt(i)] = i;
}
// Positions of hex characters in a standard UUID string (skipping dashes at 8, 13, 18, 23)
const HEX_INDICES = [];
for (let i = 0; i < 36; i++) {
    if (i !== 8 && i !== 13 && i !== 18 && i !== 23) {
        HEX_INDICES.push(i);
    }
}
/**
 * Decompress a Cocos Creator compressed UUID back to standard UUID format.
 *
 * @param compressed  The 22-char compressed UUID (optionally with @suffix)
 * @returns           Standard UUID "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" (with @suffix if present)
 */
function decompressUUID(compressed) {
    const parts = compressed.split('@');
    const base64 = parts[0];
    if (base64.length !== 22) {
        return compressed; // Not a standard compressed UUID, return as-is
    }
    const template = '00000000-0000-0000-0000-000000000000'.split('');
    // First 2 chars are stored directly as hex
    template[HEX_INDICES[0]] = base64[0];
    template[HEX_INDICES[1]] = base64[1];
    // Decode remaining 20 base64 chars → 30 hex chars (10 pairs × 3 hex each)
    for (let i = 2, j = 2; i < 22; i += 2) {
        const lhs = base64Values[base64.charCodeAt(i)];
        const rhs = base64Values[base64.charCodeAt(i + 1)];
        template[HEX_INDICES[j++]] = HEX_CHARS[lhs >> 2];
        template[HEX_INDICES[j++]] = HEX_CHARS[((lhs & 3) << 2) | (rhs >> 4)];
        template[HEX_INDICES[j++]] = HEX_CHARS[rhs & 0xF];
    }
    let result = template.join('');
    if (parts.length > 1) {
        result += '@' + parts.slice(1).join('@');
    }
    return result;
}
exports.decompressUUID = decompressUUID;
// ─── File System Helpers ─────────────────────────────────────────────────────
function getAllFiles(dir, exts) {
    let results = [];
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (['node_modules', '.git', 'library', 'temp', 'dist', 'build', 'local'].includes(entry.name))
                continue;
            if (entry.isDirectory()) {
                results = results.concat(getAllFiles(fullPath, exts));
            }
            else if (exts.some(ext => entry.name.endsWith(ext))) {
                results.push(fullPath);
            }
        }
    }
    catch (_e) { /* skip inaccessible dirs */ }
    return results;
}
/**
 * Build a map of UUID → script file info for all TypeScript/JavaScript files.
 * Only indexes .ts and .js files (the actual scripts).
 */
function buildScriptMetaMap(assetsDir) {
    const map = {};
    const metaFiles = getAllFiles(assetsDir, ['.meta']);
    for (const metaFile of metaFiles) {
        const assetFile = metaFile.replace(/\.meta$/, '');
        const ext = path.extname(assetFile).toLowerCase();
        if (ext !== '.ts' && ext !== '.js')
            continue;
        try {
            const content = fs.readFileSync(metaFile, 'utf8');
            const meta = JSON.parse(content);
            if (meta.uuid) {
                map[meta.uuid] = { metaPath: metaFile, scriptPath: assetFile };
            }
        }
        catch (_e) { /* skip unparseable */ }
    }
    return map;
}
/**
 * Build a map of UUID → meta file path for ALL assets (for resolving prefab references).
 */
function buildFullMetaMap(assetsDir) {
    const map = {};
    const metaFiles = getAllFiles(assetsDir, ['.meta']);
    for (const metaFile of metaFiles) {
        try {
            const content = fs.readFileSync(metaFile, 'utf8');
            const meta = JSON.parse(content);
            if (meta.uuid) {
                map[meta.uuid] = metaFile;
            }
        }
        catch (_e) { /* skip */ }
    }
    return map;
}
/**
 * Walk up from a file path, looking for a parent folder whose .meta has `isBundle: true`.
 * Returns the bundle folder path (relative to projectRoot), or null.
 */
function findBundleRoot(filePath, projectRoot) {
    let dir = path.dirname(path.resolve(filePath));
    const assetsDir = path.resolve(path.join(projectRoot, 'assets'));
    while (dir.length >= assetsDir.length) {
        const metaPath = dir + '.meta';
        if (fs.existsSync(metaPath)) {
            try {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                if (meta.userData && meta.userData.isBundle) {
                    return dir;
                }
            }
            catch (_e) { /* skip */ }
        }
        const parent = path.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return null;
}
// ─── Main Scan Logic ─────────────────────────────────────────────────────────
/**
 * Scan scene/prefab files for all custom script references.
 *
 * When `targetPath` is a file, that single file is scanned.
 * When `targetPath` is a directory, ALL .scene and .prefab files inside it are scanned.
 *
 * If `recursive` is true (default), referenced prefabs are followed recursively
 * to discover scripts used by nested prefab dependencies.
 *
 * @param targetPath    Path to a .scene/.prefab file or a bundle directory
 * @param bundleFolder  The bundle folder to check membership against
 * @param projectRoot   Cocos Creator project root (contains /assets)
 * @param options       { recursive?: boolean }
 */
function scanSceneScripts(targetPath, bundleFolder, projectRoot, options = {}) {
    var _a;
    const assetsDir = path.join(projectRoot, 'assets');
    const normalizedBundle = path.resolve(bundleFolder) + path.sep;
    const recursive = (_a = options.recursive) !== null && _a !== void 0 ? _a : true;
    console.log('═══════════════════════════════════════════════════════');
    console.log(' [Scene Script Scanner] Scanning Script References');
    console.log('═══════════════════════════════════════════════════════');
    // ── Determine files to scan ──────────────────────────────────────────────
    let filesToScan = [];
    try {
        if (fs.statSync(targetPath).isDirectory()) {
            filesToScan = getAllFiles(targetPath, ['.scene', '.prefab']);
            console.log(`  📂 Scanning directory: ${path.relative(projectRoot, targetPath)}`);
            console.log(`  📄 Found ${filesToScan.length} scene/prefab files`);
        }
        else {
            filesToScan = [targetPath];
            console.log(`  📄 Scanning file: ${path.relative(projectRoot, targetPath)}`);
        }
    }
    catch (err) {
        return { success: false, error: `Cannot access target path: ${err.message}` };
    }
    if (filesToScan.length === 0) {
        return { success: false, error: 'No .scene or .prefab files found in the target path.' };
    }
    console.log(`  📦 Bundle: ${path.relative(projectRoot, bundleFolder)}`);
    console.log(`  🔄 Recursive prefab scan: ${recursive}`);
    console.log('');
    // ── Build caches ─────────────────────────────────────────────────────────
    console.log('  🔍 Building script meta cache...');
    const scriptMetaMap = buildScriptMetaMap(assetsDir);
    console.log(`  📦 Indexed ${Object.keys(scriptMetaMap).length} script files`);
    let fullMetaMap = null;
    if (recursive) {
        console.log('  🔍 Building full asset meta cache (for recursive prefab scan)...');
        fullMetaMap = buildFullMetaMap(assetsDir);
        console.log(`  📦 Indexed ${Object.keys(fullMetaMap).length} total assets`);
    }
    // ── Scan all files (with optional recursive prefab follow) ───────────────
    const scriptRefMap = {};
    const scannedFiles = new Set();
    const pendingFiles = [...filesToScan];
    let totalComponents = 0;
    while (pendingFiles.length > 0) {
        const filePath = pendingFiles.pop();
        const normalized = path.resolve(filePath);
        if (scannedFiles.has(normalized))
            continue;
        scannedFiles.add(normalized);
        if (!fs.existsSync(filePath))
            continue;
        let data;
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            data = JSON.parse(content);
            if (!Array.isArray(data))
                continue;
        }
        catch (_e) {
            continue;
        }
        const relFile = path.relative(projectRoot, filePath);
        console.log(`\n  ── Scanning: ${relFile} (${data.length} entries) ──`);
        for (let idx = 0; idx < data.length; idx++) {
            const entry = data[idx];
            if (!entry || !entry.__type__)
                continue;
            const type = entry.__type__;
            // Skip Cocos built-in types (cc.Node, cc.Sprite, cc.Label, etc.)
            if (type.startsWith('cc.'))
                continue;
            totalComponents++;
            // Decompress the UUID
            const decompressed = decompressUUID(type);
            // Resolve node name: if this is a component, look up the parent node's _name
            let nodeName = entry._name || '';
            if (!nodeName && entry.node && entry.node.__id__ !== undefined) {
                const parentNode = data[entry.node.__id__];
                if (parentNode && parentNode._name) {
                    nodeName = parentNode._name;
                }
            }
            if (!nodeName)
                nodeName = `(entry #${idx})`;
            if (!scriptRefMap[type]) {
                // Look up the script file via decompressed UUID
                const baseUUID = decompressed.split('@')[0];
                const scriptInfo = scriptMetaMap[baseUUID] || null;
                let scriptFilePath = null;
                let relativePath = null;
                let isInBundle = false;
                let bundleLocation = null;
                if (scriptInfo) {
                    scriptFilePath = scriptInfo.scriptPath;
                    relativePath = path.relative(projectRoot, scriptFilePath);
                    const resolvedPath = path.resolve(scriptFilePath);
                    isInBundle = resolvedPath.startsWith(normalizedBundle);
                    // Detect which bundle this script belongs to
                    const detectedBundle = findBundleRoot(scriptFilePath, projectRoot);
                    if (detectedBundle) {
                        bundleLocation = path.relative(projectRoot, detectedBundle);
                    }
                }
                scriptRefMap[type] = {
                    compressedType: type,
                    decompressedUUID: decompressed,
                    scriptFilePath,
                    relativePath,
                    isInBundle,
                    bundleLocation,
                    nodeNames: [nodeName],
                    sourceFiles: [relFile],
                };
            }
            else {
                // Append unique node names and source files
                const ref = scriptRefMap[type];
                if (!ref.nodeNames.includes(nodeName)) {
                    ref.nodeNames.push(nodeName);
                }
                if (!ref.sourceFiles.includes(relFile)) {
                    ref.sourceFiles.push(relFile);
                }
            }
            // ── Recursive: discover referenced prefabs via __uuid__ ──────
            if (recursive && fullMetaMap) {
                const jsonStr = JSON.stringify(entry);
                const uuidRegex = /"__uuid__"\s*:\s*"([^"]+)"/g;
                let uuidMatch;
                while ((uuidMatch = uuidRegex.exec(jsonStr)) !== null) {
                    const refUUID = uuidMatch[1].split('@')[0];
                    const refMeta = fullMetaMap[refUUID];
                    if (refMeta) {
                        const refAsset = refMeta.replace(/\.meta$/, '');
                        const refExt = path.extname(refAsset).toLowerCase();
                        if (refExt === '.prefab') {
                            const resolvedRef = path.resolve(refAsset);
                            if (!scannedFiles.has(resolvedRef)) {
                                pendingFiles.push(refAsset);
                                console.log(`     ↳ Queued prefab: ${path.relative(projectRoot, refAsset)}`);
                            }
                        }
                    }
                }
            }
        }
    }
    // ── Categorize results ───────────────────────────────────────────────────
    const scripts = Object.values(scriptRefMap);
    const scriptsInBundle = scripts.filter(s => s.isInBundle);
    const scriptsMissing = scripts.filter(s => !s.isInBundle && s.scriptFilePath !== null);
    const scriptsNotFound = scripts.filter(s => s.scriptFilePath === null);
    // ── Print detailed report ────────────────────────────────────────────────
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════');
    console.log(' SCAN RESULTS');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  Files scanned:         ${scannedFiles.size}`);
    console.log(`  Custom script usages:  ${totalComponents}`);
    console.log(`  Unique scripts:        ${scripts.length}`);
    console.log(`  ✅ In bundle:          ${scriptsInBundle.length}`);
    console.log(`  ❌ Outside bundle:     ${scriptsMissing.length}`);
    console.log(`  ⚠️  Not found:         ${scriptsNotFound.length}`);
    if (scriptsInBundle.length > 0) {
        console.log('\n  ── ✅ Scripts IN Bundle ────────────────────────────');
        for (const s of scriptsInBundle) {
            console.log(`     📄 ${s.relativePath}`);
            console.log(`        Nodes: ${s.nodeNames.join(', ')}`);
        }
    }
    if (scriptsMissing.length > 0) {
        console.log('\n  ── ❌ Scripts OUTSIDE Bundle (Potential Missing) ──');
        for (const s of scriptsMissing) {
            console.log(`     📄 ${s.relativePath}`);
            console.log(`        UUID:       ${s.decompressedUUID}`);
            console.log(`        In bundle:  ${s.bundleLocation || '(none / project root)'}`);
            console.log(`        Nodes:      ${s.nodeNames.join(', ')}`);
            console.log(`        Found in:   ${s.sourceFiles.join(', ')}`);
        }
    }
    if (scriptsNotFound.length > 0) {
        console.log('\n  ── ⚠️  Scripts NOT FOUND (Deleted / Moved?) ──────');
        for (const s of scriptsNotFound) {
            console.log(`     ❓ Type:   ${s.compressedType}`);
            console.log(`        UUID:   ${s.decompressedUUID}`);
            console.log(`        Nodes:  ${s.nodeNames.join(', ')}`);
            console.log(`        Found in: ${s.sourceFiles.join(', ')}`);
        }
    }
    console.log('\n═══════════════════════════════════════════════════════\n');
    return {
        success: true,
        scannedFiles: [...scannedFiles],
        bundlePath: bundleFolder,
        totalComponents,
        uniqueScripts: scripts.length,
        scriptsInBundle: scriptsInBundle.length,
        scriptsMissing: scriptsMissing.length,
        scriptsNotFound: scriptsNotFound.length,
        scripts,
    };
}
exports.scanSceneScripts = scanSceneScripts;
// ─── Report File Generator ───────────────────────────────────────────────────
/**
 * Write a detailed scan report as a JSON file.
 */
function writeScanReport(result, outputPath) {
    const report = Object.assign({ generatedAt: new Date().toISOString() }, result);
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`📝 Report saved to: ${outputPath}`);
}
exports.writeScanReport = writeScanReport;

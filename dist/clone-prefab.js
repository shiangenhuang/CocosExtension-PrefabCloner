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
exports.clonePrefab = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateUUID() {
    return crypto.randomUUID();
}
function getAllFiles(dir, ext) {
    let results = [];
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (['node_modules', '.git', 'library', 'temp'].includes(entry.name))
                continue;
            if (entry.isDirectory()) {
                results = results.concat(getAllFiles(fullPath, ext));
            }
            else if (entry.name.endsWith(ext)) {
                results.push(fullPath);
            }
        }
    }
    catch (_e) { /* skip inaccessible dirs */ }
    return results;
}
// ─── Meta Cache ───────────────────────────────────────────────────────────────
let metaCache = null;
function buildMetaCache(searchDir) {
    if (metaCache)
        return metaCache;
    console.log('  [Prefab Cloner] Building meta file cache (first run only)...');
    metaCache = {};
    const files = getAllFiles(searchDir, '.meta');
    for (const file of files) {
        try {
            const content = fs.readFileSync(file, 'utf8');
            const meta = JSON.parse(content);
            if (meta.uuid) {
                metaCache[meta.uuid] = file;
            }
            // Also index subMeta UUIDs (they are in "mainUUID@subKey" format in Cocos 3.x)
            if (meta.subMetas) {
                for (const [_key, sub] of Object.entries(meta.subMetas)) {
                    const subMeta = sub;
                    if (subMeta.uuid) {
                        // subMeta uuid in Cocos 3.x is "mainUUID@subKey", extract the base
                        const subBase = subMeta.uuid.split('@')[0];
                        if (!metaCache[subBase]) {
                            metaCache[subBase] = file;
                        }
                    }
                }
            }
        }
        catch (_e) { /* skip unparseable */ }
    }
    console.log(`  [Prefab Cloner] Cached ${Object.keys(metaCache).length} UUIDs from ${files.length} meta files`);
    return metaCache;
}
function resetMetaCache() {
    metaCache = null;
}
function findMetaByUUID(searchDir, uuid) {
    const baseUUID = uuid.split('@')[0];
    const cache = buildMetaCache(searchDir);
    return cache[baseUUID] || null;
}
// ─── Main Clone Logic ─────────────────────────────────────────────────────────
/**
 * Clone a prefab, copying only assets that originate from the blacklist folder.
 * Assets outside the blacklist folder are reused (references kept as-is).
 *
 * @param sourcePrefabPath  Absolute path to the source .prefab file
 * @param targetDir         Absolute path to the target directory for the cloned prefab
 * @param projectRoot       Absolute path to the Cocos project root
 * @param blacklistFolder   Absolute path to the folder whose assets should be cloned (not reused)
 */
function clonePrefab(sourcePrefabPath, targetDir, projectRoot, blacklistFolder) {
    const assetsDir = path.join(projectRoot, 'assets');
    // Normalize the blacklist folder for consistent comparison
    const normalizedBlacklist = path.resolve(blacklistFolder) + path.sep;
    // Reset cache for each run so we pick up fresh state
    resetMetaCache();
    console.log('═══════════════════════════════════════════');
    console.log(' [Prefab Cloner] Cocos Creator Prefab Cloner');
    console.log('═══════════════════════════════════════════');
    console.log(`  Source:    ${sourcePrefabPath}`);
    console.log(`  Target:    ${targetDir}`);
    console.log(`  Blacklist: ${blacklistFolder}`);
    console.log('');
    // ── Validate ──────────────────────────────────────────────────────────────
    if (!fs.existsSync(sourcePrefabPath)) {
        return { success: false, error: `Source prefab not found: ${sourcePrefabPath}` };
    }
    if (!fs.existsSync(sourcePrefabPath + '.meta')) {
        return { success: false, error: `Source .meta not found: ${sourcePrefabPath}.meta` };
    }
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }
    // ── 1. Read the prefab ───────────────────────────────────────────────────
    const prefabContent = fs.readFileSync(sourcePrefabPath, 'utf8');
    // ── 2. Extract all __uuid__ references ───────────────────────────────────
    const uuidRegex = /"__uuid__"\s*:\s*"([^"]+)"/g;
    const externalUUIDs = new Set();
    let match;
    while ((match = uuidRegex.exec(prefabContent)) !== null) {
        externalUUIDs.add(match[1]);
    }
    console.log(`📦 Found ${externalUUIDs.size} external UUID references\n`);
    // ── 3. Build UUID mapping: old → new ────────────────────────────────────
    //
    // Only map (clone) assets that are IN the blacklist folder.
    // Assets outside blacklist are REUSED (no entry in uuidMap = unchanged).
    //
    const uuidMap = {};
    const fileCopyMap = {};
    const skippedBuiltins = [];
    let skippedReused = 0;
    for (const fullUUID of externalUUIDs) {
        const baseUUID = fullUUID.split('@')[0];
        const suffix = fullUUID.includes('@') ? '@' + fullUUID.split('@')[1] : '';
        // Find the source .meta file
        const metaPath = findMetaByUUID(assetsDir, fullUUID);
        if (!metaPath) {
            skippedBuiltins.push(fullUUID);
            continue;
        }
        const resolvedMetaPath = path.resolve(metaPath);
        // ── BLACKLIST CHECK ──────────────────────────────────────────────
        // Only clone assets that are INSIDE the blacklist folder.
        // Assets outside the blacklist folder are REUSED (kept as-is).
        if (!resolvedMetaPath.startsWith(normalizedBlacklist)) {
            console.log(`  ♻️  Reuse (outside blacklist): ${path.basename(metaPath, '.meta')}`);
            skippedReused++;
            continue;
        }
        // Check if asset is ALREADY in the target bundle
        const targetBundleRoot = path.resolve(targetDir, '..');
        if (resolvedMetaPath.startsWith(targetBundleRoot + path.sep)) {
            console.log(`  ✅ Already in target bundle: ${path.basename(metaPath, '.meta')}`);
            continue;
        }
        // Determine the source asset file (remove .meta extension)
        const sourceAssetPath = metaPath.replace(/\.meta$/, '');
        if (!fs.existsSync(sourceAssetPath)) {
            console.log(`  ⚠️  Asset file not found: ${sourceAssetPath}`);
            continue;
        }
        // Skip if already mapped (same base asset from a different sub-reference)
        if (fileCopyMap[sourceAssetPath]) {
            const existingNewUUID = fileCopyMap[sourceAssetPath].newUUID;
            uuidMap[fullUUID] = existingNewUUID + suffix;
            continue;
        }
        // Determine target subdirectory based on file type
        const assetBasename = path.basename(sourceAssetPath);
        const assetExt = path.extname(sourceAssetPath).toLowerCase();
        let targetSubDir = targetDir;
        const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'];
        const animExts = ['.anim', '.clip'];
        const fontExts = ['.fnt', '.ttf', '.otf'];
        const materialExts = ['.mtl', '.pmtl', '.effect'];
        const audioExts = ['.mp3', '.ogg', '.wav'];
        if (imageExts.includes(assetExt)) {
            targetSubDir = path.join(path.dirname(targetDir), 'image');
        }
        else if (animExts.includes(assetExt)) {
            targetSubDir = path.join(path.dirname(targetDir), 'anim');
        }
        else if (fontExts.includes(assetExt)) {
            targetSubDir = path.join(path.dirname(targetDir), 'fnt');
        }
        else if (materialExts.includes(assetExt)) {
            targetSubDir = path.join(path.dirname(targetDir), 'material');
        }
        else if (audioExts.includes(assetExt)) {
            targetSubDir = path.join(path.dirname(targetDir), 'sound');
        }
        if (!fs.existsSync(targetSubDir)) {
            fs.mkdirSync(targetSubDir, { recursive: true });
        }
        const targetAssetPath = path.join(targetSubDir, assetBasename);
        const newBaseUUID = generateUUID();
        fileCopyMap[sourceAssetPath] = {
            target: targetAssetPath,
            targetMeta: targetAssetPath + '.meta',
            sourceMeta: metaPath,
            newUUID: newBaseUUID,
        };
        // Map the full reference: "oldBase@suffix" → "newBase@suffix"
        uuidMap[fullUUID] = newBaseUUID + suffix;
        // Also map the bare base UUID (without suffix) for non-subMeta references
        if (suffix && !uuidMap[baseUUID]) {
            uuidMap[baseUUID] = newBaseUUID;
        }
        console.log(`  📋 Will clone: ${assetBasename}`);
        console.log(`     ${baseUUID} → ${newBaseUUID}`);
    }
    if (skippedBuiltins.length > 0) {
        console.log(`\n  ℹ️  Skipped ${skippedBuiltins.length} built-in/engine UUIDs (no action needed)`);
    }
    if (skippedReused > 0) {
        console.log(`  ♻️  Reused ${skippedReused} assets outside blacklist folder`);
    }
    // ── 4. Copy asset files and update .meta UUIDs ──────────────────────────
    //
    // IMPORTANT: In Cocos Creator 3.x, image .meta subMetas use
    // "mainUUID@subKey" format for the uuid field. We must replace
    // ALL occurrences of the old mainUUID with the new one throughout
    // the entire .meta file content (string replace), rather than
    // parsing and regenerating individual subMeta UUIDs.
    //
    const copyCount = Object.keys(fileCopyMap).length;
    console.log(`\n📂 Copying ${copyCount} assets...`);
    for (const [source, info] of Object.entries(fileCopyMap)) {
        // Copy the actual asset file
        fs.copyFileSync(source, info.target);
        // Read the source .meta and replace ALL occurrences of old main UUID
        // with the new one. This correctly handles:
        //   - Top-level "uuid": "oldMain"
        //   - SubMeta "uuid": "oldMain@6c48a" → "newMain@6c48a"
        //   - userData "imageUuidOrDatabaseUri": "oldMain" → "newMain"
        //   - userData "imageUuidOrDatabaseUri": "oldMain@6c48a" → "newMain@6c48a"
        //   - userData "redirect": "oldMain@6c48a" → "newMain@6c48a"
        //   - userData "textureUuid": "oldTextureUuid" (handled separately if needed)
        const metaContent = fs.readFileSync(info.sourceMeta, 'utf8');
        const sourceMetaData = JSON.parse(metaContent);
        const oldMainUUID = sourceMetaData.uuid;
        // String-replace every occurrence of the old main UUID with the new one
        let newMetaContent = metaContent.replace(new RegExp(oldMainUUID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), info.newUUID);
        // Also handle textureUuid in bitmap font metas — this references another asset's UUID.
        // If that other asset was also cloned, remap it; otherwise leave it as-is (reuse).
        const newMetaData = JSON.parse(newMetaContent);
        if (newMetaData.userData && newMetaData.userData.textureUuid) {
            const oldTextureUuid = sourceMetaData.userData.textureUuid;
            if (uuidMap[oldTextureUuid]) {
                newMetaData.userData.textureUuid = uuidMap[oldTextureUuid];
                newMetaContent = JSON.stringify(newMetaData, null, 2) + '\n';
            }
        }
        fs.writeFileSync(info.targetMeta, newMetaContent);
        console.log(`  ✅ Copied: ${path.basename(info.target)}`);
    }
    // ── 5. Rewrite the prefab with new UUIDs ────────────────────────────────
    console.log('\n🔄 Rewriting prefab UUID references...');
    let newPrefabContent = prefabContent;
    let replacements = 0;
    // Sort by length descending to replace longer (more specific) matches first.
    // This prevents "oldBase" from matching inside "oldBase@suffix" before the
    // full "oldBase@suffix" mapping is applied.
    const sortedEntries = Object.entries(uuidMap).sort((a, b) => b[0].length - a[0].length);
    for (const [oldUUID, newUUID] of sortedEntries) {
        const escaped = oldUUID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'g');
        const before = newPrefabContent;
        newPrefabContent = newPrefabContent.replace(regex, newUUID);
        if (before !== newPrefabContent)
            replacements++;
    }
    console.log(`  Replaced ${replacements} UUID references`);
    // ── 6. Write the new prefab ─────────────────────────────────────────────
    const prefabBasename = path.basename(sourcePrefabPath);
    const targetPrefabPath = path.join(targetDir, prefabBasename);
    fs.writeFileSync(targetPrefabPath, newPrefabContent);
    // ── 7. Write the new .meta for the prefab ───────────────────────────────
    const sourcePrefabMeta = sourcePrefabPath + '.meta';
    const prefabMetaContent = fs.readFileSync(sourcePrefabMeta, 'utf8');
    const prefabMeta = JSON.parse(prefabMetaContent);
    const newPrefabUUID = generateUUID();
    prefabMeta.uuid = newPrefabUUID;
    const targetPrefabMeta = targetPrefabPath + '.meta';
    fs.writeFileSync(targetPrefabMeta, JSON.stringify(prefabMeta, null, 2) + '\n');
    // ── 8. Verification: Check for remaining cross-bundle references ────────
    console.log('\n🔍 Verifying no cross-bundle dependencies remain...');
    const finalUUIDRegex = /"__uuid__"\s*:\s*"([^"]+)"/g;
    const remainingCrossRefs = [];
    while ((match = finalUUIDRegex.exec(newPrefabContent)) !== null) {
        const uuid = match[1].split('@')[0];
        const metaAnywhere = findMetaByUUID(assetsDir, uuid);
        if (metaAnywhere) {
            const resolvedMeta = path.resolve(metaAnywhere);
            // If asset is inside the blacklist AND not in the target bundle, it's a problem
            if (resolvedMeta.startsWith(normalizedBlacklist)) {
                const targetBundleRoot = path.resolve(targetDir, '..');
                if (!resolvedMeta.startsWith(targetBundleRoot + path.sep)) {
                    remainingCrossRefs.push({
                        uuid: match[1],
                        source: path.relative(projectRoot, metaAnywhere),
                    });
                }
            }
            // Assets outside blacklist are intentionally reused — not an error
        }
    }
    console.log('');
    console.log('═══════════════════════════════════════════');
    if (remainingCrossRefs.length > 0) {
        console.log(`⚠️  ${remainingCrossRefs.length} remaining reference(s) to blacklisted assets:`);
        remainingCrossRefs.forEach((r) => {
            console.log(`   ${r.uuid}`);
            console.log(`   → ${r.source}`);
        });
        console.log('\n   These may need manual copying.');
    }
    else {
        console.log('🎉 SUCCESS: No remaining references to blacklisted assets!');
    }
    console.log('');
    console.log(`📄 Cloned prefab: ${targetPrefabPath}`);
    console.log(`🆔 New UUID: ${newPrefabUUID}`);
    console.log(`📦 Cloned: ${copyCount} assets | ♻️ Reused: ${skippedReused} assets`);
    console.log('═══════════════════════════════════════════');
    return {
        success: true,
        prefabPath: targetPrefabPath,
        newUUID: newPrefabUUID,
        copiedCount: copyCount,
        crossRefs: remainingCrossRefs.length,
        skippedReused,
    };
}
exports.clonePrefab = clonePrefab;

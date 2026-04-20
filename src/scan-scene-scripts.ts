import * as fs from 'fs';
import * as path from 'path';

// ─── Cocos Creator UUID Decompression ────────────────────────────────────────
//
// Cocos Creator 3.x uses compressed UUIDs in scene/prefab __type__ fields.
// Two formats exist:
//
//   22-char: 2 hex + 20 base64 (10 groups × 2 base64 → 3 hex each = 30 hex)
//   23-char: 5 hex + 18 base64 ( 9 groups × 2 base64 → 3 hex each = 27 hex)
//
// Both decode to 32 hex chars → a standard UUID.

const BASE64_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
const HEX_CHARS = '0123456789abcdef';

const base64Values: number[] = new Array(128).fill(64);
for (let i = 0; i < 64; ++i) {
    base64Values[BASE64_KEYS.charCodeAt(i)] = i;
}

/**
 * Decode pairs of base64 chars → groups of 3 hex chars.
 */
function decodeBase64Pairs(b64: string): string {
    let hex = '';
    for (let i = 0; i < b64.length; i += 2) {
        const lhs = base64Values[b64.charCodeAt(i)];
        const rhs = base64Values[b64.charCodeAt(i + 1)];
        hex += HEX_CHARS[lhs >> 2];
        hex += HEX_CHARS[((lhs & 3) << 2) | (rhs >> 4)];
        hex += HEX_CHARS[rhs & 0xF];
    }
    return hex;
}

/**
 * Insert dashes into a 32-char hex string to form a standard UUID.
 */
function hexToUUID(hex: string): string {
    return (
        hex.substring(0, 8) + '-' +
        hex.substring(8, 12) + '-' +
        hex.substring(12, 16) + '-' +
        hex.substring(16, 20) + '-' +
        hex.substring(20, 32)
    );
}

/**
 * Decompress a Cocos Creator compressed UUID to standard format.
 *
 * Supports:
 *   - 22-char format: 2 hex chars + 20 base64 chars
 *   - 23-char format: 5 hex chars + 18 base64 chars
 *   - Already-standard UUIDs (36 chars with dashes)
 *   - With optional @suffix (e.g. "abc123...@f9941")
 */
export function decompressUUID(compressed: string): string {
    const parts = compressed.split('@');
    const body = parts[0];
    let hex32 = '';

    if (body.length === 23) {
        // 5 hex + 18 base64 → 5 + 27 = 32 hex
        hex32 = body.substring(0, 5) + decodeBase64Pairs(body.substring(5));
    } else if (body.length === 22) {
        // 2 hex + 20 base64 → 2 + 30 = 32 hex
        hex32 = body.substring(0, 2) + decodeBase64Pairs(body.substring(2));
    } else if (body.length === 36 && body[8] === '-') {
        // Already a full UUID with dashes
        let result = compressed;
        return result;
    } else if (body.length === 32) {
        // 32 hex chars without dashes
        hex32 = body;
    } else {
        return compressed; // Unknown format, return as-is
    }

    let result = hexToUUID(hex32);
    if (parts.length > 1) {
        result += '@' + parts.slice(1).join('@');
    }
    return result;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScriptReference {
    /** The raw __type__ value */
    typeKey: string;
    /** Resolved absolute path to the .ts/.js file */
    scriptFilePath: string;
    /** Path relative to project root */
    relativePath: string;
    /** Whether this script is inside the bundle folder */
    isInBundle: boolean;
    /** Scene/prefab file(s) where this script was found */
    foundIn: string[];
}

export interface ScanResult {
    success: boolean;
    scannedFiles?: string[];
    bundlePath?: string;
    uniqueScripts?: number;
    scriptsInBundle?: ScriptReference[];
    scriptsMissing?: ScriptReference[];
    error?: string;
}

// ─── File System Helpers ─────────────────────────────────────────────────────

function getAllFiles(dir: string, exts: string[]): string[] {
    let results: string[] = [];
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (['node_modules', '.git', 'library', 'temp', 'dist', 'build', 'local'].includes(entry.name)) continue;
            if (entry.isDirectory()) {
                results = results.concat(getAllFiles(fullPath, exts));
            } else if (exts.some(ext => entry.name.endsWith(ext))) {
                results.push(fullPath);
            }
        }
    } catch (_e) { /* skip inaccessible dirs */ }
    return results;
}

// ─── Lookup Map Builders ─────────────────────────────────────────────────────

/**
 * Strategy 1: Build map of className → scriptFilePath
 * by scanning all .ts/.js files for @ccclass('ClassName') decorators.
 */
function buildClassNameMap(assetsDir: string): Record<string, string> {
    const map: Record<string, string> = {};
    const scriptFiles = getAllFiles(assetsDir, ['.ts', '.js']);

    // Pattern 1: @ccclass('Name') or @ccclass("Name")
    const decoratorWithArg = /@ccclass\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    // Pattern 2: @ccclass or @ccclass() followed by class ClassName
    const decoratorWithoutArg = /@ccclass\s*(?:\(\s*\))?\s*[\r\n]+[^\r\n]*?class\s+(\w+)/g;

    for (const filePath of scriptFiles) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            let match;

            // Match @ccclass('Name')
            decoratorWithArg.lastIndex = 0;
            while ((match = decoratorWithArg.exec(content)) !== null) {
                map[match[1]] = filePath;
            }

            // Match @ccclass \n class ClassName
            decoratorWithoutArg.lastIndex = 0;
            while ((match = decoratorWithoutArg.exec(content)) !== null) {
                map[match[1]] = filePath;
            }
        } catch (_e) { /* skip */ }
    }

    return map;
}

/**
 * Strategy 2: Build map of UUID → scriptFilePath
 * by reading all script .meta files.
 */
function buildScriptUUIDMap(assetsDir: string): Record<string, string> {
    const map: Record<string, string> = {};
    const metaFiles = getAllFiles(assetsDir, ['.meta']);

    for (const metaFile of metaFiles) {
        const assetFile = metaFile.replace(/\.meta$/, '');
        const ext = path.extname(assetFile).toLowerCase();
        if (ext !== '.ts' && ext !== '.js') continue;

        try {
            const content = fs.readFileSync(metaFile, 'utf8');
            const meta = JSON.parse(content);
            if (meta.uuid) {
                map[meta.uuid] = assetFile;
            }
        } catch (_e) { /* skip */ }
    }

    return map;
}

/**
 * Build a full UUID → metaFilePath map for all assets (for resolving prefab refs).
 */
function buildFullMetaMap(assetsDir: string): Record<string, string> {
    const map: Record<string, string> = {};
    const metaFiles = getAllFiles(assetsDir, ['.meta']);

    for (const metaFile of metaFiles) {
        try {
            const content = fs.readFileSync(metaFile, 'utf8');
            const meta = JSON.parse(content);
            if (meta.uuid) {
                map[meta.uuid] = metaFile;
            }
        } catch (_e) { /* skip */ }
    }

    return map;
}

// ─── Main Scan Logic ─────────────────────────────────────────────────────────

/**
 * Scan scene/prefab files for all custom script references.
 *
 * Returns ONLY scripts that could be resolved to a file path.
 * Scripts that can't be resolved (engine internals, etc.) are silently skipped.
 *
 * @param targetPath    Path to a .scene/.prefab file OR a bundle directory
 * @param bundleFolder  The bundle folder to check membership against
 * @param projectRoot   Cocos Creator project root (contains /assets)
 */
export function scanSceneScripts(
    targetPath: string,
    bundleFolder: string,
    projectRoot: string,
): ScanResult {
    const assetsDir = path.join(projectRoot, 'assets');
    const normalizedBundle = path.resolve(bundleFolder) + path.sep;

    console.log('═══════════════════════════════════════════════');
    console.log(' [Script Scanner] Scanning Script References');
    console.log('═══════════════════════════════════════════════');

    // ── Determine files to scan ──────────────────────────────────────────
    let filesToScan: string[] = [];
    try {
        if (fs.statSync(targetPath).isDirectory()) {
            filesToScan = getAllFiles(targetPath, ['.scene', '.prefab']);
            console.log(`📂 Directory: ${path.relative(projectRoot, targetPath)} (${filesToScan.length} files)`);
        } else {
            filesToScan = [targetPath];
            console.log(`📄 File: ${path.relative(projectRoot, targetPath)}`);
        }
    } catch (err: any) {
        return { success: false, error: `Cannot access: ${err.message}` };
    }

    if (filesToScan.length === 0) {
        return { success: false, error: 'No .scene or .prefab files found.' };
    }

    console.log(`📦 Bundle: ${path.relative(projectRoot, bundleFolder)}`);

    // ── Build lookup maps ────────────────────────────────────────────────
    console.log('🔍 Indexing scripts...');
    const classNameMap = buildClassNameMap(assetsDir);
    const uuidMap = buildScriptUUIDMap(assetsDir);
    const fullMetaMap = buildFullMetaMap(assetsDir);
    console.log(`   ${Object.keys(classNameMap).length} class names, ${Object.keys(uuidMap).length} script UUIDs`);

    // ── Scan files ───────────────────────────────────────────────────────
    const resolvedScripts: Record<string, ScriptReference> = {};
    // Track which file each script was found in (keyed by resolved script path)
    const scriptFoundIn: Record<string, Set<string>> = {};
    const scannedFiles = new Set<string>();
    const pendingFiles = [...filesToScan];

    while (pendingFiles.length > 0) {
        const filePath = pendingFiles.pop()!;
        const normalized = path.resolve(filePath);
        if (scannedFiles.has(normalized)) continue;
        scannedFiles.add(normalized);
        if (!fs.existsSync(filePath)) continue;

        let data: any[];
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            data = JSON.parse(content);
            if (!Array.isArray(data)) continue;
        } catch (_e) { continue; }

        for (const entry of data) {
            if (!entry || !entry.__type__) continue;
            const typeKey: string = entry.__type__;

            // Skip Cocos built-in types
            if (typeKey.startsWith('cc.')) continue;

            // Skip if already resolved
            if (resolvedScripts[typeKey]) continue;

            // ── Try to resolve to a script file ──────────────────────
            let scriptPath: string | null = null;

            // Strategy 1: Class name match
            if (classNameMap[typeKey]) {
                scriptPath = classNameMap[typeKey];
            }

            // Strategy 2: Decompress UUID and match
            if (!scriptPath) {
                const decompressed = decompressUUID(typeKey);
                const baseUUID = decompressed.split('@')[0];
                if (uuidMap[baseUUID]) {
                    scriptPath = uuidMap[baseUUID];
                }
            }

            // If resolved, record it
            if (scriptPath) {
                const resolvedPath = path.resolve(scriptPath);
                const sourceFile = path.basename(filePath);
                if (!resolvedScripts[typeKey]) {
                    resolvedScripts[typeKey] = {
                        typeKey,
                        scriptFilePath: scriptPath,
                        relativePath: path.relative(projectRoot, scriptPath),
                        isInBundle: resolvedPath.startsWith(normalizedBundle),
                        foundIn: [],
                    };
                }
                // Track which file(s) reference this script
                if (!scriptFoundIn[resolvedPath]) scriptFoundIn[resolvedPath] = new Set();
                scriptFoundIn[resolvedPath].add(sourceFile);
            }

            // ── Follow prefab references for recursive scanning ──────
            const jsonStr = JSON.stringify(entry);
            const uuidRegex = /"__uuid__"\s*:\s*"([^"]+)"/g;
            let uuidMatch;
            while ((uuidMatch = uuidRegex.exec(jsonStr)) !== null) {
                const refUUID = uuidMatch[1].split('@')[0];
                const refMeta = fullMetaMap[refUUID];
                if (refMeta) {
                    const refAsset = refMeta.replace(/\.meta$/, '');
                    if (path.extname(refAsset).toLowerCase() === '.prefab') {
                        const resolvedRef = path.resolve(refAsset);
                        if (!scannedFiles.has(resolvedRef)) {
                            pendingFiles.push(refAsset);
                        }
                    }
                }
            }
        }
    }

    // ── Deduplicate by file path & categorize ────────────────────────────
    const seenPaths = new Set<string>();
    const allScripts: ScriptReference[] = [];
    for (const s of Object.values(resolvedScripts)) {
        const key = path.resolve(s.scriptFilePath);
        if (seenPaths.has(key)) continue;
        seenPaths.add(key);
        s.foundIn = [...(scriptFoundIn[key] || [])];
        allScripts.push(s);
    }
    const inBundle = allScripts.filter(s => s.isInBundle);
    const missing = allScripts.filter(s => !s.isInBundle);

    // ── Console output ───────────────────────────────────────────────────
    console.log('');
    console.log(`✅ In bundle:      ${inBundle.length}`);
    console.log(`❌ Outside bundle: ${missing.length}`);

    if (missing.length > 0) {
        console.log('');
        console.log('── Scripts outside bundle: ──');
        for (const s of missing) {
            const from = s.foundIn.length > 0 ? ` (from: ${s.foundIn.join(', ')})` : '';
            console.log(`   ❌ ${s.relativePath}${from}`);
        }
    }

    console.log('═══════════════════════════════════════════════');

    return {
        success: true,
        scannedFiles: [...scannedFiles],
        bundlePath: bundleFolder,
        uniqueScripts: allScripts.length,
        scriptsInBundle: inBundle,
        scriptsMissing: missing,
    };
}

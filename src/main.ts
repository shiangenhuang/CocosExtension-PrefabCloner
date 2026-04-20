import { clonePrefab } from './clone-prefab';
import { scanSceneScripts, writeScanReport } from './scan-scene-scripts';
import * as path from 'path';

/**
 * Extension methods registered for IPC messages
 */
export const methods: { [key: string]: (...args: any) => any } = {
    async clonePrefab() {
        try {
            // Step 1: Let user pick the source .prefab file
            const sourceResult = await Editor.Dialog.select({
                title: '① 選擇來源 Prefab (Select Source Prefab)',
                path: Editor.Project.path + '/assets',
                type: 'file',
                filters: [{ name: 'Prefab', extensions: ['prefab'] }],
            });

            if (sourceResult.canceled || !sourceResult.filePaths || sourceResult.filePaths.length === 0) {
                console.log('[Prefab Cloner] Cancelled by user.');
                return;
            }

            const sourcePrefabPath = sourceResult.filePaths[0];

            // Step 2: Let user pick the blacklist folder
            // Assets INSIDE this folder will be cloned (new UUID).
            // Assets OUTSIDE this folder will be reused (keep original UUID).
            const blacklistResult = await Editor.Dialog.select({
                title: '② 選擇要克隆的來源 Bundle 資料夾 (Select Source Bundle Folder to Clone From)',
                path: Editor.Project.path + '/assets',
                type: 'directory',
            });

            if (blacklistResult.canceled || !blacklistResult.filePaths || blacklistResult.filePaths.length === 0) {
                console.log('[Prefab Cloner] Cancelled by user.');
                return;
            }

            const blacklistFolder = blacklistResult.filePaths[0];

            // Step 3: Let user pick the target directory
            const targetResult = await Editor.Dialog.select({
                title: '③ 選擇目標資料夾 (Select Target Directory)',
                path: Editor.Project.path + '/assets',
                type: 'directory',
            });

            if (targetResult.canceled || !targetResult.filePaths || targetResult.filePaths.length === 0) {
                console.log('[Prefab Cloner] Cancelled by user.');
                return;
            }

            const targetDir = targetResult.filePaths[0];

            // Step 4: Run the clone
            console.log('[Prefab Cloner] Starting clone...');
            console.log(`  Source:    ${sourcePrefabPath}`);
            console.log(`  Blacklist: ${blacklistFolder}`);
            console.log(`  Target:    ${targetDir}`);

            const result = clonePrefab(sourcePrefabPath, targetDir, Editor.Project.path, blacklistFolder);

            // Step 5: Refresh the asset database so changes show up immediately
            await Editor.Message.request('asset-db', 'refresh-asset', 'db://assets');

            // Step 6: Show result dialog
            if (result.success) {
                await Editor.Dialog.info(
                    `✅ Prefab cloned successfully!\n\n` +
                    `📄 ${result.prefabPath}\n` +
                    `🆔 New UUID: ${result.newUUID}\n` +
                    `📦 Cloned: ${result.copiedCount} assets\n` +
                    `♻️ Reused: ${result.skippedReused} assets\n` +
                    ((result.crossRefs ?? 0) > 0
                        ? `\n⚠️ ${result.crossRefs} remaining blacklisted ref(s) need attention.`
                        : `\n🎉 No remaining references to blacklisted folder!`),
                    { title: 'Prefab Cloner' }
                );
            } else {
                await Editor.Dialog.error(
                    `❌ Clone failed:\n${result.error}`,
                    { title: 'Prefab Cloner' }
                );
            }

        } catch (err: any) {
            console.error('[Prefab Cloner] Error:', err);
            await Editor.Dialog.error(
                `❌ Unexpected error:\n${err.message || err}`,
                { title: 'Prefab Cloner' }
            );
        }
    },

    // ─── Scan Single Scene / Prefab ──────────────────────────────────────────

    async scanScene() {
        try {
            // Step 1: Let user pick a .scene or .prefab file
            const fileResult = await Editor.Dialog.select({
                title: '① 選擇場景或 Prefab 檔案 (Select Scene or Prefab)',
                path: Editor.Project.path + '/assets',
                type: 'file',
                filters: [{ name: 'Scene/Prefab', extensions: ['scene', 'prefab'] }],
            });

            if (fileResult.canceled || !fileResult.filePaths || fileResult.filePaths.length === 0) {
                console.log('[Scene Script Scanner] Cancelled by user.');
                return;
            }

            const sceneFilePath = fileResult.filePaths[0];

            // Step 2: Let user pick the bundle folder to check against
            const bundleResult = await Editor.Dialog.select({
                title: '② 選擇 Bundle 資料夾 (Select Bundle Folder to Check Against)',
                path: Editor.Project.path + '/assets',
                type: 'directory',
            });

            if (bundleResult.canceled || !bundleResult.filePaths || bundleResult.filePaths.length === 0) {
                console.log('[Scene Script Scanner] Cancelled by user.');
                return;
            }

            const bundleFolder = bundleResult.filePaths[0];

            // Step 3: Run the scan
            console.log('[Scene Script Scanner] Starting scan...');
            const result = scanSceneScripts(sceneFilePath, bundleFolder, Editor.Project.path, {
                recursive: true,
            });

            // Step 4: Save report
            if (result.success) {
                const reportPath = path.join(Editor.Project.path, 'script-scan-report.json');
                writeScanReport(result, reportPath);
            }

            // Step 5: Show result dialog
            await showScanResultDialog(result);

        } catch (err: any) {
            console.error('[Scene Script Scanner] Error:', err);
            await Editor.Dialog.error(
                `❌ Unexpected error:\n${err.message || err}`,
                { title: 'Scene Script Scanner' }
            );
        }
    },

    // ─── Scan Entire Bundle ──────────────────────────────────────────────────

    async scanBundle() {
        try {
            // Step 1: Let user pick the bundle folder
            const bundleResult = await Editor.Dialog.select({
                title: '選擇要掃描的 Bundle 資料夾 (Select Bundle Folder to Scan)',
                path: Editor.Project.path + '/assets',
                type: 'directory',
            });

            if (bundleResult.canceled || !bundleResult.filePaths || bundleResult.filePaths.length === 0) {
                console.log('[Scene Script Scanner] Cancelled by user.');
                return;
            }

            const bundleFolder = bundleResult.filePaths[0];

            // Step 2: Run the scan (directory mode — scans ALL .scene/.prefab in the folder)
            console.log('[Scene Script Scanner] Starting bundle-wide scan...');
            const result = scanSceneScripts(bundleFolder, bundleFolder, Editor.Project.path, {
                recursive: true,
            });

            // Step 3: Save report
            if (result.success) {
                const bundleName = path.basename(bundleFolder);
                const reportPath = path.join(Editor.Project.path, `script-scan-report-${bundleName}.json`);
                writeScanReport(result, reportPath);
            }

            // Step 4: Show result dialog
            await showScanResultDialog(result);

        } catch (err: any) {
            console.error('[Scene Script Scanner] Error:', err);
            await Editor.Dialog.error(
                `❌ Unexpected error:\n${err.message || err}`,
                { title: 'Scene Script Scanner' }
            );
        }
    },
};

// ─── Shared Dialog Helper ────────────────────────────────────────────────────

async function showScanResultDialog(result: ReturnType<typeof scanSceneScripts>) {
    if (!result.success) {
        await Editor.Dialog.error(
            `❌ Scan failed:\n${result.error}`,
            { title: 'Scene Script Scanner' }
        );
        return;
    }

    const scripts = result.scripts || [];
    const missing = scripts.filter(s => !s.isInBundle && s.scriptFilePath !== null);
    const notFound = scripts.filter(s => s.scriptFilePath === null);

    // Build dialog message
    let msg = `📊 Scan Complete\n\n`;
    msg += `Files scanned:     ${result.scannedFiles?.length || 0}\n`;
    msg += `Unique scripts:    ${result.uniqueScripts}\n`;
    msg += `✅ In bundle:      ${result.scriptsInBundle}\n`;
    msg += `❌ Outside bundle: ${result.scriptsMissing}\n`;
    msg += `⚠️ Not found:      ${result.scriptsNotFound}\n`;

    if (missing.length > 0) {
        msg += `\n── Scripts OUTSIDE Bundle ──\n`;
        for (const s of missing) {
            msg += `\n❌ ${s.relativePath}`;
            if (s.bundleLocation) {
                msg += `  (in: ${s.bundleLocation})`;
            }
            msg += `\n   Nodes: ${s.nodeNames.slice(0, 5).join(', ')}`;
            if (s.nodeNames.length > 5) msg += ` (+${s.nodeNames.length - 5} more)`;
        }
    }

    if (notFound.length > 0) {
        msg += `\n\n── Scripts NOT FOUND ──\n`;
        for (const s of notFound) {
            msg += `\n⚠️ ${s.compressedType}`;
            msg += ` → ${s.decompressedUUID}`;
            msg += `\n   Nodes: ${s.nodeNames.slice(0, 5).join(', ')}`;
            if (s.nodeNames.length > 5) msg += ` (+${s.nodeNames.length - 5} more)`;
        }
    }

    msg += `\n\n📝 Full report saved to project root.`;
    msg += `\n📋 See Console for detailed output.`;

    if (missing.length > 0 || notFound.length > 0) {
        await Editor.Dialog.warn(msg, { title: 'Scene Script Scanner' });
    } else {
        await Editor.Dialog.info(
            msg + `\n\n🎉 All scripts are inside the bundle!`,
            { title: 'Scene Script Scanner' },
        );
    }
}

/**
 * Hooks triggered after extension loading is complete
 */
export function load() {
    console.log('[Prefab Cloner] Extension loaded.');
}

/**
 * Hooks triggered after extension uninstallation is complete
 */
export function unload() {
    console.log('[Prefab Cloner] Extension unloaded.');
}

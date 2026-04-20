import { clonePrefab } from './clone-prefab';
import { scanSceneScripts } from './scan-scene-scripts';
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

    // ─── Scan Single Scene / Prefab ──────────────────────────────────────

    async scanScene() {
        try {
            const fileResult = await Editor.Dialog.select({
                title: '① 選擇場景或 Prefab (Select Scene or Prefab)',
                path: Editor.Project.path + '/assets',
                type: 'file',
                filters: [{ name: 'Scene/Prefab', extensions: ['scene', 'prefab'] }],
            });

            if (fileResult.canceled || !fileResult.filePaths || fileResult.filePaths.length === 0) {
                console.log('[Script Scanner] Cancelled.');
                return;
            }

            const bundleResult = await Editor.Dialog.select({
                title: '② 選擇 Bundle 資料夾 (Select Bundle Folder)',
                path: Editor.Project.path + '/assets',
                type: 'directory',
            });

            if (bundleResult.canceled || !bundleResult.filePaths || bundleResult.filePaths.length === 0) {
                console.log('[Script Scanner] Cancelled.');
                return;
            }

            const result = scanSceneScripts(
                fileResult.filePaths[0],
                bundleResult.filePaths[0],
                Editor.Project.path,
            );

            await showScanResult(result);
        } catch (err: any) {
            console.error('[Script Scanner] Error:', err);
            await Editor.Dialog.error(`❌ Error:\n${err.message || err}`, { title: 'Script Scanner' });
        }
    },

    // ─── Scan Entire Bundle ──────────────────────────────────────────────

    async scanBundle() {
        try {
            const bundleResult = await Editor.Dialog.select({
                title: '選擇要掃描的 Bundle 資料夾 (Select Bundle Folder)',
                path: Editor.Project.path + '/assets',
                type: 'directory',
            });

            if (bundleResult.canceled || !bundleResult.filePaths || bundleResult.filePaths.length === 0) {
                console.log('[Script Scanner] Cancelled.');
                return;
            }

            const folder = bundleResult.filePaths[0];
            const result = scanSceneScripts(folder, folder, Editor.Project.path);
            await showScanResult(result);
        } catch (err: any) {
            console.error('[Script Scanner] Error:', err);
            await Editor.Dialog.error(`❌ Error:\n${err.message || err}`, { title: 'Script Scanner' });
        }
    },
};

// ─── Result Dialog ───────────────────────────────────────────────────────────

async function showScanResult(result: ReturnType<typeof scanSceneScripts>) {
    if (!result.success) {
        await Editor.Dialog.error(`❌ ${result.error}`, { title: 'Script Scanner' });
        return;
    }

    const missing = result.scriptsMissing || [];
    const inBundle = result.scriptsInBundle || [];

    if (missing.length === 0) {
        await Editor.Dialog.info(
            `🎉 All ${inBundle.length} scripts are inside the bundle!\n\n` +
            `Files scanned: ${result.scannedFiles?.length || 0}`,
            { title: 'Script Scanner' },
        );
        return;
    }

    // Build a clean numbered list with forward slashes
    let msg = `❌ ${missing.length} script(s) outside bundle:\n\n`;
    for (let i = 0; i < missing.length; i++) {
        const num = String(i + 1).padStart(2);
        msg += `${num}. ${missing[i].relativePath.replace(/\\/g, '/')}\n`;
    }
    msg += `\n✅ ${inBundle.length} scripts are in bundle`;

    await Editor.Dialog.warn(msg, { title: 'Script Scanner' });
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

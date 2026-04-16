"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unload = exports.load = exports.methods = void 0;
const clone_prefab_1 = require("./clone-prefab");
/**
 * Extension methods registered for IPC messages
 */
exports.methods = {
    async clonePrefab() {
        var _a;
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
            const result = (0, clone_prefab_1.clonePrefab)(sourcePrefabPath, targetDir, Editor.Project.path, blacklistFolder);
            // Step 5: Refresh the asset database so changes show up immediately
            await Editor.Message.request('asset-db', 'refresh-asset', 'db://assets');
            // Step 6: Show result dialog
            if (result.success) {
                await Editor.Dialog.info(`✅ Prefab cloned successfully!\n\n` +
                    `📄 ${result.prefabPath}\n` +
                    `🆔 New UUID: ${result.newUUID}\n` +
                    `📦 Cloned: ${result.copiedCount} assets\n` +
                    `♻️ Reused: ${result.skippedReused} assets\n` +
                    (((_a = result.crossRefs) !== null && _a !== void 0 ? _a : 0) > 0
                        ? `\n⚠️ ${result.crossRefs} remaining blacklisted ref(s) need attention.`
                        : `\n🎉 No remaining references to blacklisted folder!`), { title: 'Prefab Cloner' });
            }
            else {
                await Editor.Dialog.error(`❌ Clone failed:\n${result.error}`, { title: 'Prefab Cloner' });
            }
        }
        catch (err) {
            console.error('[Prefab Cloner] Error:', err);
            await Editor.Dialog.error(`❌ Unexpected error:\n${err.message || err}`, { title: 'Prefab Cloner' });
        }
    },
};
/**
 * Hooks triggered after extension loading is complete
 */
function load() {
    console.log('[Prefab Cloner] Extension loaded.');
}
exports.load = load;
/**
 * Hooks triggered after extension uninstallation is complete
 */
function unload() {
    console.log('[Prefab Cloner] Extension unloaded.');
}
exports.unload = unload;

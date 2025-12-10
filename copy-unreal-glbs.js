/**
 * Copy Unreal-exported GLBs to the correct asset folders
 * Uses LOD0 (highest quality) versions
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.join(__dirname, 'unrealglbs');
const ASSETS_DIR = path.join(__dirname, 'client', 'public', 'assets');

// Mapping of asset prefixes to destination folders
const FOLDER_MAP = {
    'SM_Env_Bush': 'nature/trees',
    'SM_Env_Tree': 'nature/trees',
    'SM_Env_Grass': 'nature/grass',
    'SM_Env_CropField': 'nature/grass',
    'SM_Env_Flowers': 'nature/flowers',
    'SM_Env_Cloud': 'environment',
    'SM_Env_Fog': 'environment'
};

function getDestFolder(filename) {
    for (const [prefix, folder] of Object.entries(FOLDER_MAP)) {
        if (filename.startsWith(prefix)) {
            return folder;
        }
    }
    return null;
}

function getCleanName(filename) {
    // SM_Env_Bush_01_SM_Env_Bush_01_LOD0.glb -> SM_Env_Bush_01.glb
    // SM_Env_Flowers_Flat_01_SM_Env_Flowers_Flat_01.glb -> SM_Env_Flowers_Flat_01.glb

    // Remove .glb extension
    let name = filename.replace('.glb', '');

    // Remove LOD suffix if present
    name = name.replace(/_LOD\d+$/, '');

    // The filename is duplicated with underscore, take first half
    // SM_Env_Bush_01_SM_Env_Bush_01 -> SM_Env_Bush_01
    const parts = name.split('_');
    const halfLen = Math.floor(parts.length / 2);

    // Check if first half equals second half
    const firstHalf = parts.slice(0, halfLen).join('_');
    const secondHalf = parts.slice(halfLen).join('_');

    if (firstHalf === secondHalf) {
        return firstHalf + '.glb';
    }

    // For cases like SM_Env_Bush_02_SM_Env_Bush_02_Branches
    // We want SM_Env_Bush_02.glb (skip the Branches/Leaves variants for now)
    // Actually let's keep the base name
    return firstHalf + '.glb';
}

function main() {
    console.log('=== Copy Unreal GLBs to Asset Folders ===\n');

    const files = fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith('.glb'));
    console.log(`Found ${files.length} GLB files\n`);

    // Group files by base name and pick LOD0 or non-LOD version
    const fileGroups = {};

    for (const file of files) {
        const cleanName = getCleanName(file);
        const isLOD0 = file.includes('_LOD0');
        const hasNoLOD = !file.includes('_LOD');
        const isBranches = file.includes('_Branches');
        const isLeaves = file.includes('_Leaves');

        // Skip Branches/Leaves variants - we want the main mesh
        if (isBranches || isLeaves) continue;

        if (!fileGroups[cleanName] || isLOD0 || hasNoLOD) {
            fileGroups[cleanName] = file;
        }
    }

    let copied = 0;
    let skipped = 0;

    for (const [destName, sourceFile] of Object.entries(fileGroups)) {
        const folder = getDestFolder(destName);

        if (!folder) {
            console.log(`[SKIP] ${sourceFile} - no matching folder`);
            skipped++;
            continue;
        }

        const destFolder = path.join(ASSETS_DIR, folder);
        const sourcePath = path.join(SOURCE_DIR, sourceFile);
        const destPath = path.join(destFolder, destName);

        // Ensure destination folder exists
        if (!fs.existsSync(destFolder)) {
            fs.mkdirSync(destFolder, { recursive: true });
        }

        // Copy file (overwrite existing)
        fs.copyFileSync(sourcePath, destPath);
        console.log(`[COPY] ${sourceFile} -> ${folder}/${destName}`);
        copied++;
    }

    console.log('\n=== Done ===');
    console.log(`Copied: ${copied}`);
    console.log(`Skipped: ${skipped}`);
}

main();

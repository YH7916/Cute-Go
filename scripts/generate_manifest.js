import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROBLEMS_DIR = path.join(__dirname, '../public/Problems');
const OUTPUT_FILE = path.join(__dirname, '../public/problems_manifest.json');

const CATEGORIES = [
    { dir: 'Tsumego', name: '死活题', id: 'life_death' },
    { dir: 'Endgame', name: '官子题', id: 'endgame' }
];

function getFiles(dir, relativeTo = '') {
    if (!fs.existsSync(dir)) return [];
    try {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        let results = [];
        
        for (const item of items) {
            const resPath = path.join(dir, item.name);
            const relPath = relativeTo ? path.join(relativeTo, item.name) : item.name;
            
            if (item.isDirectory()) {
                results = results.concat(getFiles(resPath, relPath));
            } else if (item.name.endsWith('.sgf')) {
                results.push(relPath.replace(/\\/g, '/')); // Ensure forward slashes
            }
        }
        
        // Sort results
        return results.sort((a, b) => {
            // Try to extract numbers from filenames for sorting
             const nameA = a.split('/').pop();
             const nameB = b.split('/').pop();
             const numA = parseInt(nameA);
             const numB = parseInt(nameB);
             
             if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
             return a.localeCompare(b, 'zh-CN', { numeric: true });
        });
        
    } catch (e) {
        console.error(`Error reading ${dir}:`, e);
        return [];
    }
}

const manifest = CATEGORIES.map(cat => {
    const dirPath = path.join(PROBLEMS_DIR, cat.dir);
    console.log(`Scanning ${dirPath}...`);
    
    if (!fs.existsSync(dirPath)) return { ...cat, count: 0, children: [] };

    // Check if category has subdirectories
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    
    // Sort items: folders first, then files
    items.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        // Numeric sort
        const numA = parseInt(a.name);
        const numB = parseInt(b.name);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.name.localeCompare(b.name, 'zh-CN');
    });

    const children = items.map(item => {
        if (item.isDirectory()) {
            // Subcategory
            const subDir = path.join(dirPath, item.name);
            const files = getFiles(subDir);
            if (files.length === 0) return null;
            return {
                isGroup: true,
                name: item.name,
                files: files.map(f => `${item.name}/${f}`)
            };
        } else if (item.name.endsWith('.sgf')) {
            // Root file
            return {
                isGroup: false,
                name: item.name,
                file: item.name
            };
        }
        return null;
    }).filter(x => x);

    // Flatten logic: If mixed files and folders, maybe group files into "Misc"?
    // For now, let's just return the structure.
    
    // Calculate total count
    let totalCount = 0;
    children.forEach(c => {
        if (c.isGroup) totalCount += c.files.length;
        else totalCount += 1;
    });

    return {
        id: cat.id,
        name: cat.name,
        dirName: cat.dir,
        count: totalCount,
        children: children
    };
});

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));
console.log(`Manifest generated at ${OUTPUT_FILE}`);
console.log('Summary:');
manifest.forEach(c => console.log(`- ${c.name}: ${c.count} problems`));

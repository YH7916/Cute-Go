export interface TsumegoGroup {
    isGroup: true;
    name: string;
    files: string[];
}

export interface TsumegoFile {
    isGroup: false;
    name: string;
    file: string;
}

export interface TsumegoCategory {
    id: string;
    name: string;
    dirName: string;
    count: number;
    children: (TsumegoGroup | TsumegoFile)[];
    files?: string[]; // Legacy support or flat list?
}

export interface TsumegoLevel {
    id: string;         // Unique ID
    title: string;      // Display title
    subtitle?: string;
    category: string;   // Category ID
    groupName?: string; // [New]
    filename: string;   // Relative path
    difficulty: number;
    isLocked?: boolean;
    isCompleted?: boolean;
}

export const isTsumegoGroup = (
    child: TsumegoGroup | TsumegoFile
): child is TsumegoGroup => child.isGroup;

export const getCategoryFiles = (category: TsumegoCategory, groupName?: string): string[] => {
    if (groupName) {
        const group = category.children.find(
            child => isTsumegoGroup(child) && child.name === groupName
        );
        return group && isTsumegoGroup(group) ? group.files : [];
    }

    return category.children.flatMap(child =>
        isTsumegoGroup(child) ? child.files : [child.file]
    );
};

export const fetchProblemManifest = async (): Promise<TsumegoCategory[]> => {
    try {
        const res = await fetch('problems_manifest.json');
        if (!res.ok) throw new Error('Failed to load manifest');
        return await res.json();
    } catch (e) {
        console.error('Error fetching tsumego manifest:', e);
        return [];
    }
};

export const fetchProblemSGF = async (filename: string): Promise<string> => {
    try {
        const res = await fetch(`Problems/${filename}`);
        if (!res.ok) throw new Error(`Failed to load SGF: ${filename}`);
        
        const buffer = await res.arrayBuffer();
        
        // Simple heuristic: Decode as Latin1 (binary safe) to look for CA tag
        // or just look at bytes. 
        // CA[gb2312] or CA[GBK]
        
        const latinString = new TextDecoder('latin1').decode(buffer);
        const caMatch = latinString.match(/CA\s*\[([^\]]+)\]/);
        
        let charset = 'utf-8';
        if (caMatch && caMatch[1]) {
            const code = caMatch[1].toLowerCase();
            if (code.includes('gb') || code.includes('big5')) {
                charset = code;
            }
        }
        
        try {
            const decoder = new TextDecoder(charset);
            return decoder.decode(buffer);
        } catch {
            console.warn(`Failed to decode with ${charset}, falling back to utf-8`);
            return new TextDecoder('utf-8').decode(buffer);
        }
    } catch (e) {
        console.error('Error loading SGF:', e);
        throw e;
    }
};

// Helper to generate level objects from category
// Now handles nested Children structure
export const getLevelsFromCategory = (category: TsumegoCategory, groupName?: string): TsumegoLevel[] => {
    let targetFiles: {file: string, group?: string}[] = [];
    
    if (groupName) {
        const group = category.children.find(
            child => isTsumegoGroup(child) && child.name === groupName
        );
        if (group && isTsumegoGroup(group)) {
            targetFiles = group.files.map(file => ({ file, group: groupName }));
        }
    } else {
        // Flatten all or just root files? 
        // If no group specified, return ALL levels (for counting or search?)
        // Or just root files?
        // Let's return ALL flattened for "All Problems" view if needed, 
        // OR if category has mixed content.
        
        category.children.forEach(child => {
            if (isTsumegoGroup(child)) {
                child.files.forEach(file => targetFiles.push({ file, group: child.name }));
                return;
            }

            targetFiles.push({ file: child.file });
        });
    }

    return targetFiles.map((item, index) => ({
        id: `${category.id}/${item.file}`,
        title: `Problems ${index + 1}`, // Can be improved
        category: category.id,
        groupName: item.group,
        filename: `${category.dirName}/${item.file}`, // item.file is relative to category? No, manifest script returns "Group/file.sgf"
        difficulty: 1
    }));
};

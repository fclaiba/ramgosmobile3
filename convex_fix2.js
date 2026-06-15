const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else if (file.endsWith('.ts')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk('./convex');
let updatedCount = 0;
files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let replaced = content.replace(/actorId:\s*v\.optional\(v\.id\(['"]users['"]\)\)/g, 'actorId: v.optional(v.any())');
    
    // Also catch any non-optional actorId
    replaced = replaced.replace(/actorId:\s*v\.id\(['"]users['"]\)/g, 'actorId: v.any()');

    if (content !== replaced) {
        fs.writeFileSync(file, replaced);
        console.log('Updated ' + file);
        updatedCount++;
    }
});
console.log('Total files updated: ' + updatedCount);

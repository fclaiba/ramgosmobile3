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
    
    // Replace all occurrences of v.id("users") or v.id('users')
    let replaced = content.replace(/v\.id\(['"]users['"]\)/g, 'v.union(v.id("users"), v.string())');
    
    // Fix any double unions that might have been created if it was already updated
    replaced = replaced.replace(/v\.union\(v\.union\(v\.id\("users"\), v\.string\(\)\), v\.string\(\)\)/g, 'v.union(v.id("users"), v.string())');
    
    if (content !== replaced) {
        fs.writeFileSync(file, replaced);
        console.log('Updated ' + file);
        updatedCount++;
    }
});

console.log('Total files updated: ' + updatedCount);

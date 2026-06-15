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
    let replaced = content.replace(/v\.union\(v\.id\(['"]users['"]\), v\.string\(\)\)/g, 'v.id("users")');
    if (content !== replaced) {
        fs.writeFileSync(file, replaced);
        console.log('Reverted ' + file);
        updatedCount++;
    }
});
console.log('Total files reverted: ' + updatedCount);

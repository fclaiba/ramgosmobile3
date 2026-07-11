import os
import re
import json

def find_mock_data(root_dir):
    patterns = {
        'mock_variables': re.compile(r'(const|let|var)\s+(mock|dummy|fake|sample|test)[A-Za-z0-9_]*\s*=', re.IGNORECASE),
        'unsplash_images': re.compile(r'https://images\.unsplash\.com/[^\s\'"]+'),
        'lorem_ipsum': re.compile(r'lorem ipsum', re.IGNORECASE),
        'hardcoded_arrays': re.compile(r'const\s+[a-zA-Z0-9_]+\s*=\s*\[\s*\{', re.IGNORECASE),
        'hardcoded_objects': re.compile(r'(useState.*?\(\s*\{|const\s+[a-zA-Z0-9_]+\s*=\s*\{\s*(name|title|description|id):)', re.IGNORECASE),
    }

    results = {key: [] for key in patterns.keys()}
    
    for dirpath, _, filenames in os.walk(root_dir):
        if 'node_modules' in dirpath or '.expo' in dirpath or '.git' in dirpath:
            continue
            
        for filename in filenames:
            if not (filename.endswith('.ts') or filename.endswith('.tsx')):
                continue
                
            filepath = os.path.join(dirpath, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                    
                for i, line in enumerate(lines):
                    for key, pattern in patterns.items():
                        if pattern.search(line):
                            results[key].append({
                                'file': filepath,
                                'line': i + 1,
                                'content': line.strip()[:100] # truncate long lines
                            })
            except Exception as e:
                pass
                
    return results

def main():
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src'))
    
    results = find_mock_data(root_dir)
    
    report_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'mock_report.md'))
    
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write('# Reporte de Data Mockeada y Hardcodeada\n\n')
        
        for category, matches in results.items():
            f.write(f'## {category.replace("_", " ").title()} ({len(matches)} encontradas)\n')
            if not matches:
                f.write('*Ninguna encontrada*\n\n')
                continue
                
            for match in matches:
                rel_path = os.path.relpath(match['file'], os.path.dirname(report_path))
                f.write(f'- **{rel_path}:{match["line"]}**: `{match["content"]}`\n')
            f.write('\n')
            
    print(f'Reporte generado exitosamente en {report_path}')

if __name__ == '__main__':
    main()

import os
import re
import json
import glob

def audit_social_module():
    target_files = glob.glob('src/**/*.tsx', recursive=True)
    
    findings = []
    
    # Advanced patterns for detecting UI bugs in React Native
    patterns = {
        'potential_undefined_length': r'\w+\.\w+\.length', 
        'deprecated_post_user': r'post\.user\b', 
        'deprecated_post_id': r'post\.id\b', 
        'missing_optional_chaining': r'\w+\.(?!_id|id)\w+\.\w+', 
        'unsafe_string_index': r'\w+(\.\w+)*\[0\]', # e.g. name[0] without (name || '')[0]
        'unsafe_map': r'\b\w+\.map\(', # e.g. items.map without items?.map
        'deprecated_image_resize_mode': r'style=\{[^}]*resizeMode', # React Native Image style.resizeMode is deprecated
    }
    
    for filepath in target_files:
        if not os.path.exists(filepath):
            continue
            
        with open(filepath, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            
        for i, line in enumerate(lines):
            line_num = i + 1
            line_strip = line.strip()
            if line_strip.startswith('//'):
                continue
                
            # 1. Obsolete variables
            if re.search(patterns['deprecated_post_user'], line):
                findings.append({
                    'file': filepath, 'line': line_num, 'type': 'deprecated_post_user',
                    'message': 'Uso de post.user detectado. Usar post.author (o fallback).', 'snippet': line_strip
                })
                
            # 2. Length crashes
            if re.search(r'\w+\.\w+\.length', line) and '?.' not in line:
                findings.append({
                    'file': filepath, 'line': line_num, 'type': 'unsafe_length_check',
                    'message': 'Acceso a .length sin optional chaining (?.), puede causar crasheos.', 'snippet': line_strip
                })
                    
            # 3. ID deprecation
            if re.search(patterns['deprecated_post_id'], line) and 'post._id || post.id' not in line:
                findings.append({
                    'file': filepath, 'line': line_num, 'type': 'unsafe_id_access',
                    'message': 'Uso de post.id en lugar de post._id. Considerar (post._id || post.id).', 'snippet': line_strip
                })

            # 4. Comments undefined crash
            if 'post.comments' in line and 'post.comments?' not in line:
                findings.append({
                    'file': filepath, 'line': line_num, 'type': 'unsafe_comments_access',
                    'message': 'Acceso a post.comments sin optional chaining.', 'snippet': line_strip
                })

            # 5. String indexing crash (e.g. name[0])
            if re.search(r'\b\w+\.name\[0\]', line) or re.search(r'\b\w+Name\[0\]', line):
                if '||' not in line and '?' not in line:
                    findings.append({
                        'file': filepath, 'line': line_num, 'type': 'unsafe_string_index',
                        'message': 'Acceso a índice [0] en string sin fallback. Si la variable es undefined, crashea (Cannot read properties of undefined (reading "0")).', 'snippet': line_strip
                    })
                    
            # 6. Unsafe Array Map
            if re.search(r'\b(\w+)\.map\(', line):
                # Simple check if array name is preceded by ? (optional chaining)
                if '?.' not in line and '|| []' not in line and not line_strip.startswith('Object.'):
                    findings.append({
                        'file': filepath, 'line': line_num, 'type': 'unsafe_array_map',
                        'message': 'Llamada a .map() sin optional chaining (?.map) o fallback (|| []). Si el array no existe, crashea.', 'snippet': line_strip
                    })
                    
            # 7. Deprecated Image resizeMode
            if re.search(patterns['deprecated_image_resize_mode'], line):
                findings.append({
                    'file': filepath, 'line': line_num, 'type': 'deprecated_resize_mode',
                    'message': 'style.resizeMode en <Image> está obsoleto. Usar prop resizeMode="...".', 'snippet': line_strip
                })

    output_path = 'graphify-out/social_audit_errors_v2.json'
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(findings, f, indent=4, ensure_ascii=False)
        
    print(f"Auditoría Avanzada completada. Se encontraron {len(findings)} posibles errores/warnings en todo 'src/**/*.tsx'.")
    print(f"Resultados guardados en {output_path}")

if __name__ == '__main__':
    audit_social_module()

#!/usr/bin/env python3
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGETS = [ROOT / "src"]
EXTENSIONS = {'.tsx', '.ts'}
EXCLUDE_DIRS = {'node_modules', '.git', 'dist', 'build', '.expo', 'ui', 'theme'}

# Regex patterns for Shadow Blocks
SHADOW_REGEX = re.compile(
    r'\bshadowColor\s*:\s*(?:isDark\s*\?\s*\'[^\']+\'\s*:\s*\'[^\']+\'|\'[^\']+\')\s*,\s*'
    r'(?:shadowOffset\s*:\s*\{[^}]+\}\s*,\s*)?'
    r'(?:shadowOpacity\s*:\s*(?:isDark\s*\?\s*[\d.]+\s*:\s*[\d.]+|[\d.]+)\s*,\s*)?'
    r'(?:shadowRadius\s*:\s*[\d.]+\s*,\s*)?'
    r'(?:elevation\s*:\s*[\d.]+\s*,?)?',
    re.MULTILINE
)

RADIUS_REGEX = re.compile(r'\bborderRadius\s*:\s*(\d+)\b')

def get_radius_token(val_str: str) -> str:
    val = int(val_str)
    if val <= 8:
        return "Radius.sm"
    elif val <= 14:
        return "Radius.md"
    elif val <= 18:
        return "Radius.lg"
    elif val <= 24:
        return "Radius.xl"
    elif val <= 32:
        return "Radius['2xl']"
    else:
        return "Radius.full"

BG_ELEVATED_REGEX = re.compile(
    r"backgroundColor\s*:\s*isDark\s*\?\s*'#(?:111827|1F2937|1C1C1E|18181B|0B0A12)'\s*:\s*'#(?:FFFFFF|F9FAFB)'",
    re.IGNORECASE
)
BG_PAGE_REGEX = re.compile(
    r"backgroundColor\s*:\s*isDark\s*\?\s*'#(?:09090B|000000|0B0A12)'\s*:\s*'#(?:F3F4F6|F5F3FF|FAFAFA|F8F7FC)'",
    re.IGNORECASE
)
TEXT_PRIMARY_REGEX = re.compile(
    r"color\s*:\s*isDark\s*\?\s*'#(?:FFFFFF|F9FAFB|F3F4F6|E5E7EB)'\s*:\s*'#(?:000000|111827|1F2937|374151)'",
    re.IGNORECASE
)
TEXT_MUTED_REGEX = re.compile(
    r"color\s*:\s*isDark\s*\?\s*'#(?:9CA3AF|D1D5DB)'\s*:\s*'#(?:6B7280|4B5563)'",
    re.IGNORECASE
)
GLASS_CARD_REGEX = re.compile(
    r"backgroundColor\s*:\s*isDark\s*\?\s*'rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.08\)'\s*:\s*'rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.78\)'",
    re.IGNORECASE
)

def get_relative_import_path(file_path: Path) -> str:
    try:
        rel = file_path.relative_to(ROOT / 'src')
        depth = len(rel.parts) - 1
        if depth == 0:
            return "./theme/tokens"
        else:
            return "../" * depth + "theme/tokens"
    except ValueError:
        return "src/theme/tokens"

def patch_file(file_path: Path) -> bool:
    try:
        text = file_path.read_text(encoding='utf-8')
    except Exception:
        return False
        
    original = text
    needs_glass_shadow = False
    needs_radius = False
    needs_colors = False

    if SHADOW_REGEX.search(text):
        text = SHADOW_REGEX.sub(r'...glassShadow(isDark),', text)
        needs_glass_shadow = True
    
    if BG_ELEVATED_REGEX.search(text):
        text = BG_ELEVATED_REGEX.sub(r'backgroundColor: colors(isDark).bgElevated', text)
        needs_colors = True
        
    if BG_PAGE_REGEX.search(text):
        text = BG_PAGE_REGEX.sub(r'backgroundColor: colors(isDark).bg', text)
        needs_colors = True
        
    if TEXT_PRIMARY_REGEX.search(text):
        text = TEXT_PRIMARY_REGEX.sub(r'color: colors(isDark).text', text)
        needs_colors = True
        
    if TEXT_MUTED_REGEX.search(text):
        text = TEXT_MUTED_REGEX.sub(r'color: colors(isDark).textMuted', text)
        needs_colors = True

    if GLASS_CARD_REGEX.search(text):
        text = GLASS_CARD_REGEX.sub(r'backgroundColor: colors(isDark).glass', text)
        needs_colors = True

    def radius_replacer(match):
        nonlocal needs_radius
        val = int(match.group(1))
        if val == 0:
            return match.group(0)
        needs_radius = True
        return f"borderRadius: {get_radius_token(str(val))}"
        
    if RADIUS_REGEX.search(text):
        text = RADIUS_REGEX.sub(radius_replacer, text)

    imports_to_add = []
    if needs_glass_shadow: imports_to_add.append('glassShadow')
    if needs_radius: imports_to_add.append('Radius')
    if needs_colors: imports_to_add.append('colors')
    
    if imports_to_add and text != original:
        existing_import = re.search(r'import\s+\{([^}]+)\}\s+from\s+[\'"](?:[^.\'"]*/)?theme/tokens[\'"]', text)
        if existing_import:
            existing_tokens = set([t.strip() for t in existing_import.group(1).split(',')])
            missing = [t for t in imports_to_add if t not in existing_tokens]
            if missing:
                new_tokens_str = ", ".join(list(existing_tokens) + missing)
                text = text[:existing_import.start(1)] + new_tokens_str + text[existing_import.end(1):]
        else:
            import_path = get_relative_import_path(file_path)
            new_import = f"import {{ {', '.join(imports_to_add)} }} from '{import_path}';\n"
            imports = list(re.finditer(r'^import\s+.*$', text, re.MULTILINE))
            if imports:
                last_import = imports[-1]
                text = text[:last_import.end()] + '\n' + new_import + text[last_import.end():]
            else:
                text = new_import + '\n' + text

    if text != original:
        file_path.write_text(text, encoding='utf-8')
        return True
    return False

def main():
    print("Iniciando aplicación masiva de Liquid Glass UX/UI...")
    files_changed = 0
    
    for target in TARGETS:
        for path in target.rglob('*'):
            if path.is_file() and path.suffix in EXTENSIONS:
                if not any(excluded in path.parts for excluded in EXCLUDE_DIRS):
                    if patch_file(path):
                        print(f"Transformado: {path.relative_to(ROOT)}")
                        files_changed += 1
                        
    print(f"\nTransformación completada. Archivos actualizados: {files_changed}")

if __name__ == '__main__':
    main()

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Superscript v2.0 — Auditoría técnica de alto rendimiento para Next.js + Convex.
Optimizado para entornos agenticos y pipelines CI/CD.
"""

from __future__ import annotations
import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional, Dict, List, Set

# ==========================================
# UI & FORMATTING
# ==========================================
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BOLD = '\033[1m'
    ENDC = '\033[0m'

SEVERITY_ORDER = {"CRITICAL": 0, "WARNING": 1, "INFO": 2, "OK": 3}
SEV_ICONS = {
    "CRITICAL": f"🔴 CRITICAL",
    "WARNING":  f"🟡 WARNING ",
    "INFO":     f"🔵 INFO    ",
    "OK":       f"🟢 OK      ",
}

@dataclass
class Finding:
    layer: str
    severity: str
    title: str
    description: str
    file: str = ""
    fix_hint: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

# ==========================================
# CORE ENGINE: CACHE & TRAVERSAL
# ==========================================
class Codebase:
    def __init__(self, root: Path):
        self.root = root
        self.files_cache: Dict[str, str] = {}
        self.extensions = {".ts", ".tsx", ".js", ".jsx", ".json", ".mjs"}
        self.exclude_dirs = {"node_modules", ".git", ".next", "dist", "build", "__pycache__", ".turbo", ".vercel"}
        self._load_codebase()

    def _load_codebase(self):
        """Precarga todos los archivos de texto relevantes en memoria para escaneos O(1)."""
        for dirpath, dirnames, filenames in os.walk(self.root):
            dirnames[:] = [d for d in dirnames if d not in self.exclude_dirs]
            for fname in filenames:
                ext = os.path.splitext(fname)[1].lower()
                if ext in self.extensions or fname.startswith(".env"):
                    full_path = Path(dirpath) / fname
                    rel_path = self.relative(full_path)
                    try:
                        self.files_cache[rel_path] = full_path.read_text(encoding="utf-8", errors="ignore")
                    except Exception:
                        pass

    def relative(self, path: Path) -> str:
        try:
            return str(path.relative_to(self.root))
        except ValueError:
            return str(path)

    def get_files_by_pattern(self, dir_pattern: str, extensions: tuple = (".ts", ".tsx", ".js", ".jsx")) -> List[str]:
        """Filtra archivos en caché basados en un patrón de directorio y extensiones."""
        return [
            f for f in self.files_cache.keys()
            if (dir_pattern in f.replace("\\", "/")) and f.endswith(extensions)
        ]

    def get_content(self, rel_path: str) -> Optional[str]:
        return self.files_cache.get(rel_path)

# ==========================================
# ANALIZADORES
# ==========================================
def analyze_security(codebase: Codebase) -> List[Finding]:
    findings = []
    layer = "CAPA 1: SEGURIDAD"
    
    auth_guards = [r"requireUser\s*\(", r"requireAdmin\s*\(", r"requireModerator\s*\(", r"getServerSession\s*\(", r"auth\s*\(\s*\)", r"getAuth\s*\("]
    secret_patterns = [
        (r'\b(?:password|passwd|pwd)\b\s*=\s*["\'][^"\']{4,}["\']', "Password hardcodeado"),
        (r'\b(?:secret|api_?key|apikey|token)\b\s*=\s*["\'][^"\']{8,}["\']', "Secret/Key hardcodeado"),
        (r'(?:sk_live_|pk_live_|sk_test_|pk_test_)[A-Za-z0-9]{10,}', "Clave Stripe hardcodeada"),
    ]
    insecure_fallback = re.compile(r'process\.env\.[A-Z_]+\s*\|\|\s*["\'][^"\']{2,}["\']')

    # API Routes Check
    api_routes = codebase.get_files_by_pattern("app/api")
    for route in api_routes:
        content = codebase.get_content(route)
        rel_route = route.replace("\\", "/")
        is_public = "/public/" in rel_route or "/webhook" in rel_route.lower() or "api/auth/mercadopago" in rel_route

        if not is_public and not any(re.search(pat, content) for pat in auth_guards):
            findings.append(Finding(layer, "CRITICAL", f"Sin guard de autenticación", "Ruta de API desprotegida", route, "Agregar middleware o auth guard al inicio"))

        if is_public and not re.search(r'rateLimit|limiter|take\(', content, re.IGNORECASE):
            findings.append(Finding(layer, "WARNING", f"Sin rate limiting", "Endpoint expuesto", route, "Implementar rate limit middleware"))

    # Global Secrets Check
    for rel_path, content in codebase.files_cache.items():
        if rel_path.endswith((".json", ".mjs")) or ".env" in rel_path: continue
        
        for pat, label in secret_patterns:
            for m in re.finditer(pat, content, re.IGNORECASE):
                line_no = content[:m.start()].count('\n') + 1
                findings.append(Finding(layer, "CRITICAL", f"{label} (Línea {line_no})", m.group()[:60], rel_path, "Mover a .env.local"))

        for m in insecure_fallback.finditer(content):
            line_no = content[:m.start()].count('\n') + 1
            findings.append(Finding(layer, "WARNING", f"Fallback inseguro ENV (Línea {line_no})", m.group()[:60], rel_path, "Remover fallback estático"))

    return findings

def analyze_contracts(codebase: Codebase) -> List[Finding]:
    findings = []
    layer = "CAPA 2: CONTRATOS FRONT↔BACKEND"

    # Exportaciones en Convex
    convex_exports = set()
    for f in codebase.get_files_by_pattern("convex/"):
        if "_generated" in f: continue
        content = codebase.get_content(f)
        for m in re.finditer(r'export\s+const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:mutation|query|action|internalMutation|internalQuery)', content):
            convex_exports.add(m.group(1))
        for m in re.finditer(r'export\s+(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)', content):
            convex_exports.add(m.group(1))

    # Llamadas en Frontend
    frontend_calls = {}
    call_pat = re.compile(r'use(?:Mutation|Query|Action)\s*\(\s*api\.([A-Za-z0-9_.]+)\s*\)')
    
    for f in codebase.get_files_by_pattern("app/"):
        content = codebase.get_content(f)
        for m in call_pat.finditer(content):
            func_parts = m.group(1).split('.')
            func_name = func_parts[-1]
            frontend_calls.setdefault(func_name, []).append(f)

        # Manejo de estado
        if re.search(r'use(?:Query|Mutation|Action)\s*\(', content) and not re.search(r'isLoading|isPending|isError|isFetching', content):
            findings.append(Finding(layer, "WARNING", "Sin manejo de estado asíncrono", "Mutación/Query sin UI feedback", f, "Agregar isPending o error handling"))

    for call, files in frontend_calls.items():
        if call not in convex_exports:
            # Filtro para evitar falsos positivos de nombres comunes
            if call in ["default", "handler", "schema"]: continue
            findings.append(Finding(layer, "WARNING", f"Llamada posiblemente huérfana: `{call}`", f"El front llama a una función no exportada explícitamente en convex/", files[0], "Verificar exportación en convex/"))

    return findings

def analyze_architecture(codebase: Codebase) -> List[Finding]:
    findings = []
    layer = "CAPA 3: NEXT.JS & DB ARCHITECTURE"

    # React Hooks in Server Components
    use_client_pat = re.compile(r'["\']use client["\']')
    react_hooks_pat = re.compile(r'(?:^|\s)use(?:State|Effect|Reducer|Callback|Memo|Ref|Context)\s*\(')

    for f in codebase.get_files_by_pattern("app/"):
        content = codebase.get_content(f)
        if not use_client_pat.search(content) and react_hooks_pat.search(content):
            # Excluir archivos de test
            if ".test." in f or ".spec." in f: continue
            findings.append(Finding(layer, "CRITICAL", "Hook en Server Component", "Uso de React Context/State en el servidor", f, "Agregar 'use client' o mover lógica"))

    # Convex Schema Validation
    schema_path = "convex/schema.ts" if os.name != 'nt' else "convex\\schema.ts"
    schema_content = codebase.get_content(schema_path) or codebase.get_content("convex/schema.js")
    if schema_content:
        for table in re.findall(r'([A-Za-z_][A-Za-z0-9_]*)\s*:\s*defineTable\s*\(', schema_content):
            # Regex simple para detectar si la tabla tiene índice
            has_index = bool(re.search(rf'{table}\s*:[\s\S]*?\.index\s*\(', schema_content))
            if not has_index:
                findings.append(Finding(layer, "WARNING", f"Tabla `{table}` sin índices", "Queries sobre esta tabla harán full-scan", "convex/schema.ts", "Agregar .index()"))
    else:
        findings.append(Finding(layer, "WARNING", "Sin schema de Convex", "No se detectó schema estricto", "convex/schema.ts", "Crear y definir tablas"))

    return findings

def analyze_env_deploy(codebase: Codebase) -> List[Finding]:
    findings = []
    layer = "CAPA 4: ENV & DEPLOY"

    # Envs
    env_used = set()
    env_pat = re.compile(r'process\.env\.([A-Z_][A-Z0-9_]+)')
    for content in codebase.files_cache.values():
        env_used.update(env_pat.findall(content))

    env_defined = set()
    # Leer todos los .env posibles
    for env_file in [".env.local", ".env", ".env.development", ".env.example"]:
        content = codebase.get_content(env_file)
        if content:
            for line in content.splitlines():
                if '=' in line and not line.strip().startswith('#'):
                    env_defined.add(line.split('=', 1)[0].strip())

    for var in env_used:
        if var not in env_defined and not var.startswith("NODE_") and var not in ["VERCEL_URL", "CI"]:
            findings.append(Finding(layer, "CRITICAL", f"Variable huérfana: {var}", "Usada en código pero no en .env", ".env", "Definir en .env.local y .env.example"))

    # Deploy Ready
    pkg_content = codebase.get_content("package.json")
    if pkg_content:
        try:
            scripts = json.loads(pkg_content).get("scripts", {})
            for s in ["build", "start"]:
                if s not in scripts:
                    findings.append(Finding(layer, "CRITICAL", f"Sin script de {s}", "", "package.json", f"Añadir 'next {s}'"))
        except:
            pass

    next_config = codebase.get_content("next.config.ts") or codebase.get_content("next.config.js") or codebase.get_content("next.config.mjs")
    if next_config and 'ignoreBuildErrors: true' in next_config:
        findings.append(Finding(layer, "CRITICAL", "Typescript silenciado", "ignoreBuildErrors está activado", "next.config.*", "Eliminar regla y arreglar tipos"))

    return findings

# ==========================================
# EJECUCIÓN Y REPORTERÍA
# ==========================================
def print_report(findings: List[Finding], project_name: str, elapsed: float):
    # Intentar configurar salida UTF-8 para Windows
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except:
        pass

    print(f"\n{Colors.BOLD}{Colors.HEADER}════════════════════════════════════════════════════════{Colors.ENDC}")
    print(f"{Colors.BOLD}  SUPERSCRIPT AUDIT v2.0 — {project_name}{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.HEADER}════════════════════════════════════════════════════════{Colors.ENDC}")

    grouped = {}
    for f in findings:
        grouped.setdefault(f.layer, []).append(f)

    for layer in sorted(grouped.keys()):
        items = grouped[layer]
        print(f"\n{Colors.BOLD}[{layer}]{Colors.ENDC}")
        for f in sorted(items, key=lambda x: SEVERITY_ORDER.get(x.severity, 9)):
            icon = SEV_ICONS.get(f.severity, f.severity)
            print(f"  {icon} {f.title}")
            print(f"               {Colors.CYAN}File:{Colors.ENDC} {f.file}")
            if f.description: print(f"               {Colors.CYAN}Info:{Colors.ENDC} {f.description}")
            if f.fix_hint: print(f"               {Colors.CYAN}Fix: {Colors.ENDC} {f.fix_hint}\n")

    crits = sum(1 for f in findings if f.severity == "CRITICAL")
    warns = sum(1 for f in findings if f.severity == "WARNING")
    
    print(f"{Colors.BOLD}{Colors.HEADER}════════════════════════════════════════════════════════{Colors.ENDC}")
    ready = f"{Colors.GREEN}✅ LISTO PARA PRODUCCIÓN{Colors.ENDC}" if crits == 0 else f"{Colors.RED}❌ REQUIERE INTERVENCIÓN ({crits} Blockers){Colors.ENDC}"
    print(f"  Estado: {ready}")
    print(f"  Resumen: {crits} Críticos | {warns} Warnings | {elapsed:.2f}s de ejecución")
    print(f"{Colors.BOLD}{Colors.HEADER}════════════════════════════════════════════════════════{Colors.ENDC}\n")

def main():
    parser = argparse.ArgumentParser(description="Auditoría técnica de alto rendimiento")
    parser.add_argument("--path", "-p", default=".", help="Ruta al proyecto")
    parser.add_argument("--output", "-o", choices=["terminal", "json"], default="terminal")
    args = parser.parse_args()

    root = Path(args.path).resolve()
    t0 = time.time()
    
    codebase = Codebase(root)
    all_findings = []
    all_findings.extend(analyze_security(codebase))
    all_findings.extend(analyze_contracts(codebase))
    all_findings.extend(analyze_architecture(codebase))
    all_findings.extend(analyze_env_deploy(codebase))
    
    elapsed = time.time() - t0

    if args.output == "json":
        print(json.dumps([f.to_dict() for f in all_findings], ensure_ascii=False, indent=2))
    else:
        print_report(all_findings, root.name.upper(), elapsed)

if __name__ == "__main__":
    main()

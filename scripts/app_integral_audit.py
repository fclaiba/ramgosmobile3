#!/usr/bin/env python3
"""
Ramgos Mobile - Integral App Audit Script
==========================================

Escaneo integral del repo para producir un diagnostico auditable del estado
actual de la app: arquitectura, backend (Convex), pagos/escrow/KYC,
configuracion movil, calidad tecnica, credenciales y readiness de release.

Uso basico:
    python scripts/app_integral_audit.py
    python scripts/app_integral_audit.py --root . --output DIAGNOSTICO_APP_ESTADO_ACTUAL.md
    python scripts/app_integral_audit.py --run-checks
    python scripts/app_integral_audit.py --run-checks --online-checks

Salida: archivo Markdown con resumen ejecutivo, scoring por dimension,
hallazgos con severidad y plan de accion.

Sin dependencias externas (solo stdlib).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import socket
import subprocess
import sys
import textwrap
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple
from urllib import request as urlrequest
from urllib.error import URLError, HTTPError


# ---------------------------------------------------------------------------
# Modelo de datos
# ---------------------------------------------------------------------------

SEVERITY_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4}
STATUS_EMOJI = {"PASS": "PASS", "FAIL": "FAIL", "WARN": "WARN", "SKIP": "SKIP"}


@dataclass
class CheckResult:
    check_id: str
    category: str
    severity: str  # CRITICAL, HIGH, MEDIUM, LOW, INFO
    status: str    # PASS, FAIL, WARN, SKIP
    description: str
    evidence: str = ""
    remediation: str = ""


@dataclass
class CategoryScore:
    name: str
    weight: int
    points_earned: float = 0.0
    points_possible: float = 0.0

    @property
    def score(self) -> float:
        if self.points_possible == 0:
            return 0.0
        return round((self.points_earned / self.points_possible) * 100.0, 1)


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def read_text(path: Path, max_bytes: int = 2_000_000) -> Optional[str]:
    try:
        if not path.exists() or not path.is_file():
            return None
        with path.open("r", encoding="utf-8", errors="replace") as f:
            return f.read(max_bytes)
    except Exception:
        return None


def read_json(path: Path) -> Optional[dict]:
    raw = read_text(path)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


def file_exists(path: Path) -> bool:
    return path.exists() and path.is_file()


def dir_exists(path: Path) -> bool:
    return path.exists() and path.is_dir()


def short(text: str, limit: int = 240) -> str:
    text = text.replace("\r", "").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 3] + "..."


def run_command(
    cmd: List[str],
    cwd: Path,
    timeout: int = 600,
) -> Tuple[int, str, str]:
    """Ejecuta un comando y devuelve (exit_code, stdout, stderr).
    Tolera fallos: nunca lanza excepcion al consumidor.
    """
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=False,
        )
        return proc.returncode, proc.stdout or "", proc.stderr or ""
    except FileNotFoundError as exc:
        return 127, "", f"FileNotFoundError: {exc}"
    except subprocess.TimeoutExpired as exc:
        return 124, exc.stdout or "", f"TimeoutExpired after {timeout}s"
    except Exception as exc:  # noqa: BLE001
        return 1, "", f"Exception: {exc}"


def http_head(url: str, timeout: float = 6.0) -> Tuple[bool, str]:
    try:
        req = urlrequest.Request(url, method="GET")  # algunos servers no responden HEAD
        with urlrequest.urlopen(req, timeout=timeout) as resp:
            code = resp.getcode()
            return (200 <= code < 500, f"HTTP {code}")
    except HTTPError as exc:
        return (exc.code != 0, f"HTTPError {exc.code}")
    except URLError as exc:
        return (False, f"URLError: {exc.reason}")
    except (socket.timeout, TimeoutError):
        return (False, "timeout")
    except Exception as exc:  # noqa: BLE001
        return (False, f"Exception: {exc}")


# ---------------------------------------------------------------------------
# Auditor principal
# ---------------------------------------------------------------------------

class Auditor:
    def __init__(self, root: Path, run_checks: bool, online_checks: bool) -> None:
        self.root = root
        self.run_checks = run_checks
        self.online_checks = online_checks
        self.results: List[CheckResult] = []
        self.categories: Dict[str, CategoryScore] = {
            "arquitectura": CategoryScore("Arquitectura y dominio", 100),
            "finanzas": CategoryScore("Pagos / Escrow / Comisiones", 100),
            "seguridad": CategoryScore("Seguridad y credenciales", 100),
            "release": CategoryScore("Build / Release readiness", 100),
            "calidad": CategoryScore("Testing y calidad", 100),
            "integraciones": CategoryScore("Integraciones externas", 100),
        }

        # Pre-cargar artefactos clave
        self.package_json = read_json(root / "package.json") or {}
        self.app_json = read_json(root / "app.json") or {}
        self.eas_json = read_json(root / "eas.json") or {}
        self.env_example = read_text(root / ".env.example") or ""
        self.gitignore = read_text(root / ".gitignore") or ""
        self.schema_ts = read_text(root / "convex" / "schema.ts") or ""
        self.http_ts = read_text(root / "convex" / "http.ts") or ""
        self.stripe_ts = read_text(root / "convex" / "stripe.ts") or ""
        self.identity_ts = read_text(root / "convex" / "identity.ts") or ""
        self.finance_ts = read_text(root / "convex" / "finance.ts") or ""
        self.users_convex_ts = read_text(root / "convex" / "users.ts") or ""
        self.cart_convex_ts = read_text(root / "convex" / "cart.ts") or ""
        self.economy_ts = read_text(root / "convex" / "economy.ts") or ""

    # -- Helpers de registro -------------------------------------------------

    def add(
        self,
        check_id: str,
        category: str,
        severity: str,
        status: str,
        description: str,
        evidence: str = "",
        remediation: str = "",
        weight: float = 1.0,
    ) -> None:
        self.results.append(
            CheckResult(
                check_id=check_id,
                category=category,
                severity=severity,
                status=status,
                description=description,
                evidence=evidence,
                remediation=remediation,
            )
        )
        cat = self.categories[category]
        cat.points_possible += weight
        if status == "PASS":
            cat.points_earned += weight
        elif status == "WARN":
            cat.points_earned += weight * 0.5
        # FAIL/SKIP no suman puntos

    # -- Categorias de auditoria --------------------------------------------

    def audit_architecture(self) -> None:
        cat = "arquitectura"

        deps = (self.package_json.get("dependencies") or {})
        dev_deps = (self.package_json.get("devDependencies") or {})

        critical_deps = [
            ("expo", "Expo SDK base"),
            ("react-native", "React Native runtime"),
            ("react", "React core"),
            ("convex", "Cliente Convex"),
            ("@stripe/stripe-react-native", "Stripe RN SDK"),
            ("stripe", "Stripe Node SDK (server)"),
            ("@react-navigation/native", "Navegacion"),
            ("expo-notifications", "Push notifications"),
            ("expo-image-picker", "Captura de evidencia/foto"),
            ("resend", "Servicio de emails"),
        ]
        for dep, label in critical_deps:
            present = dep in deps or dep in dev_deps
            self.add(
                check_id=f"deps.{dep}",
                category=cat,
                severity="MEDIUM",
                status="PASS" if present else "FAIL",
                description=f"Dependencia critica presente: {label} ({dep})",
                evidence=(deps.get(dep) or dev_deps.get(dep) or "no encontrada"),
                remediation=f"Instalar {dep}: npm install {dep}",
            )

        # Schema y modulos Convex clave
        convex_modules = [
            "users", "cart", "orders", "disputes", "economy",
            "finance", "stripe", "http", "identity", "files",
            "listings", "reviews", "userProfile", "developer",
            "notifications", "authHelpers",
        ]
        for mod in convex_modules:
            mod_path = self.root / "convex" / f"{mod}.ts"
            present = file_exists(mod_path)
            self.add(
                check_id=f"convex.module.{mod}",
                category=cat,
                severity="HIGH" if mod in {"finance", "stripe", "http", "authHelpers"} else "MEDIUM",
                status="PASS" if present else "FAIL",
                description=f"Modulo Convex presente: convex/{mod}.ts",
                evidence=str(mod_path.relative_to(self.root)) if present else "no existe",
                remediation=f"Crear y deployar convex/{mod}.ts",
            )

        # Generated API
        api_dts = self.root / "convex" / "_generated" / "api.d.ts"
        api_content = read_text(api_dts) or ""
        registered_modules = ["finance", "stripe", "notifications", "users", "orders", "disputes", "economy"]
        missing = [m for m in registered_modules if f"typeof {m}" not in api_content]
        self.add(
            check_id="convex.generated.modules",
            category=cat,
            severity="HIGH",
            status="PASS" if not missing else "FAIL",
            description="convex/_generated/api.d.ts registra modulos clave",
            evidence=("ok" if not missing else f"falta declarar: {', '.join(missing)}"),
            remediation="Ejecutar `npx convex codegen` con acceso al proyecto productivo.",
        )

        # Contextos React criticos
        contexts_dir = self.root / "src" / "contexts"
        critical_contexts = [
            "AuthContext.tsx", "CartContext.tsx", "MarketplaceContext.tsx",
            "FintechContext.tsx", "WalletContext.tsx", "PointsContext.tsx",
            "RewardsContext.tsx", "EscrowContext.tsx", "NotificationsContext.tsx",
        ]
        missing_ctx = [c for c in critical_contexts if not file_exists(contexts_dir / c)]
        self.add(
            check_id="frontend.contexts.criticos",
            category=cat,
            severity="HIGH",
            status="PASS" if not missing_ctx else "FAIL",
            description="Contextos React criticos presentes",
            evidence=("ok" if not missing_ctx else f"faltan: {', '.join(missing_ctx)}"),
            remediation="Recuperar/crear contextos faltantes en src/contexts/",
        )

    def audit_finance(self) -> None:
        cat = "finanzas"

        # Tablas financieras en schema
        finance_tables = [
            "payments", "paymentEvents", "payouts",
            "withdrawals", "walletAccounts",
        ]
        for table in finance_tables:
            present = re.search(rf"\b{table}:\s*defineTable", self.schema_ts) is not None
            self.add(
                check_id=f"schema.table.{table}",
                category=cat,
                severity="CRITICAL" if table in {"payments", "paymentEvents"} else "HIGH",
                status="PASS" if present else "FAIL",
                description=f"Tabla financiera persistida en convex/schema.ts: {table}",
                evidence=("encontrada" if present else "no definida en schema"),
                remediation="Definir la tabla en convex/schema.ts con sus indices.",
            )

        # Indices criticos
        critical_indexes = [
            ("payments", "by_stripe_intent"),
            ("payments", "by_order"),
            ("payments", "by_status"),
            ("paymentEvents", "by_stripe_event"),
            ("payouts", "by_seller"),
            ("withdrawals", "by_user"),
            ("walletAccounts", "by_user"),
        ]
        for table, idx in critical_indexes:
            present = re.search(rf'\.index\(["\']{idx}["\']', self.schema_ts) is not None
            self.add(
                check_id=f"schema.index.{table}.{idx}",
                category=cat,
                severity="HIGH",
                status="PASS" if present else "FAIL",
                description=f"Indice transaccional en {table}: {idx}",
                evidence=("ok" if present else "no encontrado"),
                remediation=f"Agregar .index('{idx}', [...]) en {table}.",
            )

        # Stripe action createPaymentIntent persistente
        creates_payment_record = (
            "createPaymentIntent" in self.stripe_ts
            and "createPaymentRecord" in self.stripe_ts
        )
        self.add(
            check_id="stripe.action.payment_intent_persistido",
            category=cat,
            severity="CRITICAL",
            status="PASS" if creates_payment_record else "FAIL",
            description="createPaymentIntent persiste registro en payments",
            evidence=("Llama a internal.finance.createPaymentRecord" if creates_payment_record else "no se observa persistencia"),
            remediation="Persistir cada PaymentIntent en payments antes de devolver clientSecret.",
        )

        # Webhook idempotencia
        idempotent_webhook = (
            "recordPaymentEvent" in self.http_ts
            and "alreadyProcessed" in self.http_ts
        )
        self.add(
            check_id="webhook.idempotencia",
            category=cat,
            severity="CRITICAL",
            status="PASS" if idempotent_webhook else "FAIL",
            description="Webhook Stripe usa paymentEvents para idempotencia",
            evidence=("recordPaymentEvent + alreadyProcessed presentes" if idempotent_webhook else "no detectado"),
            remediation="Implementar tabla paymentEvents y verificar alreadyProcessed antes de procesar.",
        )

        # Webhook eventos cubiertos
        events_required = [
            "payment_intent.succeeded",
            "payment_intent.payment_failed",
            "charge.refunded",
            "charge.dispute.created",
        ]
        missing_events = [e for e in events_required if e not in self.http_ts]
        self.add(
            check_id="webhook.eventos_cubiertos",
            category=cat,
            severity="HIGH",
            status="PASS" if not missing_events else "FAIL",
            description="Webhook Stripe cubre eventos criticos del ciclo de vida del pago",
            evidence=("todos presentes" if not missing_events else f"faltan: {', '.join(missing_events)}"),
            remediation="Agregar handlers en convex/http.ts para los eventos faltantes.",
        )

        # Stripe Connect (payouts)
        has_connect = "createConnectAccountLink" in self.stripe_ts and "executePayout" in self.stripe_ts
        self.add(
            check_id="stripe.connect.payouts",
            category=cat,
            severity="HIGH",
            status="PASS" if has_connect else "FAIL",
            description="Soporte de Stripe Connect (onboarding + payout)",
            evidence=("createConnectAccountLink + executePayout" if has_connect else "no detectado"),
            remediation="Implementar acciones Connect en convex/stripe.ts y guardar stripeConnectAccountId.",
        )

        # Stripe Identity / KYC
        identity_real = (
            "identity.verificationSessions.create" in self.identity_ts
        )
        self.add(
            check_id="kyc.stripe_identity",
            category=cat,
            severity="HIGH",
            status="PASS" if identity_real else "FAIL",
            description="KYC integrado con Stripe Identity sin mocks",
            evidence=("Stripe Identity activo" if identity_real else "implementacion incompleta"),
            remediation="Usar stripe.identity.verificationSessions.create directamente sin mocks.",
        )

        # Escrow / orders
        escrow_states = [s for s in ["payment_received", "delivered", "completed", "disputed", "cancelled"] if s in self.schema_ts]
        self.add(
            check_id="orders.estados_escrow",
            category=cat,
            severity="HIGH",
            status="PASS" if len(escrow_states) >= 4 else "WARN",
            description="Estados de orden compatibles con flujo escrow",
            evidence=f"detectados: {', '.join(escrow_states)}",
            remediation="Asegurar union completa de estados para escrow.",
        )

        # Idempotencia en orders
        order_idempotency = "idempotencyKey" in self.schema_ts and "by_user_idempotency" in self.schema_ts
        self.add(
            check_id="orders.idempotencia",
            category=cat,
            severity="HIGH",
            status="PASS" if order_idempotency else "FAIL",
            description="Orders soporta idempotencyKey con indice",
            evidence=("idempotencyKey + by_user_idempotency" if order_idempotency else "ausente"),
            remediation="Agregar idempotencyKey y .index('by_user_idempotency', [...]) en orders.",
        )

        # Economy (points/wallet) idempotente
        economy_idempotent = "eventKey" in self.economy_ts and "claimKey" in self.economy_ts
        self.add(
            check_id="economy.idempotencia",
            category=cat,
            severity="HIGH",
            status="PASS" if economy_idempotent else "FAIL",
            description="Economy (points/wallet/rewards) usa eventKey/claimKey",
            evidence=("eventKey + claimKey detectados" if economy_idempotent else "no detectado"),
            remediation="Aplicar eventKey/claimKey para evitar dobles asignaciones.",
        )

        # FintechContext sin processPayment local
        fintech_path = self.root / "src" / "contexts" / "FintechContext.tsx"
        fintech = read_text(fintech_path) or ""
        local_charge = re.search(r"provider\.charge\s*\(", fintech) is not None or re.search(r"setTimeout\(.*resolve.*1500", fintech) is not None
        self.add(
            check_id="fintech.sin_charge_local",
            category=cat,
            severity="HIGH",
            status="PASS" if not local_charge and fintech else ("FAIL" if local_charge else "WARN"),
            description="FintechContext no simula cargos locales (provider.charge / setTimeout)",
            evidence=("limpio" if fintech and not local_charge else "se detectaron simulaciones"),
            remediation="Remover provider.charge/setTimeout y delegar pagos a Convex/Stripe.",
        )

    def audit_security(self) -> None:
        cat = "seguridad"

        # .env.example documentado
        required_env = [
            "EXPO_PUBLIC_CONVEX_URL", "EXPO_PUBLIC_STRIPE_KEY",
            "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
            "ALLOW_STRIPE_MOCK", "ALLOW_KYC_MOCK",
        ]
        missing_env = [e for e in required_env if e not in self.env_example]
        self.add(
            check_id="env.example.documenta_variables",
            category=cat,
            severity="MEDIUM",
            status="PASS" if not missing_env else "WARN",
            description=".env.example documenta todas las variables criticas",
            evidence=("ok" if not missing_env else f"faltan: {', '.join(missing_env)}"),
            remediation="Documentar las variables en .env.example.",
        )

        # Stripe key en eas.json no debe ser placeholder en produccion
        prod_env = (((self.eas_json.get("build") or {}).get("production") or {}).get("env") or {})
        prod_stripe = prod_env.get("EXPO_PUBLIC_STRIPE_KEY", "")
        is_real_prod_key = bool(prod_stripe) and "replace_me" not in prod_stripe and prod_stripe.startswith("pk_live_")
        self.add(
            check_id="eas.production.stripe_key",
            category=cat,
            severity="CRITICAL",
            status="PASS" if is_real_prod_key else "FAIL",
            description="eas.json -> production tiene EXPO_PUBLIC_STRIPE_KEY real (pk_live_...)",
            evidence=f"valor actual: '{prod_stripe or 'vacio'}'",
            remediation="Cargar clave publica de Stripe live en eas.json (production).",
        )

        # Convex URL en produccion
        prod_convex = prod_env.get("EXPO_PUBLIC_CONVEX_URL", "")
        self.add(
            check_id="eas.production.convex_url",
            category=cat,
            severity="HIGH",
            status="PASS" if prod_convex.startswith("https://") and "convex.cloud" in prod_convex else "FAIL",
            description="eas.json -> production define EXPO_PUBLIC_CONVEX_URL valido",
            evidence=f"valor actual: '{prod_convex or 'vacio'}'",
            remediation="Apuntar el perfil production a la URL Convex productiva.",
        )

        # Mocks Stripe en codigo (uso de ALLOW_*)
        stripe_mock_flag = "ALLOW_STRIPE_MOCK" in self.stripe_ts
        kyc_mock_flag = "ALLOW_KYC_MOCK" in self.identity_ts
        self.add(
            check_id="mocks.removidos",
            category=cat,
            severity="MEDIUM",
            status="PASS" if not stripe_mock_flag and not kyc_mock_flag else "WARN",
            description="Mocks de pagos/KYC eliminados para produccion",
            evidence=f"stripe_mock={stripe_mock_flag} kyc_mock={kyc_mock_flag}",
            remediation="Asegurarse de no utilizar ALLOW_STRIPE_MOCK ni ALLOW_KYC_MOCK en produccion.",
        )

        # Maps API key restringida (heuristica: presente en app.json)
        google_maps_key = (((self.app_json.get("expo") or {}).get("android") or {}).get("config") or {}).get("googleMaps", {}).get("apiKey")
        self.add(
            check_id="maps.apikey_restriccion",
            category=cat,
            severity="HIGH",
            status="WARN" if google_maps_key else "SKIP",
            description="Google Maps API key embebida en app.json (verificar restriccion en GCP)",
            evidence=(f"key presente: {google_maps_key[:6]}...{google_maps_key[-4:]}" if google_maps_key else "sin key"),
            remediation="Restringir la API key por package + SHA1 en Google Cloud Console.",
        )

        # Verificar que .env.local esta gitignorado
        env_local_exists = file_exists(self.root / ".env.local")
        env_local_gitignored = ".env.local" in self.gitignore or ".env*.local" in self.gitignore
        self.add(
            check_id="env.local.gitignored",
            category=cat,
            severity="CRITICAL",
            status=("PASS" if (not env_local_exists or env_local_gitignored) else "FAIL"),
            description=".env.local (si existe) esta gitignorado",
            evidence=f"exists={env_local_exists} gitignored={env_local_gitignored}",
            remediation="Agregar `.env*.local` a .gitignore inmediatamente.",
        )

        # auth helpers en backend
        auth_helpers = read_text(self.root / "convex" / "authHelpers.ts") or ""
        helpers_present = all(h in auth_helpers for h in ["requireActor", "assertSelfOrAdmin", "assertAdminOrDeveloper"])
        self.add(
            check_id="backend.auth_helpers",
            category=cat,
            severity="HIGH",
            status="PASS" if helpers_present else "FAIL",
            description="Backend usa requireActor / assertSelfOrAdmin / assertAdminOrDeveloper",
            evidence=("ok" if helpers_present else "faltan helpers"),
            remediation="Implementar y aplicar authHelpers en todas las mutations sensibles.",
        )

        # Bundle identifier definido
        ios_bundle = ((self.app_json.get("expo") or {}).get("ios") or {}).get("bundleIdentifier")
        android_pkg = ((self.app_json.get("expo") or {}).get("android") or {}).get("package")
        self.add(
            check_id="app.bundle.identifiers",
            category=cat,
            severity="HIGH",
            status="PASS" if ios_bundle and android_pkg else "FAIL",
            description="app.json define bundleIdentifier (iOS) y package (Android)",
            evidence=f"ios={ios_bundle} android={android_pkg}",
            remediation="Definir bundleIdentifier y package en app.json.",
        )

    def audit_release_readiness(self) -> None:
        cat = "release"
        expo = self.app_json.get("expo") or {}

        # Version y versionCode
        version = expo.get("version")
        version_code = (expo.get("android") or {}).get("versionCode")
        self.add(
            check_id="release.version_metadata",
            category=cat,
            severity="MEDIUM",
            status="PASS" if version and version_code else "WARN",
            description="app.json define version y android.versionCode",
            evidence=f"version={version} versionCode={version_code}",
            remediation="Sincronizar version semver y versionCode previo a cada release.",
        )

        # iOS supportsTablet + ITSAppUsesNonExemptEncryption
        ios = expo.get("ios") or {}
        non_exempt = (ios.get("infoPlist") or {}).get("ITSAppUsesNonExemptEncryption")
        self.add(
            check_id="release.ios.encryption_declaration",
            category=cat,
            severity="MEDIUM",
            status="PASS" if non_exempt is False else "WARN",
            description="iOS declara ITSAppUsesNonExemptEncryption=false (export compliance)",
            evidence=f"valor: {non_exempt}",
            remediation="Agregar ITSAppUsesNonExemptEncryption=false en infoPlist.",
        )

        # EAS profile production presente
        has_prod_profile = (((self.eas_json.get("build") or {}).get("production") or {})) != {}
        self.add(
            check_id="release.eas.profile_production",
            category=cat,
            severity="HIGH",
            status="PASS" if has_prod_profile else "FAIL",
            description="eas.json tiene perfil 'production' configurado",
            evidence=("ok" if has_prod_profile else "no presente"),
            remediation="Agregar perfil production en eas.json.",
        )

        # Documentos de release
        release_docs = [
            ("RELEASE_ANDROID.md", "Guia release Android"),
            ("IOS_RELEASE_ENABLEMENT.md", "Habilitacion iOS"),
            ("PLAY_CONSOLE_RELEASE_CHECKLIST.md", "Play Console checklist"),
            ("STORE_READY_BASELINE.md", "Baseline store readiness"),
            ("STORE_METADATA.md", "Metadata stores"),
            ("CREDENTIALS_HANDOFF_CHECKLIST.md", "Handoff de credenciales"),
        ]
        for doc, label in release_docs:
            present = file_exists(self.root / doc)
            self.add(
                check_id=f"release.doc.{doc}",
                category=cat,
                severity="LOW",
                status="PASS" if present else "WARN",
                description=f"Documentacion de release: {label}",
                evidence=doc if present else "no encontrado",
                remediation=f"Crear {doc} con el detalle correspondiente.",
            )

        # Build script
        build_script = file_exists(self.root / "build-release.ps1")
        self.add(
            check_id="release.build_script",
            category=cat,
            severity="LOW",
            status="PASS" if build_script else "WARN",
            description="Script de build release presente (build-release.ps1)",
            evidence=("ok" if build_script else "no encontrado"),
            remediation="Mantener build-release.ps1 para automatizacion local.",
        )

        # Artefacto release
        apk_path = self.root / "android" / "app" / "build" / "outputs" / "apk" / "release" / "app-release.apk"
        if apk_path.exists():
            size_mb = round(apk_path.stat().st_size / (1024 * 1024), 2)
            ts = datetime.fromtimestamp(apk_path.stat().st_mtime, tz=timezone.utc).isoformat()
            self.add(
                check_id="release.android.apk_artifact",
                category=cat,
                severity="MEDIUM",
                status="PASS",
                description="Artefacto Android release disponible",
                evidence=f"app-release.apk size={size_mb} MB, mtime={ts}",
                remediation="Generar AAB final para Play Store si va a publicarse.",
            )
        else:
            self.add(
                check_id="release.android.apk_artifact",
                category=cat,
                severity="MEDIUM",
                status="WARN",
                description="No se encontro APK release reciente",
                evidence="android/app/build/outputs/apk/release/app-release.apk no existe",
                remediation="Ejecutar build-release.ps1 para generar APK/AAB.",
            )

    def audit_quality(self) -> None:
        cat = "calidad"

        # Jest config
        jest_config = file_exists(self.root / "jest.config.js")
        self.add(
            check_id="testing.jest_config",
            category=cat,
            severity="LOW",
            status="PASS" if jest_config else "WARN",
            description="Configuracion Jest presente",
            evidence=("ok" if jest_config else "no encontrada"),
            remediation="Agregar jest.config.js para correr tests.",
        )

        # Constitution tests
        constitution = file_exists(self.root / "src" / "contexts" / "__tests__" / "constitution.test.tsx")
        self.add(
            check_id="testing.constitution",
            category=cat,
            severity="LOW",
            status="PASS" if constitution else "WARN",
            description="Suite 'constitution' de tests presente",
            evidence=("ok" if constitution else "no encontrada"),
            remediation="Mantener tests de invariantes en src/contexts/__tests__.",
        )

        # health-check.js previo
        health = file_exists(self.root / "scripts" / "health-check.js")
        self.add(
            check_id="testing.health_check_script",
            category=cat,
            severity="LOW",
            status="PASS" if health else "WARN",
            description="Script de health-check Node presente",
            evidence=("ok" if health else "no encontrado"),
            remediation="Mantener scripts/health-check.js para checks rapidos.",
        )

        # tsconfig.check
        tsc_check = file_exists(self.root / "tsconfig.check.json")
        self.add(
            check_id="testing.tsconfig_check",
            category=cat,
            severity="LOW",
            status="PASS" if tsc_check else "WARN",
            description="tsconfig.check.json para typecheck dedicado",
            evidence=("ok" if tsc_check else "no encontrado"),
            remediation="Crear tsconfig.check.json estricto para `npm run typecheck`.",
        )

        # Ejecucion real de typecheck (opcional)
        if self.run_checks:
            self._run_typecheck()
        else:
            self.add(
                check_id="cmd.typecheck",
                category=cat,
                severity="HIGH",
                status="SKIP",
                description="`npm run typecheck` no fue ejecutado (use --run-checks)",
                evidence="ejecucion deshabilitada",
                remediation="Ejecutar con --run-checks para validar tipos.",
            )

    def _run_typecheck(self) -> None:
        cat = "calidad"
        # Detectar npm
        npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
        code, out, err = run_command([npm_cmd, "run", "typecheck"], cwd=self.root, timeout=600)
        ok = code == 0
        evidence_lines = (out or "").splitlines()[-5:] + (err or "").splitlines()[-5:]
        self.add(
            check_id="cmd.typecheck",
            category=cat,
            severity="HIGH",
            status="PASS" if ok else "FAIL",
            description="`npm run typecheck` (tsc -p tsconfig.check.json --noEmit)",
            evidence=short(" | ".join([l for l in evidence_lines if l.strip()]), limit=400) or f"exit={code}",
            remediation="Resolver errores de TypeScript antes de release.",
        )

    def audit_integrations(self) -> None:
        cat = "integraciones"
        deps = (self.package_json.get("dependencies") or {})

        # Stripe (sdk + secret esperado)
        stripe_ready = "stripe" in deps and "@stripe/stripe-react-native" in deps
        self.add(
            check_id="integrations.stripe",
            category=cat,
            severity="CRITICAL",
            status="PASS" if stripe_ready else "FAIL",
            description="Stripe (RN + Node SDK) integrado en codigo",
            evidence=f"deps: stripe={deps.get('stripe')} stripe-rn={deps.get('@stripe/stripe-react-native')}",
            remediation="Faltan claves productivas: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, EXPO_PUBLIC_STRIPE_KEY (pk_live_).",
        )

        # Resend
        resend_ready = "resend" in deps
        resend_used = bool(read_text(self.root / "convex" / "notifications.ts") or "")
        self.add(
            check_id="integrations.resend",
            category=cat,
            severity="MEDIUM",
            status="PASS" if resend_ready and resend_used else "WARN",
            description="Resend (emails transaccionales) integrado",
            evidence=f"dep={resend_ready} usado_en_convex/notifications={resend_used}",
            remediation="Cargar RESEND_API_KEY en Convex env.",
        )

        # Expo Push
        push_dep = "expo-notifications" in deps
        push_screen = "expo-notifications" in (read_text(self.root / "App.tsx") or "")
        self.add(
            check_id="integrations.expo_push",
            category=cat,
            severity="MEDIUM",
            status="PASS" if push_dep else "WARN",
            description="Expo push notifications integrado",
            evidence=f"dep={push_dep} usado_en_App={push_screen}",
            remediation="Conectar registro de push token con backend Convex.",
        )

        # Maps
        maps_dep = "react-native-maps" in deps or "pigeon-maps" in deps
        maps_key = (((self.app_json.get("expo") or {}).get("android") or {}).get("config") or {}).get("googleMaps", {}).get("apiKey")
        self.add(
            check_id="integrations.maps",
            category=cat,
            severity="MEDIUM",
            status="PASS" if maps_dep and maps_key else "WARN",
            description="Google Maps integrado (deps + key embebida)",
            evidence=f"deps_ok={maps_dep} key_present={bool(maps_key)}",
            remediation="Restringir API key por package+SHA1 en Google Cloud.",
        )

        # Apple / Play (verificar docs)
        apple_doc = file_exists(self.root / "IOS_RELEASE_ENABLEMENT.md")
        play_doc = file_exists(self.root / "PLAY_CONSOLE_RELEASE_CHECKLIST.md")
        self.add(
            check_id="integrations.app_stores",
            category=cat,
            severity="HIGH",
            status="WARN" if apple_doc and play_doc else "FAIL",
            description="Documentacion para Apple/Play presente (credenciales pendientes)",
            evidence=f"apple_doc={apple_doc} play_doc={play_doc}",
            remediation="Crear app records en App Store Connect / Play Console y subir builds.",
        )

        # Zendesk (preparado/deshabilitado)
        zd = (
            "EXPO_PUBLIC_ZENDESK_ENABLED" in self.env_example
            and "ZENDESK_API_TOKEN" in self.env_example
            and "ZENDESK_EMAIL" in self.env_example
            and "ZENDESK_SUBDOMAIN" in self.env_example
        )
        self.add(
            check_id="integrations.zendesk",
            category=cat,
            severity="LOW",
            status="WARN" if zd else "SKIP",
            description="Zendesk preparado en env (modulo deshabilitado)",
            evidence=f"env_documented={zd}",
            remediation="Habilitar modulo soporte cuando se cargue cuenta Zendesk.",
        )

        # Crash/Analytics
        deps_all = {**deps, **(self.package_json.get("devDependencies") or {})}
        crash_present = any(
            d in deps_all for d in [
                "@sentry/react-native", "sentry-expo",
                "@react-native-firebase/crashlytics", "firebase",
                "@amplitude/analytics-react-native", "posthog-react-native",
            ]
        )
        self.add(
            check_id="integrations.crash_analytics",
            category=cat,
            severity="HIGH",
            status="PASS" if crash_present else "FAIL",
            description="SDK de crash reporting / analytics integrado",
            evidence=("alguna lib detectada" if crash_present else "ninguna lib instalada"),
            remediation="Integrar Sentry o Firebase Crashlytics para monitoreo en produccion.",
        )

        # Online checks opcionales
        if self.online_checks:
            convex_url = (
                ((self.eas_json.get("build") or {}).get("production") or {}).get("env", {}).get("EXPO_PUBLIC_CONVEX_URL")
                or os.environ.get("EXPO_PUBLIC_CONVEX_URL")
                or ""
            )
            if convex_url:
                ok, info = http_head(convex_url)
                self.add(
                    check_id="online.convex_reachable",
                    category=cat,
                    severity="HIGH",
                    status="PASS" if ok else "FAIL",
                    description="Convex deployment alcanzable (HEAD/GET)",
                    evidence=f"url={convex_url} -> {info}",
                    remediation="Verificar deployment Convex y conectividad de red.",
                )
            else:
                self.add(
                    check_id="online.convex_reachable",
                    category=cat,
                    severity="HIGH",
                    status="SKIP",
                    description="Convex URL no encontrada para chequeo online",
                    evidence="ni eas.json production ni env la definen",
                    remediation="Definir EXPO_PUBLIC_CONVEX_URL en eas.json/production.",
                )

            stripe_secret = os.environ.get("STRIPE_SECRET_KEY", "")
            if stripe_secret:
                ok, info = http_head("https://api.stripe.com/v1/charges?limit=1")
                self.add(
                    check_id="online.stripe_api",
                    category=cat,
                    severity="MEDIUM",
                    status="PASS" if ok else "WARN",
                    description="Stripe API alcanzable (no autenticado)",
                    evidence=info,
                    remediation="Si falla, revisar conectividad/firewall.",
                )
            else:
                self.add(
                    check_id="online.stripe_api",
                    category=cat,
                    severity="LOW",
                    status="SKIP",
                    description="Sin STRIPE_SECRET_KEY en env, se omite chequeo Stripe",
                    evidence="env vacio",
                    remediation="Cargar STRIPE_SECRET_KEY localmente o en Convex.",
                )
        else:
            self.add(
                check_id="online.checks",
                category=cat,
                severity="LOW",
                status="SKIP",
                description="Chequeos online deshabilitados (use --online-checks)",
                evidence="modo offline",
                remediation="Pasar --online-checks para validar conectividad real.",
            )

    # -- Render del reporte --------------------------------------------------

    def _global_status(self) -> str:
        criticals = [r for r in self.results if r.severity == "CRITICAL" and r.status == "FAIL"]
        highs = [r for r in self.results if r.severity == "HIGH" and r.status == "FAIL"]
        if criticals:
            return "NO_GO"
        if highs:
            return "GO_WITH_RISKS"
        return "GO"

    def _summary_table(self) -> str:
        rows = ["| Dimension | Score | Pasados | Total |", "|---|---:|---:|---:|"]
        for key, cat in self.categories.items():
            passed = sum(1 for r in self.results if r.category == key and r.status == "PASS")
            total = sum(1 for r in self.results if r.category == key)
            rows.append(f"| {cat.name} | {cat.score:.1f} | {passed} | {total} |")
        return "\n".join(rows)

    def _findings_section(self, severity: str) -> str:
        items = [r for r in self.results if r.severity == severity and r.status in {"FAIL", "WARN"}]
        items.sort(key=lambda r: (r.status, r.check_id))
        if not items:
            return f"_Sin hallazgos {severity.lower()}._"
        lines = []
        for r in items:
            lines.append(f"- [{r.status}] **{r.check_id}** ({r.category}) - {r.description}")
            if r.evidence:
                lines.append(f"  - Evidencia: `{r.evidence}`")
            if r.remediation:
                lines.append(f"  - Remediacion: {r.remediation}")
        return "\n".join(lines)

    def _full_results_table(self) -> str:
        rows = ["| ID | Categoria | Sev | Estado | Descripcion |", "|---|---|---|---|---|"]
        for r in sorted(self.results, key=lambda r: (SEVERITY_ORDER.get(r.severity, 99), r.category, r.check_id)):
            rows.append(
                f"| `{r.check_id}` | {r.category} | {r.severity} | {STATUS_EMOJI.get(r.status, r.status)} | {r.description} |"
            )
        return "\n".join(rows)

    def _action_plan(self) -> str:
        plan = []
        plan.append("### Bloqueantes (CRITICAL/FAIL)")
        for r in self.results:
            if r.severity == "CRITICAL" and r.status == "FAIL":
                plan.append(f"- `{r.check_id}` - {r.description}\n    - Accion: {r.remediation}")
        if not any(r.severity == "CRITICAL" and r.status == "FAIL" for r in self.results):
            plan.append("- (ninguno)")

        plan.append("\n### Riesgos altos (HIGH/FAIL)")
        for r in self.results:
            if r.severity == "HIGH" and r.status == "FAIL":
                plan.append(f"- `{r.check_id}` - {r.description}\n    - Accion: {r.remediation}")
        if not any(r.severity == "HIGH" and r.status == "FAIL" for r in self.results):
            plan.append("- (ninguno)")

        plan.append("\n### Quick wins (MEDIUM/WARN)")
        for r in self.results:
            if r.severity in {"MEDIUM"} and r.status == "WARN":
                plan.append(f"- `{r.check_id}` - {r.description}\n    - Accion: {r.remediation}")
        if not any(r.severity == "MEDIUM" and r.status == "WARN" for r in self.results):
            plan.append("- (ninguno)")

        return "\n".join(plan)

    def render_markdown(self) -> str:
        ts = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
        global_status = self._global_status()
        package_name = self.package_json.get("name", "ramgos-mobile")
        version = self.package_json.get("version", "?")

        critical_count = sum(1 for r in self.results if r.severity == "CRITICAL" and r.status == "FAIL")
        high_count = sum(1 for r in self.results if r.severity == "HIGH" and r.status == "FAIL")
        warn_count = sum(1 for r in self.results if r.status == "WARN")
        pass_count = sum(1 for r in self.results if r.status == "PASS")
        total = len(self.results)

        score_global = round(
            sum(c.score for c in self.categories.values()) / max(1, len(self.categories)),
            1,
        )

        md = []
        md.append(f"# Diagnostico Integral - {package_name} v{version}")
        md.append("")
        md.append(f"Fecha: `{ts}`  ")
        md.append(f"Generado por: `scripts/app_integral_audit.py`  ")
        md.append(f"Modo: `run_checks={self.run_checks} online_checks={self.online_checks}`")
        md.append("")
        md.append("## 1) Resumen ejecutivo")
        md.append("")
        md.append(f"- **Estado global: `{global_status}`**")
        md.append(f"- Score global ponderado: **{score_global}/100**")
        md.append(f"- Checks ejecutados: {total} (PASS: {pass_count}, WARN: {warn_count}, CRITICAL/FAIL: {critical_count}, HIGH/FAIL: {high_count})")
        md.append("")
        md.append("Interpretacion:")
        md.append("- `GO`: sin bloqueantes, listo para release con riesgos menores.")
        md.append("- `GO_WITH_RISKS`: sin criticos, con riesgos altos a mitigar antes de produccion.")
        md.append("- `NO_GO`: hay al menos 1 bloqueante critico que impide release.")
        md.append("")

        md.append("## 2) Score por dimension")
        md.append("")
        md.append(self._summary_table())
        md.append("")

        md.append("## 3) Hallazgos por severidad")
        md.append("")
        for sev in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]:
            md.append(f"### {sev}")
            md.append(self._findings_section(sev))
            md.append("")

        md.append("## 4) Plan de accion priorizado")
        md.append("")
        md.append(self._action_plan())
        md.append("")

        md.append("## 5) Matriz de integraciones externas")
        md.append("")
        md.append("| Plataforma | Estado | Detalle |")
        md.append("|---|---|---|")
        rows = [
            ("Stripe (pagos / payouts / KYC)", "Integrado en codigo", "Cargar `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (Convex) y `EXPO_PUBLIC_STRIPE_KEY` (eas.json prod)."),
            ("Resend (emails)", "Integrado en convex/notifications.ts", "Cargar `RESEND_API_KEY` en Convex env."),
            ("Expo / EAS (builds + push)", "Configurado", "Validar credenciales EAS (Android keystore + iOS provisioning)."),
            ("Google Maps", "Integrado, key embebida", "Restringir API key por package + SHA1 en Google Cloud Console."),
            ("Apple Developer (App Store)", "Pendiente credenciales", "Crear app record en App Store Connect, subir build TestFlight."),
            ("Google Play Console", "Pendiente cierre de ficha", "Generar AAB, completar Data Safety, Content Rating, Policy."),
            ("Zendesk (soporte)", "Preparado, deshabilitado", "Activar modulo cuando se carguen credenciales."),
            ("Crash/Analytics", "No implementado", "Instalar Sentry o Firebase Crashlytics."),
        ]
        for name, status, detail in rows:
            md.append(f"| {name} | {status} | {detail} |")
        md.append("")

        md.append("## 6) Detalle completo de checks")
        md.append("")
        md.append(self._full_results_table())
        md.append("")

        md.append("## 7) Notas tecnicas")
        md.append("")
        md.append(textwrap.dedent("""\
            - Esta auditoria es estatica + opcionalmente operativa (typecheck) + opcionalmente online.
            - Los chequeos de credenciales reales (Stripe live, Resend, Apple/Play) requieren intervencion humana
              y se reportan como `WARN/FAIL` cuando no se detectan.
            - El estado global se calcula segun la severidad de los `FAIL`:
              CRITICAL -> NO_GO, HIGH -> GO_WITH_RISKS, sin FAIL -> GO.
        """))

        return "\n".join(md).rstrip() + "\n"

    # -- Run -----------------------------------------------------------------

    def run(self) -> str:
        self.audit_architecture()
        self.audit_finance()
        self.audit_security()
        self.audit_release_readiness()
        self.audit_quality()
        self.audit_integrations()
        return self.render_markdown()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Relevamiento integral de la app Ramgos Mobile.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--root",
        default=".",
        help="Ruta raiz del repo (default: directorio actual).",
    )
    parser.add_argument(
        "--output",
        default="DIAGNOSTICO_APP_ESTADO_ACTUAL.md",
        help="Archivo Markdown de salida (default: DIAGNOSTICO_APP_ESTADO_ACTUAL.md).",
    )
    parser.add_argument(
        "--run-checks",
        action="store_true",
        help="Ejecutar `npm run typecheck` (puede tardar).",
    )
    parser.add_argument(
        "--online-checks",
        action="store_true",
        help="Realizar chequeos online (Convex reachability, Stripe API).",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="No imprimir resumen al stdout, solo escribir el archivo.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = Path(args.root).resolve()
    if not root.exists():
        print(f"[ERROR] Root no existe: {root}", file=sys.stderr)
        return 2

    auditor = Auditor(
        root=root,
        run_checks=args.run_checks,
        online_checks=args.online_checks,
    )
    md = auditor.run()
    out_path = root / args.output
    out_path.write_text(md, encoding="utf-8")

    if not args.quiet:
        print(f"[ok] Diagnostico generado: {out_path}")
        critical = sum(1 for r in auditor.results if r.severity == "CRITICAL" and r.status == "FAIL")
        high = sum(1 for r in auditor.results if r.severity == "HIGH" and r.status == "FAIL")
        warn = sum(1 for r in auditor.results if r.status == "WARN")
        print(
            f"[summary] global={auditor._global_status()} "
            f"checks={len(auditor.results)} CRIT/FAIL={critical} HIGH/FAIL={high} WARN={warn}"
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())

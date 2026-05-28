#!/usr/bin/env python3
"""
Ramgos Mobile - Dev Completeness Audit
=======================================

Escanea todo el proyecto y reporta qué falta en cada módulo para llegar
al 100% de desarrollo. Complementa app_integral_audit.py (que audita
credenciales/seguridad/build); este script detecta exclusivamente gaps
de código: stubs, no-ops, mocks activos, TODOs y features pendientes.

Uso:
    python scripts/dev_completeness_audit.py
    python scripts/dev_completeness_audit.py --root . --output DEV_COMPLETENESS.md
    python scripts/dev_completeness_audit.py --verbose

Sin dependencias externas (solo stdlib).
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# Modelo de datos
# ---------------------------------------------------------------------------

SEV_ORDER = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}

STATUS_EMOJI = {"GO": "GO", "WARN": "WARN", "FAIL": "FAIL"}


@dataclass
class Finding:
    module_id: str
    severity: str       # HIGH | MEDIUM | LOW
    file: str           # relative path
    line: int
    label: str          # short human description
    snippet: str        # the matching source line (stripped)
    action: str = ""    # suggested fix


@dataclass
class CheckResult:
    module_id: str
    passed: bool
    severity: str
    label: str
    detail: str = ""
    action: str = ""


@dataclass
class ModuleResult:
    module_id: str
    label: str
    findings: List[Finding] = field(default_factory=list)
    check_results: List[CheckResult] = field(default_factory=list)

    @property
    def unique_findings(self) -> List["Finding"]:
        """Deduplicate findings by (label) within this module — same gap in N lines counts once."""
        seen: Dict[str, "Finding"] = {}
        for f in self.findings:
            key = f.label
            if key not in seen:
                seen[key] = f
        return list(seen.values())

    @property
    def gap_count(self) -> int:
        fails = sum(1 for c in self.check_results if not c.passed)
        return len(self.unique_findings) + fails

    @property
    def score(self) -> int:
        if not self.check_results and not self.findings:
            return 100
        # Penalty per UNIQUE gap type (weight by severity)
        sev_weight = {"HIGH": 10, "MEDIUM": 5, "LOW": 2}
        total_penalty = sum(sev_weight.get(f.severity, 5) for f in self.unique_findings)
        total_penalty += sum(
            sev_weight.get(c.severity, 5) for c in self.check_results if not c.passed
        )
        # Cap penalty to avoid negative scores
        return max(0, 100 - total_penalty)

    @property
    def status(self) -> str:
        s = self.score
        if s >= 90:
            return "GO"
        if s >= 70:
            return "WARN"
        return "FAIL"


# ---------------------------------------------------------------------------
# STUB_PATTERNS — Capa 1: patrones globales de código incompleto
# Each entry: (regex_pattern, severity, label, action, module_hint)
# module_hint: "" means assign to module by file path heuristic
# ---------------------------------------------------------------------------

STUB_PATTERNS: List[Tuple[str, str, str, str, str]] = [
    # Próximamente / coming soon placeholders in UI
    (
        r"pr[oó]ximamente",
        "HIGH",
        "Texto 'próximamente' — feature no implementada",
        "Implementar la feature o remover el placeholder.",
        "",
    ),
    # TODO / FIXME in source (not in test files)
    (
        r"//\s*(TODO|FIXME)\b",
        "HIGH",
        "Comentario TODO/FIXME en código",
        "Resolver el TODO o abrir un ticket y remover el comentario.",
        "",
    ),
    # console.warn stubs — not persisted / not implemented
    (
        r"console\.warn\(.*not persisted",
        "HIGH",
        "Función stub — no persiste datos en Convex",
        "Implementar la mutación/tabla Convex correspondiente.",
        "",
    ),
    (
        r"console\.warn\(.*not implemented",
        "HIGH",
        "Función no implementada (console.warn stub)",
        "Implementar la lógica o marcar como fuera de scope.",
        "",
    ),
    # console.warn('[x] groups not persisted')
    (
        r"console\.warn\(.*groups not persisted",
        "HIGH",
        "Grupos de comunidad no persistidos",
        "Implementar tabla socialGroups en Convex + mutaciones join/leave.",
        "social",
    ),
    # console.warn('[x] highlights not persisted')
    (
        r"console\.warn\(.*highlights not persisted",
        "HIGH",
        "Story highlights no persistidos",
        "Implementar tabla socialHighlights en Convex.",
        "social",
    ),
    # Retweet no-op
    (
        r"retweet.*no-op|no-op.*retweet",
        "MEDIUM",
        "retweetPost es no-op — no hay tabla de reposts",
        "Implementar socialReposts en Convex si el producto lo requiere.",
        "social",
    ),
    # savedPosts solo en memoria
    (
        r"savedPosts.*not persisted|not persisted.*savedPosts|saved.*v1\.1",
        "MEDIUM",
        "savedPosts solo en memoria (no persiste entre sesiones)",
        "Implementar tabla socialSavedPosts en Convex.",
        "social",
    ),
    # Fallback a api.users.syncUser — módulo Convex no en API generado
    (
        r"\|\|\s*api\.users\.syncUser",
        "MEDIUM",
        "Acción usa api.users.syncUser como fallback — módulo Convex posiblemente no generado",
        "Ejecutar 'npx convex codegen' y verificar que el módulo aparece en convex/_generated/api.d.ts.",
        "",  # use path heuristic for module assignment
    ),
    # Mock backend call (en servicios de producción)
    (
        r"//\s*Mock backend call",
        "HIGH",
        "Mock backend call activo en código de producción",
        "Reemplazar con llamada real a Convex o API externa.",
        "",
    ),
    # setTimeout como simulación de backend
    (
        r"setTimeout\(.*resolve\(",
        "MEDIUM",
        "setTimeout simulando respuesta de backend",
        "Reemplazar con llamada real asíncrona.",
        "",
    ),
    # not part of v1 / not in v1
    (
        r"not (part of|in) v1",
        "LOW",
        "Feature explícitamente diferida a v2",
        "Evaluar si incluir en el scope actual o documentar como backlog.",
        "",
    ),
    # deprecated via context
    (
        r"via context is deprecated",
        "LOW",
        "Función marcada como deprecated en contexto",
        "Actualizar los consumidores para usar la API directa de Convex.",
        "",
    ),
    # suggestedUsers vacío sin backend
    (
        r"suggestedUsers:\s*\[\]",
        "MEDIUM",
        "suggestedUsers hardcodeado como [] sin backend",
        "Implementar query api.social.getSuggestedUsers en Convex.",
        "social",
    ),
    # EMPTY_ constantes como datos de producción
    (
        r"EMPTY_(INSTAGRAM|HIGHLIGHTS|GROUPS|TRENDING|SAVED)\b",
        "MEDIUM",
        "Constante EMPTY_* usada como datos — feature sin implementar",
        "Conectar a la query Convex correspondiente.",
        "social",
    ),
    # Mock con resolve/reject en producción (patrón Promise manual)
    (
        r"new Promise\(\s*\(resolve\)\s*=>\s*\{.*setTimeout",
        "MEDIUM",
        "Promise manual con setTimeout simulando backend",
        "Reemplazar con llamada real.",
        "",
    ),
]

# ---------------------------------------------------------------------------
# MODULE_DEFINITIONS — Capa 2: checks declarativos por módulo
# Each module: id, label, required_files, required_patterns, forbidden_patterns
# required_patterns: list of (file_relative, regex, description, action)
# forbidden_patterns: patterns that must NOT appear (indicate gap)
# file_scan_globs: globs relative to root to include in pattern scan
# ---------------------------------------------------------------------------

MODULE_DEFINITIONS: Dict[str, dict] = {
    "auth": {
        "label": "Auth / KYC",
        "file_scan_globs": [
            "convex/users.ts",
            "convex/identity.ts",
            "src/screens/KYCScreen.tsx",
            "src/screens/LoginScreen.tsx",
            "src/screens/RegisterScreen.tsx",
            "src/contexts/AuthContext.tsx",
        ],
        "required_files": [
            ("convex/users.ts", "Backend de usuarios"),
            ("convex/identity.ts", "Backend KYC / Stripe Identity"),
            ("src/screens/KYCScreen.tsx", "Pantalla KYC"),
            ("src/screens/ChangePasswordScreen.tsx", "Pantalla cambio de contraseña"),
        ],
        "required_patterns": [
            ("convex/users.ts", r"changePassword", "Mutación changePassword en users.ts",
             "Agregar mutación changePassword en convex/users.ts."),
            ("convex/identity.ts", r"startKyc|createVerificationSession", "Función KYC en identity.ts",
             "Implementar startKyc en convex/identity.ts."),
            ("src/contexts/AuthContext.tsx", r"useQuery|useMutation|convex", "AuthContext conectado a Convex",
             "Conectar AuthContext al backend Convex."),
        ],
        "forbidden_patterns": [],
    },
    "social": {
        "label": "Social (posts, stories, DMs, follows, grupos, highlights)",
        "file_scan_globs": [
            "convex/social.ts",
            "convex/social/_helpers.ts",
            "src/contexts/SocialContext.tsx",
            "src/screens/SocialScreen.tsx",
            "src/components/social/*.tsx",
        ],
        "required_files": [
            ("convex/social.ts", "Backend social en Convex"),
            ("src/contexts/SocialContext.tsx", "Contexto social"),
            ("src/screens/SocialScreen.tsx", "Pantalla social principal"),
        ],
        "required_patterns": [
            ("convex/social.ts", r"createPost", "Mutación createPost en Convex",
             "Implementar createPost en convex/social.ts."),
            ("convex/social.ts", r"followUser", "Mutación followUser en Convex",
             "Implementar followUser en convex/social.ts."),
            ("convex/social.ts", r"sendMessage", "Mutación sendMessage (DMs) en Convex",
             "Implementar sendMessage en convex/social.ts."),
            ("src/contexts/SocialContext.tsx", r"useMutation|useQuery", "SocialContext usa hooks de Convex",
             "Reemplazar AsyncStorage/local state con useQuery/useMutation de Convex."),
        ],
        "forbidden_patterns": [
            ("src/contexts/SocialContext.tsx", r"INITIAL_POSTS|MOCK_USERS|MOCK_CHATS",
             "Mock data hardcodeado en SocialContext",
             "Eliminar INITIAL_POSTS / MOCK_USERS y conectar al backend Convex.",
             "HIGH"),
        ],
    },
    "marketplace": {
        "label": "Marketplace / Listings",
        "file_scan_globs": [
            "convex/listings.ts",
            "convex/bonos.ts",
            "convex/events.ts",
            "src/screens/CreateListingScreen.tsx",
            "src/screens/MarketplaceScreen.tsx",
            "src/screens/marketplace/AddEditProductScreen.tsx",
            "src/screens/marketplace/ProductDetailScreen.tsx",
        ],
        "required_files": [
            ("convex/listings.ts", "Backend de listings"),
            ("convex/bonos.ts", "Backend de bonos"),
            ("convex/events.ts", "Backend de eventos"),
            ("src/screens/CreateListingScreen.tsx", "Pantalla crear listing"),
            ("src/screens/marketplace/AddEditProductScreen.tsx", "Pantalla editar producto"),
        ],
        "required_patterns": [
            ("convex/listings.ts", r"createListing", "Mutación createListing",
             "Implementar createListing en convex/listings.ts."),
            ("src/screens/marketplace/AddEditProductScreen.tsx", r"expo-image-picker|ImagePicker",
             "Image picker real en AddEditProductScreen",
             "Reemplazar mock de imagen con expo-image-picker real."),
        ],
        "forbidden_patterns": [],
    },
    "orders": {
        "label": "Orders / Escrow / Disputas",
        "file_scan_globs": [
            "convex/orders.ts",
            "convex/disputes.ts",
            "convex/cart.ts",
            "src/screens/marketplace/OrderDetailScreen.tsx",
            "src/screens/marketplace/DisputeScreen.tsx",
            "src/screens/marketplace/DisputeChatScreen.tsx",
        ],
        "required_files": [
            ("convex/orders.ts", "Backend de órdenes"),
            ("convex/disputes.ts", "Backend de disputas"),
            ("convex/cart.ts", "Backend de carrito"),
            ("src/screens/marketplace/DisputeChatScreen.tsx", "Pantalla chat de disputa"),
        ],
        "required_patterns": [
            ("convex/orders.ts", r"createOrder", "Mutación createOrder",
             "Implementar createOrder en convex/orders.ts."),
            ("convex/disputes.ts", r"createDispute", "Mutación createDispute",
             "Implementar createDispute en convex/disputes.ts."),
            ("convex/orders.ts", r"notifyUser|sendPushNotification", "Push notification en cambio de orden",
             "Conectar cambios de estado de orden a notifyUser."),
        ],
        "forbidden_patterns": [],
    },
    "payments": {
        "label": "Pagos / Stripe / Escrow financiero",
        "file_scan_globs": [
            "convex/stripe.ts",
            "convex/http.ts",
            "convex/finance.ts",
            "convex/reconciliation.ts",
            "src/screens/PaymentScreen.tsx",
            "src/screens/marketplace/CheckoutScreen.tsx",
        ],
        "required_files": [
            ("convex/stripe.ts", "Backend Stripe"),
            ("convex/http.ts", "HTTP handlers (webhooks)"),
            ("convex/finance.ts", "Backend finanzas / payouts"),
            ("convex/reconciliation.ts", "Reconciliación financiera"),
        ],
        "required_patterns": [
            ("convex/stripe.ts", r"createPaymentIntent", "Acción createPaymentIntent",
             "Implementar createPaymentIntent en convex/stripe.ts."),
            ("convex/http.ts", r"stripe-webhook", "Webhook Stripe registrado en http.ts",
             "Registrar handler /stripe-webhook en convex/http.ts."),
            ("convex/http.ts", r"apple-iap-webhook", "Webhook Apple IAP registrado",
             "Registrar handler /apple-iap-webhook en convex/http.ts."),
            ("convex/http.ts", r"google-iap-webhook", "Webhook Google IAP registrado",
             "Registrar handler /google-iap-webhook en convex/http.ts."),
        ],
        "forbidden_patterns": [
            ("convex/stripe.ts", r"ALLOW_STRIPE_MOCK\s*=\s*['\"]?true|createPaymentIntent.*return.*mock",
             "Mock de Stripe hardcodeado como true (sin lectura de env variable)",
             "Asegurar que ALLOW_STRIPE_MOCK se lea de Convex env, no hardcodeado.",
             "HIGH"),
        ],
    },
    "iap": {
        "label": "IAP — In-App Purchases (Apple + Google)",
        "file_scan_globs": [
            "convex/iap.ts",
            "convex/iapActions.ts",
            "src/services/iap/iapService.ts",
            "src/screens/SubscriptionPlansScreen.tsx",
        ],
        "required_files": [
            ("convex/iap.ts", "Backend IAP (receipts DB)"),
            ("convex/iapActions.ts", "Acciones IAP (Node runtime)"),
            ("src/services/iap/iapService.ts", "Servicio IAP frontend"),
            ("src/screens/SubscriptionPlansScreen.tsx", "Pantalla planes de suscripción"),
        ],
        "required_patterns": [
            ("convex/iapActions.ts", r"validateAppleReceipt", "Validación receipt Apple",
             "Implementar validateAppleReceipt en convex/iapActions.ts."),
            ("convex/iapActions.ts", r"validateGoogleReceipt", "Validación receipt Google",
             "Implementar validateGoogleReceipt en convex/iapActions.ts."),
            ("convex/iapActions.ts", r"verifyAppleJws|APPLE_ROOT_CA", "Verificación JWS Apple (Root CA pinning)",
             "Implementar verifyAppleJws con pin al Apple Root CA G3."),
            ("convex/iapActions.ts", r"google-auth-library|JWT|fetchGoogleSubscription", "Validación Google Play via API",
             "Implementar fetchGoogleSubscription con google-auth-library."),
            ("src/services/iap/iapService.ts", r"initIapConnection|requestSubscription", "Wrapper IAP frontend",
             "Implementar initIapConnection y requestSubscription en iapService.ts."),
        ],
        "forbidden_patterns": [],
    },
    "notifications": {
        "label": "Push Notifications (backend-triggered)",
        "file_scan_globs": [
            "convex/notifications.ts",
            "src/contexts/NotificationsContext.tsx",
            "src/screens/NotificationsScreen.tsx",
        ],
        "required_files": [
            ("convex/notifications.ts", "Backend de notificaciones"),
            ("src/screens/NotificationsScreen.tsx", "Pantalla notificaciones"),
        ],
        "required_patterns": [
            ("convex/notifications.ts", r"sendPushNotification|notifyUser", "Función notifyUser en Convex",
             "Implementar notifyUser en convex/notifications.ts."),
            ("convex/notifications.ts", r"pushDeliveries|pushTokens", "Tabla de tokens push en schema",
             "Agregar pushDeliveries/pushTokens al schema de Convex."),
            ("convex/orders.ts", r"notifyUser|sendPushNotification", "Push en cambios de orden",
             "Llamar a notifyUser desde convex/orders.ts en cambios de estado."),
            ("convex/disputes.ts", r"notifyUser|sendPushNotification", "Push en disputas",
             "Llamar a notifyUser desde convex/disputes.ts."),
        ],
        "forbidden_patterns": [],
    },
    "wallet": {
        "label": "Wallet / Puntos / Rewards",
        "file_scan_globs": [
            "convex/economy.ts",
            "convex/finance.ts",
            "src/contexts/WalletContext.tsx",
            "src/contexts/PointsContext.tsx",
            "src/contexts/RewardsContext.tsx",
            "src/screens/finance/WalletScreen.tsx",
        ],
        "required_files": [
            ("convex/economy.ts", "Backend economía (puntos/rewards)"),
            ("convex/finance.ts", "Backend finanzas (wallet/withdrawals)"),
            ("src/screens/finance/WalletScreen.tsx", "Pantalla wallet"),
        ],
        "required_patterns": [
            ("convex/economy.ts", r"addPoints|claimKey|eventKey", "Idempotencia en economía de puntos",
             "Implementar claimKey/eventKey en convex/economy.ts."),
            ("convex/finance.ts", r"requestWithdrawal|walletAccounts", "Wallet y retiros en finance.ts",
             "Implementar requestWithdrawal y walletAccounts en convex/finance.ts."),
            ("src/contexts/WalletContext.tsx", r"useQuery|useMutation", "WalletContext conectado a Convex",
             "Conectar WalletContext a Convex con useQuery/useMutation."),
        ],
        "forbidden_patterns": [],
    },
    "influencer": {
        "label": "Influencer / Campaigns",
        "file_scan_globs": [
            "convex/campaigns.ts",
            "convex/connect.ts",
            "src/screens/InfluencerDashboardScreen.tsx",
            "src/screens/marketing/CampaignManagerScreen.tsx",
        ],
        "required_files": [
            ("convex/campaigns.ts", "Backend de campañas"),
            ("src/screens/InfluencerDashboardScreen.tsx", "Dashboard influencer"),
            ("src/screens/marketing/CampaignManagerScreen.tsx", "Gestión de campañas"),
        ],
        "required_patterns": [
            ("convex/campaigns.ts", r"createCampaign|proposeCampaign", "Mutación crear campaña",
             "Implementar createCampaign en convex/campaigns.ts."),
            ("convex/campaigns.ts", r"attribution|influencerRate", "Atribución de ventas a influencer",
             "Implementar lógica de atribución en convex/campaigns.ts."),
        ],
        "forbidden_patterns": [],
    },
    "settings": {
        "label": "Settings / Perfil de usuario",
        "file_scan_globs": [
            "src/screens/SettingsScreen.tsx",
            "src/screens/ChangePasswordScreen.tsx",
            "src/screens/PaymentMethodsScreen.tsx",
            "src/screens/ProfileScreen.tsx",
        ],
        "required_files": [
            ("src/screens/SettingsScreen.tsx", "Pantalla configuración"),
            ("src/screens/ChangePasswordScreen.tsx", "Pantalla cambio de contraseña"),
            ("src/screens/PaymentMethodsScreen.tsx", "Pantalla métodos de pago"),
        ],
        "required_patterns": [
            ("src/screens/ChangePasswordScreen.tsx", r"changePassword|currentPassword", "Formulario cambio de contraseña",
             "Implementar formulario de cambio de contraseña."),
            ("src/screens/PaymentMethodsScreen.tsx", r"listPaymentMethods|detachPaymentMethod", "Gestión de tarjetas Stripe",
             "Implementar listPaymentMethods y detachPaymentMethod."),
        ],
        "forbidden_patterns": [],
    },
    "help": {
        "label": "Help Center / Soporte",
        "file_scan_globs": [
            "src/screens/HelpCenterScreen.tsx",
            "src/screens/HelpArticleDetailScreen.tsx",
            "src/screens/SupportScreen.tsx",
            "src/data/helpArticles.ts",
        ],
        "required_files": [
            ("src/screens/HelpCenterScreen.tsx", "Pantalla help center"),
            ("src/screens/HelpArticleDetailScreen.tsx", "Pantalla artículo de ayuda"),
            ("src/data/helpArticles.ts", "Corpus de artículos de ayuda"),
            ("src/screens/SupportScreen.tsx", "Pantalla soporte"),
        ],
        "required_patterns": [
            ("src/data/helpArticles.ts", r"getArticleById|searchArticles", "Funciones de búsqueda en helpArticles",
             "Implementar getArticleById y searchArticles en helpArticles.ts."),
            ("src/screens/SupportScreen.tsx", r"Linking\.openURL|wa\.me|whatsapp", "Live chat (WhatsApp/email)",
             "Conectar chat en vivo a WhatsApp o email via Linking.openURL."),
        ],
        "forbidden_patterns": [],
    },
    "admin": {
        "label": "Admin Dashboard",
        "file_scan_globs": [
            "src/screens/AdminDashboardScreen.tsx",
            "src/screens/admin/AdminFinanceScreen.tsx",
            "convex/developer.ts",
        ],
        "required_files": [
            ("src/screens/AdminDashboardScreen.tsx", "Dashboard admin"),
            ("src/screens/admin/AdminFinanceScreen.tsx", "Dashboard finanzas admin"),
            ("convex/developer.ts", "Backend funciones admin/developer"),
        ],
        "required_patterns": [
            ("convex/developer.ts", r"assertAdminOrDeveloper", "Control de acceso admin",
             "Asegurar assertAdminOrDeveloper en todas las funciones de developer.ts."),
        ],
        "forbidden_patterns": [],
    },
    "games": {
        "label": "Games / MiMascota / Raffles",
        "file_scan_globs": [
            "src/screens/GamesScreen.tsx",
            "src/screens/MiMascotaScreen.tsx",
            "src/services/raffles/RaffleServiceMock.ts",
            "src/components/games/*.ts",
            "src/components/games/*.tsx",
        ],
        "required_files": [
            ("src/screens/GamesScreen.tsx", "Pantalla juegos"),
            ("src/screens/MiMascotaScreen.tsx", "Pantalla mi mascota"),
        ],
        "required_patterns": [],
        "forbidden_patterns": [
            ("src/services/raffles/RaffleServiceMock.ts", r"Mock backend call|setTimeout.*resolve",
             "RaffleServiceMock usa backend simulado con setTimeout",
             "Reemplazar RaffleServiceMock con llamada real a Convex (convex/economy.ts).",
             "MEDIUM"),
        ],
    },
}

# ---------------------------------------------------------------------------
# Files to scan globally (all TS/TSX files under these dirs)
# ---------------------------------------------------------------------------

SCAN_DIRS = ["src", "convex"]
SCAN_EXTENSIONS = {".ts", ".tsx"}
EXCLUDE_DIRS = {"node_modules", ".git", ".expo", "__tests__", "_generated", "dist", "build"}
# Test files are excluded from stub pattern scanning
EXCLUDE_GLOBS = {".test.tsx", ".test.ts", ".spec.ts", ".spec.tsx"}


# ---------------------------------------------------------------------------
# Path → module heuristic
# ---------------------------------------------------------------------------

def infer_module(rel_path: str) -> str:
    """Heuristically assign a file to a module by its path."""
    p = rel_path.replace("\\", "/").lower()
    if "social" in p:
        return "social"
    if "iap" in p or "subscription" in p:
        return "iap"
    if "notification" in p:
        return "notifications"
    if "dispute" in p or "escrow" in p:
        return "orders"
    if "order" in p or "cart" in p or "checkout" in p:
        return "orders"
    if "stripe" in p or "payment" in p or "finance" in p or "reconcili" in p:
        return "payments"
    if "wallet" in p or "points" in p or "reward" in p or "economy" in p:
        return "wallet"
    if "campaign" in p or "influencer" in p or "marketing" in p:
        return "influencer"
    if "setting" in p or "password" in p or "profile" in p:
        return "settings"
    if "help" in p or "support" in p or "article" in p:
        return "help"
    if "admin" in p or "developer" in p:
        return "admin"
    if "game" in p or "mascota" in p or "raffle" in p or "roulette" in p:
        return "games"
    if "kyc" in p or "identity" in p or "auth" in p or "login" in p or "register" in p:
        return "auth"
    if "listing" in p or "product" in p or "marketplace" in p or "bono" in p or "event" in p:
        return "marketplace"
    return "general"


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def read_text(path: Path) -> Optional[str]:
    try:
        if not path.exists() or not path.is_file():
            return None
        return path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return None


def iter_source_files(root: Path):
    """Yield (path, relative_path_str) for all source files to scan."""
    for scan_dir in SCAN_DIRS:
        base = root / scan_dir
        if not base.exists():
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            # Prune excluded dirs
            dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
            for fname in filenames:
                ext = Path(fname).suffix
                if ext not in SCAN_EXTENSIONS:
                    continue
                # Skip test files
                if any(fname.endswith(eg) for eg in EXCLUDE_GLOBS):
                    continue
                full = Path(dirpath) / fname
                rel = str(full.relative_to(root)).replace("\\", "/")
                yield full, rel


def expand_glob(root: Path, pattern: str) -> List[Path]:
    """Expand a simple glob pattern (supports * in filename, not recursive **)."""
    p = Path(pattern)
    parent = root / p.parent
    fname_pattern = p.name
    if not parent.exists():
        return []
    results = []
    for f in parent.iterdir():
        if f.is_file() and _match_simple(f.name, fname_pattern):
            results.append(f)
    return results


def _match_simple(name: str, pattern: str) -> bool:
    """Match filename against simple glob (only * wildcard)."""
    import fnmatch
    return fnmatch.fnmatch(name, pattern)


def short_snippet(line: str, max_len: int = 120) -> str:
    s = line.strip()
    if len(s) > max_len:
        return s[:max_len] + "…"
    return s


# ---------------------------------------------------------------------------
# Scanner — Capa 1
# ---------------------------------------------------------------------------

class Scanner:
    """Scans all source files for STUB_PATTERNS and returns Findings."""

    def __init__(self, root: Path, verbose: bool = False):
        self.root = root
        self.verbose = verbose

    def scan(self) -> List[Finding]:
        findings: List[Finding] = []
        compiled = [
            (re.compile(pat, re.IGNORECASE), sev, label, action, mod_hint)
            for pat, sev, label, action, mod_hint in STUB_PATTERNS
        ]

        for full_path, rel in iter_source_files(self.root):
            content = read_text(full_path)
            if content is None:
                continue
            lines = content.splitlines()
            for lineno, line in enumerate(lines, start=1):
                for regex, sev, label, action, mod_hint in compiled:
                    if regex.search(line):
                        module_id = mod_hint if mod_hint else infer_module(rel)
                        findings.append(Finding(
                            module_id=module_id,
                            severity=sev,
                            file=rel,
                            line=lineno,
                            label=label,
                            snippet=short_snippet(line),
                            action=action,
                        ))
                        # Only report first matching pattern per line
                        break

        if self.verbose:
            print(f"  [Scanner] {len(findings)} findings across all source files", file=sys.stderr)
        return findings


# ---------------------------------------------------------------------------
# ModuleAuditor — Capa 2
# ---------------------------------------------------------------------------

class ModuleAuditor:
    """Runs declarative checks per module and detects navigation gaps."""

    def __init__(self, root: Path, verbose: bool = False):
        self.root = root
        self.verbose = verbose

    def audit_module(self, module_id: str, mdef: dict) -> List[CheckResult]:
        results: List[CheckResult] = []

        # 1. Required files
        for rel_file, description in mdef.get("required_files", []):
            path = self.root / rel_file
            exists = path.exists() and path.is_file()
            results.append(CheckResult(
                module_id=module_id,
                passed=exists,
                severity="HIGH",
                label=f"Archivo requerido: {rel_file}",
                detail=f"{description} — {'presente' if exists else 'FALTA'}",
                action=f"Crear {rel_file}." if not exists else "",
            ))

        # 2. Required patterns (must be present)
        for rel_file, pattern, description, action in mdef.get("required_patterns", []):
            path = self.root / rel_file
            content = read_text(path) or ""
            found = bool(re.search(pattern, content))
            results.append(CheckResult(
                module_id=module_id,
                passed=found,
                severity="HIGH" if not found else "HIGH",
                label=description,
                detail=f"Buscando `{pattern}` en {rel_file} — {'encontrado' if found else 'NO ENCONTRADO'}",
                action=action if not found else "",
            ))

        # 3. Forbidden patterns (must NOT be present)
        for rel_file, pattern, description, action, severity in mdef.get("forbidden_patterns", []):
            path = self.root / rel_file
            content = read_text(path) or ""
            found = bool(re.search(pattern, content, re.IGNORECASE))
            results.append(CheckResult(
                module_id=module_id,
                passed=not found,  # pass = pattern is absent (good)
                severity=severity,
                label=description,
                detail=f"Patrón `{pattern}` {'ENCONTRADO (no debería estar)' if found else 'ausente (OK)'}  en {rel_file}",
                action=action if found else "",
            ))

        return results

    def audit_navigation(self) -> List[CheckResult]:
        """Detect screens imported in App.tsx but not registered as Stack.Screen."""
        results: List[CheckResult] = []
        app_path = self.root / "App.tsx"
        content = read_text(app_path)
        if not content:
            return results

        # Find all imports of screen components
        import_re = re.compile(
            r"import\s+(\w+)\s+from\s+['\"]\./(src/screens/[^'\"]+)['\"]"
        )
        # Find all registered Stack.Screen names (by component= attribute)
        screen_re = re.compile(r"component=\{(\w+)\}")

        imported: Dict[str, str] = {}  # component_name → file_path
        for m in import_re.finditer(content):
            imported[m.group(1)] = m.group(2)

        registered_components = set(screen_re.findall(content))

        for comp_name, file_path in imported.items():
            if comp_name not in registered_components:
                results.append(CheckResult(
                    module_id=infer_module(file_path),
                    passed=False,
                    severity="MEDIUM",
                    label=f"Pantalla importada sin Stack.Screen: {comp_name}",
                    detail=f"{comp_name} ({file_path}) está importada en App.tsx pero no tiene <Stack.Screen>.",
                    action=f"Agregar <Stack.Screen name=\"...\" component={{{comp_name}}} /> en App.tsx.",
                ))

        if self.verbose:
            print(f"  [NavAudit] {len(imported)} screens imported, "
                  f"{len(registered_components)} registered, "
                  f"{len(results)} unregistered", file=sys.stderr)
        return results


# ---------------------------------------------------------------------------
# Reporter — aggregation and Markdown rendering
# ---------------------------------------------------------------------------

class Reporter:
    def __init__(self, module_results: Dict[str, ModuleResult], root: Path):
        self.module_results = module_results
        self.root = root

    def _global_score(self) -> float:
        scores = [mr.score for mr in self.module_results.values()]
        if not scores:
            return 0.0
        return round(sum(scores) / len(scores), 1)

    def _total_gaps(self) -> int:
        return sum(mr.gap_count for mr in self.module_results.values())

    def render(self) -> str:
        now = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        lines: List[str] = []

        lines.append("# Dev Completeness Audit — Ramgos Mobile")
        lines.append(f"\nFecha: `{now}`  ")
        lines.append(f"Generado por: `scripts/dev_completeness_audit.py`\n")

        global_score = self._global_score()
        total_gaps = self._total_gaps()
        global_status = "GO" if global_score >= 90 else ("WARN" if global_score >= 70 else "FAIL")
        lines.append("## 1) Resumen ejecutivo\n")
        lines.append(f"- **Score global: `{global_score}%`** — Estado: `{global_status}`")
        lines.append(f"- Total gaps detectados: **{total_gaps}**")
        lines.append(f"- Módulos auditados: {len(self.module_results)}\n")

        # Summary table
        lines.append("## 2) Score por módulo\n")
        lines.append("| Módulo | Score | Gaps | Estado |")
        lines.append("|---|---:|---:|---|")
        for mrid, mr in sorted(
            self.module_results.items(),
            key=lambda x: x[1].score,
        ):
            lines.append(f"| {mr.label} | {mr.score}% | {mr.gap_count} | {mr.status} |")

        # Module detail
        lines.append("\n## 3) Detalle por módulo\n")
        for mrid, mr in self.module_results.items():
            lines.append(f"---\n")
            lines.append(f"### {mr.label} — {mr.score}% ({mr.gap_count} gaps)\n")

            # Failed checks first
            failed_checks = [c for c in mr.check_results if not c.passed]
            if failed_checks:
                lines.append("#### Checks fallidos\n")
                for c in failed_checks:
                    lines.append(f"**[{c.severity}]** {c.label}")
                    if c.detail:
                        lines.append(f"- Detalle: {c.detail}")
                    if c.action:
                        lines.append(f"- Accion: {c.action}")
                    lines.append("")

            # Pattern findings (deduplicated)
            unique = mr.unique_findings
            if unique:
                lines.append("#### Gaps detectados por escaneo de código\n")
                # Build occurrence count map
                label_count: Dict[str, int] = {}
                for f in mr.findings:
                    label_count[f.label] = label_count.get(f.label, 0) + 1
                # Sort by severity then file
                sorted_f = sorted(
                    unique,
                    key=lambda f: (SEV_ORDER.get(f.severity, 9), f.file, f.line),
                )
                for f in sorted_f:
                    count = label_count.get(f.label, 1)
                    count_suffix = f" ×{count}" if count > 1 else ""
                    lines.append(
                        f"**[{f.severity}]** `{f.file}:{f.line}`{count_suffix} — {f.label}"
                    )
                    lines.append(f"```\n{f.snippet}\n```")
                    if f.action:
                        lines.append(f"- Accion: {f.action}")
                    lines.append("")

            if not failed_checks and not mr.findings:
                lines.append("_Sin gaps detectados en este modulo._\n")

        # Quick wins summary
        lines.append("---\n")
        lines.append("## 4) Quick wins (gaps LOW/MEDIUM de codigo)\n")
        all_findings: List[Finding] = []
        for mr in self.module_results.values():
            all_findings.extend(mr.unique_findings)
        medium_low = [f for f in all_findings if f.severity in ("MEDIUM", "LOW")]
        if medium_low:
            lines.append("| Severidad | Módulo | Archivo | Gap |")
            lines.append("|---|---|---|---|")
            for f in sorted(medium_low, key=lambda x: (SEV_ORDER.get(x.severity, 9), x.file)):
                mod_label = self.module_results.get(f.module_id, ModuleResult("", f.module_id)).label or f.module_id
                lines.append(f"| {f.severity} | {mod_label} | `{f.file}:{f.line}` | {f.label} |")
        else:
            lines.append("_No quedan quick wins pendientes._\n")

        lines.append("\n---")
        lines.append("## 5) Notas tecnicas\n")
        lines.append("- Este audit es puramente estatico (sin ejecutar codigo).")
        lines.append("- Complementa `scripts/app_integral_audit.py` (credenciales/seguridad/build).")
        lines.append("- Scores se calculan con penalizacion por severidad: HIGH=-10pts, MEDIUM=-5pts, LOW=-2pts.")
        lines.append("- Re-ejecutar despues de implementar cada gap para confirmar que baja a 0.")

        return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Ramgos Mobile — Dev Completeness Audit"
    )
    parser.add_argument(
        "--root", default=".", help="Raiz del proyecto (default: .)"
    )
    parser.add_argument(
        "--output",
        default="DEV_COMPLETENESS.md",
        help="Archivo de salida Markdown (default: DEV_COMPLETENESS.md)",
    )
    parser.add_argument(
        "--verbose", action="store_true", help="Mostrar progreso en stderr"
    )
    args = parser.parse_args()

    root = Path(args.root).resolve()
    if not root.exists():
        print(f"ERROR: root no existe: {root}", file=sys.stderr)
        return 1

    print(f"Dev Completeness Audit — {root}", file=sys.stderr)

    # ── Capa 1: scan global ──────────────────────────────────────────────
    if args.verbose:
        print("[1/3] Ejecutando scan global de patrones...", file=sys.stderr)
    scanner = Scanner(root, verbose=args.verbose)
    all_findings = scanner.scan()

    # Group findings by module
    findings_by_module: Dict[str, List[Finding]] = {}
    for f in all_findings:
        findings_by_module.setdefault(f.module_id, []).append(f)

    # ── Capa 2: declarative module checks ───────────────────────────────
    if args.verbose:
        print("[2/3] Ejecutando checks declarativos por modulo...", file=sys.stderr)
    auditor = ModuleAuditor(root, verbose=args.verbose)

    # Navigation gap check
    nav_check_results = auditor.audit_navigation()
    nav_by_module: Dict[str, List[CheckResult]] = {}
    for cr in nav_check_results:
        nav_by_module.setdefault(cr.module_id, []).append(cr)

    # ── Assemble ModuleResults ───────────────────────────────────────────
    module_results: Dict[str, ModuleResult] = {}
    for module_id, mdef in MODULE_DEFINITIONS.items():
        mr = ModuleResult(
            module_id=module_id,
            label=mdef["label"],
        )
        mr.findings = findings_by_module.get(module_id, [])
        mr.check_results = auditor.audit_module(module_id, mdef)
        # Attach nav findings to this module
        mr.check_results.extend(nav_by_module.get(module_id, []))
        module_results[module_id] = mr

    # Handle findings for modules not in MODULE_DEFINITIONS
    for module_id, findings in findings_by_module.items():
        if module_id not in module_results:
            mr = ModuleResult(module_id=module_id, label=module_id.capitalize())
            mr.findings = findings
            module_results[module_id] = mr

    # ── Render Markdown ──────────────────────────────────────────────────
    if args.verbose:
        print("[3/3] Generando reporte...", file=sys.stderr)

    reporter = Reporter(module_results, root)
    report_text = reporter.render()

    output_path = root / args.output
    output_path.write_text(report_text, encoding="utf-8")
    print(f"Reporte generado: {output_path}", file=sys.stderr)

    # Print summary to stdout
    global_score = sum(mr.score for mr in module_results.values()) / max(len(module_results), 1)
    total_gaps = sum(mr.gap_count for mr in module_results.values())
    print(f"\nScore global: {global_score:.1f}%  |  Total gaps: {total_gaps}")
    print("\nModulos con gaps:")
    for mrid, mr in sorted(module_results.items(), key=lambda x: x[1].score):
        if mr.gap_count > 0:
            print(f"  {mr.status:4s}  {mr.score:3d}%  {mr.label} ({mr.gap_count} gaps)")

    return 0


if __name__ == "__main__":
    sys.exit(main())

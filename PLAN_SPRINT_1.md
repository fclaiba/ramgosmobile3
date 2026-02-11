# PLAN_SPRINT_1 — Fundaciones (Menú + Legales + Naming)

## Objetivo
Dejar la app “presentable” y coherente: menú guest-friendly, legals accesibles, y naming correcto (“Mis compras”).

## Scope (qué se hace)
- SidebarMenu:
  - Legales visibles siempre (Términos/Privacidad).
  - “Historial” => “Mis compras”.
  - Anonymous: CTA Login/Registro y ocultar accesos que no aplican (perfil/pagos si corresponde).
  - Pending: mostrar estado/CTA “Verificar email”.
- Headers:
  - `HistoryScreen` title -> “Mis compras” (y mantener navegación actual).
- No se implementa todavía `useActionGate` (eso es Sprint 2), pero se prepara la UI para soportarlo.

## Archivos candidatos
- `src/components/SidebarMenu.tsx`
- `src/screens/HistoryScreen.tsx`
- (si falta ruta) navegación donde estén registradas las screens `Terms`/`Privacy`/`Verification`.

## Definition of Done (DoD)
- Desde el menú se puede abrir `Terms` y `Privacy`.
- El menú cambia según estado (`anonymous` / `pending_verification` / `authenticated`).
- La pantalla “Historial” se ve como “Mis compras” al usuario.

---

## Context Engineering (Sprint 1)
- No tocar lógica interna de Auth más allá de lecturas del estado (`status`, `user`).
- No meter gating de acciones todavía (solo UI/menú).
- No eliminar routes existentes; solo agregar accesos y renombrar labels.

---

## Prompt Engineering (Sprint 1) — Copiar/pegar en Cursor Chat
@PLAN_MAESTRO.md @PLAN_SPRINT_1.md @Codebase

Hola. Ejecutá Sprint 1 completo.
Reglas:
- No crees nuevos contexts de sesión.
- Implementá cambios en `SidebarMenu` para estados anonymous/pending/authenticated.
- Agregá accesos a Terms y Privacy.
- Cambiá label “Historial” a “Mis compras” y actualizá el header de HistoryScreen.

Entregables:
- Código aplicado.
- Lista de archivos tocados.
- Checklist DoD marcado con evidencia (qué pantalla valida cada punto).


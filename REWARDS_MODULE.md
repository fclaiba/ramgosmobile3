# Ramgos Rewards – Gamificación y Lealtad

Este módulo introduce el motor de retención **Ramgos Rewards**, diseñado para incentivar el uso continuo de la app mediante recompensas, rachas y referidos.

## Billetera de puntos
- Conversión automática: **1 punto = $0.01 USD**.
- Asignación inmediata: cada **$1 gastado = 1 punto**.
- El cálculo de nivel (Bronze, Silver, Gold, Platinum) ahora considera **puntos históricos** acumulados.
- El multiplicador de nivel se aplica automáticamente en las compras (`trackPurchase` dentro de `PointsContext`).

## Mini‑juegos y Arcade
- Los juegos de habilidad (`Dino`, `Duck Hunt`, `Fruit Catcher`, `Memory`) pueden otorgar puntos adicionales.
- Límite diario de recompensas: **máximo 3 premios por día**. Los resultados se administran en `RewardsContext`.
- Las recompensas se integran en:
  - `MiMascotaView`: al finalizar un mini‑juego se registra el puntaje.
  - `GamesScreen`: los juegos del Game Center también notifican la recompensa.

## Rueda de la Suerte
- Disponible **1 giro diario** con lógica de probabilidades configurable (`RewardsContext`).
- El estado y últimos resultados se muestran en `PointsManager`, permitiendo al usuario girar la ruleta desde el panel de puntos.

## Sistema de rachas
- El login diario continúa siendo gestionado en `PointsContext`, pero las **recompensas progresivas** se controlan desde `RewardsContext`.
- Hitos configurados: 3, 7, 14 y 30 días.
- Los usuarios pueden reclamar bonuses directamente en la vista de puntos (`PointsManager`).

## Referidos
- Cada usuario obtiene un código/enlace único (derivado de su `user.id`).
- Recompensas configurables:
  - Registro exitoso: +100 pts.
  - Primera compra del referido: +250 pts.
- El resumen de referidos y el código se muestran en:
  - `PointsManager` (tarjeta Ramgos Rewards).
  - `InfluencerDashboardScreen`.

## Componentes y contextos clave

| Archivo | Descripción |
| --- | --- |
| `src/contexts/RewardsContext.tsx` | Estado persistente (AsyncStorage) para ruleta, arcade, rachas y referidos. |
| `src/contexts/PointsContext.tsx` | Añade `lifetimePoints` y actualiza cálculo de tiers y multiplicadores. |
| `src/components/PointsManager.tsx` | Nueva sección **Ramgos Rewards** con estado de racha, ruleta, arcade y referidos. |
| `src/components/pet/MiMascotaView.tsx` | Alimentar mascota otorga puntos diarios; minijuegos registran recompensas arcade. |
| `src/screens/GamesScreen.tsx` | Registra automáticamente recompensas arcade al terminar juegos elegibles. |
| `src/screens/InfluencerDashboardScreen.tsx` | Muestra código real de referido y métricas derivadas de `RewardsContext`. |

## Persistencia y reseteo diario
- El estado diario (`DailyEngagementState`) se guarda en AsyncStorage y se reinicia automáticamente cada día.
- Los hitos de racha reclamados y el récord de racha se conservan entre sesiones.
- El estado de referidos es específico por usuario (`@ramgos/rewards/referral/<userId>`).

## Próximos pasos sugeridos
- Añadir métricas de uso y panel analítico para administradores.
- Integrar un servicio remoto para validar referidos y compras reales.
- Crear pruebas unitarias para `RewardsContext` (simular reseteos diarios y límites de arcade).







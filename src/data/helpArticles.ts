/**
 * src/data/helpArticles.ts — Static FAQ corpus for the Help Center.
 *
 * 20 articles split across 5 categories:
 *   - Compras (5)
 *   - Vendedor (5)
 *   - Cuenta (4)
 *   - Influencers (3)
 *   - Recompensas (3)
 *
 * Each article body is plain markdown so HelpArticleDetailScreen can render
 * it without a heavy dependency. Keep paragraphs short (mobile reading) and
 * link to in-app screens via `[texto](ramgos://...)` deeplinks.
 */

export type HelpCategoryId =
    | 'compras'
    | 'vendedor'
    | 'cuenta'
    | 'influencers'
    | 'recompensas';

export interface HelpArticle {
    id: string;
    categoryId: HelpCategoryId;
    title: string;
    summary: string;
    body: string;
}

export interface HelpCategory {
    id: HelpCategoryId;
    name: string;
    description: string;
}

export const HELP_CATEGORIES: HelpCategory[] = [
    { id: 'compras', name: 'Compras', description: 'Comprar bonos, eventos, productos y servicios.' },
    { id: 'vendedor', name: 'Vendedor', description: 'Publicar y vender en Ramgos.' },
    { id: 'cuenta', name: 'Mi Cuenta', description: 'Perfil, seguridad y configuración.' },
    { id: 'influencers', name: 'Influencers', description: 'Campañas, comisiones y promoción.' },
    { id: 'recompensas', name: 'Recompensas', description: 'Puntos, niveles y beneficios.' },
];

export const HELP_ARTICLES: HelpArticle[] = [
    // -------- Compras (5) --------
    {
        id: 'compras-1-como-comprar',
        categoryId: 'compras',
        title: '¿Cómo hago una compra?',
        summary: 'Paso a paso para comprar bonos, eventos, productos o servicios.',
        body: `Para hacer una compra:\n\n1. Buscá lo que necesitás en el **Marketplace** o navegá por categorías.\n2. Tocá el ítem para ver detalles, reviews y stock.\n3. Tocá **Agregar al carrito** o **Comprar ya**.\n4. Revisá el resumen en el **Carrito** y tocá **Pagar**.\n5. Elegí tu método de pago guardado o agregá una tarjeta nueva.\n6. Confirmás y listo: el pago queda en garantía hasta que recibas el producto.\n\nSi lo que comprás es un bono o entrada de evento, vas a recibir un código QR en la sección **Mis Compras**.`,
    },
    {
        id: 'compras-2-escrow',
        categoryId: 'compras',
        title: '¿Qué es el sistema de garantía (escrow)?',
        summary: 'Tu plata queda retenida hasta que confirmás que recibiste lo que compraste.',
        body: `Cuando pagás, el dinero **NO** se libera al vendedor de inmediato. Queda retenido en una cuenta de garantía y se libera recién cuando:\n\n- Confirmás recepción manualmente desde **Mis Compras**, o\n- Pasan 7 días desde que el vendedor marca el envío como entregado (auto-release), o\n- Pasaste por el QR del comercio (en bonos/eventos presenciales).\n\nSi algo sale mal, podés abrir una **disputa** desde el detalle del pedido. La plata queda congelada hasta que se resuelva.`,
    },
    {
        id: 'compras-3-disputa',
        categoryId: 'compras',
        title: '¿Cómo abro una disputa?',
        summary: 'Cuándo y cómo reclamar si recibiste algo distinto a lo prometido.',
        body: `Podés abrir una disputa cuando:\n\n- El producto no llegó.\n- Llegó dañado o muy distinto a la publicación.\n- El servicio no se prestó como se ofreció.\n\n**Cómo hacerlo:**\n\n1. Andá a **Mis Compras** y tocá el pedido afectado.\n2. Tocá **Abrir disputa**.\n3. Elegí el motivo y describí qué pasó.\n4. Subí fotos o comprobantes (recomendado).\n\nUn moderador del equipo Ramgos va a mediar entre vos y el vendedor. Si la disputa se resuelve a tu favor, te devolvemos la plata al método de pago original.`,
    },
    {
        id: 'compras-4-reembolso',
        categoryId: 'compras',
        title: '¿Cómo recibo un reembolso?',
        summary: 'Tiempos y métodos cuando una disputa se resuelve a tu favor.',
        body: `Si una disputa se resuelve a tu favor, el reembolso vuelve **al mismo método de pago** que usaste para comprar.\n\n**Tiempos típicos:**\n\n- Tarjetas de crédito/débito: 5 a 10 días hábiles.\n- Saldo en Wallet de Ramgos: instantáneo.\n\nVas a recibir una notificación push y un email cuando se procese. Si pasaron más de 10 días hábiles y no ves el reembolso, contactanos desde **Soporte**.`,
    },
    {
        id: 'compras-5-bono-qr',
        categoryId: 'compras',
        title: '¿Cómo uso mi bono o entrada con QR?',
        summary: 'Mostralo al comercio para validar tu compra.',
        body: `Cada bono o entrada de evento que compres genera un **código QR único** en **Mis Compras → Bonos / Eventos**.\n\nCuando llegues al comercio o evento:\n\n1. Abrí el bono.\n2. Mostrá el QR al vendedor.\n3. Esperá la confirmación (verás el bono en estado **Canjeado**).\n\nEl QR es de un solo uso. Si lo perdés, podés generarlo de nuevo desde la app sin costo.`,
    },

    // -------- Vendedor (5) --------
    {
        id: 'vendedor-1-publicar',
        categoryId: 'vendedor',
        title: '¿Cómo publico mi primer producto o servicio?',
        summary: 'Crea tu listing en menos de 5 minutos.',
        body: `Para publicar:\n\n1. Andá a **Mis Listados** y tocá **+ Nuevo**.\n2. Elegí el tipo: **bono**, **evento**, **producto** o **servicio**.\n3. Subí fotos (mínimo 1, recomendado 3+).\n4. Completá título, descripción, precio y categoría.\n5. Si vendés productos físicos, configurá el envío.\n6. Tocá **Publicar**.\n\nTu listing aparece en el Marketplace en menos de 1 minuto. Podés editarlo o pausarlo cuando quieras desde **Mis Listados**.`,
    },
    {
        id: 'vendedor-2-comisiones',
        categoryId: 'vendedor',
        title: '¿Qué comisión cobra Ramgos por venta?',
        summary: 'Take rate transparente y cuándo se descuenta.',
        body: `Ramgos retiene un porcentaje de cada venta como comisión de plataforma. Este porcentaje se descuenta **antes** de que la plata se acredite a tu Wallet.\n\nLa comisión cubre:\n\n- Procesamiento de pagos.\n- Sistema de garantía / escrow.\n- Mediación de disputas.\n- Visibilidad en el Marketplace.\n\nVas a ver el desglose exacto (precio bruto, comisión, neto a cobrar) en cada venta desde el detalle del pedido.`,
    },
    {
        id: 'vendedor-3-cobrar',
        categoryId: 'vendedor',
        title: '¿Cómo cobro lo que vendí?',
        summary: 'Wallet, retiros bancarios y conexión con Stripe.',
        body: `Las ventas se acreditan en tu **Wallet de Vendedor** después de pasar por el escrow (cuando el comprador confirma o se libera automáticamente).\n\nPara cobrar a tu cuenta bancaria:\n\n1. Andá a **Wallet → Retirar**.\n2. Necesitás haber completado el **onboarding de Stripe Connect** (DNI / CUIT, datos bancarios). Si no lo hiciste, la app te guía.\n3. Ingresá el monto y confirmá.\n\n**Tiempos:** los retiros suelen acreditarse en tu cuenta bancaria en 1 a 3 días hábiles.`,
    },
    {
        id: 'vendedor-4-disputas',
        categoryId: 'vendedor',
        title: 'Un comprador abrió una disputa: ¿qué hago?',
        summary: 'Respondé rápido, sumá evidencia y buscá un acuerdo.',
        body: `Cuando un comprador abre una disputa, vas a recibir una notificación push y un email. Tenés 48hs para responder antes de que el caso escale a moderación.\n\n**Buenas prácticas:**\n\n1. Respondé desde el **Chat de la disputa** lo antes posible.\n2. Subí fotos / comprobantes de envío / capturas de chat previas.\n3. Si reconocés un error, ofrecé reembolso o reposición desde el chat.\n4. Si no llegan a un acuerdo en 72hs, un moderador de Ramgos decide en base a la evidencia.\n\nResolver disputas a favor del comprador rápido **NO** baja tu rating si no hay mala fe. Lo que penaliza es no responder.`,
    },
    {
        id: 'vendedor-5-multi',
        categoryId: 'vendedor',
        title: '¿Puedo vender más de un tipo de cosa?',
        summary: 'Sí: bonos, eventos, productos físicos y servicios desde la misma cuenta.',
        body: `Una sola cuenta de vendedor puede publicar todos los tipos:\n\n- **Bonos:** cupones que el comprador canjea presencialmente con QR.\n- **Eventos:** entradas con cupos limitados, fecha y lugar.\n- **Productos:** ítems físicos con stock y envío.\n- **Servicios:** turnos / horas de trabajo, on-site o remoto.\n\nCada tipo tiene su flujo de fulfillment, pero todos pasan por el mismo escrow y wallet. Podés gestionar todo desde **Mis Listados** y **Pedidos**.`,
    },

    // -------- Cuenta (4) --------
    {
        id: 'cuenta-1-cambiar-password',
        categoryId: 'cuenta',
        title: '¿Cómo cambio mi contraseña?',
        summary: 'Desde Configuración → Seguridad.',
        body: `Para cambiar tu contraseña:\n\n1. Abrí **Configuración** desde el menú.\n2. Tocá **Cambiar contraseña** dentro de la sección **Seguridad**.\n3. Ingresá tu contraseña actual.\n4. Elegí una nueva (mínimo 8 caracteres).\n5. Confirmala y tocá **Actualizar**.\n\nVas a cerrar sesión en otros dispositivos automáticamente por seguridad.`,
    },
    {
        id: 'cuenta-2-kyc',
        categoryId: 'cuenta',
        title: '¿Por qué me piden verificar mi identidad (KYC)?',
        summary: 'Requisito legal para cobrar a tu cuenta bancaria.',
        body: `La verificación de identidad (KYC = "Know Your Customer") es un **requisito regulatorio** para procesar pagos. Sin KYC podés navegar y comprar, pero no podés:\n\n- Recibir pagos como vendedor.\n- Retirar plata de tu Wallet a tu banco.\n- Cobrar comisiones como influencer.\n\n**Cómo verificarte:**\n\n1. Andá a **Configuración → Verificación**.\n2. Tomate una foto de tu documento (DNI / pasaporte).\n3. Hacé el selfie de prueba de vida.\n4. En menos de 24hs vas a tener el resultado.\n\nUsamos **Stripe Identity** — no almacenamos tus documentos directamente.`,
    },
    {
        id: 'cuenta-3-eliminar',
        categoryId: 'cuenta',
        title: '¿Cómo elimino mi cuenta?',
        summary: 'Es definitivo. Asegurate de retirar tu saldo antes.',
        body: `Antes de eliminar tu cuenta:\n\n1. Retirá cualquier saldo pendiente de tu Wallet (no se devuelve después).\n2. Cerrá las disputas que tengas abiertas.\n3. Cancelá las suscripciones activas (Pro o Negocio).\n\nLuego andá a **Configuración → Eliminar cuenta** y seguí los pasos. Es **definitivo** y no se puede revertir.\n\nLa información se borra de nuestros sistemas en 30 días, salvo lo que estamos obligados a conservar por leyes fiscales (facturación, AFIP).`,
    },
    {
        id: 'cuenta-4-roles',
        categoryId: 'cuenta',
        title: '¿Puedo ser vendedor e influencer al mismo tiempo?',
        summary: 'Sí, los roles no son excluyentes.',
        body: `Tu cuenta puede tener múltiples roles activos:\n\n- **Consumidor:** comprar.\n- **Vendedor / Negocio:** publicar y vender.\n- **Influencer:** promocionar productos de negocios y cobrar comisión.\n\nUsá **Configuración → Roles** para activar o desactivar cada rol. Cada uno tiene su propio dashboard pero comparten la misma Wallet y verificación KYC.\n\n**Importante:** algunos roles requieren KYC adicional. Por ejemplo, ser Negocio requiere verificación fiscal (CUIT).`,
    },

    // -------- Influencers (3) --------
    {
        id: 'influencers-1-promocionar',
        categoryId: 'influencers',
        title: '¿Cómo empiezo a promocionar productos?',
        summary: 'Buscá negocios abiertos a campañas o esperá invitaciones.',
        body: `Como influencer podés:\n\n1. **Buscar listings abiertos** desde **Influencer → Marketplace de campañas**: son productos / servicios donde el vendedor permite que cualquier influencer los promocione.\n2. **Recibir invitaciones** de negocios que te seleccionan específicamente.\n3. **Proponer una campaña** a un negocio: vos elegís el producto y proponés tu comisión.\n\nUna vez aceptada la campaña, generás tu **link / código de referido** único. Cada venta hecha con ese código te paga tu porcentaje al confirmar el pedido.`,
    },
    {
        id: 'influencers-2-comisiones',
        categoryId: 'influencers',
        title: '¿Cuándo cobro mi comisión?',
        summary: 'Cuando se libera el escrow del pedido.',
        body: `Tu comisión sigue el mismo timeline que el pago al vendedor:\n\n1. Comprador paga → la plata queda en escrow.\n2. Comprador confirma recepción (o pasan 7 días) → escrow libera.\n3. **Tu comisión se acredita en tu Wallet** automáticamente, en pending → available.\n\nDesde **Wallet → Retirar** podés mover la plata a tu cuenta bancaria.\n\nSi el comprador abre una disputa y se resuelve a su favor, **se reversa también tu comisión** (porque se reembolsó la venta).`,
    },
    {
        id: 'influencers-3-codigo',
        categoryId: 'influencers',
        title: '¿Cómo funciona mi código de referido?',
        summary: 'Único por campaña, atribución server-side.',
        body: `Cada campaña activa genera un **código único** que podés compartir en tus redes:\n\n- Como código (ej: \`MARIA10\`) que el comprador escribe en el carrito.\n- Como **deeplink** (\`ramgos.app/p/123?ref=MARIA10\`) que abre el producto en la app.\n\nLa atribución es **server-side**: cuando alguien usa tu código, el sistema registra la venta como tuya en el momento del pago. No hay tracking por cookies ni IPs — funciona aún si el comprador instala la app después.\n\n**Reglas:**\n\n- Solo podés promocionar productos de **negocios** (no de consumidores particulares).\n- Cada venta solo cuenta para **un** influencer (el primero cuyo código se usó).`,
    },

    // -------- Recompensas (3) --------
    {
        id: 'recompensas-1-puntos',
        categoryId: 'recompensas',
        title: '¿Cómo gano puntos Ramgos?',
        summary: 'Por cada compra, review y referido.',
        body: `Ganás puntos automáticamente cuando:\n\n- **Comprás:** 1 punto por cada **$1** pagado en efectivo (si usás puntos para pagar, solo sumás sobre el saldo restante en tarjeta).\n- **Bonus de nivel:** Plata/Oro/Élite suman % extra sobre esa compra.\n- **Referís usuarios:** puntos cuando un amigo se registra y hace su primera compra con tu link.\n- **Completás misiones:** revisá el feed de **Mascota** para ver desafíos disponibles.\n\nLos puntos se acreditan en el backend al confirmar el pago (casi en tiempo real).`,
    },
    {
        id: 'recompensas-2-niveles',
        categoryId: 'recompensas',
        title: '¿Qué son los niveles (Bronce / Plata / Oro)?',
        summary: 'Tu nivel desbloquea descuentos y beneficios.',
        body: `Tu nivel se calcula por puntos acumulados en los últimos 90 días:\n\n- **Bronce:** punto de partida (0+ pts).\n- **Plata:** 1.000+ pts → 5% off en bonos seleccionados.\n- **Oro:** 5.000+ pts → 10% off + acceso anticipado a eventos.\n- **Platino:** 20.000+ pts → 15% off + envíos sin cargo en marketplace.\n\nSi bajás de actividad, podés perder un nivel después de 90 días. La app te avisa antes para que no te tome por sorpresa.`,
    },
    {
        id: 'recompensas-3-canjear',
        categoryId: 'recompensas',
        title: '¿Cómo canjeo mis puntos?',
        summary: 'En el carrito o desde la sección de Recompensas.',
        body: `Tenés dos formas de canjear:\n\n1. **En el carrito:** al pagar, vas a ver una opción para usar puntos. 100 puntos = $1 de descuento, hasta cubrir el 50% del subtotal.\n2. **En Recompensas → Catálogo:** canjeás puntos por bonos exclusivos, productos digitales, o entradas a eventos premium.\n\nLos puntos **NO se vencen** mientras tengas la cuenta activa. Si tu cuenta queda inactiva más de 12 meses, los puntos pueden expirar sin previo aviso.`,
    },
];

export const getArticlesByCategory = (categoryId: HelpCategoryId): HelpArticle[] =>
    HELP_ARTICLES.filter((a) => a.categoryId === categoryId);

export const getArticleById = (id: string): HelpArticle | undefined =>
    HELP_ARTICLES.find((a) => a.id === id);

export const searchArticles = (query: string): HelpArticle[] => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return HELP_ARTICLES.filter(
        (a) =>
            a.title.toLowerCase().includes(q) ||
            a.summary.toLowerCase().includes(q) ||
            a.body.toLowerCase().includes(q),
    );
};

export const POPULAR_ARTICLE_IDS = [
    'compras-2-escrow',
    'compras-3-disputa',
    'vendedor-3-cobrar',
    'recompensas-1-puntos',
];

export const UNIFIED_CATEGORIES = {
    product: [
        'Tecnología', 'Indumentaria', 'Hogar', 'Deportes', 'Mascotas', 'Juguetes',
        'Belleza y Cuidado Personal', 'Herramientas', 'Automotriz', 'Libros y Papelería',
        'Arte y Artesanías', 'Instrumentos Musicales', 'Jardinería', 'Otros'
    ],
    service: [
        'Profesional', 'Oficios', 'Educación', 'Salud', 'Transporte', 'Limpieza',
        'Mantenimiento', 'Belleza y Cuidado', 'Barbería', 'Gimnasio',
        'Marketing', 'Desarrollo Web',
        'Diseño', 'Legales', 'Contabilidad', 'Eventos', 'Otros'
    ],
    event: [
        'Concierto', 'Fiesta', 'Deportivo', 'Teatro', 'Conferencia', 'Workshop',
        'Webinar', 'Meetup', 'Feria', 'Exposición', 'Festival', 'Cine', 'Otros'
    ],
    business: [
        'Gastronomía', 'Indumentaria', 'Tecnología', 'Salud y Belleza',
        'Barbería', 'Gimnasio',
        'Hogar y Decoración', 'Servicios Profesionales', 'Entretenimiento',
        'Educación', 'Automotriz', 'Deportes', 'Mascotas', 'Otros'
    ]
};

export type CategoryType = keyof typeof UNIFIED_CATEGORIES;

export const getAllCategories = (): string[] => {
    const all = new Set<string>();
    Object.values(UNIFIED_CATEGORIES).forEach(list => list.forEach(cat => all.add(cat)));
    // Sort alphabetically for filters
    return Array.from(all).sort();
};

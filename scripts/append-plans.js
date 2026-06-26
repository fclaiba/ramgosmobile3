const fs = require('fs');
fs.appendFileSync('convex/subscriptions.ts', `
export const getPlans = query({
    args: {},
    handler: async () => ({
        pro: {
            tier: 'pro',
            priceMonthlyUsd: 2.99,
            displayName: 'Membresía Usuario PRO',
            perks: ['Insignia PRO', 'Skins exclusivas']
        },
        business: {
            tier: 'business',
            priceMonthlyUsd: 5.99,
            displayName: 'Membresía Negocio Verificado',
            perks: ['Badge Oficial', 'Panel avanzado']
        }
    })
});
`, 'utf8');

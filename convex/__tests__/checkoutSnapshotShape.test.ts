/**
 * El snapshot del checkout se calcula en `_split.ts` y se persiste con los
 * validadores de `schema.ts`. Nada ataba una cosa a la otra: `SplitLine`
 * ganó `grossCents` y el validador no, así que Convex rechazaba el objeto
 * entero al escribir el pago — con el PaymentIntent YA creado en Stripe — y
 * el checkout no podía completarse (E-139).
 *
 * Estos tests comparan los campos que realmente produce el split contra los
 * que declara el validador, en las dos direcciones.
 */
import { computeCheckoutSplit } from "../_split";
import {
    checkoutLineValidator,
    checkoutSellerSplitValidator,
    checkoutSnapshotValidator,
} from "../schema";

/** Nombres de campo declarados por un `v.object({...})`. */
const validatorFields = (validator: any): Set<string> => new Set(Object.keys(validator.fields));

/** Campos opcionales de un `v.object({...})`. */
const optionalFields = (validator: any): Set<string> =>
    new Set(
        Object.entries(validator.fields as Record<string, any>)
            .filter(([, f]) => f.isOptional === "optional")
            .map(([name]) => name),
    );

const split = computeCheckoutSplit({
    lines: [
        {
            listingId: "l1",
            sellerId: "s1",
            unitCents: 3000,
            quantity: 1,
            type: "bono",
            title: "Bono VIP",
            image: "https://example.com/x.jpg",
            influencerId: "inf1",
            influencerRate: 0.05,
            referralCode: "REF1",
            sourcePostId: "p1",
        },
        { listingId: "l2", sellerId: "s2", unitCents: 1500, quantity: 2, type: "product" },
    ],
    shippingCents: 500,
});

describe("el snapshot que produce _split.ts entra en los validadores de schema.ts", () => {
    it("cada lineItem sólo tiene campos declarados en checkoutLineValidator", () => {
        const declared = validatorFields(checkoutLineValidator);
        for (const line of split.lineItems) {
            for (const field of Object.keys(line)) {
                // Éste es exactamente el fallo de E-139: `grossCents` existía
                // en el objeto y no en el validador.
                expect({ field, declared: declared.has(field) }).toEqual({ field, declared: true });
            }
        }
    });

    it("cada línea trae todos los campos obligatorios del validador", () => {
        const declared = validatorFields(checkoutLineValidator);
        const optional = optionalFields(checkoutLineValidator);
        const required = [...declared].filter((f) => !optional.has(f));
        for (const line of split.lineItems) {
            for (const field of required) {
                expect({ field, present: field in line }).toEqual({ field, present: true });
            }
        }
    });

    it("cada seller sólo tiene campos declarados, y todos los obligatorios", () => {
        const declared = validatorFields(checkoutSellerSplitValidator);
        const optional = optionalFields(checkoutSellerSplitValidator);
        const required = [...declared].filter((f) => !optional.has(f));
        for (const seller of split.sellers) {
            for (const field of Object.keys(seller)) {
                expect({ field, declared: declared.has(field) }).toEqual({ field, declared: true });
            }
            for (const field of required) {
                expect({ field, present: field in seller }).toEqual({ field, present: true });
            }
        }
    });

    it("el snapshot de primer nivel coincide con checkoutSnapshotValidator", () => {
        const declared = validatorFields(checkoutSnapshotValidator);
        for (const field of Object.keys(split)) {
            expect({ field, declared: declared.has(field) }).toEqual({ field, declared: true });
        }
    });

    it("grossCents sigue siendo unitCents * quantity (la base de las comisiones)", () => {
        for (const line of split.lineItems) {
            expect(line.grossCents).toBe(line.unitCents * line.quantity);
        }
    });
});

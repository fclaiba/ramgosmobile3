
# Setup Stripe + Convex + Expo

1. **Instalación de dependencias**
   ```bash
   npx expo install @stripe/stripe-react-native
   npm install stripe  # en el directorio raíz o de convex
   ```

2. **Variables de entorno en Convex Dashboard**
   Ejecuta en tu terminal:
   ```bash
   npx convex env set STRIPE_SECRET_KEY sk_test_...
   npx convex env set STRIPE_WEBHOOK_SECRET whsec_...
   ```

3. **Configuración iOS**
   Asegúrate de agregar tu `merchantIdentifier` si usarás Apple Pay. Revisa el `Info.plist`.

4. **Configuración Android**
   Revisa tu `AndroidManifest.xml` si agregas configuraciones adicionales de Stripe.

5. **Configurar el webhook en Stripe Dashboard**
   - **URL del endpoint:** `https://<tu-deployment>.convex.site/stripe/webhook` (obten tu deployment url con `npx convex url`)
   - **Eventos a escuchar:**
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`

6. **Tarjetas de prueba para QA**
   | Número | Resultado |
   |--------|-----------|
   | 4242 4242 4242 4242 | Éxito |
   | 4000 0000 0000 9995 | Fondos insuficientes |
   | 4000 0025 0000 3155 | Requiere 3DS |
   | 4000 0000 0000 0002 | Declinada genérica |

7. **Checklist de producción**
   - [ ] Cambiar a `pk_live_` y `sk_live_`
   - [ ] Webhook en producción apuntando al deployment live de Convex
   - [ ] PCI SAQ A checklist
   - [ ] `postalCodeEnabled={false}` confirmado para LATAM

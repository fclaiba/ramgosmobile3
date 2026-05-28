import os
import re
import sys

def audit_and_fix():
    print("--- Iniciando Auditoria de Ramgos Mobile ---")
    root_dir = os.getcwd()
    errors_found = 0

    # 1. Detectar Importaciones Rotas (Relative paths)
    print("Checking for broken imports in nested screens...")
    for root, dirs, files in os.walk(os.path.join(root_dir, "src", "screens")):
        for file in files:
            if file.endswith(".tsx") or file.endswith(".ts"):
                path = os.path.join(root, file)
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                rel_depth = root.replace(os.path.join(root_dir, "src", "screens"), "").count(os.sep)
                if rel_depth > 0:
                    broken_pattern = r"from '\.\./(contexts|components)/"
                    if re.search(broken_pattern, content):
                        print(f"  [ERROR] Path issue in: {file}")
                        new_content = re.sub(broken_pattern, r"from '../../\1/", content)
                        with open(path, 'w', encoding='utf-8') as f:
                            f.write(new_content)
                        print(f"  [FIXED] Updated to '../../'")
                        errors_found += 1

    # 2. Verificar Shims de Web para Stripe
    print("\nChecking Web compatibility (Stripe shims)...")
    native_files = [
        "src/components/StripeWrapper.tsx",
        "src/components/stripe/StripePaymentModal.tsx",
        "src/screens/PaymentMethodsScreen.tsx"
    ]
    for nf in native_files:
        web_file = nf.replace(".tsx", ".web.tsx")
        if not os.path.exists(os.path.join(root_dir, web_file)):
            print(f"  [WARNING] Missing web shim for: {nf}")
            errors_found += 1

    # 3. Validar Variables de Env
    print("\nValidating .env.local...")
    if not os.path.exists(".env.local"):
        print("  [ERROR] .env.local not found")
    else:
        with open(".env.local", 'r') as f:
            env_content = f.read()
            if "EXPO_PUBLIC_CONVEX_URL" not in env_content:
                print("  [ERROR] Missing EXPO_PUBLIC_CONVEX_URL")
            if "EXPO_PUBLIC_STRIPE_KEY" not in env_content:
                print("  [WARNING] Missing EXPO_PUBLIC_STRIPE_KEY")

    print(f"\nAudit complete. Issues found/fixed: {errors_found}")

if __name__ == "__main__":
    audit_and_fix()

const fs = require('fs');

const path = 'App.tsx';
let content = fs.readFileSync(path, 'utf8');

// Remove imports
content = content.replace(/import \{ StripeConnectProvider \} from '\.\/src\/contexts\/StripeConnectContext';\r?\n/, '');
content = content.replace(/import \{ StripeWrapper \} from '\.\/src\/components\/StripeWrapper';\r?\n/, '');

// Remove STRIPE_PUBLISHABLE_KEY validation logic
content = content.replace(/const STRIPE_PUBLISHABLE_KEY = process\.env\.EXPO_PUBLIC_STRIPE_KEY;[\s\S]+?const stripePublishableKey = STRIPE_PUBLISHABLE_KEY \?\? 'pk_test_mock_fallback';\r?\n/, '');

// Remove wrapper components from the JSX tree
content = content.replace(/<StripeWrapper publishableKey=\{stripePublishableKey\}>\s+<AuthProvider>/g, '<AuthProvider>');
content = content.replace(/<\/AuthProvider>\s+<\/StripeWrapper>/g, '</AuthProvider>');

content = content.replace(/<StripeConnectProvider>\s+<PointsFeedback \/>/g, '<PointsFeedback />');
content = content.replace(/<\/AppNavigator>\s+<\/StripeConnectProvider>/g, '</AppNavigator>');

fs.writeFileSync(path, content);
console.log('App.tsx refactored to remove Stripe wrappers.');

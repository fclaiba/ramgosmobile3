const fs = require('fs');

const path = 'App.tsx';
let content = fs.readFileSync(path, 'utf8');

// Remove deleted screens and imports
const toRemove = [
    /import CheckoutScreen from '\.\/src\/screens\/marketplace\/CheckoutScreen';\r?\n/,
    /import StripeConnectScreen from '\.\/src\/screens\/marketing\/StripeConnectScreen';\r?\n/,
    /<Stack\.Screen name="Checkout" component=\{CheckoutScreen\} \/>\r?\n/,
    /<Stack\.Screen name="StripeConnect" component=\{StripeConnectScreen\} \/>\r?\n/
];

toRemove.forEach(regex => {
    content = content.replace(regex, '');
});

fs.writeFileSync(path, content);
console.log('App.tsx cleaned of deleted screen imports.');

/** Stripe sandbox cards — https://docs.stripe.com/testing */

export type TestCard = {
    id: string;
    brand: string;
    last4: string;
    label: string;
    number: string;
    cvc: string;
    exp: string;
    pm?: string;
};

export const STRIPE_TEST_CARDS: TestCard[] = [
    { id: 'visa', brand: 'visa', last4: '4242', label: 'Visa', number: '4242424242424242', cvc: '123', exp: '12/34', pm: 'pm_card_visa' },
    { id: 'visa_debit', brand: 'visa', last4: '5556', label: 'Visa débito', number: '4000056655665556', cvc: '123', exp: '12/34', pm: 'pm_card_visa_debit' },
    { id: 'mc', brand: 'mastercard', last4: '4444', label: 'Mastercard', number: '5555555555554444', cvc: '123', exp: '12/34', pm: 'pm_card_mastercard' },
    { id: 'mc_2', brand: 'mastercard', last4: '3222', label: 'MC 2-series', number: '2223003122003222', cvc: '123', exp: '12/34' },
    { id: 'mc_debit', brand: 'mastercard', last4: '8210', label: 'MC débito', number: '5200828282828210', cvc: '123', exp: '12/34', pm: 'pm_card_mastercard_debit' },
    { id: 'amex', brand: 'amex', last4: '0005', label: 'Amex', number: '378282246310005', cvc: '1234', exp: '12/34', pm: 'pm_card_amex' },
    { id: 'amex2', brand: 'amex', last4: '8431', label: 'Amex 2', number: '371449635398431', cvc: '1234', exp: '12/34' },
    { id: 'discover', brand: 'discover', last4: '1117', label: 'Discover', number: '6011111111111117', cvc: '123', exp: '12/34', pm: 'pm_card_discover' },
    { id: 'diners', brand: 'diners', last4: '0004', label: 'Diners', number: '3056930009020004', cvc: '123', exp: '12/34', pm: 'pm_card_diners' },
    { id: 'jcb', brand: 'jcb', last4: '0505', label: 'JCB', number: '3566002020360505', cvc: '123', exp: '12/34', pm: 'pm_card_jcb' },
    { id: 'unionpay', brand: 'unionpay', last4: '0005', label: 'UnionPay', number: '6200000000000005', cvc: '123', exp: '12/34', pm: 'pm_card_unionpay' },
];

export const formatCardNumber = (n: string) => n.replace(/(\d{4})(?=\d)/g, '$1 ').trim();

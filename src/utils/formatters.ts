/**
 * Validates and masks numeric input for prices.
 * Allows digits, dot, comma.
 * Normalizes to dot.
 * Limits to 2 decimal places.
 */
export const formatPrice = (text: string) => {
    let formatted = text.replace(/[^0-9.,]/g, '');
    formatted = formatted.replace(',', '.');
    const parts = formatted.split('.');
    if (parts.length > 2) {
        formatted = parts[0] + '.' + parts.slice(1).join('');
    }
    if (parts.length === 2 && parts[1].length > 2) {
        formatted = parts[0] + '.' + parts[1].slice(0, 2);
    }
    return formatted;
};

/**
 * Validates and keeps only integer digits.
 */
export const formatInteger = (text: string) => text.replace(/[^0-9]/g, '');

/**
 * Masks input to DD/MM/YYYY format.
 */
export const formatDate = (text: string) => {
    // Remove non-digits
    const digits = text.replace(/[^0-9]/g, '');
    let formatted = digits;

    if (digits.length >= 2) {
        formatted = digits.slice(0, 2) + '/' + digits.slice(2);
    }
    if (digits.length >= 4) {
        formatted = formatted.slice(0, 5) + '/' + digits.slice(4, 8);
    }
    return formatted;
};

/**
 * Masks input to HH:MM format.
 */
export const formatTime = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '');
    let formatted = digits;

    if (digits.length >= 2) {
        formatted = digits.slice(0, 2) + ':' + digits.slice(2, 4);
    }
    return formatted;
};

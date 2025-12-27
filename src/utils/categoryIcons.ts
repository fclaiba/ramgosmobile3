import { ShoppingBag, Ticket, Calendar, Box, Star, Heart, MapPin } from 'lucide-react-native';

export const getItemIcon = (type: string) => {
    switch (type) {
        case 'product':
            return ShoppingBag;
        case 'bonos':
            return Ticket;
        case 'events':
            return Calendar;
        default:
            return Box;
    }
};

export const getCategoryIcon = (category: string) => {
    // Add logic if needed
    return Star;
};

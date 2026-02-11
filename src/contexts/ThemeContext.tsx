import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme as useNativeWindColorScheme } from 'nativewind';
import { useColorScheme as useSystemColorScheme } from 'react-native';

type Theme = 'light' | 'dark' | 'system';
type ColorScheme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  colorScheme: ColorScheme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = '@ramgos_theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { colorScheme: nativeWindColorScheme, setColorScheme: setNativeWindColorScheme } = useNativeWindColorScheme();
  const systemColorScheme = useSystemColorScheme();

  const [theme, setThemeState] = useState<Theme>('system');
  const [colorScheme, setColorScheme] = useState<ColorScheme>(nativeWindColorScheme || 'light');

  // Load saved theme preference on mount
  useEffect(() => {
    loadTheme();
  }, []);

  // Update colorScheme and NativeWind when theme or system preference changes
  useEffect(() => {
    const targetColorScheme = theme === 'system'
      ? (systemColorScheme || 'light')
      : theme === 'dark'
        ? 'dark'
        : 'light';

    setColorScheme(targetColorScheme);
    try {
      // NativeWind v2: Directly set the color scheme
      setNativeWindColorScheme(targetColorScheme);
    } catch (error: any) {
      // Suppress specific NativeWind v4 warning if darkMode is successfully set in tailwind.config
      if (!error.message?.includes('Unable to manually set color scheme')) {
        console.log('NativeWind color scheme warning:', error);
      }
    }

  }, [theme, systemColorScheme]);

  const loadTheme = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system')) {
        setThemeState(savedTheme as Theme);
      }
    } catch (error) {
      console.error('Error loading theme:', error);
    }
  };

  const setTheme = async (newTheme: Theme) => {
    try {
      setThemeState(newTheme);
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  };

  const toggleTheme = () => {
    // Always toggle to the opposite of the current effective color scheme
    // This ensures a visual change happens every time the user clicks the button
    const newTheme = colorScheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, colorScheme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

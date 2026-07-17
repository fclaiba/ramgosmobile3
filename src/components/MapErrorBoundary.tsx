import React, { Component, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Map, RefreshCw, AlertTriangle, XCircle } from 'lucide-react-native';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onRetry?: () => void;
  isDark?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Error boundary specifically for map components.
 * Catches JavaScript errors in the map component tree and displays a fallback UI.
 * 
 * Usage:
 * ```tsx
 * <MapErrorBoundary onRetry={() => setKey(k => k + 1)}>
 *   <MapView ... />
 * </MapErrorBoundary>
 * ```
 */
export class MapErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    
    // Log error for debugging
    logMapError(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onRetry?.();
  };

  render() {
    const { hasError, error } = this.state;
    const { children, fallback, isDark = false } = this.props;
    const styles = getStyles(isDark);

    if (hasError) {
      if (fallback) {
        return <>{fallback}</>;
      }

      return (
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <Map size={48} color={isDark ? '#9CA3AF' : '#6B7280'} />
          </View>
          <Text style={styles.title}>No se pudo cargar el mapa</Text>
          <Text style={styles.message}>
            {getErrorMessage(error)}
          </Text>
          
          {__DEV__ && error && (
            <View style={styles.debugContainer}>
              <AlertTriangle size={14} color="#F59E0B" />
              <Text style={styles.debugText} numberOfLines={3}>
                {error.message}
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.retryButton} onPress={this.handleRetry}>
            <RefreshCw size={18} color="#fff" />
            <Text style={styles.retryText}>Intentar de nuevo</Text>
          </TouchableOpacity>

          <Text style={styles.helpText}>
            Si el problema persiste, verifica tu conexión a internet o reinicia la app.
          </Text>
        </View>
      );
    }

    return children;
  }
}

/**
 * Logs map errors for debugging and analytics
 */
export function logMapError(error: Error, errorInfo?: React.ErrorInfo | null, context?: Record<string, any>) {
  const timestamp = new Date().toISOString();
  const platform = Platform.OS;
  const version = Platform.Version;
  
  const logEntry = {
    timestamp,
    type: 'MAP_ERROR',
    platform,
    version,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5).join('\n'),
    },
    componentStack: errorInfo?.componentStack?.split('\n').slice(0, 5).join('\n'),
    context,
  };

  if (__DEV__) {
    console.group(`🗺️ [MapError] ${timestamp}`);
    console.error('Error:', error);
    if (errorInfo) {
      console.error('Component Stack:', errorInfo.componentStack);
    }
    if (context) {
      console.log('Context:', context);
    }
    console.groupEnd();
  }

  if (!__DEV__) {
    try {
      const Sentry = require('@sentry/react-native');
      Sentry.captureException(error, {
        extra: {
          componentStack: logEntry.componentStack,
          context: logEntry.context,
          mapErrorType: logEntry.type
        }
      });
    } catch (e) {
      console.error('[MapErrorTracker] Fallback logger:', error.name, error.message, logEntry);
    }
  }
  
  return logEntry;
}

/**
 * Logs map initialization and lifecycle events
 */
export function logMapEvent(
  event: 'INIT' | 'READY' | 'REGION_CHANGE' | 'LOCATION_ACQUIRED' | 'PERMISSION_DENIED' | 'API_ERROR',
  data?: Record<string, any>
) {
  if (__DEV__) {
    const timestamp = new Date().toISOString();
    const prefix = event === 'API_ERROR' || event === 'PERMISSION_DENIED' ? '⚠️' : '📍';
    console.log(`${prefix} [Map:${event}] ${timestamp}`, data || '');
  } else {
    // Placeholder for analytics (Amplitude, Mixpanel, etc.)
    console.log(`[MapAnalytics] track: map_${event.toLowerCase()}`, data || '');
  }
}

/**
 * Gets user-friendly error message based on error type
 */
function getErrorMessage(error: Error | null): string {
  if (!error) {
    return 'Ocurrió un error inesperado al cargar el mapa.';
  }
  
  const message = error.message.toLowerCase();
  
  if (message.includes('network') || message.includes('fetch')) {
    return 'Error de conexión. Verifica tu internet e intenta de nuevo.';
  }
  
  if (message.includes('permission') || message.includes('location')) {
    return 'No se pudo acceder a tu ubicación. Verifica los permisos de la app.';
  }
  
  if (message.includes('api') || message.includes('google')) {
    return 'Error al conectar con el servicio de mapas. Intenta más tarde.';
  }
  
  if (message.includes('memory') || message.includes('render')) {
    return 'Error de rendimiento. Intenta cerrar otras apps.';
  }
  
  return 'Ocurrió un error al cargar el mapa. Intenta de nuevo.';
}

const getStyles = (isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDark ? '#09090B' : '#FAFAFA',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: isDark ? '#F9FAFB' : '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: isDark ? '#9CA3AF' : '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  debugContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.1)' : '#FFFBEB',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    maxWidth: '100%',
  },
  debugText: {
    flex: 1,
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: isDark ? '#FCD34D' : '#B45309',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#6366F1',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  helpText: {
    fontSize: 12,
    color: isDark ? '#6B7280' : '#9CA3AF',
    textAlign: 'center',
    maxWidth: 280,
  },
});

export default MapErrorBoundary;

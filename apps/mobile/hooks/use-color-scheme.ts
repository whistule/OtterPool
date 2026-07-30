import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * RN 0.83 (SDK 55) widened ColorSchemeName to include 'unspecified' alongside
 * 'light' | 'dark' | null. Callers do `Colors[scheme ?? 'light']` and Colors
 * only has light/dark keys, so 'unspecified' broke the index at ~24 sites.
 * Narrow once here rather than guarding each one — anything that isn't an
 * explicit dark preference is light, which is what `?? 'light'` already meant.
 */
export function useColorScheme(): 'light' | 'dark' {
  return useRNColorScheme() === 'dark' ? 'dark' : 'light';
}

/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const slateNavy = '#2a4560';
const burntOrange = '#b85530';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#f5f3ee',
    surface: '#ffffff',
    tint: slateNavy,
    icon: '#687076',
    tabIconDefault: '#9aa3ac',
    tabIconSelected: slateNavy,
    border: '#e3e1dc',
    muted: '#6b7178',
    accent: burntOrange,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    surface: '#1f2326',
    tint: '#ffffff',
    icon: '#9BA1A6',
    tabIconDefault: '#6c757d',
    tabIconSelected: '#ffffff',
    border: '#2a2f33',
    muted: '#9BA1A6',
    accent: burntOrange,
  },
};

export const OtterPalette = {
  slateNavy: '#2a4560',
  seaTeal: ['#00c8b4', '#0098a0', '#005a6e'],
  riverGreen: ['#58d048', '#28a030', '#0a5018'],
  pinkstonOrange: ['#d4703a', '#b85530', '#8a2e10'],
  lochPool: '#5a7080',
  burntOrange: '#b85530',
  ice: '#8a1a1a',
  forest: '#2c4a2e',
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

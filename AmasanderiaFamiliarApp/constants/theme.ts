/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#2563EB'; // Soft professional blue for interactive accents
const tintColorDark = '#60A5FA';

export const Colors = {
  light: {
    text: '#0F172A', // Deep slate for readability
    background: '#F8FAFC', // Very light, calm background
    card: '#FFFFFF',
    tint: tintColorLight,
    icon: '#334155', // Muted slate
    tabIconDefault: '#94A3B8',
    tabIconSelected: tintColorLight,
    success: '#14B8A6', // Teal for positive actions
    border: '#CBD5E1',
  },
  dark: {
    text: '#E2E8F0',
    background: '#0F172A',
    card: '#1E293B',
    tint: tintColorDark,
    icon: '#94A3B8',
    tabIconDefault: '#94A3B8',
    tabIconSelected: tintColorDark,
    success: '#2DD4BF',
    border: '#334155',
  },
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

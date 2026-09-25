import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/**
 * PrintSetu brand: neutral slate/white base, one confident accent
 * (indigo) reserved for primary actions — per the UI design direction in
 * the SRS brief. Everything else (surfaces, borders, secondary text)
 * stays neutral so the accent keeps its weight.
 */
export const printsetuTheme = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#eef2ff',
      100: '#e0e7ff',
      200: '#c7d2fe',
      300: '#a5b4fc',
      400: '#818cf8',
      500: '#6366f1',
      600: '#4f46e5',
      700: '#4338ca',
      800: '#3730a3',
      900: '#312e81',
      950: '#1e1b4b',
    },
    // The app's own dark surfaces (styles.scss) are slate/navy; Aura's default dark surface is neutral zinc.
    colorScheme: {
      dark: {
        surface: {
          0: '#ffffff',
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
      },
    },
  },
  components: {
    // Filled primary buttons keep the app's solid indigo + white text in dark mode too.
    // (Aura's dark default is a pale indigo with dark text, which clashed with the custom buttons.)
    button: {
      colorScheme: {
        // Aura's red.500 reads only 3.8:1 (white on red, or red on white); red.600 passes 4.5:1.
        light: {
          root: {
            danger: {
              background: '{red.600}',
              hoverBackground: '{red.700}',
              activeBackground: '{red.800}',
              borderColor: '{red.600}',
              hoverBorderColor: '{red.700}',
              activeBorderColor: '{red.800}',
            },
          },
          outlined: { danger: { color: '{red.600}' } },
          text: { danger: { color: '{red.600}' } },
        },
        dark: {
          root: {
            primary: {
              background: '{primary.600}',
              hoverBackground: '{primary.500}',
              activeBackground: '{primary.500}',
              borderColor: '{primary.600}',
              hoverBorderColor: '{primary.500}',
              activeBorderColor: '{primary.500}',
              color: '#ffffff',
              hoverColor: '#ffffff',
              activeColor: '#ffffff',
            },
          },
        },
      },
    },
  },
});

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
  },
});

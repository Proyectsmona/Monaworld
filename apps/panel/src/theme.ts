import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/**
 * Identidad de MonaWorld: rosa neón sobre negro violáceo.
 *
 * Los neutros no son grises puros: llevan sesgo hacia el morado del acento,
 * que es lo que hace que el conjunto se lea como elegido y no heredado.
 */
export const MonaWorldPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#fff0f9',
      100: '#ffd6ef',
      200: '#ffade0',
      300: '#ff85d0',
      400: '#ff5cc4',
      500: '#ff35b8',
      600: '#db1f9a',
      700: '#b3117c',
      800: '#8a0a5f',
      900: '#630543',
      950: '#3d0228',
    },
    colorScheme: {
      dark: {
        surface: {
          0: '#ffffff',
          50: '#f6f2fa',
          100: '#e9e0f1',
          200: '#cfc2d8',
          300: '#a18fb4',
          400: '#7a6a8c',
          500: '#574868',
          600: '#3f3350',
          700: '#2e2040',
          800: '#1d1428',
          900: '#150e1d',
          950: '#0b0711',
        },
        primary: {
          color: '#ff35b8',
          contrastColor: '#0b0711',
          hoverColor: '#ff5cc4',
          activeColor: '#db1f9a',
        },
        highlight: {
          background: 'rgba(255, 53, 184, 0.16)',
          focusBackground: 'rgba(255, 53, 184, 0.24)',
          color: '#ffffff',
          focusColor: '#ffffff',
        },
        content: {
          background: '#150e1d',
          hoverBackground: '#1d1428',
          borderColor: '#2e2040',
          color: '#f3eaf8',
        },
        overlay: {
          select: { background: '#150e1d', borderColor: '#2e2040', color: '#f3eaf8' },
          popover: { background: '#150e1d', borderColor: '#2e2040', color: '#f3eaf8' },
          modal: { background: '#150e1d', borderColor: '#2e2040', color: '#f3eaf8' },
        },
        formField: {
          background: '#0b0711',
          disabledBackground: '#1d1428',
          filledBackground: '#1d1428',
          borderColor: '#2e2040',
          hoverBorderColor: '#574868',
          focusBorderColor: '#ff35b8',
          color: '#f3eaf8',
          placeholderColor: '#7a6a8c',
        },
        text: {
          color: '#f3eaf8',
          hoverColor: '#ffffff',
          mutedColor: '#a18fb4',
          hoverMutedColor: '#cfc2d8',
        },
      },
    },
  },
  components: {
    button: {
      colorScheme: {
        dark: {
          root: {
            primary: {
              background: 'linear-gradient(90deg, #ff35b8, #a578ff)',
              hoverBackground: 'linear-gradient(90deg, #ff5cc4, #b98fff)',
              activeBackground: 'linear-gradient(90deg, #db1f9a, #8f5ce0)',
              borderColor: 'transparent',
              hoverBorderColor: 'transparent',
              activeBorderColor: 'transparent',
              color: '#ffffff',
              hoverColor: '#ffffff',
            },
          },
        },
      },
    },
  },
});

/** Fuerza el modo oscuro: la identidad del producto es neón sobre negro. */
export const themeOptions = { darkModeSelector: '.mw-dark' } as const;

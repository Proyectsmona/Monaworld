import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PrimeReactProvider } from '@primereact/core/config';
import { MonaWorldPreset, themeOptions } from './theme';
import { App } from './App';
import './styles.css';

/**
 * Licencia de PrimeUI, nivel community.
 *
 * Va en el código y no en una variable de entorno a propósito: es una clave
 * pública de cliente —viaja en el bundle que descarga cualquiera que abra el
 * panel— y esconderla en un `.env` daría una falsa sensación de secreto sin
 * ocultarla de nadie. Sin ella la librería escribe un aviso en consola.
 */
const PRIMEUI_LICENSE =
  'eyJpZCI6IjU4MTg2MjM2LTdkODctNDIxNS05YTM4LTM0NmM3MzE1MzVhYiIsInByb2R1Y3QiOiJwcmltZXVpIiwidGllciI6ImNvbW11bml0eSIsInR5cGUiOiJkZXYiLCJpYXQiOjE3ODY3MzQxNzMsImV4cCI6MTgxODI3MDE3M30.sdr2vAUzjK6vchBIaznPvA9Ok7bVtidmxuoOPc_Ca8-2LotsLzsPCBbO-dXAZq0w7Qwo1FaJIYMj79melNR3BQ';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrimeReactProvider
      theme={{ preset: MonaWorldPreset, options: themeOptions }}
      license={PRIMEUI_LICENSE}
      ripple
    >
      <App />
    </PrimeReactProvider>
  </StrictMode>,
);

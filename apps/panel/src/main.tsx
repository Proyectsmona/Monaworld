import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PrimeReactProvider } from '@primereact/core/config';
import { MonaWorldPreset, themeOptions } from './theme';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrimeReactProvider theme={{ preset: MonaWorldPreset, options: themeOptions }} ripple>
      <App />
    </PrimeReactProvider>
  </StrictMode>,
);

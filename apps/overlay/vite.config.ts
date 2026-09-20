import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({base:'/overlay/',plugins:[react()],build:{outDir:'../../public/overlay',emptyOutDir:false}});

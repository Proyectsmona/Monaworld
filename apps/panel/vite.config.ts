import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],build:{outDir:'../../public',emptyOutDir:true},server:{proxy:{'/api':'http://127.0.0.1:8787','/room':{target:'http://127.0.0.1:8787',ws:true},'/media':'http://127.0.0.1:8787'}}});

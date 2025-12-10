import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  server: {
    port: 5174,  // Different port from game client
    open: true,
    fs: {
      // Allow serving files from parent directory (client assets)
      allow: ['..']
    }
  },
  build: {
    outDir: 'dist'
  },
  resolve: {
    alias: {
      '@assets': path.resolve(__dirname, '../client/public/assets')
    }
  },
  // Serve client's public folder as the public directory for the level editor
  publicDir: path.resolve(__dirname, '../client/public')
});

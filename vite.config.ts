import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Fix: cast process to any to avoid type error if @types/node is missing or incorrect
  const cwd = (process as any).cwd();
  const env = loadEnv(mode, cwd, '');
  return {
    plugins: [react()],
    define: {
      // Polyfill process.env for the Google GenAI SDK and existing code usage
      'process.env': env
    }
  }
})
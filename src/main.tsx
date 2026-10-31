import './stagingAppCheckDebug.ts';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { FirebaseAuthGate } from './components/FirebaseAuthGate.tsx';
import './index.css';

// Register Service Worker for offline PWA functionality
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('ServiceWorker registration failed:', err);
    });
  });
}

createRoot(document.getElementById('root')!).render(<FirebaseAuthGate><App /></FirebaseAuthGate>);

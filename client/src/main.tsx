import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './lib/theme' // Initialize theme before render

// Ripple effect position tracking
document.addEventListener('pointerdown', (e) => {
  const target = (e.target as HTMLElement).closest('button');
  if (target) {
    const rect = target.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width * 100).toFixed(0);
    const y = ((e.clientY - rect.top) / rect.height * 100).toFixed(0);
    target.style.setProperty('--ripple-x', `${x}%`);
    target.style.setProperty('--ripple-y', `${y}%`);
  }
});

createRoot(document.getElementById('root')!).render(<App />)

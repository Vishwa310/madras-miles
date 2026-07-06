import { useState, useEffect } from 'react';

type Theme = 'light' | 'dark';

function getInitialTheme(): Theme {
  const stored = localStorage.getItem('mm_theme') as Theme | null;
  if (stored) return stored;
  return 'dark';
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('mm_theme', theme);
  }, [theme]);

  function toggleTheme() {
    setThemeState(prev => prev === 'dark' ? 'light' : 'dark');
  }

  return { theme, toggleTheme };
}

// Initialize theme on page load (before React renders)
const initial = getInitialTheme();
document.documentElement.setAttribute('data-theme', initial);

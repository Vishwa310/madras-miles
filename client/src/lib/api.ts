import { API_URL } from './config';

const API_BASE = `${API_URL}/api`;

// Global loading state
let activeRequests = 0;
function showLoader() {
  activeRequests++;
  const el = document.getElementById('global-loader');
  if (el) el.style.opacity = '1';
}
function hideLoader() {
  activeRequests = Math.max(0, activeRequests - 1);
  if (activeRequests === 0) {
    const el = document.getElementById('global-loader');
    if (el) el.style.opacity = '0';
  }
}

function getToken(): string | null {
  return localStorage.getItem('mm_token');
}

export function setToken(token: string) {
  localStorage.setItem('mm_token', token);
}

export function clearToken() {
  localStorage.removeItem('mm_token');
  localStorage.removeItem('mm_strava_user');
}

export function isLoggedIn(): boolean {
  return !!getToken() || !!localStorage.getItem('mm_strava_user');
}

export function getLocalUser(): any | null {
  const data = localStorage.getItem('mm_strava_user');
  if (data) return JSON.parse(data);
  return null;
}

async function request(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  showLoader();
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

    if (res.status === 401) {
      clearToken();
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }

    return res.json();
  } finally {
    hideLoader();
  }
}

export const api = {
  get: (path: string) => request(path),
  post: (path: string, body?: any) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path: string, body?: any) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path: string) => request(path, { method: 'DELETE' }),
};

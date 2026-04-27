// Central configuration for API and WebSocket URLs
// In development: Vite proxy handles /api/* and /ws/* → localhost:8000
// In production: VITE_API_URL points to HuggingFace Spaces backend

const DEFAULT_PROD_API_URL = 'https://ichimarugin2-affex-api.hf.space';
const RAW_API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? DEFAULT_PROD_API_URL : '');

// For fetch() calls: empty string in dev (uses proxy), full URL in prod
export const API_BASE = RAW_API_URL;

// For WebSocket: derive ws:// or wss:// from the API URL
export const WS_BASE = RAW_API_URL
  ? RAW_API_URL.replace('https://', 'wss://').replace('http://', 'ws://')
  : `ws://${window.location.hostname}:8000`;

/**
 * Helper to build an API URL. 
 * In dev, returns just the path so the Vite proxy picks it up.
 * In prod, returns the full URL.
 */
export const apiUrl = (path: string) => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${cleanPath}`;
};

/**
 * Helper to build a WebSocket URL.
 */
export const wsUrl = (path: string) => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${WS_BASE}${cleanPath}`;
};

/**
 * Standard headers for authenticated API requests
 */
export const authHeaders = () => {
  const token = localStorage.getItem('moodlearn_token');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
};

/**
 * Legacy helper for some components
 */
export const getHeaders = authHeaders;

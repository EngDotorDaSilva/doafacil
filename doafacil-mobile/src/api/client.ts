import axios from 'axios';
import { API_BASE_URL } from '../config';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // 60 segundos para operações que podem demorar (upload de imagens, criação de posts)
  headers: {
    'Content-Type': 'application/json'
  }
});

// Interceptor para logs de debug
api.interceptors.request.use(
  (config) => {
    console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`, config.data);
    return config;
  },
  (error) => {
    console.error('[API] Request error:', error);
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => {
    console.log(`[API] Response ${response.status} ${response.config.url}`, response.data);
    return response;
  },
  (error) => {
    console.error('[API] Response error:', {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
      code: error.code
    });
    return Promise.reject(error);
  }
);

export function setAuthToken(token: string | null) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}


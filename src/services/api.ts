import axios, { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { BASE_URL, ASSESSMENT_KEY } from '../config/constants';
import { getAccessToken, getRefreshToken, setAccessToken, setRefreshToken, clearTokens } from './storage';
import { replace } from '../navigation/RootNavigation';

// Queue to hold requests that failed with 401 while token refresh is in progress
interface FailedRequest {
  resolve: (token: string) => void;
  reject: (error: any) => void;
}

let isRefreshing = false;
let failedQueue: FailedRequest[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

export const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-Assessment-Key': ASSESSMENT_KEY,
  },
});

// Request Interceptor: Synchronously read and inject Access Token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Inject Authorization header except on login and refresh endpoints
    const isAuthRoute = config.url?.includes('/auth/login') || config.url?.includes('/auth/refresh');
    if (!isAuthRoute) {
      const token = getAccessToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor: Handle 401 Unauthorized using a Mutex to refresh tokens
api.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Guard: If the refresh call itself failed with 401, or if it has already been retried
    if (error.response?.status === 401 && originalRequest.url?.includes('/auth/refresh')) {
      clearTokens();
      replace('LoginScreen');
      return Promise.reject(error);
    }

    // Handle 401 errors for other requests
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // If a refresh is already in progress, queue the request
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(token => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch(err => {
            return Promise.reject(err);
          });
      }

      // Start the refresh cycle
      isRefreshing = true;
      const refreshToken = getRefreshToken();

      if (!refreshToken) {
        clearTokens();
        replace('LoginScreen');
        isRefreshing = false;
        return Promise.reject(error);
      }

      try {
        // Call POST /auth/refresh.
        // We make a direct request to avoid appending the invalid Authorization header via interceptors
        const response = await axios.post(`${BASE_URL}/auth/refresh`, {
          refreshToken,
        }, {
          headers: {
            'X-Assessment-Key': ASSESSMENT_KEY,
            'Content-Type': 'application/json',
          }
        });

        const { access_token, refreshToken: newRefreshToken } = response.data;

        // Save new credentials
        setAccessToken(access_token);
        setRefreshToken(newRefreshToken);

        // Process queue with the new access token
        processQueue(null, access_token);
        isRefreshing = false;

        // Replay original request
        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return api(originalRequest);
      } catch (refreshError: any) {
        processQueue(refreshError, null);
        isRefreshing = false;

        // Security Guardrail: If refresh returns 401 (e.g. spent/expired token), wipe storage & force logout
        if (refreshError.response?.status === 401) {
          clearTokens();
          replace('LoginScreen');
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

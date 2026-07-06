import axios from 'axios';

const API = axios.create({
    baseURL: 'http://localhost:8000/api/',
});

// ── Request interceptor ───────────────────────────────────────
API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    // ↑ Every time React makes an API call
    // we read the JWT token from localStorage
    // and attach it to the request header

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      // ↑ Django reads this header
      // and knows which user is making the request
      // Format: Authorization: Bearer eyJhbGci...
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor ──────────────────────────────────────
API.interceptors.response.use(
  (response) => response,
  // ↑ If response is successful just return it

  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      // ↑ 401 = token expired
      // Try to get a new access token using refresh token

      original._retry = true;
      // ↑ Prevent infinite retry loop

      try {
        const refresh = localStorage.getItem('refresh_token');
        const res = await axios.post(
          'http://localhost:8000/api/token/refresh/',
          { refresh }
        );

        localStorage.setItem('access_token', res.data.access);
        // ↑ Save new access token

        original.headers.Authorization = `Bearer ${res.data.access}`;
        return API(original);
        // ↑ Retry the original request with new token

      } catch (err) {
        // Refresh token also expired → force logout
        localStorage.clear();
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export default API;
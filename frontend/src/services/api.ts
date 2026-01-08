/// <reference types="vite/client" />
import axios, { AxiosError } from 'axios';
import type {
  ApiResponse,
  AuthResponse,
  Message,
  MessageStats,
  PaginatedResponse,
  MessageFilters,
  User,
  Complaint,
  ComplaintFilters,
  ComplaintPaginatedResponse,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiResponse>) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  requestMagicLink: async (email: string): Promise<ApiResponse> => {
    const response = await api.post<ApiResponse>('/auth/magic-link/request', { email });
    return response.data;
  },

  verifyMagicLink: async (token: string): Promise<ApiResponse<AuthResponse>> => {
    const response = await api.get<ApiResponse<AuthResponse>>('/auth/magic-link/verify', {
      params: { token },
    });
    if (response.data.data?.token) {
      localStorage.setItem('token', response.data.data.token);
    }
    return response.data;
  },

  logout: async (): Promise<ApiResponse> => {
    const response = await api.post<ApiResponse>('/auth/logout');
    localStorage.removeItem('token');
    return response.data;
  },

  getCurrentUser: async (): Promise<ApiResponse<User>> => {
    const response = await api.get<ApiResponse<User>>('/auth/me');
    return response.data;
  },

  refreshToken: async (): Promise<ApiResponse<{ token: string; expiresAt: string }>> => {
    const response = await api.post<ApiResponse<{ token: string; expiresAt: string }>>('/auth/refresh');
    if (response.data.data?.token) {
      localStorage.setItem('token', response.data.data.token);
    }
    return response.data;
  },
};

// Dashboard API
export const dashboardApi = {
  getMessages: async (
    filters: MessageFilters
  ): Promise<ApiResponse<PaginatedResponse<Message>>> => {
    const response = await api.get<ApiResponse<PaginatedResponse<Message>>>(
      '/dashboard/messages',
      { params: filters }
    );
    return response.data;
  },

  getMessage: async (id: string): Promise<ApiResponse<Message>> => {
    const response = await api.get<ApiResponse<Message>>(`/dashboard/messages/${id}`);
    return response.data;
  },

  getStats: async (period: 'day' | 'week' | 'month' = 'day'): Promise<ApiResponse<MessageStats>> => {
    const response = await api.get<ApiResponse<MessageStats>>('/dashboard/stats', {
      params: { period },
    });
    return response.data;
  },
};

// Complaints API
export const complaintsApi = {
  getComplaints: async (
    filters: ComplaintFilters
  ): Promise<ApiResponse<ComplaintPaginatedResponse>> => {
    const response = await api.get<ApiResponse<ComplaintPaginatedResponse>>(
      '/complaints',
      { params: filters }
    );
    return response.data;
  },

  getComplaint: async (id: string): Promise<ApiResponse<Complaint>> => {
    const response = await api.get<ApiResponse<Complaint>>(`/complaints/${id}`);
    return response.data;
  },

  updateStatus: async (
    id: string,
    status: Complaint['status']
  ): Promise<ApiResponse<Complaint>> => {
    const response = await api.patch<ApiResponse<Complaint>>(
      `/complaints/${id}/status`,
      { status }
    );
    return response.data;
  },

  assign: async (id: string, assignedTo: string): Promise<ApiResponse<Complaint>> => {
    const response = await api.post<ApiResponse<Complaint>>(
      `/complaints/${id}/assign`,
      { assignedTo }
    );
    return response.data;
  },

  addNotes: async (id: string, notes: string): Promise<ApiResponse<Complaint>> => {
    const response = await api.post<ApiResponse<Complaint>>(
      `/complaints/${id}/notes`,
      { notes }
    );
    return response.data;
  },

  escalate: async (id: string): Promise<ApiResponse<{ complaint: Complaint; ticket: unknown }>> => {
    const response = await api.post<ApiResponse<{ complaint: Complaint; ticket: unknown }>>(
      `/complaints/${id}/escalate`
    );
    return response.data;
  },

  resolve: async (id: string, resolution?: string): Promise<ApiResponse<Complaint>> => {
    const response = await api.post<ApiResponse<Complaint>>(
      `/complaints/${id}/resolve`,
      { resolution }
    );
    return response.data;
  },

  getStats: async (): Promise<ApiResponse<{
    total: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    byType: Record<string, number>;
    avgResolutionTimeHours: number;
  }>> => {
    const response = await api.get<ApiResponse<{
      total: number;
      byStatus: Record<string, number>;
      byPriority: Record<string, number>;
      byType: Record<string, number>;
      avgResolutionTimeHours: number;
    }>>('/complaints/stats');
    return response.data;
  },
};

// Health API
export const healthApi = {
  check: async (): Promise<ApiResponse<{ status: string }>> => {
    const response = await api.get<ApiResponse<{ status: string }>>('/health');
    return response.data;
  },
};

export default api;

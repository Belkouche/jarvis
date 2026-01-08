// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  messages: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// User types
export interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'admin' | 'bo_team' | 'viewer';
  lastLoginAt?: string;
  createdAt?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
  expiresAt: string;
}

// Message types
export interface Message {
  id: string;
  phone: string;
  contractorName: string | null;
  rawMessage: string;
  language: string;
  intent: string;
  contractNumber: string | null;
  isValidFormat: boolean | null;
  isSpam: boolean | null;
  lmLatency: number | null;
  crmLatency: number | null;
  totalLatency: number;
  crmStatus: CRMStatus | null;
  crmFromCache: boolean;
  responseSent: string | null;
  templateUsed: string | null;
  isComplaint: boolean;
  complaintType: string | null;
  usedFallback: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CRMStatus {
  contract_id: string;
  etat: string;
  sous_etat: string | null;
  sous_etat_2: string | null;
  date_rdv: string | null;
  technicien: string | null;
  date_created: string | null;
}

// Stats types
export interface MessageStats {
  period: string;
  totalMessages: number;
  successMessages: number;
  errorMessages: number;
  successRate: number;
  openComplaints: number;
  avgResponseTime: number;
  avgLmLatency: number;
  avgCrmLatency: number;
  cacheHitRate: number;
  fallbackCount: number;
  fallbackRate: number;
  byIntent: {
    contract_status: number;
    complaint: number;
    greeting: number;
    other: number;
  };
}

// Complaint types
export interface Complaint {
  id: string;
  phone: string;
  contractorName: string | null;
  contractNumber: string;
  complaintType: string;
  description: string | null;
  status: 'open' | 'assigned' | 'escalated' | 'resolved';
  priority: 'low' | 'medium' | 'high';
  assignedTo: string | null;
  assignedToUser?: {
    id: string;
    name: string | null;
    email: string;
  };
  escalatedToOrange: boolean;
  orangeTicketId: string | null;
  notes: string | null;
  messageId: string | null;
  tickets?: Ticket[];
  createdAt: string;
  updatedAt: string;
}

export interface Ticket {
  id: string;
  orangeTicketId: string | null;
  status: string;
  priority: string;
  createdAt: string;
}

export interface ComplaintPaginatedResponse {
  complaints: Complaint[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Filter types
export interface MessageFilters {
  page?: number;
  limit?: number;
  search?: string;
  intent?: string;
  language?: string;
  hasError?: boolean;
  isComplaint?: boolean;
  dateFrom?: string;
  dateTo?: string;
}

export interface ComplaintFilters {
  page?: number;
  limit?: number;
  status?: 'open' | 'assigned' | 'escalated' | 'resolved';
  priority?: 'low' | 'medium' | 'high';
  assignedTo?: string | null;
  phone?: string;
  contractNumber?: string;
}

// Language codes supported by JARVIS
export type LanguageCode = 'fr' | 'ar' | 'dar' | 'en';

// Intent types for message classification
export type MessageIntent = 'status_check' | 'complaint' | 'other';

// Complaint types dropdown
export type ComplaintType =
  | 'Retard installation'
  | 'Annulation contrat'
  | 'Contact errone'
  | 'Adresse erronee'
  | 'Cas bloque'
  | 'Deuxieme contrat'
  | 'Prise de RDV'
  | 'Autre';

// Complaint status
export type ComplaintStatus = 'open' | 'assigned' | 'escalated' | 'resolved';

// Ticket status for Orange escalation
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

// Priority levels
export type Priority = 'low' | 'medium' | 'high' | 'critical';

// User roles for admin dashboard
export type UserRole = 'admin' | 'bo_team' | 'viewer';

// Audit event types
export type AuditEventType =
  | 'admin_login'
  | 'admin_logout'
  | 'complaint_created'
  | 'complaint_updated'
  | 'complaint_assigned'
  | 'ticket_escalated'
  | 'ticket_updated'
  | 'export_generated'
  | 'message_processed';

// LM Studio analysis result
export interface LMAnalysisResult {
  language: LanguageCode;
  intent: MessageIntent;
  contract_number: string | null;
  is_valid_format: boolean;
  is_spam: boolean;
  confidence: number;
}

// CRM status from D2D Portal
export interface CRMStatus {
  contract_id: string;
  etat: string;
  sous_etat: string | null;
  sous_etat_2: string | null;
  date_created: string | null;
  seller_info?: {
    name: string;
    phone: string;
  };
}

// Message template for bilingual responses
export interface MessageTemplate {
  id: string;
  etat: string;
  sous_etat: string | null;
  sous_etat_2: string | null;
  fr: string;
  ar: string;
  allow_complaint: boolean;
}

// Incoming webhook message from Evolution API
export interface IncomingMessage {
  phone: string;
  message: string;
  timestamp: string;
  messageId: string;
}

// Processed message result
export interface ProcessedMessage {
  id: string;
  phone: string;
  contractor_name?: string;
  incoming_message: string;
  language_detected: LanguageCode;
  intent: MessageIntent;
  contract_number: string | null;
  is_valid_format: boolean;
  is_spam: boolean;
  lm_studio_latency: number;
  crm_lookup_latency: number | null;
  total_latency: number;
  crm_status: CRMStatus | null;
  response_message_fr: string;
  response_message_ar: string;
  has_complaint: boolean;
  complaint_type: ComplaintType | null;
  error_code: string | null;
  error_message: string | null;
  lm_studio_fallback: boolean;
}

// API response wrapper
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Pagination
export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

// Dashboard filter params
export interface MessageFilters {
  dateFrom?: string;
  dateTo?: string;
  status?: 'success' | 'error';
  contract?: string;
  phone?: string;
  hasComplaint?: boolean;
}

// Session data
export interface SessionData {
  id: string;
  email: string;
  role: UserRole;
  expiresAt: Date;
}

// JWT payload
export interface JWTPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

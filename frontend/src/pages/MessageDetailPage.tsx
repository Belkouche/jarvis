import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Loader2,
  Clock,
  MessageSquare,
  AlertCircle,
  CheckCircle,
  Database,
  Cpu,
  FileText,
} from 'lucide-react';
import { dashboardApi } from '../services/api';

const INTENT_LABELS: Record<string, string> = {
  contract_status: 'Contract Status Check',
  complaint: 'Complaint',
  greeting: 'Greeting',
  other: 'Other',
};

export default function MessageDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['message', id],
    queryFn: () => dashboardApi.getMessage(id!),
    enabled: !!id,
  });

  const message = data?.data;

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(dateString));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-orange-600 animate-spin" />
      </div>
    );
  }

  if (error || !message) {
    return (
      <div className="card p-8 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          Message not found
        </h2>
        <p className="text-gray-600 mb-4">
          The message you're looking for doesn't exist or has been deleted.
        </p>
        <Link to="/messages" className="btn-primary">
          Back to messages
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/messages"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Message Details</h1>
          <p className="text-gray-600">{message.phone}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Original message */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="w-5 h-5 text-gray-600" />
              <h2 className="text-lg font-semibold text-gray-900">
                Original Message
              </h2>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-gray-900 whitespace-pre-wrap">
                {message.rawMessage}
              </p>
            </div>
            <div className="flex items-center gap-4 mt-4 text-sm text-gray-500">
              <span>Language: {message.language === 'ar' ? 'Arabic' : 'French'}</span>
              <span>Intent: {INTENT_LABELS[message.intent] || message.intent}</span>
              {message.contractNumber && (
                <span>Contract: {message.contractNumber}</span>
              )}
            </div>
          </div>

          {/* Response sent */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-gray-600" />
              <h2 className="text-lg font-semibold text-gray-900">
                Response Sent
              </h2>
            </div>
            {message.responseSent ? (
              <div className="bg-orange-50 rounded-lg p-4 border border-orange-100">
                <p className="text-gray-900 whitespace-pre-wrap">
                  {message.responseSent}
                </p>
              </div>
            ) : (
              <p className="text-gray-500 italic">No response was sent</p>
            )}
            {message.templateUsed && (
              <p className="text-sm text-gray-500 mt-4">
                Template used: <code className="bg-gray-100 px-2 py-1 rounded">{message.templateUsed}</code>
              </p>
            )}
          </div>

          {/* CRM Data */}
          {message.crmStatus && (
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Database className="w-5 h-5 text-gray-600" />
                <h2 className="text-lg font-semibold text-gray-900">
                  CRM Lookup Result
                </h2>
                {message.crmFromCache && (
                  <span className="badge-info text-xs">From Cache</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Status (Etat)</p>
                  <p className="font-medium text-gray-900">
                    {message.crmStatus.etat || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Sub-status (Sous-etat)</p>
                  <p className="font-medium text-gray-900">
                    {message.crmStatus.sous_etat || 'N/A'}
                  </p>
                </div>
                {message.crmStatus.date_rdv && (
                  <div>
                    <p className="text-sm text-gray-500">Appointment Date</p>
                    <p className="font-medium text-gray-900">
                      {message.crmStatus.date_rdv}
                    </p>
                  </div>
                )}
                {message.crmStatus.technicien && (
                  <div>
                    <p className="text-sm text-gray-500">Technician</p>
                    <p className="font-medium text-gray-900">
                      {message.crmStatus.technicien}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error details */}
          {message.errorMessage && (
            <div className="card p-6 border-red-200 bg-red-50">
              <div className="flex items-center gap-2 mb-4">
                <AlertCircle className="w-5 h-5 text-red-600" />
                <h2 className="text-lg font-semibold text-red-900">
                  Error Details
                </h2>
              </div>
              <p className="text-red-800">{message.errorMessage}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status */}
          <div className="card p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-3">Status</h3>
            <div className="flex items-center gap-2">
              {message.errorMessage ? (
                <>
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <span className="font-medium text-red-600">Error</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="font-medium text-green-600">Sent</span>
                </>
              )}
            </div>
          </div>

          {/* Timestamp */}
          <div className="card p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-3">
              Received At
            </h3>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-400" />
              <span className="text-gray-900">{formatDate(message.createdAt)}</span>
            </div>
          </div>

          {/* Performance metrics */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Cpu className="w-5 h-5 text-gray-600" />
              <h3 className="text-sm font-medium text-gray-600">Performance</h3>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">LM Studio</span>
                  <span className="font-medium">{message.lmLatency || 0}ms</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-500 rounded-full"
                    style={{
                      width: `${Math.min((message.lmLatency || 0) / 100, 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">CRM Lookup</span>
                  <span className="font-medium">{message.crmLatency || 0}ms</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{
                      width: `${Math.min((message.crmLatency || 0) / 100, 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="pt-2 border-t border-gray-200">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total Latency</span>
                  <span className="font-bold text-gray-900">
                    {message.totalLatency}ms
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Flags */}
          <div className="card p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-3">Flags</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Complaint</span>
                <span
                  className={`badge ${
                    message.isComplaint ? 'badge-error' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {message.isComplaint ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Used Fallback</span>
                <span
                  className={`badge ${
                    message.usedFallback ? 'badge-warning' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {message.usedFallback ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">CRM Cached</span>
                <span
                  className={`badge ${
                    message.crmFromCache ? 'badge-success' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {message.crmFromCache ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

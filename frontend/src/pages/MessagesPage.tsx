import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquare,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { dashboardApi } from '../services/api';
import type { Message, MessageFilters } from '../types';

const INTENT_BADGES: Record<string, { label: string; className: string }> = {
  contract_status: { label: 'Contract Status', className: 'badge-info' },
  complaint: { label: 'Complaint', className: 'badge-error' },
  greeting: { label: 'Greeting', className: 'badge-success' },
  other: { label: 'Other', className: 'bg-gray-100 text-gray-800' },
};

const LANGUAGE_FLAGS: Record<string, string> = {
  fr: 'FR',
  ar: 'AR',
};

export default function MessagesPage() {
  const [filters, setFilters] = useState<MessageFilters>({
    page: 1,
    limit: 20,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['messages', filters],
    queryFn: () => dashboardApi.getMessages(filters),
    placeholderData: (previousData) => previousData,
  });

  const messages = data?.data?.messages || [];
  const pagination = data?.data?.pagination;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters((prev) => ({ ...prev, search: searchQuery, page: 1 }));
  };

  const handleFilterChange = (key: keyof MessageFilters, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value || undefined,
      page: 1,
    }));
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
          <p className="text-gray-600 mt-1">
            View and analyze WhatsApp message history
          </p>
        </div>
        {isFetching && !isLoading && (
          <Loader2 className="w-5 h-5 text-orange-600 animate-spin" />
        )}
      </div>

      {/* Search and filters */}
      <div className="card p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <form onSubmit={handleSearch} className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by phone number or message content..."
                className="input pl-10"
              />
            </div>
          </form>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`btn-outline ${showFilters ? 'bg-orange-50 border-orange-300' : ''}`}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-200">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Intent
              </label>
              <select
                className="input"
                value={filters.intent || ''}
                onChange={(e) => handleFilterChange('intent', e.target.value)}
              >
                <option value="">All intents</option>
                <option value="contract_status">Contract Status</option>
                <option value="complaint">Complaint</option>
                <option value="greeting">Greeting</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Language
              </label>
              <select
                className="input"
                value={filters.language || ''}
                onChange={(e) => handleFilterChange('language', e.target.value)}
              >
                <option value="">All languages</option>
                <option value="fr">French</option>
                <option value="ar">Arabic</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                className="input"
                value={filters.hasError !== undefined ? String(filters.hasError) : ''}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    hasError: e.target.value ? e.target.value === 'true' : undefined,
                    page: 1,
                  }))
                }
              >
                <option value="">All statuses</option>
                <option value="false">Successful</option>
                <option value="true">Has errors</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Complaints
              </label>
              <select
                className="input"
                value={filters.isComplaint !== undefined ? String(filters.isComplaint) : ''}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    isComplaint: e.target.value ? e.target.value === 'true' : undefined,
                    page: 1,
                  }))
                }
              >
                <option value="">All messages</option>
                <option value="true">Complaints only</option>
                <option value="false">Non-complaints</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Messages table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-orange-600 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <MessageSquare className="w-12 h-12 mb-2" />
            <p>No messages found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">
                    Phone / Time
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">
                    Message
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">
                    Intent
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">
                    Lang
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">
                    Latency
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {messages.map((message: Message) => (
                  <tr
                    key={message.id}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/messages/${message.id}`}
                        className="block"
                      >
                        <p className="font-medium text-gray-900">
                          {message.phone}
                        </p>
                        <p className="text-sm text-gray-500">
                          {formatDate(message.createdAt)}
                        </p>
                      </Link>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <Link
                        to={`/messages/${message.id}`}
                        className="block"
                      >
                        <p className="text-gray-900 truncate">
                          {message.rawMessage}
                        </p>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          INTENT_BADGES[message.intent]?.className || 'badge'
                        }
                      >
                        {INTENT_BADGES[message.intent]?.label || message.intent}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-gray-600">
                        {LANGUAGE_FLAGS[message.language] || message.language}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <Clock className="w-3 h-3" />
                        {message.totalLatency}ms
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {message.errorMessage ? (
                        <div className="flex items-center gap-1 text-red-600">
                          <AlertCircle className="w-4 h-4" />
                          <span className="text-sm">Error</span>
                        </div>
                      ) : (
                        <span className="badge-success">Sent</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
              {pagination.total} messages
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setFilters((prev) => ({ ...prev, page: prev.page! - 1 }))
                }
                disabled={pagination.page <= 1}
                className="btn-outline p-2 disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() =>
                  setFilters((prev) => ({ ...prev, page: prev.page! + 1 }))
                }
                disabled={pagination.page >= pagination.totalPages}
                className="btn-outline p-2 disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
  Clock,
  User,
  ExternalLink,
} from 'lucide-react';
import { complaintsApi } from '../services/api';
import type { Complaint, ComplaintFilters } from '../types';

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-yellow-100 text-yellow-800' },
  assigned: { label: 'Assigned', className: 'bg-blue-100 text-blue-800' },
  escalated: { label: 'Escalated', className: 'bg-red-100 text-red-800' },
  resolved: { label: 'Resolved', className: 'bg-green-100 text-green-800' },
};

const PRIORITY_BADGES: Record<string, { label: string; className: string }> = {
  high: { label: 'High', className: 'bg-red-100 text-red-800' },
  medium: { label: 'Medium', className: 'bg-yellow-100 text-yellow-800' },
  low: { label: 'Low', className: 'bg-green-100 text-green-800' },
};

const TYPE_LABELS: Record<string, string> = {
  delay: 'Delay',
  quality: 'Quality',
  service: 'Service',
  billing: 'Billing',
  general: 'General',
};

export default function ComplaintsPage() {
  const [filters, setFilters] = useState<ComplaintFilters>({
    page: 1,
    limit: 20,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['complaints', filters],
    queryFn: () => complaintsApi.getComplaints(filters),
    placeholderData: (previousData) => previousData,
  });

  const complaints = data?.data?.complaints || [];
  const pagination = data?.data?.pagination;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters((prev) => ({
      ...prev,
      phone: searchQuery || undefined,
      contractNumber: searchQuery || undefined,
      page: 1,
    }));
  };

  const getAgeLabel = (dateString: string) => {
    const hours = (Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${Math.floor(hours)}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Complaints</h1>
          <p className="text-gray-600 mt-1">
            Manage and track customer complaints
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
                placeholder="Search by phone or contract number..."
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-200">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                className="input"
                value={filters.status || ''}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    status: (e.target.value as ComplaintFilters['status']) || undefined,
                    page: 1,
                  }))
                }
              >
                <option value="">All statuses</option>
                <option value="open">Open</option>
                <option value="assigned">Assigned</option>
                <option value="escalated">Escalated</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Priority
              </label>
              <select
                className="input"
                value={filters.priority || ''}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    priority: (e.target.value as ComplaintFilters['priority']) || undefined,
                    page: 1,
                  }))
                }
              >
                <option value="">All priorities</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assignment
              </label>
              <select
                className="input"
                value={filters.assignedTo === null ? 'unassigned' : filters.assignedTo || ''}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    assignedTo:
                      e.target.value === 'unassigned'
                        ? null
                        : e.target.value || undefined,
                    page: 1,
                  }))
                }
              >
                <option value="">All</option>
                <option value="unassigned">Unassigned</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Complaints table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-orange-600 animate-spin" />
          </div>
        ) : complaints.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <AlertTriangle className="w-12 h-12 mb-2" />
            <p>No complaints found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">
                    Contract / Phone
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">
                    Type
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">
                    Priority
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">
                    Assigned To
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">
                    Age
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {complaints.map((complaint: Complaint) => (
                  <tr key={complaint.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">
                        {complaint.contractNumber}
                      </p>
                      <p className="text-sm text-gray-500">{complaint.phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-900">
                        {TYPE_LABELS[complaint.complaintType] || complaint.complaintType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          PRIORITY_BADGES[complaint.priority]?.className || ''
                        }`}
                      >
                        {PRIORITY_BADGES[complaint.priority]?.label || complaint.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          STATUS_BADGES[complaint.status]?.className || ''
                        }`}
                      >
                        {STATUS_BADGES[complaint.status]?.label || complaint.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {complaint.assignedToUser ? (
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-900">
                            {complaint.assignedToUser.name || complaint.assignedToUser.email}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <Clock className="w-3 h-3" />
                        {getAgeLabel(complaint.createdAt)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/complaints/${complaint.id}`}
                        className="text-orange-600 hover:text-orange-700 flex items-center gap-1"
                      >
                        View
                        <ExternalLink className="w-3 h-3" />
                      </Link>
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
              {pagination.total} complaints
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setFilters((prev) => ({ ...prev, page: (prev.page || 1) - 1 }))
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
                  setFilters((prev) => ({ ...prev, page: (prev.page || 1) + 1 }))
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

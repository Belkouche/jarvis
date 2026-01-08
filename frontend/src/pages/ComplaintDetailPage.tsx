import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Clock,
  User,
  MessageSquare,
  ExternalLink,
  Send,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { complaintsApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';

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

export default function ComplaintDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [notes, setNotes] = useState('');
  const [resolution, setResolution] = useState('');
  const [showResolveForm, setShowResolveForm] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['complaint', id],
    queryFn: () => complaintsApi.getComplaint(id!),
    enabled: !!id,
  });

  const addNotesMutation = useMutation({
    mutationFn: (notes: string) => complaintsApi.addNotes(id!, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complaint', id] });
      setNotes('');
    },
  });

  const assignMutation = useMutation({
    mutationFn: (userId: string) => complaintsApi.assign(id!, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complaint', id] });
    },
  });

  const escalateMutation = useMutation({
    mutationFn: () => complaintsApi.escalate(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complaint', id] });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (resolution: string) => complaintsApi.resolve(id!, resolution),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complaint', id] });
      setShowResolveForm(false);
      setResolution('');
    },
  });

  const complaint = data?.data;

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateString));
  };

  const getAgeHours = (dateString: string) => {
    return Math.round((Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-orange-600 animate-spin" />
      </div>
    );
  }

  if (error || !complaint) {
    return (
      <div className="card p-8 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          Complaint not found
        </h2>
        <Link to="/complaints" className="btn-primary">
          Back to complaints
        </Link>
      </div>
    );
  }

  const isAdmin = user?.role === 'admin';
  const canEdit = user?.role === 'admin' || user?.role === 'bo_team';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/complaints"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Complaint #{complaint.id.slice(0, 8)}
            </h1>
            <p className="text-gray-600">{complaint.contractNumber}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              PRIORITY_BADGES[complaint.priority]?.className || ''
            }`}
          >
            {PRIORITY_BADGES[complaint.priority]?.label || complaint.priority}
          </span>
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              STATUS_BADGES[complaint.status]?.className || ''
            }`}
          >
            {STATUS_BADGES[complaint.status]?.label || complaint.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Complaint details */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Contract Number</p>
                <p className="font-medium text-gray-900">{complaint.contractNumber}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Phone</p>
                <p className="font-medium text-gray-900">{complaint.phone}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Contractor Name</p>
                <p className="font-medium text-gray-900">
                  {complaint.contractorName || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Complaint Type</p>
                <p className="font-medium text-gray-900 capitalize">
                  {complaint.complaintType}
                </p>
              </div>
            </div>

            {complaint.description && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-500 mb-2">Description</p>
                <p className="text-gray-900 whitespace-pre-wrap">
                  {complaint.description}
                </p>
              </div>
            )}
          </div>

          {/* Notes section */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="w-5 h-5 text-gray-600" />
              <h2 className="text-lg font-semibold text-gray-900">Notes</h2>
            </div>

            {complaint.notes ? (
              <div className="bg-gray-50 rounded-lg p-4 mb-4 max-h-64 overflow-y-auto">
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
                  {complaint.notes}
                </pre>
              </div>
            ) : (
              <p className="text-gray-500 italic mb-4">No notes yet</p>
            )}

            {canEdit && complaint.status !== 'resolved' && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add a note..."
                  className="input flex-1"
                />
                <button
                  onClick={() => addNotesMutation.mutate(notes)}
                  disabled={!notes || addNotesMutation.isPending}
                  className="btn-primary"
                >
                  {addNotesMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Orange ticket info */}
          {complaint.escalatedToOrange && (
            <div className="card p-6 border-orange-200 bg-orange-50">
              <div className="flex items-center gap-2 mb-4">
                <ExternalLink className="w-5 h-5 text-orange-600" />
                <h2 className="text-lg font-semibold text-orange-900">
                  Orange Ticket
                </h2>
              </div>
              <p className="text-orange-800">
                Ticket ID: <strong>{complaint.orangeTicketId || 'Pending'}</strong>
              </p>
              {complaint.tickets && complaint.tickets.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm text-orange-700">
                    Status: {complaint.tickets[0].status}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Resolve form */}
          {showResolveForm && (
            <div className="card p-6 border-green-200 bg-green-50">
              <h3 className="text-lg font-semibold text-green-900 mb-4">
                Resolve Complaint
              </h3>
              <textarea
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="Enter resolution details..."
                className="input w-full h-24 mb-4"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => resolveMutation.mutate(resolution)}
                  disabled={resolveMutation.isPending}
                  className="btn-primary bg-green-600 hover:bg-green-700"
                >
                  {resolveMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  )}
                  Confirm Resolution
                </button>
                <button
                  onClick={() => setShowResolveForm(false)}
                  className="btn-outline"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Timestamps */}
          <div className="card p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-3">Timeline</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">Created</p>
                  <p className="text-sm text-gray-900">{formatDate(complaint.createdAt)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">Age</p>
                  <p className="text-sm text-gray-900">{getAgeHours(complaint.createdAt)} hours</p>
                </div>
              </div>
            </div>
          </div>

          {/* Assignment */}
          <div className="card p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-3">Assignment</h3>
            {complaint.assignedToUser ? (
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900">
                    {complaint.assignedToUser.name || complaint.assignedToUser.email}
                  </p>
                  <p className="text-xs text-gray-500">
                    {complaint.assignedToUser.email}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 italic">Unassigned</p>
            )}

            {isAdmin && !complaint.assignedTo && complaint.status !== 'resolved' && (
              <button
                onClick={() => assignMutation.mutate(user!.id)}
                disabled={assignMutation.isPending}
                className="btn-outline w-full mt-4"
              >
                {assignMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Assign to me'
                )}
              </button>
            )}
          </div>

          {/* Actions */}
          {canEdit && complaint.status !== 'resolved' && (
            <div className="card p-6">
              <h3 className="text-sm font-medium text-gray-600 mb-3">Actions</h3>
              <div className="space-y-2">
                {!complaint.escalatedToOrange && isAdmin && (
                  <button
                    onClick={() => escalateMutation.mutate()}
                    disabled={escalateMutation.isPending}
                    className="btn-outline w-full border-red-300 text-red-600 hover:bg-red-50"
                  >
                    {escalateMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 mr-2" />
                    )}
                    Escalate to Orange
                  </button>
                )}

                <button
                  onClick={() => setShowResolveForm(true)}
                  className="btn-primary w-full bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Resolve
                </button>
              </div>
            </div>
          )}

          {/* Related message */}
          {complaint.messageId && (
            <div className="card p-6">
              <h3 className="text-sm font-medium text-gray-600 mb-3">
                Related Message
              </h3>
              <Link
                to={`/messages/${complaint.messageId}`}
                className="text-orange-600 hover:text-orange-700 flex items-center gap-1"
              >
                View original message
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

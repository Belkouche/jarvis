import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from '../config/logger';
import { env } from '../config/env';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
  userRole?: string;
}

interface NotificationPayload {
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

let io: Server | null = null;

/**
 * Initialize WebSocket server
 */
export function initWebSocket(server: HttpServer): Server {
  io = new Server(server, {
    cors: {
      origin: env.CORS_ORIGINS?.split(',') || ['http://localhost:5173'],
      credentials: true,
    },
    path: '/ws',
  });

  // Authentication middleware
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as {
        userId: string;
        email: string;
        role: string;
      };

      socket.userId = decoded.userId;
      socket.userEmail = decoded.email;
      socket.userRole = decoded.role;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.info('WebSocket client connected', {
      socketId: socket.id,
      userId: socket.userId,
      email: socket.userEmail,
    });

    // Join role-based rooms
    if (socket.userRole) {
      socket.join(`role:${socket.userRole}`);
    }

    // Join user-specific room
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
    }

    // Join general authenticated users room
    socket.join('authenticated');

    socket.on('disconnect', () => {
      logger.info('WebSocket client disconnected', {
        socketId: socket.id,
        userId: socket.userId,
      });
    });

    // Handle client subscribing to specific complaint
    socket.on('subscribe:complaint', (complaintId: string) => {
      socket.join(`complaint:${complaintId}`);
      logger.debug('Client subscribed to complaint', {
        socketId: socket.id,
        complaintId,
      });
    });

    socket.on('unsubscribe:complaint', (complaintId: string) => {
      socket.leave(`complaint:${complaintId}`);
    });
  });

  logger.info('WebSocket server initialized');
  return io;
}

/**
 * Get the WebSocket server instance
 */
export function getIO(): Server | null {
  return io;
}

/**
 * Send notification to all authenticated users
 */
export function broadcastNotification(notification: NotificationPayload): void {
  if (!io) {
    logger.warn('WebSocket not initialized, cannot broadcast notification');
    return;
  }

  io.to('authenticated').emit('notification', notification);
  logger.debug('Broadcast notification sent', { type: notification.type });
}

/**
 * Send notification to users with specific role
 */
export function notifyRole(role: string, notification: NotificationPayload): void {
  if (!io) {
    logger.warn('WebSocket not initialized, cannot notify role');
    return;
  }

  io.to(`role:${role}`).emit('notification', notification);
  logger.debug('Role notification sent', { role, type: notification.type });
}

/**
 * Send notification to specific user
 */
export function notifyUser(userId: string, notification: NotificationPayload): void {
  if (!io) {
    logger.warn('WebSocket not initialized, cannot notify user');
    return;
  }

  io.to(`user:${userId}`).emit('notification', notification);
  logger.debug('User notification sent', { userId, type: notification.type });
}

/**
 * Send update to subscribers of a specific complaint
 */
export function notifyComplaintUpdate(
  complaintId: string,
  event: string,
  data: Record<string, unknown>
): void {
  if (!io) {
    logger.warn('WebSocket not initialized, cannot notify complaint update');
    return;
  }

  io.to(`complaint:${complaintId}`).emit('complaint:update', {
    complaintId,
    event,
    data,
    timestamp: new Date().toISOString(),
  });
  logger.debug('Complaint update sent', { complaintId, event });
}

// Pre-built notification helpers

/**
 * Notify about new complaint
 */
export function notifyNewComplaint(complaint: {
  id: string;
  contractNumber: string;
  priority: string;
  complaintType: string;
}): void {
  const notification: NotificationPayload = {
    type: 'new_complaint',
    title: 'Nouvelle réclamation',
    message: `Réclamation ${complaint.priority.toUpperCase()} - ${complaint.complaintType} pour contrat ${complaint.contractNumber}`,
    data: { complaintId: complaint.id },
    timestamp: new Date().toISOString(),
  };

  // Notify admins and BO team
  notifyRole('admin', notification);
  notifyRole('bo_team', notification);
}

/**
 * Notify about complaint assignment
 */
export function notifyComplaintAssignment(
  complaintId: string,
  assignedToUserId: string,
  contractNumber: string
): void {
  const notification: NotificationPayload = {
    type: 'complaint_assigned',
    title: 'Réclamation assignée',
    message: `La réclamation ${contractNumber} vous a été assignée`,
    data: { complaintId },
    timestamp: new Date().toISOString(),
  };

  notifyUser(assignedToUserId, notification);
  notifyComplaintUpdate(complaintId, 'assigned', { assignedTo: assignedToUserId });
}

/**
 * Notify about complaint escalation
 */
export function notifyComplaintEscalation(complaint: {
  id: string;
  contractNumber: string;
  orangeTicketId?: string | null;
}): void {
  const notification: NotificationPayload = {
    type: 'complaint_escalated',
    title: 'Réclamation escaladée',
    message: `La réclamation ${complaint.contractNumber} a été escaladée vers Orange`,
    data: {
      complaintId: complaint.id,
      orangeTicketId: complaint.orangeTicketId,
    },
    timestamp: new Date().toISOString(),
  };

  // Notify all admins about escalation
  notifyRole('admin', notification);
  notifyComplaintUpdate(complaint.id, 'escalated', {
    orangeTicketId: complaint.orangeTicketId,
  });
}

/**
 * Notify about complaint resolution
 */
export function notifyComplaintResolution(complaint: {
  id: string;
  contractNumber: string;
  resolution?: string;
}): void {
  const notification: NotificationPayload = {
    type: 'complaint_resolved',
    title: 'Réclamation résolue',
    message: `La réclamation ${complaint.contractNumber} a été résolue`,
    data: { complaintId: complaint.id },
    timestamp: new Date().toISOString(),
  };

  broadcastNotification(notification);
  notifyComplaintUpdate(complaint.id, 'resolved', {
    resolution: complaint.resolution,
  });
}

/**
 * Notify about new incoming message
 */
export function notifyNewMessage(message: {
  id: string;
  phone: string;
  hasComplaint: boolean;
  contractNumber?: string | null;
}): void {
  const notification: NotificationPayload = {
    type: 'new_message',
    title: 'Nouveau message',
    message: message.hasComplaint
      ? `Nouveau message avec réclamation de ${message.phone}`
      : `Nouveau message de ${message.phone}`,
    data: {
      messageId: message.id,
      hasComplaint: message.hasComplaint,
      contractNumber: message.contractNumber,
    },
    timestamp: new Date().toISOString(),
  };

  broadcastNotification(notification);
}

/**
 * Notify about system alerts
 */
export function notifySystemAlert(
  alertType: 'warning' | 'error' | 'info',
  title: string,
  message: string,
  data?: Record<string, unknown>
): void {
  const notification: NotificationPayload = {
    type: `system_${alertType}`,
    title,
    message,
    data,
    timestamp: new Date().toISOString(),
  };

  notifyRole('admin', notification);
}

export default {
  initWebSocket,
  getIO,
  broadcastNotification,
  notifyRole,
  notifyUser,
  notifyComplaintUpdate,
  notifyNewComplaint,
  notifyComplaintAssignment,
  notifyComplaintEscalation,
  notifyComplaintResolution,
  notifyNewMessage,
  notifySystemAlert,
};

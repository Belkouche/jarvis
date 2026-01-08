import { useEffect, useCallback, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
  read: boolean;
}

interface ComplaintUpdate {
  complaintId: string;
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  subscribeToComplaint: (complaintId: string) => void;
  unsubscribeFromComplaint: (complaintId: string) => void;
}

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000';

export function useWebSocket(): UseWebSocketReturn {
  const { token, isAuthenticated } = useAuthStore();
  const [isConnected, setIsConnected] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const socketRef = useRef<Socket | null>(null);

  // Calculate unread count
  const unreadCount = notifications.filter((n) => !n.read).length;

  // Connect to WebSocket when authenticated
  useEffect(() => {
    if (!isAuthenticated || !token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    // Create socket connection
    const socket = io(WS_URL, {
      path: '/ws',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      console.log('WebSocket connected');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error.message);
      setIsConnected(false);
    });

    // Handle notifications
    socket.on('notification', (notification: Omit<Notification, 'id' | 'read'>) => {
      const newNotification: Notification = {
        ...notification,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        read: false,
      };

      setNotifications((prev) => [newNotification, ...prev].slice(0, 50)); // Keep last 50

      // Show browser notification if supported
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.message,
          icon: '/jarvis-icon.png',
        });
      }
    });

    // Handle complaint updates
    socket.on('complaint:update', (update: ComplaintUpdate) => {
      // Create a notification for the update
      const updateNotification: Notification = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: `complaint_${update.event}`,
        title: `Mise à jour réclamation`,
        message: `Réclamation ${update.complaintId.slice(0, 8)} - ${update.event}`,
        data: { ...update.data, complaintId: update.complaintId },
        timestamp: update.timestamp,
        read: false,
      };

      setNotifications((prev) => [updateNotification, ...prev].slice(0, 50));
    });

    // Cleanup on unmount
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, token]);

  // Request browser notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Mark single notification as read
  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  // Clear all notifications
  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // Subscribe to complaint updates
  const subscribeToComplaint = useCallback((complaintId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe:complaint', complaintId);
    }
  }, []);

  // Unsubscribe from complaint updates
  const unsubscribeFromComplaint = useCallback((complaintId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('unsubscribe:complaint', complaintId);
    }
  }, []);

  return {
    isConnected,
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearNotifications,
    subscribeToComplaint,
    unsubscribeFromComplaint,
  };
}

export default useWebSocket;

import React, { createContext, useContext, useState } from "react";

export type Notification = {
  id: string;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
};

type NotificationContextType = {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (title: string, message: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
};

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: "1",
      title: "Welcome to SPETRO",
      message: "Get started by exploring our analysis modules.",
      timestamp: new Date(),
      read: false,
    }
  ]);

  const addNotification = (title: string, message: string) => {
    setNotifications((prev) => [
      {
        id: Math.random().toString(36).substr(2, 9),
        title,
        message,
        timestamp: new Date(),
        read: false,
      },
      ...prev,
    ]);
  };

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, addNotification, markAsRead, markAllAsRead }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}

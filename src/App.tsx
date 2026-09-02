import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { io, Socket } from 'socket.io-client';

// Pages
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { ContentListPage } from './pages/ContentListPage';
import { ContentFormPage } from './pages/ContentFormPage';
import { AIAssistantPage } from './pages/AIAssistantPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminPage } from './pages/AdminPage';

// Protected Layout Route Guard
const ProtectedLayout: React.FC = () => {
  const { user, loading, token } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [notification, setNotification] = useState<{ title: string; message: string; type: string } | null>(null);

  React.useEffect(() => {
    let socket: Socket | null = null;
    if (token) {
      // Connect to the backend with JWT for authentication
      const apiUrl = (import.meta as any).env?.VITE_API_URL || window.location.origin;
      socket = io(apiUrl, {
        auth: { token },
      });

      socket.on('ai_notification', (data) => {
        setNotification(data);
        // Auto-hide toast after 5 seconds
        setTimeout(() => setNotification(null), 5000);
      });

      socket.on('connect_error', (err) => {
        console.error('WebSocket connection error:', err.message);
      });
    }

    return () => {
      // Cleanup on unmount or token change
      if (socket) {
        socket.disconnect();
      }
    };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        Authenticating session...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
      />

      {notification && (
        <div className="fixed top-20 right-4 z-50 bg-emerald-900 border border-emerald-500 text-emerald-100 px-6 py-4 rounded shadow-lg animate-in fade-in slide-in-from-top-2 duration-300">
          <h4 className="font-bold">{notification.title}</h4>
          <p className="text-sm opacity-90">{notification.message}</p>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 gap-6">
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

        <main className="flex-1 min-w-0 overflow-y-auto">
          <Routes>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/content" element={<ContentListPage />} />
            <Route path="/content/new" element={<ContentFormPage />} />
            <Route path="/content/edit/:id" element={<ContentFormPage />} />
            <Route path="/ai-assistant" element={<AIAssistantPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route
              path="/admin"
              element={user.role === 'ADMIN' ? <AdminPage /> : <Navigate to="/dashboard" replace />}
            />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Protected Routes */}
          <Route path="/*" element={<ProtectedLayout />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

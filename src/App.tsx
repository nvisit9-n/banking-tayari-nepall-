import React, { useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Dashboard } from './components/Dashboard';
import { isOwnerAdmin } from './utils/sanitizer';

function AdminRouteHandler() {
  const { user, setActiveTab, addToast } = useApp();

  useEffect(() => {
    const checkAdminRoute = () => {
      const path = window.location.pathname.toLowerCase().replace(/\/+$/, '');
      const hash = window.location.hash.toLowerCase();
      const search = window.location.search.toLowerCase();
      
      const isAdminRoute = (
        path === '/admin' || 
        path.startsWith('/admin/') || 
        hash === '#admin' || 
        hash.startsWith('#admin/') ||
        search.includes('admin=true')
      );

      if (isAdminRoute) {
        if (!isOwnerAdmin(user?.email)) {
          // Strictly redirect unauthorized user or guest to Home (/)
          try {
            window.history.replaceState(null, '', '/');
          } catch {}
          setActiveTab('home');
          addToast('Unauthorized Access: प्रशासक ड्यासबोर्डमा पहुँच केवल आधिकारिक एप ओनरका लागि मात्र उपलब्ध छ।', 'error');
        } else {
          setActiveTab('admin');
        }
      }
    };

    checkAdminRoute();
    window.addEventListener('popstate', checkAdminRoute);
    window.addEventListener('hashchange', checkAdminRoute);
    return () => {
      window.removeEventListener('popstate', checkAdminRoute);
      window.removeEventListener('hashchange', checkAdminRoute);
    };
  }, [user?.email, setActiveTab, addToast]);

  return null;
}

export function App() {
  return (
    <AppProvider>
      <AdminRouteHandler />
      <Dashboard />
    </AppProvider>
  );
}

export default App;

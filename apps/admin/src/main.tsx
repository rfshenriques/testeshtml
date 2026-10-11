import React from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import { createQueryClient } from '@/lib/query';
import { useToken } from '@/lib/auth';
import { Toaster } from '@/lib/toast';
import { LoginGate } from '@/components/layout/LoginGate';
import { routes } from '@/routes';

const queryClient = createQueryClient();
const router = createBrowserRouter(routes);

function App() {
  const token = useToken();
  return (
    <QueryClientProvider client={queryClient}>
      {token ? <RouterProvider router={router} /> : <LoginGate />}
      <Toaster />
    </QueryClientProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

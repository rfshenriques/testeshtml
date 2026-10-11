import React from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import { createQueryClient } from '@/lib/query';
import { useToken } from '@/lib/auth';
import { Toaster } from '@/lib/toast';
import { AppShell } from '@/components/layout/AppShell';
import { LoginGate } from '@/components/layout/LoginGate';
import { DashboardPage } from '@/pages/Dashboard';
import { CampaignsPage } from '@/pages/campaigns/Campaigns';
import { CampaignDetailPage } from '@/pages/campaigns/CampaignDetail';
import { LeadsPage } from '@/pages/leads/Leads';
import { ReviewPage } from '@/pages/Review';
import { GeneratorPage } from '@/pages/Generator';
import { OutreachPage } from '@/pages/outreach/Outreach';
import { InboxPage } from '@/pages/Inbox';
import { PricingPage } from '@/pages/Pricing';
import { CompliancePage } from '@/pages/Compliance';
import { OpsPage } from '@/pages/Ops';

const queryClient = createQueryClient();

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'campaigns', element: <CampaignsPage /> },
      { path: 'campaigns/:id', element: <CampaignDetailPage /> },
      { path: 'leads', element: <LeadsPage /> },
      { path: 'leads/:id', element: <LeadsPage /> },
      { path: 'review', element: <ReviewPage /> },
      { path: 'generator', element: <GeneratorPage /> },
      { path: 'outreach', element: <OutreachPage /> },
      { path: 'inbox', element: <InboxPage /> },
      { path: 'pricing', element: <PricingPage /> },
      { path: 'compliance', element: <CompliancePage /> },
      { path: 'ops', element: <OpsPage /> },
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);

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

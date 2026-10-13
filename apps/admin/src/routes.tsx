import { Navigate, type RouteObject } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
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
import { StudioPage } from '@/pages/leads/Studio';
import { MeetingsPage } from '@/pages/Meetings';
import { SchedulingPage } from '@/pages/Scheduling';

export const routes: RouteObject[] = [
  { path: '/leads/:id/studio', element: <StudioPage /> },
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
      { path: 'meetings', element: <MeetingsPage /> },
      { path: 'scheduling', element: <SchedulingPage /> },
      { path: 'pricing', element: <PricingPage /> },
      { path: 'compliance', element: <CompliancePage /> },
      { path: 'ops', element: <OpsPage /> },
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
];

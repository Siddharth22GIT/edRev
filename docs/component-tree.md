# Component tree

```text
RootLayout
├── / (redirects to /dashboard)
└── (workspace)/WorkspaceLayout
    └── AppShell [client]
        ├── Sidebar [client]
        │   └── navigation links
        ├── Topbar
        └── route page
            ├── DashboardOverview
            ├── OpportunitiesScreen
            │   └── OpportunityDetailScreen
            │       └── BidDesk [client]
            │           ├── validated BidForm
            │           └── analyst bid review / allocation action
            ├── StudentsScreen
            │   ├── StudentDetailScreen
            │   └── StudentTierScreen
            ├── EarningsScreen
            ├── ProposalsScreen
            ├── SafeguardsScreen
            ├── AnalyticsScreen
            └── SettingsScreen
```

## Reusable UI

| Component | Purpose |
| --- | --- |
| `Button` | Consistent primary, secondary, and ghost actions. |
| `Card` | Bordered elevated content surface. |
| `Badge` / `StatusBadge` | Compact semantic metadata and status display. |
| `PageHeader` | Shared page title, description, and optional action. |
| `StatCard` | Summary metric display. |
| `DataTable` | Responsive overflow-safe table shell. |
| `ProgressBar` | Bounded visual progress indicator. |
| `EmptyState` | Reusable empty collection presentation. |

Screen components compose UI primitives and do not contain transport code. This keeps the future API client transition localized.

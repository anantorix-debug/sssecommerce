/** Every staff permission. Roles are bundles of these; "*" means all. */
export const PERMISSIONS = {
  'dashboard.view': 'See the dashboard and work queues',
  'catalog.read': 'View products, categories, rooms, collections and looks',
  'catalog.write': 'Create and edit catalogue items and prices',
  'media.write': 'Upload and edit media',
  'inventory.read': 'View stock levels and movements',
  'inventory.write': 'Receive and adjust stock, manage locations and pincodes',
  'orders.read': 'View orders',
  'orders.write': 'Confirm, process, ship and deliver orders',
  'orders.cancel': 'Cancel orders',
  'delivery.manage': 'Manage delivery slots and installation jobs',
  'cod.manage': 'Record cash collected on delivery',
  'returns.manage': 'Approve, inspect and close returns',
  'refunds.approve': 'Approve and process refunds',
  'customers.read': 'View customer details',
  'reviews.moderate': 'Approve, reject and reply to reviews',
  'coupons.manage': 'Create and edit coupons',
  'content.manage': 'Edit homepage, pages, menus and redirects',
  'invoices.read': 'View and download invoices',
  'reports.view': 'View reports',
  'reports.export': 'Export reports',
  'staff.manage': 'Invite staff and manage roles',
  'audit.view': 'View the audit log',
  'settings.manage': 'Change store settings',
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const SYSTEM_ROLES: { name: string; description: string; permissions: string[] }[] = [
  { name: 'Owner', description: 'Full access, including staff and settings', permissions: ['*'] },
  {
    name: 'Store admin',
    description: 'All operations and content',
    permissions: Object.keys(PERMISSIONS).filter((p) => p !== 'staff.manage' && p !== 'settings.manage'),
  },
  {
    name: 'Catalogue manager',
    description: 'Products, prices, media and stock visibility',
    permissions: ['dashboard.view', 'catalog.read', 'catalog.write', 'media.write', 'inventory.read'],
  },
  {
    name: 'Content editor',
    description: 'Homepage, pages, guides and media',
    permissions: ['dashboard.view', 'catalog.read', 'content.manage', 'media.write'],
  },
  {
    name: 'Inventory and warehouse',
    description: 'Stock, pincodes and dispatch',
    permissions: ['dashboard.view', 'catalog.read', 'inventory.read', 'inventory.write', 'orders.read', 'orders.write', 'delivery.manage'],
  },
  {
    name: 'Order operations',
    description: 'Orders, delivery, COD, cancellations and returns',
    permissions: [
      'dashboard.view', 'catalog.read', 'inventory.read', 'orders.read', 'orders.write', 'orders.cancel',
      'delivery.manage', 'cod.manage', 'returns.manage', 'customers.read', 'invoices.read',
    ],
  },
  {
    name: 'Finance',
    description: 'Payments, refunds, invoices and reports',
    permissions: ['dashboard.view', 'orders.read', 'refunds.approve', 'cod.manage', 'invoices.read', 'reports.view', 'reports.export'],
  },
  {
    name: 'Customer support',
    description: 'Customers, orders and returns',
    permissions: ['dashboard.view', 'catalog.read', 'orders.read', 'orders.cancel', 'returns.manage', 'customers.read', 'invoices.read'],
  },
  {
    name: 'Marketing',
    description: 'Coupons, reviews and content',
    permissions: ['dashboard.view', 'catalog.read', 'coupons.manage', 'reviews.moderate', 'content.manage', 'media.write'],
  },
  {
    name: 'Analyst',
    description: 'Read-only dashboards and reports',
    permissions: ['dashboard.view', 'catalog.read', 'inventory.read', 'reports.view'],
  },
];

export function hasPermission(granted: string[], needed: string) {
  return granted.includes('*') || granted.includes(needed);
}

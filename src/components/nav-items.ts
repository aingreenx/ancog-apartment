import type { NavItem } from "./app-nav";

const ICONS = {
  home: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  people:
    "M16 19v-1a4 4 0 00-4-4H6a4 4 0 00-4 4v1M9 10a3 3 0 100-6 3 3 0 000 6zM22 19v-1a4 4 0 00-3-3.87M16 4.13a3 3 0 010 5.75",
  book: "M4 4h12a4 4 0 014 4v12H8a4 4 0 01-4-4V4zM8 8h8M8 12h8M8 16h5",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7l1-8z",
  settings:
    "M12 15a3 3 0 100-6 3 3 0 000 6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4",
  bill: "M6 2h12v20l-3-2-3 2-3-2-3 2V2zM9 7h6M9 11h6M9 15h4",
  meter: "M12 21a9 9 0 110-18 9 9 0 010 18zM12 12l4-4M7 12h1M12 7v1",
  wallet: "M3 7h18v12H3zM3 7l3-4h12l3 4M16 13h2",
};

export const BELL_ICON = "M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0";

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: ICONS.home },
  { href: "/admin/tenants", label: "Tenants", icon: ICONS.people },
  { href: "/admin/ledger", label: "Ledger", icon: ICONS.book },
  { href: "/admin/rates", label: "Rates", icon: ICONS.bolt },
  { href: "/admin/settings", label: "Settings", icon: ICONS.settings },
];

export const PORTAL_NAV: NavItem[] = [
  { href: "/portal", label: "Home", icon: ICONS.home },
  { href: "/portal/bills", label: "Bills", icon: ICONS.bill },
  { href: "/portal/readings", label: "Readings", icon: ICONS.meter },
  { href: "/portal/payments", label: "Payments", icon: ICONS.wallet },
];

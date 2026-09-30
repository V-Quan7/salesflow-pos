import type { SVGProps } from 'react';

export type IconName = 'dashboard' | 'products' | 'categories' | 'inventory' | 'customers' | 'orders' | 'reports' | 'settings' | 'pos' | 'logout' | 'menu' | 'close' | 'search' | 'plus' | 'minus' | 'cart' | 'edit' | 'trash' | 'chevron' | 'store' | 'user' | 'receipt' | 'trend' | 'box' | 'check' | 'warning' | 'info' | 'calendar' | 'refund';

const paths: Record<IconName, string> = {
  dashboard: 'M3 3h8v8H3z M13 3h8v5h-8z M13 10h8v11h-8z M3 13h8v8H3z',
  products: 'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M3.3 7 12 12l8.7-5 M12 22V12',
  categories: 'M3 4h8v7H3z M13 4h8v7h-8z M3 13h8v7H3z M13 13h8v7h-8z',
  inventory: 'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M12 22V12 M3.3 7 12 12l8.7-5',
  customers: 'M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M20 8v6 M23 11h-6',
  orders: 'M8 2h8l4 4v16H4V2z M16 2v5h5 M8 12h8 M8 16h8',
  reports: 'M3 3v18h18 M8 15l4-4 3 3 6-7 M17 7h4v4',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-1.7 2.94-.08-.02a1.65 1.65 0 0 0-1.68.68l-.04.07h-3.4l-.04-.07a1.65 1.65 0 0 0-1.68-.68l-.08.02-1.7-2.94.06-.06A1.65 1.65 0 0 0 9.8 15l-.08-.03v-3.4l.08-.03a1.65 1.65 0 0 0-.33-1.82l-.06-.06 1.7-2.94.08.02a1.65 1.65 0 0 0 1.68-.68l.04-.07h3.4l.04.07a1.65 1.65 0 0 0 1.68.68l.08-.02 1.7 2.94-.06.06a1.65 1.65 0 0 0-.33 1.82l.08.03v3.4z',
  pos: 'M3 3h2l2.2 11.4A2 2 0 0 0 9.16 16H18a2 2 0 0 0 1.96-1.6L22 7H6 M10 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2 M18 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  menu: 'M4 6h16M4 12h16M4 18h16', close: 'M18 6 6 18M6 6l12 12',
  search: 'm21 21-4.35-4.35 M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  minus: 'M5 12h14', cart: 'M3 3h2l2.2 11.4A2 2 0 0 0 9.16 16H18a2 2 0 0 0 1.96-1.6L22 7H6 M10 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2 M18 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
  plus: 'M12 5v14 M5 12h14', edit: 'M12 20h9 M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z',
  trash: 'M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6 M10 11v5 M14 11v5',
  chevron: 'm9 18 6-6-6-6', store: 'M3 10h18 M5 10V21h14V10 M3 10l2-7h14l2 7 M9 21v-7h6v7',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  receipt: 'M4 2v20l4-2 4 2 4-2 4 2V2l-4 2-4-2-4 2z M8 9h8 M8 13h8',
  trend: 'M3 17l6-6 4 4 8-8 M15 7h6v6', box: 'M21 8 12 13 3 8 M12 22V13 M3.3 7 12 2l8.7 5v10L12 22l-8.7-5z',
  check: 'm5 12 4 4L19 6', warning: 'M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0z M12 9v4 M12 17h.01',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20 M12 16v-4 M12 8h.01',
  calendar: 'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2z M8 14h.01 M12 14h.01 M16 14h.01 M8 18h.01 M12 18h.01',
  refund: 'M3 11a9 9 0 0 1 15.4-6.4L21 7 M21 3v4h-4 M21 13a9 9 0 0 1-15.4 6.4L3 17 M3 21v-4h4',
};

export function Icon({ name, size = 18, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]} /></svg>;
}

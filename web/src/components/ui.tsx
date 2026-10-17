import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'glass';

/** Native semantics, with one shared set of interaction states. */
export function Button({ variant = 'secondary', size = 'regular', className = '', type = 'button', ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'regular' | 'small' }) {
  return <button type={type} className={`ui-button ui-button--${variant} ui-button--${size} ${className}`} {...props} />;
}

export function Surface({ className = '', children, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`ui-surface ${className}`} {...props}>{children}</section>;
}

export function PageHeader({ eyebrow, title, description, accessory }: {
  eyebrow: string; title: string; description: string; accessory?: ReactNode;
}) {
  return <header className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-description">{description}</p></div>{accessory}</header>;
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'positive' | 'warning'; children: ReactNode }) {
  return <span className={`ui-badge ui-badge--${tone}`}><span className="status-dot" aria-hidden="true" />{children}</span>;
}

export type IconName = 'video' | 'captions' | 'camera' | 'record' | 'chart' | 'sparkles' | 'arrow' | 'shield' | 'check' | 'download' | 'sun' | 'moon' | 'display';
const paths: Record<IconName, ReactNode> = {
  video: <><rect x="3" y="5" width="12" height="14" rx="4" /><path d="m15 9 6-3v12l-6-3" /></>,
  captions: <><rect x="3" y="4" width="18" height="16" rx="5" /><path d="M7 9h10M7 13h6M7 16h9" /></>,
  camera: <><path d="m8 5 1-2h6l1 2h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" /><circle cx="12" cy="12" r="4" /></>,
  record: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /></>,
  chart: <path d="M4 4v16h17M8 15l4-5 4 2 5-7" />,
  sparkles: <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4M18 4h4" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" /><path d="m8 12 3 3 5-6" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
  moon: <path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z" />,
  display: <><rect x="3" y="4" width="18" height="13" rx="3" /><path d="M8 21h8m-4-4v4" /></>,
};

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg className={`ui-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

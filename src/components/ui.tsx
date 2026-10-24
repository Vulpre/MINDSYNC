import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { faShieldHalved, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import type { ReviewStatus, SessionStatus } from '../types';

export function AppIcon({ icon, className }: { icon: IconDefinition; className?: string }) {
  return <FontAwesomeIcon icon={icon} className={className} aria-hidden="true" focusable="false" />;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  icon?: IconDefinition;
}

export function Button({ variant = 'secondary', icon, className = '', children, ...props }: ButtonProps) {
  return (
    <button className={`button button-${variant} ${className}`.trim()} {...props}>
      {icon && <AppIcon icon={icon} />}
      {children}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconDefinition; label: string }) {
  return (
    <button className={`icon-button ${className}`.trim()} aria-label={label} title={label} {...props}>
      <AppIcon icon={icon} />
    </button>
  );
}

const reviewLabels: Record<ReviewStatus, string> = {
  draft: 'Draft',
  awaiting_review: 'Awaiting expert review',
  approved_for_simulation: 'Approved for simulation',
};

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  return (
    <span className={`status-badge review-${status}`}>
      <span className="status-dot" aria-hidden="true" />
      {reviewLabels[status]}
    </span>
  );
}

const sessionLabels: Record<SessionStatus, string> = {
  active: 'In progress',
  paused: 'Paused',
  completed: 'Completed',
  ended_incomplete: 'Ended incomplete',
};

export function SessionBadge({ status }: { status: SessionStatus }) {
  return <span className={`status-badge session-${status}`}>{sessionLabels[status]}</span>;
}

export function SafetyNotice() {
  return (
    <div className="safety-notice" role="note">
      <AppIcon icon={faShieldHalved} />
      <span>Simulation prototype only — not for real-patient care. Follow instructor-approved protocols.</span>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: IconDefinition;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="empty-state">
      <div className="empty-icon"><AppIcon icon={icon} /></div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action && <div className="empty-action">{action}</div>}
    </section>
  );
}

export function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close dialog"><AppIcon icon={faXmark} /></button>
        <h2 id="modal-title">{title}</h2>
        {description && <p className="modal-description">{description}</p>}
        {children}
      </section>
    </div>
  );
}

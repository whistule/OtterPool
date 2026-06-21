import { supabase } from './supabase';

type AuditEntry = {
  actorId: string;
  targetType: 'profile' | 'event' | 'signup';
  targetId: string;
  action: string;
  // Omit values for sensitive data (e.g. medical notes) — log only the action.
  before?: string | null;
  after?: string | null;
};

// Best-effort admin audit logging for lower-risk actions. is_admin/status
// changes are logged server-side by a trigger instead. Failures are swallowed
// so a logging hiccup never blocks the actual admin action.
export async function logAdminAction(entry: AuditEntry): Promise<void> {
  const { error } = await supabase.from('admin_audit_log').insert({
    actor_id: entry.actorId,
    target_type: entry.targetType,
    target_id: entry.targetId,
    action: entry.action,
    before_val: entry.before ?? null,
    after_val: entry.after ?? null,
  });
  if (error) {
    console.warn('[audit] failed to log admin action', error.message);
  }
}

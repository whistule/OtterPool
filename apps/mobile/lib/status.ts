import { OtterPalette } from '@/constants/theme';

export type MemberStatus = 'active' | 'aspirant' | 'lapsed' | 'suspended';

export const MEMBER_STATUS_COLOR: Record<MemberStatus, string> = {
  active: OtterPalette.forest,
  aspirant: OtterPalette.lochPool,
  lapsed: OtterPalette.burntOrange,
  suspended: OtterPalette.ice,
};

export type SignupStatus =
  | 'confirmed'
  | 'pending_payment'
  | 'pending_review'
  | 'waitlisted'
  | 'declined'
  | 'withdrawn';

type SignupStatusInfo = {
  label: string;
  shortLabel: string;
  color: string;
};

export const SIGNUP_STATUS: Record<SignupStatus, SignupStatusInfo> = {
  confirmed: { label: '✅ Confirmed', shortLabel: 'Confirmed', color: OtterPalette.forest },
  pending_payment: {
    label: '💳 Awaiting payment',
    shortLabel: 'Awaiting payment',
    color: OtterPalette.burntOrange,
  },
  pending_review: {
    label: '⚠️ Pending leader review',
    shortLabel: 'Pending review',
    color: OtterPalette.burntOrange,
  },
  waitlisted: { label: '⏳ On waitlist', shortLabel: 'Waitlist', color: OtterPalette.lochPool },
  declined: { label: '✖️ Declined', shortLabel: 'Declined', color: OtterPalette.ice },
  withdrawn: { label: '↩️ Withdrawn', shortLabel: 'Withdrawn', color: OtterPalette.lochPool },
};

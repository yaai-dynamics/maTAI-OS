'use client';

import { useRouter } from 'next/navigation';

import { Select } from '@/components/shared/ActionForm';

const OPTIONS = [
  { value: '', label: 'Choose account type' },
  { value: 'government', label: 'Tourism Department' },
  { value: 'partner', label: 'Tourism Partner' },
  { value: 'creator', label: 'Creator' },
] as const;

/**
 * Picks which interface's copy and demo accounts the sign-in card shows.
 * It never gates the actual sign-in — the account's own kind decides that —
 * it only narrows what this page displays before you type a password.
 */
export function AccountTypeSelect({ value, next }: { value: string; next?: string }) {
  const router = useRouter();

  const onChange = (as: string) => {
    const params = new URLSearchParams();
    if (as) params.set('as', as);
    if (next) params.set('next', next);
    const query = params.toString();
    router.push(query ? `/login?${query}` : '/login');
  };

  return (
    <Select
      aria-label="Account type"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}

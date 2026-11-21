interface RoleBadgeProps {
  role: string;
}

const STYLES: Record<string, string> = {
  admin: 'bg-red-100 text-red-800',
  sre: 'bg-blue-100 text-blue-800',
  developer: 'bg-gray-100 text-gray-800',
};

export function RoleBadge({ role }: RoleBadgeProps) {
  return (
    <span
      className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${STYLES[role] || 'bg-gray-100 text-gray-800'}`}
    >
      {role || 'unknown'}
    </span>
  );
}

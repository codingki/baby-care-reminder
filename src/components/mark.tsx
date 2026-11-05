export function Mark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="10" fill="#5f7f6c" />
      <path
        d="M16 7.5c.2 0 .4.2.7.7 1.2 2.2 4.8 8.2 4.8 11.2a5.5 5.5 0 0 1-11 0c0-3 3.6-9 4.8-11.2.3-.5.5-.7.7-.7Z"
        fill="#ffffff"
      />
    </svg>
  );
}

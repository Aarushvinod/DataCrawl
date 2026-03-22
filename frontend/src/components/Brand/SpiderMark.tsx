interface SpiderMarkProps {
  className?: string;
}

export default function SpiderMark({ className = '' }: SpiderMarkProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      role="presentation"
    >
      <path d="M29 19L14 11L16.5 8.6L32 16.8Z" fill="currentColor" />
      <path d="M28.5 24L9.5 21.5L10.5 18.7L31.2 20.6Z" fill="currentColor" />
      <path d="M28.6 28.4L11.2 36.3L10.2 33.6L30.7 24.9Z" fill="currentColor" />
      <path d="M29.5 31.2L18.7 49.8L15.9 47.9L31.8 27.8Z" fill="currentColor" />
      <path d="M35 19L50 11L47.5 8.6L32 16.8Z" fill="currentColor" />
      <path d="M35.5 24L54.5 21.5L53.5 18.7L32.8 20.6Z" fill="currentColor" />
      <path d="M35.4 28.4L52.8 36.3L53.8 33.6L33.3 24.9Z" fill="currentColor" />
      <path d="M34.5 31.2L45.3 49.8L48.1 47.9L32.2 27.8Z" fill="currentColor" />
      <path d="M32 27C24.8 27 20.1 35.1 20.1 43.1C20.1 50.5 24.6 56.8 32 60.4C39.4 56.8 43.9 50.5 43.9 43.1C43.9 35.1 39.2 27 32 27Z" fill="currentColor" />
      <ellipse cx="32" cy="19" rx="7.6" ry="6.1" fill="currentColor" />
    </svg>
  );
}

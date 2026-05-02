interface ConcordLogoProps {
  size?: number;
  showText?: boolean;
}

export default function ConcordLogo({ size = 28, showText = true }: ConcordLogoProps) {
  return (
    <div className="flex items-center gap-2.5">
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Left arc — initiator */}
        <path
          d="M13 6 C6 6 2 10.5 2 16 C2 21.5 6 26 13 26"
          stroke="#ff453a"
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
          opacity="0.85"
        />
        {/* Right arc — counterparty */}
        <path
          d="M19 6 C26 6 30 10.5 30 16 C30 21.5 26 26 19 26"
          stroke="#30d158"
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
          opacity="0.85"
        />
        {/* Center lock body */}
        <rect
          x="12"
          y="14.5"
          width="8"
          height="6"
          rx="1.5"
          fill="#0a84ff"
          opacity="0.9"
        />
        {/* Lock shackle */}
        <path
          d="M13.5 14.5 V12.5 C13.5 10.8 18.5 10.8 18.5 12.5 V14.5"
          stroke="#0a84ff"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
          opacity="0.9"
        />
        {/* Keyhole */}
        <circle cx="16" cy="17.2" r="1" fill="black" opacity="0.6" />
        <rect x="15.4" y="17.2" width="1.2" height="1.8" rx="0.4" fill="black" opacity="0.6" />
      </svg>

      {showText && (
        <span className="text-[15px] font-semibold tracking-tight text-foreground sf-headline">
          Concord
        </span>
      )}
    </div>
  );
}


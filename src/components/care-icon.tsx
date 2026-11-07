import {
  Baby,
  Beaker,
  Bell,
  BellRing,
  Calendar,
  Clock,
  House,
  Languages,
  LogOut,
  Settings,
  Snowflake,
  Timer,
  Users,
  X,
} from "lucide-react";

export type CareIconName =
  | "diaper"
  | "feed"
  | "pump"
  | "chiller"
  | "home"
  | "schedule"
  | "family"
  | "bell"
  | "baby"
  | "language"
  | "timer"
  | "clock"
  | "beaker"
  | "bellRing"
  | "logOut"
  | "close"
  | "settings";

export function SectionHeading({
  icon,
  children,
}: {
  icon: CareIconName;
  children: React.ReactNode;
}) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold">
      <CareIcon name={icon} className="h-4 w-4 text-accent" />
      {children}
    </h2>
  );
}

export function CareIcon({
  name,
  className = "h-6 w-6",
}: {
  name: CareIconName;
  className?: string;
}) {
  const icon = { className, strokeWidth: 1.75, "aria-hidden": true as const };
  switch (name) {
    case "home":
      return <House {...icon} />;
    case "schedule":
      return <Calendar {...icon} />;
    case "family":
      return <Users {...icon} />;
    case "bell":
      return <Bell {...icon} />;
    case "baby":
      return <Baby {...icon} />;
    case "language":
      return <Languages {...icon} />;
    case "timer":
      return <Timer {...icon} />;
    case "clock":
      return <Clock {...icon} />;
    case "beaker":
      return <Beaker {...icon} />;
    case "bellRing":
      return <BellRing {...icon} />;
    case "logOut":
      return <LogOut {...icon} />;
    case "close":
      return <X {...icon} />;
    case "settings":
      return <Settings {...icon} />;
    case "chiller":
      return <Snowflake {...icon} />;
    case "diaper":
      return <DiaperIcon className={className} />;
    case "feed":
      return <BottleIcon className={className} />;
    case "pump":
      return <PumpIcon className={className} />;
    default:
      return null;
  }
}

function Stroke({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

function DiaperIcon({ className }: { className?: string }) {
  return (
    <Stroke className={className}>
      <path d="M7 7.5h10" />
      <path d="M7.5 7.5c-.8 2.4-.6 4.4.5 6.3.9 1.6 1.2 2.6 1.2 4 0 2 1.3 3.4 2.8 3.4s2.8-1.4 2.8-3.4c0-1.4.3-2.4 1.2-4 .9-1.9 1.1-3.9.5-6.3" />
      <path d="M9.2 7.5c.25 1.35 1.3 2.15 2.8 2.15s2.55-.8 2.8-2.15" />
      <path d="M10.2 15.6h3.6" />
    </Stroke>
  );
}

function BottleIcon({ className }: { className?: string }) {
  return (
    <Stroke className={className}>
      <path d="M10 2.75h4" />
      <path d="M11 2.75v2.1" />
      <path d="M13 2.75v2.1" />
      <path d="M9.25 4.85h5.5l.85 2.15v9.15a2.85 2.85 0 0 1-2.85 2.85h-1.5a2.85 2.85 0 0 1-2.85-2.85V7l.85-2.15z" />
    </Stroke>
  );
}

function PumpIcon({ className }: { className?: string }) {
  return (
    <Stroke className={className}>
      <path d="M9 10.25h5.25V18a2.6 2.6 0 0 1-2.6 2.6h-.05A2.6 2.6 0 0 1 9 18v-7.75z" />
      <path d="M10.1 7.4h3.3v2.85h-3.3z" />
      <path d="M13.4 8.35h2.15a2.15 2.15 0 1 1 0 2.5" />
      <path d="M8.4 12.4h6.4" />
    </Stroke>
  );
}

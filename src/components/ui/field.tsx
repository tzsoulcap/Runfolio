// Shared form primitives: inputs stay 16px+ with 44px targets (§17).
export const inputCls =
  "h-12 min-w-0 w-full rounded-button border border-line bg-paper px-3 text-base text-charcoal transition-colors focus:border-forest";
export const labelCls = "mb-1 block text-sm font-medium text-charcoal";
export const errorCls = "mt-1 text-sm text-charcoal";

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className={errorCls}>
      {message}
    </p>
  );
}

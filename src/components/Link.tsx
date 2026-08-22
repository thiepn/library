import type { AnchorHTMLAttributes, PropsWithChildren } from 'react';
import { interceptLink } from '../lib/routes';

export function Link({ children, onClick, ...props }: PropsWithChildren<AnchorHTMLAttributes<HTMLAnchorElement>>) {
  return (
    <a
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) interceptLink(event);
      }}
    >
      {children}
    </a>
  );
}

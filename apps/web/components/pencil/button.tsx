"use client";

import Link from "next/link";
import clsx from "clsx";
import { forwardRef, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from "react";
import styles from "./button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonVisualProps {
  variant?: ButtonVariant;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonVisualProps {}

function buttonClassName({
  variant = "primary",
  fullWidth = false,
  className,
}: Pick<ButtonVisualProps, "variant" | "fullWidth"> & { className?: string }) {
  return clsx(styles.button, styles[variant], fullWidth && styles.fullWidth, className);
}

/** Port of Pencil `Button / Primary`, `Button / Secondary`, `Button / Ghost`. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { children, variant = "primary", fullWidth = false, leadingIcon, trailingIcon, className, type = "button", ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClassName({ variant, fullWidth, className })} {...props}>
      {leadingIcon}
      <span>{children}</span>
      {trailingIcon}
    </button>
  );
});

export interface ButtonLinkProps extends Omit<ComponentProps<typeof Link>, "className">, ButtonVisualProps {
  className?: string;
}

export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { children, variant = "primary", fullWidth = false, leadingIcon, trailingIcon, className, ...props },
  ref,
) {
  return (
    <Link ref={ref} className={buttonClassName({ variant, fullWidth, className })} {...props}>
      {leadingIcon}
      <span>{children}</span>
      {trailingIcon}
    </Link>
  );
});

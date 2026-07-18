"use client";

import Link from "next/link";
import clsx from "clsx";
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type ReactNode,
} from "react";
import styles from "./button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "quiet" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

interface ButtonVisualProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonVisualProps {
  loading?: boolean;
}

function buttonClassName({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: Pick<ButtonVisualProps, "variant" | "size" | "fullWidth"> & { className?: string }) {
  return clsx(
    styles.button,
    styles[variant],
    styles[size],
    fullWidth && styles.fullWidth,
    className,
  );
}

function ButtonContents({
  children,
  leadingIcon,
  trailingIcon,
  loading = false,
}: Pick<ButtonProps, "children" | "leadingIcon" | "trailingIcon" | "loading">) {
  return (
    <>
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : null}
      {!loading && leadingIcon ? (
        <span className={styles.icon} aria-hidden="true">{leadingIcon}</span>
      ) : null}
      <span className={styles.label}>{children}</span>
      {trailingIcon ? (
        <span className={styles.icon} aria-hidden="true">{trailingIcon}</span>
      ) : null}
    </>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    variant = "primary",
    size = "md",
    fullWidth = false,
    leadingIcon,
    trailingIcon,
    loading = false,
    disabled,
    className,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClassName({ variant, size, fullWidth, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      <ButtonContents
        leadingIcon={leadingIcon}
        trailingIcon={trailingIcon}
        loading={loading}
      >
        {children}
      </ButtonContents>
    </button>
  );
});

export interface ButtonLinkProps
  extends Omit<ComponentProps<typeof Link>, "className">,
    ButtonVisualProps {
  className?: string;
  disabled?: boolean;
}

export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(
  function ButtonLink(
    {
      children,
      variant = "primary",
      size = "md",
      fullWidth = false,
      leadingIcon,
      trailingIcon,
      disabled = false,
      className,
      tabIndex,
      onClick,
      ...props
    },
    ref,
  ) {
    return (
      <Link
        ref={ref}
        className={buttonClassName({ variant, size, fullWidth, className })}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : tabIndex}
        onClick={(event) => {
          if (disabled) {
            event.preventDefault();
            return;
          }
          onClick?.(event);
        }}
        {...props}
      >
        <ButtonContents leadingIcon={leadingIcon} trailingIcon={trailingIcon}>
          {children}
        </ButtonContents>
      </Link>
    );
  },
);

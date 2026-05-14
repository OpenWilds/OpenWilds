import { ConvexAuthProvider, useAuthActions } from "@convex-dev/auth/react";
import {
  Authenticated,
  AuthLoading,
  ConvexReactClient,
  Unauthenticated,
  useConvex,
  useQuery,
} from "convex/react";
import { makeFunctionReference } from "convex/server";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

export type AuthenticatedConvexUser = {
  _id: string;
  email: string | null;
  name: string | null;
};

type CurrentUser = AuthenticatedConvexUser;

const currentUserRef = makeFunctionReference<"query", {}, CurrentUser>(
  "auth:currentUser"
);

export function createConvexAuthClient(convexUrl: string) {
  return new ConvexReactClient(convexUrl);
}

export function ConvexAuthBoundary({
  children,
  client,
}: {
  children: React.ReactNode;
  client: ConvexReactClient;
}) {
  return <ConvexAuthProvider client={client}>{children}</ConvexAuthProvider>;
}

export function ConvexAuthScreen({ label = "Open Wilds" }: { label?: string }) {
  return (
    <>
      <AuthLoading>
        <AuthPanel label={label} mode="loading" />
      </AuthLoading>
      <Unauthenticated>
        <EmailPasswordPanel label={label} />
      </Unauthenticated>
    </>
  );
}

export function ConvexAuthenticatedUser({
  children,
  label = "Open Wilds",
}: {
  children: (args: {
    client: ConvexReactClient;
    signOut: () => Promise<void>;
    user: AuthenticatedConvexUser;
  }) => React.ReactNode;
  label?: string;
}) {
  const client = useConvex();
  const user = useQuery(currentUserRef, {});
  const { signOut } = useAuthActions();

  if (user === undefined) {
    return <AuthPanel label={label} mode="loading" />;
  }

  return <>{children({ client, signOut, user })}</>;
}

export function bootConvexGameAuth(args: {
  app: HTMLElement;
  convexUrl: string;
  onAuthenticated: (
    client: ConvexReactClient,
    user: AuthenticatedConvexUser
  ) => void;
}) {
  const rootElement = document.createElement("div");
  const client = createConvexAuthClient(args.convexUrl);
  const root = createRoot(rootElement);

  rootElement.className = "auth-root";
  args.app.prepend(rootElement);

  root.render(
    <ConvexAuthBoundary client={client}>
      <ConvexAuthScreen />
      <Authenticated>
        <ConvexGameAuthSession onAuthenticated={args.onAuthenticated} />
      </Authenticated>
    </ConvexAuthBoundary>
  );

  return {
    dispose: () => {
      root.unmount();
      rootElement.remove();
      void client.close();
    },
  };
}

function ConvexGameAuthSession({
  onAuthenticated,
}: {
  onAuthenticated: (
    client: ConvexReactClient,
    user: AuthenticatedConvexUser
  ) => void;
}) {
  const client = useConvex();
  const user = useQuery(currentUserRef, {});
  const { signOut } = useAuthActions();
  const booted = useRef(false);

  useEffect(() => {
    if (user === undefined || booted.current) {
      return;
    }

    booted.current = true;
    onAuthenticated(client, user);
  }, [client, onAuthenticated, user]);

  if (user === undefined) {
    return <AuthPanel label="Open Wilds" mode="loading" />;
  }

  return (
    <div className="auth-session-bar">
      <span>{userLabel(user)}</span>
      <button
        onClick={() => {
          void signOut().then(() => window.location.reload());
        }}
        type="button"
      >
        Sign out
      </button>
    </div>
  );
}

export function userLabel(user: AuthenticatedConvexUser) {
  return user.name?.trim() || user.email?.trim() || "Signed in";
}

function EmailPasswordPanel({ label }: { label: string }) {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const modeLabel = flow === "signIn" ? "Sign in" : "Create account";
  const alternateLabel =
    flow === "signIn" ? "Create account" : "Use existing account";

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const formData = new FormData(event.currentTarget);
      formData.set("flow", flow);
      await signIn("password", formData);
    } catch (caught) {
      setError(toErrorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthPanel label={label} mode="form">
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <label>
          <span>Email</span>
          <input
            autoComplete="email"
            name="email"
            placeholder="you@example.com"
            required
            type="email"
          />
        </label>
        <label>
          <span>Password</span>
          <input
            autoComplete={
              flow === "signIn" ? "current-password" : "new-password"
            }
            minLength={8}
            name="password"
            required
            type="password"
          />
        </label>
        {error ? <p className="auth-error">{error}</p> : null}
        <div className="auth-actions">
          <button disabled={isSubmitting} type="submit">
            {isSubmitting ? "Working..." : modeLabel}
          </button>
          <button
            disabled={isSubmitting}
            onClick={() => {
              setError(null);
              setFlow(flow === "signIn" ? "signUp" : "signIn");
            }}
            type="button"
          >
            {alternateLabel}
          </button>
        </div>
      </form>
    </AuthPanel>
  );
}

function AuthPanel({
  children,
  label,
  mode,
}: {
  children?: React.ReactNode;
  label: string;
  mode: "form" | "loading";
}) {
  const title = useMemo(
    () => (mode === "loading" ? "Checking session" : "Email password"),
    [mode]
  );

  return (
    <section className="auth-gate">
      <div className="auth-panel">
        <p className="eyebrow">{label}</p>
        <h1>{title}</h1>
        {mode === "loading" ? <div className="auth-loader" /> : children}
      </div>
    </section>
  );
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.replace(/^Error: /, "");
  }

  return "Authentication failed.";
}

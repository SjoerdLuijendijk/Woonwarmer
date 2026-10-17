"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useBackdropClose } from "./useBackdropClose";

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel: string;
  /** Styles the confirm button as destructive and focuses "Annuleren" first. */
  danger?: boolean;
};

type ChooseOptions<T extends string> = {
  title: string;
  message?: string;
  /** Shown after "Annuleren"; the last one is the primary button. */
  choices: { value: T; label: string }[];
};

type DialogRequest =
  | ({ kind: "confirm"; resolve: (confirmed: boolean) => void } & ConfirmOptions)
  | ({ kind: "choose"; resolve: (value: string | null) => void } & ChooseOptions<string>)
  | { kind: "notice"; title: string; message: string; resolve: (confirmed: boolean) => void };

type DialogApi = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Resolves with the chosen value, or null when cancelled. */
  choose: <T extends string>(options: ChooseOptions<T>) => Promise<T | null>;
  notify: (message: string, title?: string) => Promise<void>;
};

const DialogContext = createContext<DialogApi | null>(null);

export function useDialog() {
  const api = useContext(DialogContext);
  if (!api) throw new Error("useDialog must be used inside DialogProvider");
  return api;
}

// App-wide styled replacement for window.confirm and window.alert.
export default function DialogProvider({ children }: { children: React.ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [request, setRequest] = useState<DialogRequest | null>(null);
  useBackdropClose();

  useEffect(() => {
    if (request && !dialogRef.current?.open) dialogRef.current?.showModal();
  }, [request]);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setRequest({ kind: "confirm", ...options, resolve })),
    [],
  );
  const choose = useCallback(
    <T extends string>(options: ChooseOptions<T>) =>
      new Promise<T | null>((resolve) =>
        setRequest({ kind: "choose", ...options, resolve: (value) => resolve(value as T | null) }),
      ),
    [],
  );
  const notify = useCallback(
    (message: string, title = "Er ging iets mis") =>
      new Promise<void>((resolve) => setRequest({ kind: "notice", title, message, resolve: () => resolve() })),
    [],
  );

  function answer(confirmed: boolean) {
    if (request?.kind === "choose") request.resolve(null);
    else request?.resolve(confirmed);
    setRequest(null);
    dialogRef.current?.close();
  }

  function pick(value: string) {
    if (request?.kind === "choose") request.resolve(value);
    setRequest(null);
    dialogRef.current?.close();
  }

  return (
    <DialogContext.Provider value={{ confirm, choose, notify }}>
      {children}
      <dialog
        ref={dialogRef}
        className="app-dialog"
        aria-labelledby="app-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          answer(false);
        }}
      >
        {request && (
          <>
            <h2 id="app-dialog-title">{request.title}</h2>
            {request.message && <p>{request.message}</p>}
            <div className="button-row dialog-actions">
              {request.kind === "choose" ? (
                <>
                  <button type="button" className="secondary-button" onClick={() => answer(false)}>
                    Annuleren
                  </button>
                  {request.choices.map(({ value, label }, index) => {
                    const primary = index === request.choices.length - 1;
                    return (
                      <button key={value} type="button" className={primary ? "primary-button" : "secondary-button"} onClick={() => pick(value)} autoFocus={primary}>
                        {label}
                      </button>
                    );
                  })}
                </>
              ) : request.kind === "confirm" ? (
                <>
                  <button type="button" className="secondary-button" onClick={() => answer(false)} autoFocus={request.danger}>
                    Annuleren
                  </button>
                  <button
                    type="button"
                    className={request.danger ? "primary-button danger-button" : "primary-button"}
                    onClick={() => answer(true)}
                    autoFocus={!request.danger}
                  >
                    {request.confirmLabel}
                  </button>
                </>
              ) : (
                <button type="button" className="primary-button" onClick={() => answer(true)} autoFocus>
                  Oké
                </button>
              )}
            </div>
          </>
        )}
      </dialog>
    </DialogContext.Provider>
  );
}

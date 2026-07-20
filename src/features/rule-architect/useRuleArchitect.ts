import { useCallback, useRef, useState } from "react";
import type { CompilePresentationResponse } from "@/rule-presentation/types";
import type { CompileRuleResponse, PublishedRuleVersion } from "@/rules-v2";
import {
  compileChessRule,
  compileRulePresentation,
  createRuleLobby,
  publishRuleVersion,
  RuleArchitectApiError,
  type CreatedRuleLobbyResponse,
} from "./api";
import { createRequestKey } from "./request-key";

export type RuleArchitectPhase =
  | "idle"
  | "compiling"
  | "review"
  | "publishing"
  | "published"
  | "creating-lobby"
  | "ready"
  | "error";

export type RuleArchitectCompileFailure = {
  message: string;
  code: string | null;
  retryable: boolean | null;
  newRequestRequired: boolean;
};

export function useRuleArchitect() {
  const [phase, setPhase] = useState<RuleArchitectPhase>("idle");
  const [compilation, setCompilation] = useState<CompileRuleResponse | null>(
    null,
  );
  const [presentation, setPresentation] =
    useState<CompilePresentationResponse | null>(null);
  const [presentationWarning, setPresentationWarning] = useState<string | null>(
    null,
  );
  const [publication, setPublication] = useState<PublishedRuleVersion | null>(
    null,
  );
  const [lobby, setLobby] = useState<CreatedRuleLobbyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compileFailure, setCompileFailure] =
    useState<RuleArchitectCompileFailure | null>(null);

  const compileInFlight = useRef<Promise<CompileRuleResponse> | null>(null);
  const publishInFlight = useRef<Promise<PublishedRuleVersion> | null>(null);
  const lobbyInFlight = useRef<Promise<CreatedRuleLobbyResponse> | null>(null);
  const compileAttempt = useRef<{
    fingerprint: string;
    requestKey: string;
    presentationRequestKey: string;
  } | null>(null);
  const lobbyAttempt = useRef<{
    fingerprint: string;
    requestKey: string;
  } | null>(null);

  const compile = useCallback((prompt: string, premium: boolean) => {
    if (compileInFlight.current) {
      return compileInFlight.current;
    }

    const fingerprint = JSON.stringify([prompt, premium]);
    if (compileAttempt.current?.fingerprint !== fingerprint) {
      compileAttempt.current = {
        fingerprint,
        requestKey: createRequestKey(),
        presentationRequestKey: createRequestKey(),
      };
    }
    const requestKey = compileAttempt.current.requestKey;
    const presentationRequestKey =
      compileAttempt.current.presentationRequestKey;

    setPhase("compiling");
    setError(null);
    setCompileFailure(null);
    setCompilation(null);
    setPresentation(null);
    setPresentationWarning(null);
    setPublication(null);
    setLobby(null);

    const operation = (async () => {
      try {
        const result = await compileChessRule({
          prompt,
          premium,
          requestKey,
        });
        setCompilation(result);

        if (result.ok && result.compilationId) {
          try {
            const visualResult = await compileRulePresentation({
              compilationId: result.compilationId,
              requestKey: presentationRequestKey,
            });
            setPresentation(visualResult);
          } catch (presentationError) {
            const message =
              presentationError instanceof Error
                ? presentationError.message
                : "La mise en scène est indisponible. La règle de jeu reste publiable.";
            setPresentationWarning(message);

            if (
              presentationError instanceof RuleArchitectApiError &&
              presentationError.newRequestRequired &&
              compileAttempt.current?.fingerprint === fingerprint
            ) {
              compileAttempt.current = {
                ...compileAttempt.current,
                presentationRequestKey: createRequestKey(),
              };
            }
          }
        }

        setPhase("review");
        return result;
      } catch (caught) {
        const failure: RuleArchitectCompileFailure =
          caught instanceof RuleArchitectApiError
            ? {
                message: caught.message,
                code: caught.code,
                retryable: caught.retryable,
                newRequestRequired: caught.newRequestRequired,
              }
            : {
                message:
                  caught instanceof Error
                    ? caught.message
                    : "Erreur de compilation.",
                code: null,
                retryable: null,
                newRequestRequired: false,
              };

        if (failure.newRequestRequired) {
          compileAttempt.current = null;
        }
        setCompileFailure(failure);
        setError(failure.message);
        setPhase("error");
        throw caught;
      }
    })();

    compileInFlight.current = operation;
    void operation.then(
      () => {
        if (compileInFlight.current === operation) {
          compileInFlight.current = null;
        }
      },
      () => {
        if (compileInFlight.current === operation) {
          compileInFlight.current = null;
        }
      },
    );

    return operation;
  }, []);

  const publish = useCallback(
    (visibility: "private" | "unlisted" | "public") => {
      if (publishInFlight.current) {
        return publishInFlight.current;
      }

      if (!compilation?.compilationId) {
        return Promise.reject(new Error("Aucune compilation à publier."));
      }

      setPhase("publishing");
      setError(null);

      const operation = (async () => {
        try {
          const result = await publishRuleVersion({
            compilationId: compilation.compilationId,
            visibility,
          });
          setPublication(result);
          setPhase("published");
          return result;
        } catch (caught) {
          const message =
            caught instanceof Error ? caught.message : "Erreur de publication.";
          setError(message);
          setPhase("error");
          throw caught;
        }
      })();

      publishInFlight.current = operation;
      void operation.then(
        () => {
          if (publishInFlight.current === operation) {
            publishInFlight.current = null;
          }
        },
        () => {
          if (publishInFlight.current === operation) {
            publishInFlight.current = null;
          }
        },
      );

      return operation;
    },
    [compilation],
  );

  const createLobby = useCallback(
    (name: string, mode: "player" | "ai") => {
      if (lobbyInFlight.current) {
        return lobbyInFlight.current;
      }

      if (!publication?.versionId) {
        return Promise.reject(new Error("Publie d'abord la règle."));
      }

      const fingerprint = JSON.stringify([publication.versionId, name, mode]);
      if (lobbyAttempt.current?.fingerprint !== fingerprint) {
        lobbyAttempt.current = {
          fingerprint,
          requestKey: createRequestKey(),
        };
      }
      const requestKey = lobbyAttempt.current.requestKey;

      setPhase("creating-lobby");
      setError(null);

      const operation = (async () => {
        try {
          const result = await createRuleLobby({
            name,
            mode,
            ruleVersionIds: [publication.versionId],
            requestKey,
          });
          setLobby(result);
          setPhase("ready");
          return result;
        } catch (caught) {
          const message =
            caught instanceof Error
              ? caught.message
              : "Erreur de création du lobby.";
          setError(message);
          setPhase("error");
          throw caught;
        }
      })();

      lobbyInFlight.current = operation;
      void operation.then(
        () => {
          if (lobbyInFlight.current === operation) {
            lobbyInFlight.current = null;
          }
        },
        () => {
          if (lobbyInFlight.current === operation) {
            lobbyInFlight.current = null;
          }
        },
      );

      return operation;
    },
    [publication],
  );

  const resetCompilation = useCallback(() => {
    setPhase("idle");
    setCompilation(null);
    setPresentation(null);
    setPresentationWarning(null);
    setPublication(null);
    setLobby(null);
    setError(null);
    setCompileFailure(null);
    compileAttempt.current = null;
    lobbyAttempt.current = null;
  }, []);

  return {
    phase,
    compilation,
    presentation,
    presentationWarning,
    publication,
    lobby,
    error,
    compileFailure,
    compile,
    publish,
    createLobby,
    resetCompilation,
    reset: resetCompilation,
  };
}

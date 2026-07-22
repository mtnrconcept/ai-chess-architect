import { useCallback, useRef, useState } from "react";
import {
  compileChessRule,
  createRuleLobby,
  publishRuleVersion,
  RuleArchitectApiError,
  type CreatedRuleLobbyResponse,
} from "./api";
import { createRequestKey } from "./request-key";
import type { RuleGuidanceSelections } from "./guidance-api";
import type { CompileRuleResponse, PublishedRuleVersion } from "@/rules-v2";
import {
  loadRuleArchitectSession,
  persistRuleArchitectWorkflow,
  resolveRuleArchitectRequestAttempt,
  type PersistedRuleArchitectSession,
} from "./rule-architect-session";

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

const restoredPhase = (
  session: PersistedRuleArchitectSession | null,
): RuleArchitectPhase => {
  if (session?.workflow.lobby) return "ready";
  if (session?.workflow.publication) return "published";
  if (session?.workflow.compilation) return "review";
  return "idle";
};

export function useRuleArchitect(
  initialSession: PersistedRuleArchitectSession | null | undefined = undefined,
) {
  const restoredSession = useRef(
    initialSession === undefined ? loadRuleArchitectSession() : initialSession,
  ).current;
  const [phase, setPhase] = useState<RuleArchitectPhase>(() =>
    restoredPhase(restoredSession),
  );
  const [compilation, setCompilation] = useState<CompileRuleResponse | null>(
    restoredSession?.workflow.compilation ?? null,
  );
  const [publication, setPublication] = useState<PublishedRuleVersion | null>(
    restoredSession?.workflow.publication ?? null,
  );
  const [lobby, setLobby] = useState<CreatedRuleLobbyResponse | null>(
    restoredSession?.workflow.lobby ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [compileFailure, setCompileFailure] =
    useState<RuleArchitectCompileFailure | null>(null);

  const compileInFlight = useRef<Promise<CompileRuleResponse> | null>(null);
  const publishInFlight = useRef<Promise<PublishedRuleVersion> | null>(null);
  const lobbyInFlight = useRef<Promise<CreatedRuleLobbyResponse> | null>(null);
  const compileAttempt = useRef(
    restoredSession?.workflow.compileAttempt ?? null,
  );
  const lobbyAttempt = useRef(restoredSession?.workflow.lobbyAttempt ?? null);

  const compile = useCallback(
    (
      prompt: string,
      premium: boolean,
      guidanceToken?: string,
      guidanceSelections?: RuleGuidanceSelections,
    ) => {
      if (compileInFlight.current) {
        return compileInFlight.current;
      }

      const fingerprint = JSON.stringify([
        prompt,
        premium,
        guidanceToken ?? null,
        guidanceSelections ?? null,
      ]);
      compileAttempt.current = resolveRuleArchitectRequestAttempt(
        compileAttempt.current,
        fingerprint,
        createRequestKey,
      );
      const requestKey = compileAttempt.current.requestKey;

      persistRuleArchitectWorkflow({
        compilation: null,
        publication: null,
        lobby: null,
        compileAttempt: compileAttempt.current,
        lobbyAttempt: null,
      });

      setPhase("compiling");
      setError(null);
      setCompileFailure(null);
      setCompilation(null);
      setPublication(null);
      setLobby(null);

      const operation = (async () => {
        try {
          const result = await compileChessRule({
            prompt,
            premium,
            requestKey,
            ...(guidanceToken ? { guidanceToken } : {}),
            ...(guidanceSelections ? { guidanceSelections } : {}),
          });
          setCompilation(result);
          setPhase("review");
          persistRuleArchitectWorkflow({ compilation: result });
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
            persistRuleArchitectWorkflow({ compileAttempt: null });
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
    },
    [],
  );

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
          persistRuleArchitectWorkflow({ publication: result });
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
      lobbyAttempt.current = resolveRuleArchitectRequestAttempt(
        lobbyAttempt.current,
        fingerprint,
        createRequestKey,
      );
      const requestKey = lobbyAttempt.current.requestKey;
      persistRuleArchitectWorkflow({
        lobby: null,
        lobbyAttempt: lobbyAttempt.current,
      });

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
          persistRuleArchitectWorkflow({ lobby: result });
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
    setPublication(null);
    setLobby(null);
    setError(null);
    setCompileFailure(null);
    compileAttempt.current = null;
    lobbyAttempt.current = null;
    persistRuleArchitectWorkflow({
      compilation: null,
      publication: null,
      lobby: null,
      compileAttempt: null,
      lobbyAttempt: null,
    });
  }, []);

  return {
    phase,
    compilation,
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

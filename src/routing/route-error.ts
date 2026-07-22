import { isRouteErrorResponse } from "react-router-dom";

export function describeRouteError(error: unknown): string {
  if (isRouteErrorResponse(error)) {
    if (typeof error.data === "string" && error.data.trim()) {
      return error.data;
    }
    return error.statusText || `Erreur ${error.status}`;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "La page n’a pas pu être affichée.";
}

import { createContext, useContext } from "react";

/**
 * Sends a follow-up as the user's message. Undefined where there is no
 * conversation to send into (a shared page); null while a turn is under way.
 */
export const AskContext = createContext<((text: string) => void) | null | undefined>(undefined);

export function useAsk() {
  return useContext(AskContext);
}

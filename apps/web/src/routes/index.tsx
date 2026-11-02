import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { authClient } from "../auth-client";
import { Welcome as WelcomeScreen } from "../components/welcome";
import { skipWelcome } from "../session";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => skipWelcome(context.queryClient),
  component: Welcome,
});

function Welcome() {
  const [waiting, setWaiting] = useState(false);
  function start() {
    setWaiting(true);
    void authClient.signIn.social({ provider: "github", callbackURL: "/chat" });
  }
  return <WelcomeScreen waiting={waiting} onContinue={start} onOpenAgain={start} />;
}

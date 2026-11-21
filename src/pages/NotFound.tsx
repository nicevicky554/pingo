import { Wordmark } from "@/components/Wordmark";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { Link } from "react-router";

export default function NotFound() {
  return (
    <main className="dot-grid flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md text-center">
        <Wordmark className="justify-center" />
        <p className="mt-10 font-serif-display text-6xl text-primary">404</p>
        <h1 className="mt-3 text-2xl font-extrabold">This page never landed</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
          The link may be old, or the conversation was removed. Your chats are
          still where you left them.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button asChild>
            <Link to="/app/chats">
              <MessageCircle className="size-4" /> Open chats
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/">
              <ArrowLeft className="size-4" /> Back home
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}

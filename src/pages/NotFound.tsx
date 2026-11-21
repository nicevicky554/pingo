import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/Wordmark";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "react-router";

export default function NotFound() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="dot-grid flex min-h-screen flex-col bg-background">
      <header className="border-b-2 border-border">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Wordmark />
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link to="/">
              <ArrowLeft className="size-4" />
              Home
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-lg text-center"
        >
          <div className="mx-auto flex size-28 items-center justify-center rounded-full border-2 border-foreground bg-primary font-display text-4xl font-extrabold text-primary-foreground">
            404
          </div>
          <h1 className="mt-7 font-display text-4xl font-extrabold sm:text-5xl">
            This ping went nowhere.
          </h1>
          <p className="mt-3 text-base leading-7 text-muted-foreground">
            The page you were looking for isn't on the board. It may have been
            closed, moved, or never existed in the first place.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="gap-2">
              <Link to="/">
                Back to home
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to={isAuthenticated ? "/dashboard" : "/auth"}>
                {isAuthenticated ? "Open your board" : "Sign in"}
              </Link>
            </Button>
          </div>
        </motion.div>
      </main>
    </div>
  );
}

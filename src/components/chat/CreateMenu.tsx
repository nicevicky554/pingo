import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { Hash, MessageSquarePlus, Plus, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "react-router";

const ACTIONS = [
  {
    to: "/app/new/message",
    label: "New message",
    description: "Find a person and start a chat",
    icon: MessageSquarePlus,
  },
  {
    to: "/app/groups/create",
    label: "New group",
    description: "Add members and set permissions",
    icon: UsersRound,
  },
  {
    to: "/app/channels/create",
    label: "New channel",
    description: "Publish to subscribers",
    icon: Hash,
  },
  {
    to: "/app/communities/create",
    label: "New community",
    description: "Bring related groups together",
    icon: UsersRound,
  },
];

export function CreateMenu({
  trigger,
  align = "end",
}: {
  trigger?: ReactNode;
  align?: "start" | "end";
}) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const items = (
    <div className={mobile ? "space-y-1 p-2 pb-5" : "w-64 p-1.5"}>
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.to}
            to={action.to}
            onClick={() => setOpen(false)}
            className="flex items-start gap-3 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-secondary"
          >
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
              <Icon className="size-[18px]" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{action.label}</span>
              <span className="mt-0.5 block text-[0.7rem] leading-5 text-muted-foreground">
                {action.description}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );

  if (mobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          {trigger ?? (
            <button
              type="button"
              aria-label="New conversation"
              className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25"
            >
              <Plus className="size-5" />
            </button>
          )}
        </DrawerTrigger>
        <DrawerContent>
          <DrawerTitle className="px-4 pt-2 text-sm font-semibold">Create</DrawerTitle>
          {items}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            aria-label="New conversation"
            className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground"
          >
            <Plus className="size-5" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-auto p-0">
        {items}
      </PopoverContent>
    </Popover>
  );
}

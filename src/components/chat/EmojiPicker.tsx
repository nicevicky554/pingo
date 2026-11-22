import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

type Emoji = { char: string; name: string };

const GROUPS: { id: string; label: string; emoji: Emoji[] }[] = [
  {
    id: "recent",
    label: "Recent",
    emoji: [],
  },
  {
    id: "smileys",
    label: "Smileys",
    emoji: [
      ["😀", "grinning"], ["😃", "smiley"], ["😄", "smile"], ["😁", "grin"],
      ["😆", "laughing"], ["😅", "sweat smile"], ["🤣", "rofl"], ["😂", "joy"],
      ["🙂", "slight smile"], ["🙃", "upside down"], ["😉", "wink"], ["😊", "blush"],
      ["😇", "halo"], ["🥰", "smiling hearts"], ["😍", "heart eyes"], ["🤩", "star struck"],
      ["😘", "kiss"], ["😗", "kissing"], ["😚", "kissing closed eyes"], ["😙", "kissing smile"],
      ["😋", "yum"], ["😛", "tongue"], ["😜", "wink tongue"], ["🤪", "zany"],
      ["😝", "squint tongue"], ["🤑", "money mouth"], ["🤗", "hug"], ["🤭", "hand over mouth"],
      ["🤫", "shush"], ["🤔", "thinking"], ["🤐", "zipper"], ["🤨", "raised eyebrow"],
      ["😐", "neutral"], ["😑", "expressionless"], ["😶", "no mouth"], ["😏", "smirk"],
      ["😒", "unamused"], ["🙄", "eye roll"], ["😬", "grimace"], ["🤥", "lying"],
      ["😌", "relieved"], ["😔", "pensive"], ["😪", "sleepy"], ["🤤", "drool"],
      ["😴", "sleeping"], ["😷", "mask"], ["🤒", "sick"], ["🤕", "hurt"],
      ["🤢", "nauseated"], ["🤮", "vomit"], ["🥵", "hot"], ["🥶", "cold"],
      ["😵", "dizzy"], ["🤯", "exploding head"], ["🤠", "cowboy"], ["🥳", "party"],
      ["😎", "cool"], ["🤓", "nerd"], ["🧐", "monocle"], ["😕", "confused"],
      ["😟", "worried"], ["🙁", "slight frown"], ["😮", "open mouth"], ["😯", "hushed"],
      ["😲", "astonished"], ["😳", "flushed"], ["🥺", "pleading"], ["😦", "frowning"],
      ["😧", "anguished"], ["😨", "fearful"], ["😰", "anxious"], ["😥", "sad relieved"],
      ["😢", "cry"], ["😭", "sob"], ["😱", "scream"], ["😖", "confounded"],
      ["😣", "persevere"], ["😞", "disappointed"], ["😓", "downcast sweat"], ["😩", "weary"],
      ["😫", "tired"], ["🥱", "yawn"], ["😤", "triumph"], ["😡", "rage"],
      ["😠", "angry"], ["🤬", "cursing"], ["😈", "smiling devil"], ["👿", "angry devil"],
      ["💀", "skull"], ["💩", "poop"], ["🤡", "clown"], ["👻", "ghost"],
      ["👽", "alien"], ["🤖", "robot"], ["😺", "cat"], ["😸", "cat grin"],
    ].map(([char, name]) => ({ char, name })),
  },
  {
    id: "gestures",
    label: "Gestures",
    emoji: [
      ["👍", "thumbs up"], ["👎", "thumbs down"], ["👌", "ok hand"], ["🤌", "pinched"],
      ["✌️", "victory"], ["🤞", "crossed fingers"], ["🤟", "love you"], ["🤘", "rock"],
      ["🤙", "call me"], ["👈", "point left"], ["👉", "point right"], ["👆", "point up"],
      ["👇", "point down"], ["☝️", "index up"], ["👏", "clap"], ["🙌", "raised hands"],
      ["👐", "open hands"], ["🤲", "palms up"], ["🤝", "handshake"], ["🙏", "pray"],
      ["✍️", "writing"], ["💅", "nail polish"], ["💪", "muscle"], ["🦾", "mechanical arm"],
      ["🫶", "heart hands"], ["👋", "wave"], ["🤚", "raised back"], ["🖐️", "hand"],
      ["✋", "raised hand"], ["🖖", "vulcan"], ["🫡", "salute"], ["🫸", "push"],
      ["👊", "fist"], ["✊", "raised fist"], ["🤛", "left fist"], ["🤜", "right fist"],
    ].map(([char, name]) => ({ char, name })),
  },
  {
    id: "hearts",
    label: "Hearts",
    emoji: [
      ["❤️", "red heart"], ["🧡", "orange heart"], ["💛", "yellow heart"], ["💚", "green heart"],
      ["💙", "blue heart"], ["💜", "purple heart"], ["🖤", "black heart"], ["🤍", "white heart"],
      ["🤎", "brown heart"], ["💔", "broken heart"], ["❤️‍🔥", "heart fire"], ["💕", "two hearts"],
      ["💞", "revolving hearts"], ["💓", "beating heart"], ["💗", "growing heart"], ["💖", "sparkling heart"],
      ["💘", "heart arrow"], ["💝", "heart ribbon"], ["💟", "heart decoration"], ["💯", "hundred"],
      ["💢", "anger"], ["💥", "boom"], ["💫", "dizzy"], ["💦", "sweat drops"],
      ["💨", "dash"], ["🕳️", "hole"], ["💬", "speech"], ["💭", "thought"],
      ["🔥", "fire"], ["✨", "sparkles"], ["⭐", "star"], ["🌟", "glowing star"],
      ["🌈", "rainbow"], ["☀️", "sun"], ["🌙", "moon"], ["⚡", "lightning"],
    ].map(([char, name]) => ({ char, name })),
  },
  {
    id: "objects",
    label: "Objects",
    emoji: [
      ["📱", "phone"], ["💻", "laptop"], ["⌚", "watch"], ["📷", "camera"],
      ["🎧", "headphones"], ["🎤", "microphone"], ["🎵", "music"], ["🎶", "notes"],
      ["📞", "telephone"], ["📧", "email"], ["✉️", "envelope"], ["📦", "package"],
      ["📅", "calendar"], ["⏰", "alarm"], ["⌛", "hourglass"], ["💡", "idea"],
      ["🔑", "key"], ["🔒", "lock"], ["🔔", "bell"], ["🎉", "party popper"],
      ["🎁", "gift"], ["🏆", "trophy"], ["⚽", "football"], ["🏀", "basketball"],
      ["🎮", "game"], ["🎯", "target"], ["🚀", "rocket"], ["✈️", "plane"],
      ["🚗", "car"], ["🏠", "house"], ["🌍", "earth"], ["🍕", "pizza"],
      ["☕", "coffee"], ["🍰", "cake"], ["🍎", "apple"], ["🥂", "cheers"],
    ].map(([char, name]) => ({ char, name })),
  },
];

const RECENT_KEY = "pingo:recent_emoji";

function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [group, setGroup] = useState("smileys");
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>(readRecent);

  const emoji = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (term) {
      return GROUPS.flatMap((item) => item.emoji).filter((item) =>
        item.name.includes(term),
      );
    }
    if (group === "recent") {
      return recent.map((char) => ({
        char,
        name:
          GROUPS.flatMap((item) => item.emoji).find((item) => item.char === char)
            ?.name ?? "emoji",
      }));
    }
    return GROUPS.find((item) => item.id === group)?.emoji ?? [];
  }, [group, query, recent]);

  function choose(char: string) {
    const next = [char, ...recent.filter((item) => item !== char)].slice(0, 24);
    setRecent(next);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    onSelect(char);
  }

  return (
    <div className="w-[min(20rem,calc(100vw-2rem))]">
      <div className="flex items-center gap-2 border-b border-border px-2 pb-2">
        <Search className="size-3.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search emoji"
          className="h-7 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
      </div>
      {!query && (
        <div className="flex gap-0.5 overflow-x-auto px-1 py-1.5 [scrollbar-width:none]">
          {GROUPS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setGroup(item.id)}
              className={cn(
                "shrink-0 rounded-md px-2 py-1 text-[0.65rem] font-medium",
                group === item.id
                  ? "bg-accent text-primary"
                  : "text-muted-foreground hover:bg-secondary",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      <div className="thin-scrollbar grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto p-1">
        {emoji.length === 0 ? (
          <p className="col-span-8 py-6 text-center text-xs text-muted-foreground">
            {group === "recent" ? "No recent emoji yet." : "No emoji found."}
          </p>
        ) : (
          emoji.map((item, index) => (
            <button
              key={`${item.char}-${index}`}
              type="button"
              title={item.name}
              onClick={() => choose(item.char)}
              className="flex size-8 items-center justify-center rounded-md text-lg transition-colors hover:bg-secondary"
            >
              {item.char}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

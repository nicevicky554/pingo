import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

const statusValidator = v.union(
  v.literal("in"),
  v.literal("maybe"),
  v.literal("out"),
);

type Member = { name: string; initials: string };

function displayName(user: Doc<"users"> | null): string {
  const name = user?.name?.trim();
  if (name) return name;
  const email = user?.email?.split("@")[0]?.trim();
  if (email) return email;
  return "A guest";
}

function initialsFor(label: string): string {
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

async function requireUserId(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Sign in to join the party.");
  return userId;
}

async function shapePing(
  ctx: QueryCtx,
  ping: Doc<"pings">,
  viewerId: Id<"users">,
) {
  const [host, responses] = await Promise.all([
    ctx.db.get(ping.hostId),
    ctx.db
      .query("pingResponses")
      .withIndex("by_ping", (q) => q.eq("pingId", ping._id))
      .collect(),
  ]);

  const attendees: Member[] = [];
  let inCount = 0;
  let maybeCount = 0;
  let outCount = 0;

  for (const response of responses) {
    if (response.status === "out") {
      outCount += 1;
      continue;
    }
    if (response.status === "in") inCount += 1;
    if (response.status === "maybe") maybeCount += 1;
    const member = await ctx.db.get(response.userId);
    const label = displayName(member);
    attendees.push({ name: label, initials: initialsFor(label) });
  }

  const myStatus =
    responses.find((response) => response.userId === viewerId)?.status ?? null;

  return {
    _id: ping._id,
    title: ping.title,
    emoji: ping.emoji,
    place: ping.place,
    note: ping.note ?? null,
    startsAt: ping.startsAt,
    closedAt: ping.closedAt ?? null,
    isHost: ping.hostId === viewerId,
    hostName: displayName(host),
    myStatus,
    counts: { in: inCount, maybe: maybeCount, out: outCount },
    attendees: attendees.slice(0, 5),
  };
}

/** Everything open and happening soon, for the pulse of the app. */
export const pulse = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];

    const cutoff = Date.now() - 1000 * 60 * 60 * 3;
    const pings = await ctx.db
      .query("pings")
      .withIndex("by_startsAt", (q) => q.gte("startsAt", cutoff))
      .collect();

    const open = pings
      .filter((ping) => ping.closedAt === undefined)
      .sort((a, b) => a.startsAt - b.startsAt);

    return await Promise.all(open.map((ping) => shapePing(ctx, ping, userId)));
  },
});

/** Pings you created, including the ones that already happened. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];

    const pings = await ctx.db
      .query("pings")
      .withIndex("by_host", (q) => q.eq("hostId", userId))
      .collect();

    pings.sort((a, b) => b.startsAt - a.startsAt);
    return await Promise.all(pings.map((ping) => shapePing(ctx, ping, userId)));
  },
});

/** Everyone who has signed in, with a little signal about how they show up. */
export const crew = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];

    const users = await ctx.db.query("users").collect();

    const members = await Promise.all(
      users.map(async (member) => {
        const responses = await ctx.db
          .query("pingResponses")
          .withIndex("by_user", (q) => q.eq("userId", member._id))
          .collect();
        const label = displayName(member);
        return {
          _id: member._id,
          name: label,
          initials: initialsFor(label),
          isYou: member._id === userId,
          rsvpCount: responses.length,
          inCount: responses.filter((r) => r.status === "in").length,
        };
      }),
    );

    return members.sort((a, b) => {
      if (a.isYou !== b.isYou) return a.isYou ? -1 : 1;
      return b.inCount - a.inCount;
    });
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    emoji: v.string(),
    place: v.string(),
    note: v.optional(v.string()),
    startsAt: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const title = args.title.trim().slice(0, 70);
    const place = args.place.trim().slice(0, 70);
    if (title.length < 2) throw new Error("Give your ping a name.");
    if (place.length < 2) throw new Error("Add a place so people can find you.");
    if (!Number.isFinite(args.startsAt)) throw new Error("Pick a date and time.");

    const pingId = await ctx.db.insert("pings", {
      hostId: userId,
      title,
      emoji: args.emoji.slice(0, 8) || "📍",
      place,
      note: args.note?.trim().slice(0, 240) || undefined,
      startsAt: args.startsAt,
    });

    // The host is in, obviously.
    await ctx.db.insert("pingResponses", {
      pingId,
      userId,
      status: "in",
    });

    return pingId;
  },
});

export const respond = mutation({
  args: { pingId: v.id("pings"), status: statusValidator },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const ping = await ctx.db.get(args.pingId);
    if (!ping) throw new Error("That ping has wandered off.");
    if (ping.closedAt !== undefined) {
      throw new Error("This ping is closed — the plan is locked in.");
    }

    const existing = await ctx.db
      .query("pingResponses")
      .withIndex("by_ping_user", (q) =>
        q.eq("pingId", args.pingId).eq("userId", userId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { status: args.status });
    } else {
      await ctx.db.insert("pingResponses", {
        pingId: args.pingId,
        userId,
        status: args.status,
      });
    }
  },
});

export const close = mutation({
  args: { pingId: v.id("pings") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const ping = await ctx.db.get(args.pingId);
    if (!ping) throw new Error("That ping has wandered off.");
    if (ping.hostId !== userId) {
      throw new Error("Only the host can close this ping.");
    }
    await ctx.db.patch(ping._id, { closedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { pingId: v.id("pings") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const ping = await ctx.db.get(args.pingId);
    if (!ping) return;
    if (ping.hostId !== userId) {
      throw new Error("Only the host can delete this ping.");
    }
    const responses = await ctx.db
      .query("pingResponses")
      .withIndex("by_ping", (q) => q.eq("pingId", ping._id))
      .collect();
    await Promise.all(responses.map((response) => ctx.db.delete(response._id)));
    await ctx.db.delete(ping._id);
  },
});

/** Let people pick the name that shows up on the board. */
export const setDisplayName = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const name = args.name.trim().slice(0, 40);
    if (name.length < 2) throw new Error("Names need at least two characters.");
    await ctx.db.patch(userId, { name });
  },
});

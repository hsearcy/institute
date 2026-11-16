"""Native Hermes plugin entrypoint. Registration is inert until explicitly enabled."""
import asyncio
from collections import OrderedDict
import fcntl
import io
import logging
import os
from pathlib import Path

from .bridge import BOT, CHANNEL, GUILD, PARENT, Bridge, InstituteAPI, Ledger, NativeReply, gateway_text
from .worker import JobRunner

LOG = logging.getLogger("institute_bridge")


class DiscordTransport:
    def __init__(self, bot):
        self.bot = bot

    async def channel(self):
        if str(getattr(self.bot.user, "id", "")) != BOT:
            raise ValueError("Wrong Discord bot identity")
        channel = self.bot.get_channel(int(CHANNEL)) or await self.bot.fetch_channel(int(CHANNEL))
        if str(getattr(getattr(channel, "guild", None), "id", "")) != GUILD:
            raise ValueError("Wrong Discord guild")
        if str(channel.id) != CHANNEL:
            raise ValueError("Wrong Discord channel")
        return channel

    async def send(self, content, document=None):
        import discord
        channel = await self.channel()
        kwargs = {"content": content, "allowed_mentions": discord.AllowedMentions.none(), "suppress_embeds": True}
        if document is not None:
            kwargs["file"] = discord.File(io.BytesIO(document.encode("utf-8")), filename="review.txt")
        message = await channel.send(**kwargs)
        return str(message.id)

    async def verify(self, mid, content, document):
        channel = await self.channel()
        message = await channel.fetch_message(int(mid))
        if str(message.author.id) != BOT or message.webhook_id or message.content != content:
            return False
        if document is not None:
            expected = document.encode("utf-8")
            attachments = message.attachments
            if len(attachments) != 1 or attachments[0].filename != "review.txt" or attachments[0].size != len(expected):
                return False
            if await attachments[0].read() != expected:
                return False
        elif message.attachments:
            return False
        return True

    async def find(self, marker):
        channel = await self.channel()
        matches = []
        async for message in channel.history(limit=100):
            if str(message.author.id) == BOT and not message.webhook_id and message.content.endswith("\n" + marker):
                matches.append(str(message.id))
        return matches[0] if len(matches) == 1 else None


def native_reply(message):
    return NativeReply(str(message.id), str(message.author.id),
        str(getattr(getattr(message, "guild", None), "id", "")), str(message.channel.id),
        message.content or "", str(message.reference.message_id) if message.reference and message.reference.message_id else None,
        bool(message.author.bot), bool(message.webhook_id))


def register(ctx):
    # Public APIs only. No current_turn_origin, webhook admission, monkeypatches or model tools.
    runtimes = []
    captured = OrderedDict()

    def wire(bot, adapter):
        if ctx.get_config("enabled", False) is not True:
            return
        from hermes_constants import get_hermes_home
        home = Path(get_hermes_home()).resolve()
        if home != (Path.home() / ".hermes").resolve():
            raise ValueError("Institute bridge is default-profile only")
        api = InstituteAPI(os.environ.get("INSTITUTE_SUGGESTIONS_ADMIN_TOKEN", ""),
                           ctx.get_config("api_url", "http://100.107.237.88:5002/rpg/suggestions/internal"))
        interval = max(15, min(300, int(ctx.get_config("poll_seconds", 30))))
        root = home / "plugin_data" / "institute-bridge"
        root.mkdir(parents=True, exist_ok=True, mode=0o700)
        root.chmod(0o700)
        singleton = (root / "bridge.lock").open("a+")
        try:
            fcntl.flock(singleton, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            singleton.close()
            raise RuntimeError("Another Institute bridge already owns the ledger")
        store = Ledger(root / "ledger.sqlite3")
        runner = JobRunner(root / "jobs", ctx.get_config("source_repo", "/home/ares/apps/institute"))
        bridge = Bridge(store, api, DiscordTransport(bot), runner)
        closed = False

        def release():
            nonlocal closed
            if not closed:
                closed = True
                bot.remove_listener(incoming, "on_message")
                store.db.close()
                singleton.close()

        async def incoming(message):
            native = native_reply(message)
            if not bridge.is_lane(native):
                return
            # Authority is captured solely from the SDK message, BEFORE the first await.
            captured[native.message_id] = native
            while len(captured) > 2000:
                captured.popitem(last=False)
            try:
                # Core may mutate the shared SDK message while stripping @bot mentions.
                # Fetch the exact native message, never persist a normalized/model text.
                channel = await bridge.transport.channel()
                fresh = native_reply(await channel.fetch_message(int(native.message_id)))
                if (not fresh.authenticated() or fresh.message_id != native.message_id or
                        not bridge.is_lane(fresh)):
                    return
                captured[fresh.message_id] = fresh
                await bridge.receive(fresh)
            except Exception:
                # Never print native child/parent content, token, or remote error body.
                LOG.warning("Institute native decision deferred; inspect private ledger")
                store.queue("callback-error:" + native.message_id,
                            "The Institute decision could not be completed. No unverified build will start. Please ask for bridge review before trying again.")

        async def polling():
            try:
                await bot.wait_until_ready()
                while not bot.is_closed():
                    try:
                        await bridge.tick()
                    except Exception:
                        LOG.warning("Institute scan deferred; durable intents retained")
                    await asyncio.sleep(interval)
            finally:
                release()

        bot.add_listener(incoming, "on_message")
        task = ctx.spawn_task(polling(), name="institute-bridge-poll")
        task.add_done_callback(lambda _: release())
        runtimes.append((task, asyncio.get_running_loop()))

    async def consume(platform="", source=None, message_id=None, text="", **kwargs):
        if platform != "discord":
            return None
        # Discord dispatch schedules its core handler alongside listeners. Yield to let
        # the native listener capture identity; never derive authorization from source.
        await asyncio.sleep(0)
        native = captured.get(str(message_id))
        source = source or {}
        if (native and native.authenticated() and gateway_text(native.text) == gateway_text(text) and
                str(source.get("user_id", "")) == PARENT and str(source.get("chat_id", "")) == CHANNEL and
                str(source.get("scope_id", source.get("guild_id", ""))) == GUILD):
            return {"action": "handled"}
        return None

    def stop():
        for task, loop in runtimes:
            if not loop.is_closed():
                loop.call_soon_threadsafe(task.cancel)

    ctx.register_platform_handler("discord", wire)
    ctx.register_hook("post_gateway_admission", consume)
    ctx.on_unload(stop)

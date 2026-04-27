// Minimal ambient typings for @rails/actioncable — covers only what
// our voice/sttSession.ts uses. Upstream doesn't ship types.

declare module "@rails/actioncable" {
  type Subscription = {
    send: (data: unknown) => boolean;
    unsubscribe: () => void;
  };

  type SubscriptionCallbacks = {
    received?: (data: unknown) => void;
    connected?: () => void;
    disconnected?: () => void;
    rejected?: () => void;
  };

  type ChannelSpec = { channel: string } & Record<string, unknown>;

  type Consumer = {
    subscriptions: {
      create: (spec: ChannelSpec, callbacks: SubscriptionCallbacks) => Subscription;
    };
    disconnect: () => void;
  };

  export function createConsumer(url?: string): Consumer;
}

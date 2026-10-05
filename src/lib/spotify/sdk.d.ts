// Det vi bruker av Spotify Web Playback SDK (https://sdk.scdn.co/spotify-player.js).

declare namespace Spotify {
  interface PlaybackState {
    paused: boolean;
    position: number;
    duration: number;
    track_window: { current_track: { id: string | null; name: string } };
  }

  interface Error {
    message: string;
  }

  class Player {
    constructor(options: {
      name: string;
      getOAuthToken: (cb: (token: string) => void) => void;
      volume?: number;
    });
    connect(): Promise<boolean>;
    disconnect(): void;
    activateElement(): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    getCurrentState(): Promise<PlaybackState | null>;
    addListener(event: "ready" | "not_ready", cb: (data: { device_id: string }) => void): void;
    addListener(event: "player_state_changed", cb: (state: PlaybackState | null) => void): void;
    addListener(
      event:
        | "initialization_error"
        | "authentication_error"
        | "account_error"
        | "playback_error"
        | "autoplay_failed",
      cb: (error: Error) => void,
    ): void;
  }
}

interface Window {
  Spotify?: typeof Spotify;
  onSpotifyWebPlaybackSDKReady?: () => void;
}

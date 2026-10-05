export type Quiz = {
  id: string;
  title: string;
  created_at: string;
};

export type Runde = {
  id: string;
  quiz_id: string;
  position: number;
  title: string;
};

export type Sporsmal = {
  id: string;
  round_id: string;
  position: number;
  prompt: string;
  answer: string;
  points: number;
  spotify_track_id: string | null;
  track_title: string | null;
  track_artist: string | null;
  start_ms: number;
  end_ms: number;
};

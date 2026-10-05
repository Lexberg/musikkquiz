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

export type SpillStatus = "lobby" | "question" | "locked" | "finished";

export type Spill = {
  id: string;
  quiz_id: string;
  code: string;
  status: SpillStatus;
  question_ids: string[];
  current_index: number;
  created_at: string;
};

export type Lag = {
  id: string;
  game_id: string;
  name: string;
  created_at: string;
};

export type Svar = {
  id: string;
  team_id: string;
  question_id: string;
  answer: string;
  points: number | null;
};

/** Det deltakerne får fra game_state(). Inneholder aldri fasit eller låt. */
export type Deltakertilstand = {
  code: string;
  status: SpillStatus;
  team_name: string;
  number: number;
  total: number;
  prompt?: string;
  round_title?: string;
  my_answer?: string | null;
  scoreboard?: { name: string; points: number }[];
};

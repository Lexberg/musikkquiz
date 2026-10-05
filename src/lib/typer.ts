import type { Svarfelt } from "./svarfelt";

export type Quiz = {
  id: string;
  title: string;
  created_at: string;
  /** Nedtelling per spørsmål; null = ingen. */
  time_limit_seconds: number | null;
  speed_bonus: boolean;
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
  parts: Svarfelt[];
  spotify_track_id: string | null;
  track_title: string | null;
  track_artist: string | null;
  start_ms: number;
  end_ms: number;
  image_url: string | null;
  /** «question» = hint mens de svarer, «reveal» = vises når svarene er låst. */
  image_timing: "question" | "reveal";
};

export type SpillStatus = "lobby" | "question" | "locked" | "finished";

export type Spill = {
  id: string;
  quiz_id: string;
  code: string;
  status: SpillStatus;
  question_ids: string[];
  current_index: number;
  time_limit_seconds: number | null;
  speed_bonus: boolean;
  question_deadline: string | null;
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
  /** Én verdi per svarfelt. */
  answer_values: string[];
  /** Poeng per svarfelt; null = ikke rettet ennå. */
  part_points: number[] | null;
  points: number;
  speed_bonus: number;
  submitted_at: string;
};

/** Det deltakerne får fra game_state(). Inneholder aldri fasit eller låt. */
export type Deltakertilstand = {
  code: string;
  status: SpillStatus;
  team_name: string;
  number: number;
  total: number;
  speed_bonus: boolean;
  prompt?: string;
  round_title?: string;
  parts?: { label: string; choices?: string[] }[];
  image_url?: string | null;
  my_answer?: string[] | null;
  answered?: number;
  teams?: number;
  seconds_left?: number | null;
  scoreboard?: { name: string; points: number }[];
};

/** Det storskjermen får fra screen_state(). Kan vises for alle; aldri fasit eller låt. */
export type Storskjermtilstand = {
  code: string;
  status: SpillStatus;
  number: number;
  total: number;
  speed_bonus: boolean;
  teams: { name: string; points: number; locked: boolean }[];
  prompt?: string;
  round_title?: string;
  image_url?: string | null;
  parts?: { label: string; choices?: string[] }[];
  answered?: number;
  seconds_left?: number | null;
};

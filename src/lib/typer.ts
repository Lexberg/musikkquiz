import type { Svarfelt } from "./svarfelt";

export type Quiz = {
  id: string;
  title: string;
  created_at: string;
  /** Nedtelling per spørsmål; null = ingen. */
  time_limit_seconds: number | null;
  speed_bonus: boolean;
  answer_mode: Svarmate;
  /** Spill låten automatisk når spillmesteren går til neste spørsmål. */
  autoplay: boolean;
};

/** «typed» = lagene skriver svaret på mobilen, «buzzer» = første som trykker svarer høyt. */
export type Svarmate = "typed" | "buzzer";

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
  answer_mode: Svarmate;
  /** Når klokken startet for gjeldende spørsmål; null til låten spilles. */
  question_started_at: string | null;
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

export type Buzz = {
  id: string;
  team_id: string;
  question_id: string;
  /** null = laget svarer nå. */
  result: "correct" | "wrong" | null;
  buzzed_at: string;
  judged_at: string | null;
};

/** Buzzer-status for gjeldende spørsmål, i buzzer-modus. */
export type Buzzerstatus = {
  /** Laget som har buzzeren og svarer nå. */
  buzz_holder?: string | null;
  /** Laget som svarte riktig. */
  buzz_winner?: string | null;
  /** Lag som svarte feil og er ute av spørsmålet. */
  buzz_out?: string[];
};

/** Det deltakerne får fra game_state(). Inneholder aldri fasit eller låt. */
export type Deltakertilstand = Buzzerstatus & {
  code: string;
  status: SpillStatus;
  team_name: string;
  number: number;
  total: number;
  speed_bonus: boolean;
  answer_mode: Svarmate;
  prompt?: string;
  round_title?: string;
  parts?: { label: string; choices?: string[] }[];
  image_url?: string | null;
  /** Lagets egen buzzer-status: «holding» = svarer nå. */
  my_buzz?: "holding" | "correct" | "wrong" | null;
  my_answer?: string[] | null;
  answered?: number;
  teams?: number;
  seconds_left?: number | null;
  /** Fasit per svarfelt, først når svarene er låst. */
  correct?: string[] | null;
  /** Lagets poeng per svarfelt etter låsing; null = ikke rettet. */
  my_points?: number[] | null;
  my_bonus?: number | null;
  /** Lagets poengsum så langt, etter låsing. */
  my_total?: number;
  scoreboard?: { name: string; points: number }[];
};

/** Det storskjermen får fra screen_state(). Kan vises for alle; aldri fasit eller låt. */
export type Storskjermtilstand = Buzzerstatus & {
  code: string;
  status: SpillStatus;
  number: number;
  total: number;
  speed_bonus: boolean;
  answer_mode: Svarmate;
  teams: { name: string; points: number; locked: boolean }[];
  prompt?: string;
  round_title?: string;
  image_url?: string | null;
  parts?: { label: string; choices?: string[] }[];
  answered?: number;
  seconds_left?: number | null;
  /** Fasit per svarfelt, først når svarene er låst. */
  correct?: string[] | null;
};

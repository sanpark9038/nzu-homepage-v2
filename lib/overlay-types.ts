export type OverlayRace = "T" | "P" | "Z";
export type OverlayMode = "team" | "individual";
export type OverlayResult = "left" | "right" | null;

export type OverlaySide = {
  teamName: string;
  playerName: string;
  race: OverlayRace;
  startingPoint: string;
  startingColor: string;
};

export type OverlayEntryRow = {
  id: string;
  leftPlayer: string;
  map: string;
  rightPlayer: string;
  result: OverlayResult;
};

export type OverlaySet = {
  id: string;
  title: string;
  isAce: boolean;
  currentMatch: number | null;
  leftPool: string[];
  rightPool: string[];
  entries: OverlayEntryRow[];
};

export type OverlayPanelLayout = {
  x: number;
  y: number;
  scale: number;
  visible: boolean;
};

export type OverlayFavorite = {
  id: string;
  name: string;
  race: OverlayRace;
};

export type OverlayState = {
  mode: OverlayMode;
  title: string;
  left: OverlaySide;
  right: OverlaySide;
  sets: OverlaySet[];
  activeSetId: string | null;
  maps: string[];
  scoreboardLayout: OverlayPanelLayout;
  entryLayout: OverlayPanelLayout;
  favorites: OverlayFavorite[];
};

export function defaultOverlaySide(): OverlaySide {
  return {
    teamName: "",
    playerName: "",
    race: "T",
    startingPoint: "",
    startingColor: "#ffffff",
  };
}

export function defaultOverlaySet(title = "", isAce = false): OverlaySet {
  return {
    id: Math.random().toString(36).slice(2, 9),
    title,
    isAce,
    currentMatch: null,
    leftPool: [],
    rightPool: [],
    entries: [],
  };
}

export function defaultOverlayState(): OverlayState {
  return {
    mode: "team",
    title: "",
    left: defaultOverlaySide(),
    right: defaultOverlaySide(),
    sets: [],
    activeSetId: null,
    maps: [],
    scoreboardLayout: { x: 0, y: 373, scale: 0.54, visible: true },
    entryLayout: { x: 1200, y: 30, scale: 1, visible: true },
    favorites: [],
  };
}

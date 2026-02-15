export interface Coordinate {
  type: string;
  x: number;
  y: number;
}

export interface Location {
  id: string | null;
  type: string | null;
  name: string | null;
  score: number | null;
  coordinate: Coordinate | null;
  distance: number | null;
}

export interface Prognosis {
  platform: string | null;
  arrival: string | null;
  departure: string | null;
  capacity1st: number | null;
  capacity2nd: number | null;
}

export interface Checkpoint {
  station: Location;
  arrival: string | null;
  arrivalTimestamp: number | null;
  departure: string | null;
  departureTimestamp: number | null;
  platform: string | null;
  prognosis: Prognosis | null;
}

export interface Journey {
  name: string | null;
  category: string | null;
  categoryCode: number | null;
  number: string | null;
  operator: string | null;
  to: string | null;
  passList: Checkpoint[];
  capacity1st: number | null;
  capacity2nd: number | null;
}

export interface Section {
  journey: Journey | null;
  walk: { duration: number } | null;
  departure: Checkpoint;
  arrival: Checkpoint;
}

export interface Connection {
  from: Checkpoint;
  to: Checkpoint;
  duration: string | null;
  transfers: number;
  sections: Section[];
  products: string[];
}

export interface StationBoardEntry {
  stop: Checkpoint;
  name: string | null;
  category: string | null;
  categoryCode: number | null;
  number: string | null;
  operator: string | null;
  to: string | null;
}

export interface LocationsResponse {
  stations: Location[];
}

export interface ConnectionsResponse {
  connections: Connection[];
  from: Location;
  to: Location;
}

export interface StationBoardResponse {
  station: Location;
  stationboard: StationBoardEntry[];
}

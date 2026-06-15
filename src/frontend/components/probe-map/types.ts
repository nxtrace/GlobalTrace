export interface ProbeMapAsnSelection {
  magic: string;
  city: string;
  country: string;
  asn: string;
  network: string;
  count: number;
}

export interface ProbePickerGroup extends ProbeMapAsnSelection {
  key: string;
}

export interface ProbePickerState {
  city: string;
  country: string;
  total: number;
  groups: ProbePickerGroup[];
  left: number;
  top: number;
  pinned: boolean;
}
